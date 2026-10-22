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
        prepared = {"model": "gpt-6-luna", "input": llm_module.responses.input_items(self.messages),
                    **llm_module.responses.parameters("gpt-6-luna", {
                        key: value for key, value in self.parameters.items() if not key.startswith("booklet_")
                    }, None, None, {})}
        prepared.update(store=False, truncation="disabled")
        self.parameters["booklet_request_digest"] = hashlib.sha256(json.dumps(
            prepared, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()).hexdigest()
        self.client_creations = 0
        self.expected_timeout = 60
        self.factory_hook = None
        self.requests = []
        self.count = 32000
        self.count_body = None
        self.count_request_id = "req_count_fixture"
        self.status = "completed"
        self.usage = {"input_tokens": 10, "output_tokens": 7, "total_tokens": 17,
                      "input_tokens_details": {"cached_tokens": 2, "cache_write_tokens": 0},
                      "output_tokens_details": {"reasoning_tokens": 3}}
        self.failure = None
        self.count_failure = None
        self.refusal = False
        self.content = '{"answer":"fixture"}'
        self.output = None

    def factory(self, **kwargs):
        self.client_creations += 1
        if self.factory_hook:
            self.factory_hook()
        self.assertEqual(kwargs["max_retries"], 0)
        self.assertEqual(kwargs["timeout"], self.expected_timeout)
        self.assertEqual(kwargs["base_url"], "https://api.openai.com/v1")

        def handle(request):
            self.assertEqual(request.url.host, "api.openai.com")
            body = json.loads(request.content)
            self.requests.append((request.url.path, body))
            failure = self.count_failure if request.url.path.endswith("input_tokens") else self.failure
            if failure == "timeout":
                raise httpx2.ReadTimeout("private-provider-error-do-not-save", request=request)
            if failure:
                return httpx2.Response(failure, request=request,
                                       json={"error": {"message": "private-provider-error-do-not-save", "type": "fixture"}})
            if request.url.path.endswith("input_tokens"):
                return httpx2.Response(200, request=request, headers={"x-request-id": self.count_request_id},
                                       json=(self.count_body if self.count_body is not None else
                                             {"object": "response.input_tokens", "input_tokens": self.count}))
            part = ({"type": "refusal", "refusal": self.content} if self.refusal else
                    {"type": "output_text", "text": self.content, "annotations": []})
            return httpx2.Response(200, request=request, headers={"x-request-id": "req_fixture"}, json={
                "id": "resp_fixture", "created_at": 1, "object": "response", "model": "gpt-6-luna",
                "status": self.status, "service_tier": "default", "usage": self.usage,
                "output": self.output if self.output is not None else [{"id": "msg_fixture", "type": "message", "role": "assistant", "status": "completed", "content": [part]}],
            })

        return OpenAI(**kwargs, http_client=httpx2.Client(transport=httpx2.MockTransport(handle)))

    def invoke(self, **overrides):
        params = self.parameters | overrides
        return booklet_bounded.generate(self.llm, self.factory, "gpt-6-luna",
            {"openai_api_key": "not-a-key", "api_protocol": "responses"},
            self.messages, params, None, None, False, None)

    @staticmethod
    def message(text, phase=None):
        return {"id": "msg_fixture", "type": "message", "role": "assistant", "status": "completed",
                "phase": phase, "content": [{"type": "output_text", "text": text, "annotations": []}]}

    def test_final_answer_excludes_commentary_and_reasoning(self):
        self.output = [{"type": "reasoning", "id": "rs_fixture", "summary": [
            {"type": "summary_text", "text": "private reasoning"}]},
            self.message(self.content + " in final?", "commentary"), self.message(self.content, "final_answer")]
        result = json.loads(self.invoke().message.content)
        self.assertEqual(result["content"], self.content)
        self.assertEqual(result["providerEvidence"]["usage"]["outputTokens"], 7)
        self.assertEqual(len(self.requests), 2)

    def test_ambiguous_answers_fail_without_erasing_usage_or_retry(self):
        cases = [[], [self.message(self.content, "commentary")],
                 [self.message(self.content), self.message(self.content)],
                 [self.message(self.content, "final_answer"), self.message(self.content, "final_answer")],
                 [self.message(self.content), self.message(self.content, "final_answer")],
                 [self.message(self.content, "unknown")]]
        for output in cases:
            with self.subTest(output=output):
                self.output = output
                before = len(self.requests)
                result = json.loads(self.invoke().message.content)
                self.assertEqual(result["content"], "")
                self.assertEqual(result["providerEvidence"]["status"], "completed")
                self.assertEqual(result["providerEvidence"]["usage"]["outputTokens"], 7)
                self.assertEqual(len(self.requests) - before, 2)

    def test_selected_content_is_not_repaired(self):
        self.content = '{"answer":"first"} in final?{"answer":"last"}'
        self.output = [self.message(self.content, "final_answer")]
        result = json.loads(self.invoke().message.content)
        self.assertEqual(result["content"], self.content)
        with self.assertRaises(ValueError): json.loads(result["content"])

    def test_invalid_output_shapes_and_incomplete_messages_are_not_answers(self):
        message = self.message(self.content, "final_answer")
        for output in (42, {}, "text", [message | {"status": "incomplete"}],
                       [message | {"role": "user"}], [message | {"content": "text"}],
                       [message | {"content": []}], [message | {"content": [{"type": "unknown"}]}]):
            with self.subTest(output=output):
                self.assertEqual(booklet_bounded._final_content({"output": output}), "")

    def test_phase_less_single_answer_and_split_text_parts(self):
        self.output = [self.message(self.content)]
        self.output[0]["content"] = [{"type": "output_text", "text": part, "annotations": []}
                                    for part in (self.content[:5], self.content[5:])]
        self.assertEqual(json.loads(self.invoke().message.content)["content"], self.content)

    def carrier(self):
        payload = {"model": "gpt-6-luna", "input": [
            {"type": "message", "role": "system", "content": "Reviewed role instructions"},
            {"type": "message", "role": "user", "content": '{"brief":"\u0647\u0648\u0627\u067e\u06cc\u0645\u0627 \U0001fa81 {{#not.recursive#}} <think>"}'},
        ], "max_output_tokens": 2048, "reasoning": {"effort": "none", "mode": "standard"},
            "service_tier": "default", "text": {"format": {"type": "json_schema", "name": "fixture", "strict": True,
                "schema": {"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"], "additionalProperties": False}}},
            "store": False, "truncation": "disabled", "include": ["reasoning.encrypted_content"]}
        return payload

    def invoke_carrier(self, payload=None, raw=None, **overrides):
        payload = self.carrier() if payload is None else payload
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
        parameters = {key: value for key, value in self.parameters.items() if key not in ("response_format", "json_schema", "booklet_request_digest")}
        parameters.update(booklet_prepared_request=True, enable_stream=False,
                          booklet_deadline_at_ms=4102444800000,  # Deliberately future fake-only deadline.
                          booklet_request_digest="sha256:" + hashlib.sha256(encoded.encode()).hexdigest())
        with patch.object(llm_module, "OpenAI", side_effect=self.factory):
            return self.llm._invoke("gpt-6-luna", {"openai_api_key": "not-a-key", "api_protocol": "responses"},
                [UserPromptMessage(content=encoded if raw is None else raw)], parameters | overrides, stream=True)

    def test_carrier_uses_exact_inner_request_through_actual_invoke(self):
        result = self.invoke_carrier()
        self.assertEqual(len(self.requests), 2)
        self.assertEqual(self.requests[1][1], self.carrier())
        self.assertEqual(json.loads(result.message.content)["schemaVersion"], "booklet_provider_v1")

    def test_carrier_policy_drift_is_rejected_even_with_matching_self_digest(self):
        for change in ({"model": "gpt-6-sol"}, {"tools": []}, {"max_output_tokens": True}, {"max_output_tokens": 8192},
                       {"reasoning": {"effort": "low", "mode": "standard"}}, {"store": True},
                       {"text": {"format": None}}, {"input": [{"type": "message", "role": "user", "content": "bad"}]}):
            with self.subTest(change=change):
                with self.assertRaises(InvokeBadRequestError): self.invoke_carrier(self.carrier() | change)
        self.assertEqual(self.client_creations, 0)

    def test_carrier_truncation_formatting_and_invalid_mode_fail_before_clients(self):
        encoded = json.dumps(self.carrier(), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        for raw in (encoded[:-1], " " + encoded, "[1]", "x" * (2 * 1024 * 1024 + 1)):
            with self.assertRaises(InvokeBadRequestError): self.invoke_carrier(raw=raw)
        with self.assertRaises(InvokeBadRequestError): self.invoke_carrier(booklet_prepared_request=1)
        self.assertEqual(self.client_creations, 0)

    def test_stdio_dependency_drift_prevents_count_and_generation(self):
        with patch("importlib.metadata.version", return_value="0.10.3"):
            with self.assertRaises(InvokeBadRequestError): self.invoke_carrier()
        with patch("pathlib.Path.read_bytes", return_value=b"changed reader"):
            with self.assertRaises(InvokeBadRequestError): self.invoke_carrier()
        self.assertEqual(self.client_creations, 0)

    def test_original_deadline_blocks_queued_or_post_count_generation(self):
        for value in (None, True, 0):
            with self.assertRaises(InvokeBadRequestError): self.invoke_carrier(booklet_deadline_at_ms=value)
        self.assertEqual(self.client_creations, 0)
        self.expected_timeout = 10
        with patch.object(booklet_bounded.time, "time", side_effect=[0, 0, 11]):
            with self.assertRaises(InvokeBadRequestError): self.invoke_carrier(booklet_deadline_at_ms=10000)
        self.assertEqual(len(self.requests), 1)
        self.assertTrue(self.requests[0][0].endswith("input_tokens"))

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
        self.assertNotIn("booklet_request_digest", generate)
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
        self.assertEqual(evidence["requestDigest"], self.parameters["booklet_request_digest"])

    def test_missing_invalid_or_different_digest_prevents_both_requests(self):
        for digest in (None, True, "", "A" * 64, "0" * 64):
            with self.subTest(digest=digest):
                with self.assertRaises(InvokeBadRequestError): self.invoke(booklet_request_digest=digest)
        self.assertEqual(self.requests, [])
        self.assertEqual(self.client_creations, 0)

    def test_regional_custom_or_credential_bearing_endpoint_never_creates_client(self):
        for endpoint in ("https://eu.api.openai.com", "https://api.openai.com.evil.test", "https://user:password@api.openai.com"):
            with self.subTest(endpoint=endpoint), self.assertRaises(InvokeBadRequestError):
                booklet_bounded.generate(self.llm, self.factory, "gpt-6-luna",
                    {"openai_api_key": "not-a-key", "api_protocol": "responses", "openai_api_base": endpoint},
                    self.messages, self.parameters, None, None, False, None)
        self.assertEqual(self.requests, [])
        self.assertEqual(self.client_creations, 0)

    def test_environment_endpoint_cannot_redirect_the_bounded_request(self):
        with patch.dict("os.environ", {"OPENAI_BASE_URL": "https://eu.api.openai.com/v1"}):
            self.invoke()
        self.assertEqual(len(self.requests), 2)

    def test_prompt_schema_or_output_policy_drift_prevents_both_requests(self):
        self.messages = [UserPromptMessage(content="changed after authorization")]
        with self.assertRaises(InvokeBadRequestError): self.invoke()
        self.messages = [UserPromptMessage(content="fixture")]
        changed = self.parameters["json_schema"] | {"name": "changed_schema"}
        for parameters in ({"json_schema": changed}, {"max_tokens": 1024}, {"reasoning_effort": "low"}):
            with self.subTest(parameters=parameters):
                with self.assertRaises(InvokeBadRequestError): self.invoke(**parameters)
        self.assertEqual(self.requests, [])
        self.assertEqual(self.client_creations, 0)

    def test_admitted_snapshot_is_independent_of_later_caller_mutation(self):
        self.factory_hook = lambda: self.parameters["json_schema"]["schema"].update(description="late mutation")
        self.invoke()
        count, generated = [request[1] for request in self.requests]
        self.assertNotIn("description", count["text"]["format"]["schema"])
        self.assertNotIn("description", generated["text"]["format"]["schema"])

    def test_input_above_limit_never_generates(self):
        self.count = 32001
        evidence = self.assert_count_failure(self.invoke(), "input_limit_exceeded")
        self.assertEqual(evidence["countedInputTokens"], 32001)
        self.assertEqual(evidence["countRequestId"], "req_count_fixture")
        self.assertEqual(len(self.requests), 1)

    def assert_count_failure(self, result, code):
        wrapper = json.loads(result.message.content)
        self.assertEqual(set(wrapper), {"schemaVersion", "content", "failureEvidence"})
        self.assertEqual(wrapper["schemaVersion"], "booklet_pre_generation_failure_v1")
        self.assertEqual(wrapper["content"], "")
        evidence = wrapper["failureEvidence"]
        self.assertEqual(set(evidence), {"provider", "apiBaseUrl", "stdioSdk", "model", "serviceTier",
            "requestDigest", "adapterVersion", "stage", "code", "countedInputTokens", "limit", "generationStarted",
            "elapsedMs", "countRequestId"})
        self.assertEqual(evidence["provider"], "openai")
        self.assertEqual(evidence["apiBaseUrl"], "https://api.openai.com/v1")
        self.assertEqual(evidence["stdioSdk"]["version"], "0.10.2")
        self.assertEqual(evidence["model"], "gpt-6-luna")
        self.assertEqual(evidence["adapterVersion"], "1.0.7-dev4")
        self.assertEqual(evidence["serviceTier"], "default")
        self.assertEqual(evidence["requestDigest"], self.parameters["booklet_request_digest"])
        self.assertEqual(evidence["stage"], "input_count")
        self.assertEqual(evidence["code"], code)
        self.assertEqual(evidence["limit"], 32000)
        self.assertIs(evidence["generationStarted"], False)
        self.assertIs(type(evidence["elapsedMs"]), int)
        self.assertGreaterEqual(evidence["elapsedMs"], 0)
        self.assertEqual(result.usage, LLMUsage.empty_usage())
        self.llm._calc_response_usage.assert_not_called()
        self.assertNotIn("private-provider-error-do-not-save", result.message.content)
        return evidence

    def test_missing_or_null_count_is_unavailable_without_generation(self):
        for body in ({"object": "response.input_tokens"}, {"input_tokens": None}):
            with self.subTest(body=body):
                self.requests = []; self.count_body = body
                evidence = self.assert_count_failure(self.invoke(), "input_count_unavailable")
                self.assertIsNone(evidence["countedInputTokens"])
                self.assertEqual(len(self.requests), 1)

    def test_malformed_count_is_invalid_without_generation(self):
        for count in (True, False, -1, 1.5, "32000", "invalid", [], {}, 9007199254740992):
            with self.subTest(count=count):
                self.requests = []; self.count = count
                evidence = self.assert_count_failure(self.invoke(), "input_count_invalid")
                self.assertIsNone(evidence["countedInputTokens"])
                self.assertEqual(len(self.requests), 1)

    def test_count_request_id_is_allowlisted(self):
        self.count = 32001
        self.count_request_id = "private provider error with content"
        evidence = self.assert_count_failure(self.invoke(), "input_limit_exceeded")
        self.assertIsNone(evidence["countRequestId"])
        self.assertNotIn(self.count_request_id, json.dumps(evidence))

    def test_count_failure_elapsed_time_and_carrier_wire_are_preserved(self):
        self.count = 32001
        with patch.object(booklet_bounded.time, "monotonic", side_effect=[10, 10.125]):
            # Inject the clock explicitly because generate binds its default.
            result = booklet_bounded.generate(self.llm, self.factory, "gpt-6-luna",
                {"openai_api_key": "not-a-key"}, self.messages, self.parameters,
                None, None, False, None, clock=booklet_bounded.time.monotonic)
        self.assertEqual(self.assert_count_failure(result, "input_limit_exceeded")["elapsedMs"], 125)
        self.requests = []
        wrapper = json.loads(self.invoke_carrier().message.content)
        self.assertEqual(wrapper["schemaVersion"], "booklet_pre_generation_failure_v1")
        self.assertEqual(wrapper["failureEvidence"]["code"], "input_limit_exceeded")
        self.assertEqual(len(self.requests), 1)

    def test_count_failure_never_generates_or_retries(self):
        for failure in (429, 500, "timeout"):
            with self.subTest(failure=failure):
                self.requests = []; self.count_failure = failure
                evidence = self.assert_count_failure(self.invoke(), "input_count_request_failed")
                self.assertIsNone(evidence["countedInputTokens"])
                self.assertIsNone(evidence["countRequestId"])
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
                self.messages, {"booklet_bounded_execution": False, "booklet_timeout_seconds": 60,
                                "booklet_request_digest": "0" * 64, "booklet_prepared_request": True,
                                "booklet_deadline_at_ms": 4102444800000, "max_tokens": 10}, stream=False)
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
            digest = next(rule for rule in model.parameter_rules if rule.name == "booklet_request_digest")
            self.assertFalse(digest.required)
            carrier = next(rule for rule in model.parameter_rules if rule.name == "booklet_prepared_request")
            self.assertIs(carrier.default, False)
            deadline = next(rule for rule in model.parameter_rules if rule.name == "booklet_deadline_at_ms")
            self.assertFalse(deadline.required)
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
