"""Focused candidate tests: python THIS_FILE PATH_TO_CANDIDATE_PACKAGE.

Uses the audited SDK versions and in-memory transport; real sockets are denied.
"""
from __future__ import annotations

import json
import ast
import hashlib
import socket
import sys
import unittest
import types
from pathlib import Path
from unittest.mock import Mock, patch
from zipfile import ZipFile
import yaml
from packaging.version import Version, InvalidVersion

from dify_plugin.entities.model.llm import LLMUsage
from dify_plugin.entities.model import AIModelEntity
from dify_plugin.entities.model.message import UserPromptMessage, AssistantPromptMessage
from dify_plugin.errors.model import InvokeBadRequestError
import httpx2
from openai import OpenAI

PACKAGE = Path(sys.argv.pop(1)).resolve()
sys.path.insert(0, str(PACKAGE))
from models.llm import booklet_bounded, llm as llm_module


class BoundedTests(unittest.TestCase):
    def setUp(self):
        self.llm = object.__new__(llm_module.OpenAILargeLanguageModel)
        self.llm._calc_response_usage = Mock(return_value=LLMUsage.empty_usage())
        self.messages = [UserPromptMessage(content="fixture")]
        self.parameters = {
            "booklet_bounded_execution": True, "booklet_timeout_seconds": 60,
            "max_tokens": 2048, "reasoning_effort": "none", "reasoning_mode": "standard",
            "service_tier": "default", "response_format": "json_schema",
            "json_schema": {"name": "fixture", "strict": True, "schema": {
                "type": "object", "properties": {"answer": {"type": "string"}},
                "required": ["answer"], "additionalProperties": False,
            }},
        }
        self.requests = []
        self.count = 32000
        self.status = "completed"
        self.usage = {"input_tokens": 10, "output_tokens": 7, "total_tokens": 17,
                      "input_tokens_details": {"cached_tokens": 2, "cache_write_tokens": 0},
                      "output_tokens_details": {"reasoning_tokens": 3}}
        self.failure = None
        self.count_failure = None
        self.refusal = False
        self.content = '{"answer":"fixture"}'

    def factory(self, **kwargs):
        self.assertEqual(kwargs["max_retries"], 0)
        self.assertEqual(kwargs["timeout"], 60)

        def handle(request):
            body = json.loads(request.content)
            self.requests.append((request.url.path, body))
            failure = self.count_failure if request.url.path.endswith("input_tokens") else self.failure
            if failure == "timeout":
                raise httpx2.ReadTimeout("fixture", request=request)
            if failure:
                return httpx2.Response(failure, request=request,
                                       json={"error": {"message": "fixture", "type": "fixture"}})
            if request.url.path.endswith("input_tokens"):
                return httpx2.Response(200, request=request,
                                       json={"object": "response.input_tokens", "input_tokens": self.count})
            part = ({"type": "refusal", "refusal": self.content} if self.refusal else
                    {"type": "output_text", "text": self.content, "annotations": []})
            return httpx2.Response(200, request=request, headers={"x-request-id": "req_fixture"}, json={
                "id": "resp_fixture", "created_at": 1, "object": "response", "model": "gpt-6-luna",
                "status": self.status, "service_tier": "default", "usage": self.usage,
                "output": [{"id": "msg_fixture", "type": "message", "role": "assistant", "status": "completed", "content": [part]}],
            })

        return OpenAI(**kwargs, http_client=httpx2.Client(transport=httpx2.MockTransport(handle)))

    def invoke(self, **overrides):
        params = self.parameters | overrides
        return booklet_bounded.generate(self.llm, self.factory, "gpt-6-luna",
            {"openai_api_key": "not-a-key", "api_protocol": "responses"},
            self.messages, params, None, None, False, None)

    def test_exact_count_then_one_generation_and_evidence_survives_text(self):
        result = self.invoke()
        self.assertEqual([r[0] for r in self.requests], ["/v1/responses/input_tokens", "/v1/responses"])
        count, generate = [r[1] for r in self.requests]
        for key in ("model", "input", "reasoning", "text", "truncation"):
            self.assertEqual(count[key], generate[key])
        self.assertEqual(generate["max_output_tokens"], 2048)
        self.assertEqual(generate["service_tier"], "default")
        self.assertFalse(generate["store"])
        self.assertNotIn("booklet_bounded_execution", generate)
        wrapper = json.loads(result.message.content)
        self.assertEqual(wrapper["schemaVersion"], "booklet_provider_v1")
        self.assertEqual(json.loads(wrapper["content"]), {"answer": "fixture"})
        evidence = wrapper["providerEvidence"]
        self.assertEqual(evidence["countedInputTokens"], 32000)
        self.assertEqual(evidence["requestId"], "req_fixture")
        self.assertEqual(evidence["responseId"], "resp_fixture")
        self.assertEqual(evidence["usage"]["source"], "provider_reported")
        self.assertFalse(evidence["refused"])
        self.assertEqual(evidence["usage"]["reasoningOutputTokens"], 3)
        self.assertEqual(len(evidence["requestDigest"]), 64)

    def test_input_above_limit_never_generates(self):
        self.count = 32001
        with self.assertRaises(InvokeBadRequestError): self.invoke()
        self.assertEqual(len(self.requests), 1)

    def test_count_failure_never_generates_or_retries(self):
        for failure in (429, 500, "timeout"):
            with self.subTest(failure=failure):
                self.requests = []; self.count_failure = failure
                with self.assertRaises(Exception): self.invoke()
                self.assertEqual(len(self.requests), 1)

    def test_generation_failure_is_not_retried(self):
        for failure in (429, 500, "timeout"):
            with self.subTest(failure=failure):
                self.requests = []; self.failure = failure
                with self.assertRaises(Exception): self.invoke()
                self.assertEqual(len(self.requests), 2)

    def test_missing_usage_is_unavailable_without_estimate(self):
        self.usage = None
        wrapper = json.loads(self.invoke().message.content)
        self.assertEqual(wrapper["providerEvidence"]["usage"]["source"], "unavailable")
        self.assertIsNone(wrapper["providerEvidence"]["usage"]["inputTokens"])
        self.llm._calc_response_usage.assert_not_called()

    def test_incomplete_and_refusal_preserve_evidence(self):
        self.status = "incomplete"
        wrapper = json.loads(self.invoke().message.content)
        self.assertEqual(wrapper["providerEvidence"]["status"], "incomplete")
        self.status = "completed"
        self.refusal = True
        self.content = '{"answer":"JSON-shaped refusal must never be accepted"}'
        wrapper = json.loads(self.invoke().message.content)
        self.assertEqual(wrapper["content"], self.content)
        self.assertEqual(wrapper["providerEvidence"]["status"], "completed")
        self.assertTrue(wrapper["providerEvidence"]["refused"])

    def test_policy_violations_make_no_request(self):
        for values in ({"booklet_timeout_seconds": 121}, {"booklet_timeout_seconds": True},
                       {"max_tokens": 8193}, {"max_tokens": True}, {"reasoning_effort": "medium"},
                       {"service_tier": "priority"}, {"previous_response_id": "resp_old"},
                       {"response_format": "text"}, {"booklet_bounded_execution": "true"}):
            with self.subTest(values=values):
                with self.assertRaises(InvokeBadRequestError): self.invoke(**values)
        self.assertEqual(self.requests, [])

    def test_history_and_streaming_are_rejected(self):
        self.messages = [AssistantPromptMessage(content="old")]
        with self.assertRaises(InvokeBadRequestError): self.invoke()
        self.messages = [UserPromptMessage(content="fixture")]
        with self.assertRaises(InvokeBadRequestError):
            booklet_bounded.generate(self.llm, self.factory, "gpt-6-luna",
                {"openai_api_key": "not-a-key"}, self.messages, self.parameters, None, None, True, None)
        self.assertEqual(self.requests, [])

    def test_non_strict_or_invalid_schema_makes_no_request(self):
        original = self.parameters["json_schema"]
        for schema in (original | {"strict": False}, original["schema"],
                       original | {"schema": {}}, original | {"schema": {"type": "array"}}):
            with self.subTest(schema=schema):
                with self.assertRaises(InvokeBadRequestError): self.invoke(json_schema=schema)
        self.assertEqual(self.requests, [])

    def test_timeout_elapsed_during_count_prevents_generation(self):
        clock = Mock(side_effect=[0, 60])
        with self.assertRaises(InvokeBadRequestError):
            booklet_bounded.generate(self.llm, self.factory, "gpt-6-luna",
                {"openai_api_key": "not-a-key"}, self.messages, self.parameters, None, None, False, None, clock=clock)
        self.assertEqual(len(self.requests), 1)

    def test_false_opt_in_preserves_original_route(self):
        with patch.object(llm_module, "OpenAI") as factory, patch.object(llm_module.responses, "generate", return_value="original") as original:
            result = self.llm._chat_generate("gpt-6-luna", {"openai_api_key": "not-a-key"},
                self.messages, {"booklet_bounded_execution": False, "booklet_timeout_seconds": 60, "max_tokens": 10}, stream=False)
        self.assertEqual(result, "original")
        self.assertEqual(original.call_args.args[5], {"max_tokens": 10})
        self.assertNotIn("max_retries", factory.call_args.kwargs)

    def test_actual_opt_in_route_selects_bounded_adapter(self):
        with patch.object(llm_module, "OpenAI", side_effect=self.factory):
            result = self.llm._invoke("gpt-6-luna", {"openai_api_key": "not-a-key"},
                self.messages, self.parameters | {"enable_stream": False})
        self.assertEqual(json.loads(result.message.content)["schemaVersion"], "booklet_provider_v1")
        self.assertEqual(len(self.requests), 2)

    def test_wire_survives_dify_pinned_reasoning_filter(self):
        wheel = next((PACKAGE.parent / "graphon").glob("graphon-0.7.0-*.whl"))
        self.assertEqual(hashlib.sha256(wheel.read_bytes()).hexdigest(),
                         "6f7608aaaa65607c4935735137ed4b7029b1e6ca80202cbe829af3370cf4404e")
        with ZipFile(wheel) as archive:
            source = archive.read("graphon/nodes/llm/reasoning.py")
        module = types.ModuleType("booklet_graphon_reasoning")
        sys.modules[module.__name__] = module
        exec(compile(source, "graphon-0.7.0/reasoning.py", "exec"), module.__dict__)
        self.content = '{"answer":"Keep <think>exact text</think> intact"}'
        result = self.invoke()
        clean, reasoning = module.split_reasoning(result.message.content, "separated")
        self.assertEqual(reasoning, "")
        self.assertEqual(json.loads(clean)["content"], self.content)

    def test_selected_catalogs_validate_and_other_models_are_unchanged(self):
        for name in ("gpt-6-luna.yaml", "gpt-6-sol.yaml"):
            model = AIModelEntity.model_validate(yaml.safe_load((PACKAGE / "models/llm" / name).read_text(encoding="utf-8")))
            policy = next(rule for rule in model.parameter_rules if rule.name == "booklet_bounded_execution")
            self.assertIs(policy.default, False)
            timeout = next(rule for rule in model.parameter_rules if rule.name == "booklet_timeout_seconds")
            self.assertEqual(timeout.max, 120)
        name = "models/llm/gpt-4.1-mini.yaml"
        self.assertEqual((PACKAGE / name).read_bytes(), (PACKAGE.parent / "package" / name).read_bytes())

    def test_package_version_passes_daemon_and_actual_api_validator(self):
        # Run the pinned API method, not only the daemon's looser version regex.
        source = (PACKAGE.parent / "dify-1.17.1-plugin-entity.py").read_bytes()
        self.assertEqual(hashlib.sha256(source).hexdigest(),
                         "f57e8f058bf733485ad02960e09bf72ff14572a25547c861c00abe378df39f84")
        method = next(node for node in ast.walk(ast.parse(source))
                      if isinstance(node, ast.FunctionDef) and node.name == "validate_version")
        method.decorator_list = []
        namespace = {"Version": Version, "InvalidVersion": InvalidVersion}
        exec(compile(ast.Module(body=[method], type_ignores=[]), "dify-1.17.1/plugin.py", "exec"), namespace)
        with self.assertRaisesRegex(ValueError, "Invalid version format"):
            namespace["validate_version"](None, "1.0.7-m4r1")
        version = yaml.safe_load((PACKAGE / "manifest.yaml").read_text(encoding="utf-8"))["version"]
        self.assertEqual(namespace["validate_version"](None, version), version)
        self.assertRegex(version, r"^\d{1,4}(\.\d{1,4}){2}(-\w{1,16})?$")


if __name__ == "__main__":
    with patch.object(socket.socket, "connect", side_effect=AssertionError("Network forbidden")):
        unittest.main(verbosity=2)
