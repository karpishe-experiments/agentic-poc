"""Nonbillable tests: python m5-openai-bounded-tests.py PATH_TO_DEV5_SOURCE_PACKAGE."""
from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import pathlib
import struct
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from dify_plugin.entities.model.llm import LLMUsage
from dify_plugin.entities.model.message import ImagePromptMessageContent, TextPromptMessageContent, UserPromptMessage
from dify_plugin.errors.model import InvokeBadRequestError
from unittest.mock import patch


package = pathlib.Path(sys.argv.pop(1)).resolve()
graph_contract = None
if "--graph-contract" in sys.argv:
    index = sys.argv.index("--graph-contract")
    sys.argv.pop(index)
    graph_contract = pathlib.Path(sys.argv.pop(index))
sys.path.insert(0, str(package))
source = pathlib.Path(__file__).with_name("m5-openai-bounded.py")
spec = importlib.util.spec_from_file_location("models.llm.m5_bounded", source)
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
adapter._verify_stdio_sdk = lambda: {"version": "0.10.2", "readerSha256": "fixture"}


def png():
    return b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0dIHDR" + struct.pack(">II", 1024, 1024) + b"\x08\x02\x00\x00\x00" + b"\x00\x00\x00\x00"


def prepared():
    return {"model": "gpt-6-luna", "input": [{"type": "message", "role": "system", "content": "System"}, {"type": "message", "role": "user", "content": "Judge قاصدک"}], "max_output_tokens": 2048, "reasoning": {"effort": "none", "mode": "standard"}, "service_tier": "default", "text": {"format": {"type": "json_schema", "name": "fixture", "strict": True, "schema": {"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"], "additionalProperties": False}}}, "store": False, "truncation": "disabled", "include": ["reasoning.encrypted_content"]}


def carrier(blob=png(), request=None):
    original = prepared() if request is None else request
    policy = {"version": "m4_context_policy_v2", "hash": "a" * 64, "maxInputTokens": 128000, "warningInputTokens": 32000}
    text_carrier = {**original, "bookletPolicy": {"contractVersion": "booklet_carrier_v2", "requestDigest": adapter._real_sha(adapter._real_canonical(original)), "tokenPolicy": policy}}
    manifest = [{"assetId": "00000000-0000-4000-8000-000000000001", "versionId": "00000000-0000-4000-8000-000000000002", "sha256": hashlib.sha256(blob).hexdigest(), "byteLength": len(blob), "mimeType": "image/png", "width": 1024, "height": 1024}]
    final = json.loads(adapter._real_canonical(original))
    final["input"][1]["content"] = [{"type": "input_text", "text": original["input"][1]["content"]}, {"type": "input_image", "image_url": "data:image/png;base64," + base64.b64encode(blob).decode(), "detail": "high"}]
    body = {"schemaVersion": "booklet_real_report_carrier_v1", "textRequestJson": adapter._real_canonical(text_carrier), "textRequestDigest": adapter._real_sha(adapter._real_canonical(text_carrier)), "orderedImages": manifest, "manifestDigest": adapter._real_sha(adapter._real_canonical(manifest)), "finalRequestDigest": adapter._real_sha(adapter._real_canonical(final)), "deadlineAtMs": 9007199254740991, "adapterIdentity": adapter.REAL_REPORT_IDENTITY}
    image = ImagePromptMessageContent(format="png", mime_type="image/png", base64_data=base64.b64encode(blob).decode(), detail=ImagePromptMessageContent.DETAIL.HIGH)
    return [UserPromptMessage(content=[TextPromptMessageContent(data=adapter._real_canonical(body)), image])], final, body


class FakeFactory:
    def __init__(self, model="gpt-6-luna"):
        self.model = model
        self.count_payload = None
        self.create_payload = None
        self.kwargs = None

    def __call__(self, **kwargs):
        self.kwargs = kwargs
        return self

    def __enter__(self):
        return SimpleNamespace(responses=SimpleNamespace(input_tokens=SimpleNamespace(count=self.count), create=self.create))

    def __exit__(self, *args):
        return False

    def count(self, **payload):
        self.count_payload = payload
        return SimpleNamespace(input_tokens=100, _request_id="count_1")

    def create(self, **payload):
        self.create_payload = payload
        return SimpleNamespace(status="completed", id="response_1", _request_id="request_1", model=self.model, service_tier="default", usage={"input_tokens": 100, "output_tokens": 8}, output=[{"type": "message", "role": "assistant", "phase": "final_answer", "status": "completed", "content": [{"type": "output_text", "text": '{"answer":"ok"}'}]}])


class Contract(unittest.TestCase):
    @unittest.skipUnless(graph_contract, "Pass --graph-contract with resolved generated report-node fixtures")
    def test_generated_workflow_report_parameters_reach_fake_provider(self):
        fixtures = json.loads(graph_contract.read_text(encoding="utf-8-sig"))
        self.assertEqual({row["case"] for row in fixtures}, {"playful_kid", "enthusiast_parent", "professional_creator", "judge"})
        for row in fixtures:
            with self.subTest(case=row["case"]):
                messages, final, body = carrier(request=row["request"])
                parameters = row["parameters"]
                self.assertEqual(parameters["json_schema"], adapter._real_canonical({key: value for key, value in final["text"]["format"].items() if key != "type"}))
                rejected_factory = FakeFactory(row["request"]["model"])
                with self.assertRaisesRegex(InvokeBadRequestError, "model parameters differ"):
                    adapter.generate(self.llm, rejected_factory, row["request"]["model"], {}, messages,
                        {key: value for key, value in parameters.items() if key not in ("response_format", "json_schema")}, None, None, False, None)
                self.assertIsNone(rejected_factory.kwargs)
                factory = FakeFactory(row["request"]["model"])
                result = adapter.generate(self.llm, factory, row["request"]["model"], {}, messages, parameters, None, None, False, None)
                self.assertEqual(factory.count_payload["input"], final["input"])
                self.assertEqual({key: value for key, value in factory.create_payload.items() if key != "timeout"}, final)
                self.assertGreater(factory.create_payload["timeout"], 0)
                self.assertLessEqual(factory.create_payload["timeout"], 60)
                self.assertEqual(factory.kwargs["max_retries"], 0)
                self.assertEqual(json.loads(result.message.content)["providerEvidence"]["requestDigest"], body["finalRequestDigest"])

    def setUp(self):
        self.llm = SimpleNamespace(_to_credential_kwargs=lambda credentials: {"api_key": "fixture", "base_url": "https://api.openai.com/v1"}, _calc_response_usage=Mock(return_value=LLMUsage.empty_usage()))
        self.params = {"booklet_real_report_execution": True, "booklet_timeout_seconds": 60, "max_tokens": 2048, "reasoning_effort": "none", "reasoning_mode": "standard", "service_tier": "default", "response_format": "json_schema", "json_schema": {"name": "fixture"}, "booklet_token_policy_version": "m4_context_policy_v2", "booklet_token_policy_hash": "a" * 64, "booklet_max_input_tokens": 128000, "booklet_warning_input_tokens": 32000}

    def test_native_bytes_count_generation_payload_parity(self):
        messages, final, body = carrier()
        factory = FakeFactory()
        result = adapter.generate(self.llm, factory, "gpt-6-luna", {}, messages, self.params, None, None, False, None)
        self.assertEqual(factory.count_payload["input"], factory.create_payload["input"])
        self.assertEqual(factory.create_payload["input"], final["input"])
        self.assertEqual(factory.kwargs["max_retries"], 0)
        wrapper = json.loads(result.message.content)
        self.assertEqual(wrapper["providerEvidence"]["requestDigest"], body["finalRequestDigest"])
        self.assertEqual(wrapper["providerEvidence"]["inspectedAssetIds"], ["00000000-0000-4000-8000-000000000001"])
        self.assertEqual(wrapper["content"], '{"answer":"ok"}')

    def test_graphon_file_prompts_precede_text_carrier(self):
        messages, final, body = carrier()
        messages[0].content.reverse()
        factory = FakeFactory()
        result = adapter.generate(self.llm, factory, "gpt-6-luna", {}, messages, self.params, None, None, False, None)
        self.assertEqual(factory.count_payload["input"], final["input"])
        self.assertEqual(factory.create_payload["input"], final["input"])
        self.assertEqual(json.loads(result.message.content)["providerEvidence"]["requestDigest"], body["finalRequestDigest"])

    def test_graphon_multiple_file_order_is_manifest_order(self):
        messages, final, body = carrier()
        second = png() + b"second"
        body["orderedImages"].append({"assetId": "00000000-0000-4000-8000-000000000003",
            "versionId": "00000000-0000-4000-8000-000000000004", "sha256": hashlib.sha256(second).hexdigest(),
            "byteLength": len(second), "mimeType": "image/png", "width": 1024, "height": 1024})
        body["manifestDigest"] = adapter._real_sha(adapter._real_canonical(body["orderedImages"]))
        final["input"][1]["content"].append({"type": "input_image", "image_url": "data:image/png;base64," + base64.b64encode(second).decode(), "detail": "high"})
        body["finalRequestDigest"] = adapter._real_sha(adapter._real_canonical(final))
        carrier_text = TextPromptMessageContent(data=adapter._real_canonical(body))
        first = messages[0].content[1]
        second_part = ImagePromptMessageContent(format="png", mime_type="image/png", base64_data=base64.b64encode(second).decode(), detail=ImagePromptMessageContent.DETAIL.HIGH)
        messages[0].content = [first, second_part, carrier_text]
        factory = FakeFactory()
        adapter.generate(self.llm, factory, "gpt-6-luna", {}, messages, self.params, None, None, False, None)
        self.assertEqual(factory.create_payload["input"], final["input"])
        messages[0].content = [second_part, first, carrier_text]
        with self.assertRaises(InvokeBadRequestError):
            adapter.generate(self.llm, FakeFactory(), "gpt-6-luna", {}, messages, self.params, None, None, False, None)

    def test_missing_or_changed_image_rejected_before_factory(self):
        messages, _, _ = carrier()
        factory = FakeFactory()
        messages[0].content.pop()
        with self.assertRaises(InvokeBadRequestError):
            adapter.generate(self.llm, factory, "gpt-6-luna", {}, messages, self.params, None, None, False, None)
        self.assertIsNone(factory.kwargs)
        messages, _, _ = carrier()
        messages[0].content[1].base64_data = base64.b64encode(png() + b"altered").decode()
        with self.assertRaises(InvokeBadRequestError):
            adapter.generate(self.llm, factory, "gpt-6-luna", {}, messages, self.params, None, None, False, None)
        self.assertIsNone(factory.kwargs)

    def test_legacy_string_does_not_enter_real_branch(self):
        factory = FakeFactory()
        with self.assertRaises(InvokeBadRequestError) as caught:
            adapter.generate(self.llm, factory, "gpt-6-luna", {}, [UserPromptMessage(content="legacy")], {"booklet_real_report_execution": False}, None, None, False, None)
        self.assertIn("authorized request digest", str(caught.exception))
        self.assertIsNone(factory.kwargs)

    def test_packaged_bounded_route_accepts_new_descriptor_false_default(self):
        from models.llm import llm as llm_module
        from models.llm import booklet_bounded
        factory = FakeFactory()
        model = object.__new__(llm_module.OpenAILargeLanguageModel)
        model._to_credential_kwargs = self.llm._to_credential_kwargs
        model._calc_response_usage = self.llm._calc_response_usage
        original = adapter._real_canonical(prepared())
        parameters = {"booklet_real_report_execution": False, "booklet_bounded_execution": True,
                      "booklet_timeout_seconds": 60, "booklet_request_digest": hashlib.sha256(original.encode()).hexdigest(),
                      "booklet_prepared_request": True, "booklet_deadline_at_ms": 9007199254740991,
                      "max_tokens": 2048, "reasoning_effort": "none", "reasoning_mode": "standard",
                      "service_tier": "default", "response_format": "json_schema", "json_schema": {"name": "fixture"}}
        with patch.object(llm_module, "OpenAI", factory), patch.object(booklet_bounded, "generate", adapter.generate):
            result = model._chat_generate("gpt-6-luna", {}, [UserPromptMessage(content=original)],
                                          parameters, None, None, False, None)
        self.assertEqual(json.loads(result.message.content)["providerEvidence"]["requestDigest"],
                         hashlib.sha256(original.encode()).hexdigest())
        self.assertIsNotNone(factory.create_payload)
        parameters["booklet_real_report_execution"] = "false"
        with patch.object(llm_module, "OpenAI", FakeFactory()), patch.object(booklet_bounded, "generate", adapter.generate):
            with self.assertRaises(InvokeBadRequestError):
                model._chat_generate("gpt-6-luna", {}, [UserPromptMessage(content=original)],
                                     parameters, None, None, False, None)

    def test_non_ascii_final_digest(self):
        _, final, body = carrier()
        self.assertEqual(body["finalRequestDigest"], adapter._real_sha(adapter._real_canonical(final)))
        self.assertIn("قاصدک", adapter._real_canonical(final))

    def test_expired_deadline_blocks_count_and_generation(self):
        messages, _, body = carrier()
        body["deadlineAtMs"] = 1
        messages[0].content[0].data = adapter._real_canonical(body)
        factory = FakeFactory()
        with self.assertRaises(InvokeBadRequestError):
            adapter.generate(self.llm, factory, "gpt-6-luna", {}, messages, self.params, None, None, False, None)
        self.assertIsNone(factory.kwargs)

    def test_count_exception_retains_real_policy_and_manifest_without_generation(self):
        messages, _, body = carrier()
        class CountFailure(FakeFactory):
            def count(self, **payload):
                self.count_payload = payload
                raise RuntimeError("private count failure")
        factory = CountFailure()
        result = adapter.generate(self.llm, factory, "gpt-6-luna", {}, messages, self.params, None, None, False, None)
        wrapper = json.loads(result.message.content)
        evidence = wrapper["failureEvidence"]
        self.assertEqual(wrapper["schemaVersion"], "booklet_pre_generation_failure_v2")
        self.assertEqual(evidence["limit"], 128000)
        self.assertEqual(evidence["adapterVersion"], "m5-openai-bounded@1")
        self.assertEqual(evidence["effectivePolicy"]["hash"], "a" * 64)
        self.assertEqual(evidence["manifestDigest"], body["manifestDigest"])
        self.assertEqual(evidence["inspectedAssetIds"], ["00000000-0000-4000-8000-000000000001"])
        self.assertFalse(evidence["generationStarted"])
        self.assertIsNone(factory.create_payload)
        self.assertNotIn("private", result.message.content)

    def test_client_setup_expiry_blocks_paid_count(self):
        messages, _, body = carrier()
        body["deadlineAtMs"] = 120000
        messages[0].content[0].data = adapter._real_canonical(body)
        current = [1.0]
        class DelayedFactory(FakeFactory):
            def __enter__(self):
                current[0] = 121.0
                return super().__enter__()
        factory = DelayedFactory()
        with patch.object(adapter.time, "time", side_effect=lambda: current[0]):
            with self.assertRaises(InvokeBadRequestError):
                adapter.generate(self.llm, factory, "gpt-6-luna", {}, messages, self.params,
                                 None, None, False, None)
        self.assertIsNone(factory.count_payload)
        self.assertIsNone(factory.create_payload)

    def test_native_url_is_rejected_without_fetch(self):
        messages, _, _ = carrier()
        messages[0].content[1].url = "https://example.invalid/image.png"
        factory = FakeFactory()
        with self.assertRaises(InvokeBadRequestError):
            adapter.generate(self.llm, factory, "gpt-6-luna", {}, messages, self.params, None, None, False, None)
        self.assertIsNone(factory.kwargs)

    def test_packaged_opt_in_route(self):
        from models.llm import llm as llm_module
        from models.llm import booklet_bounded
        messages, _, body = carrier()
        factory = FakeFactory()
        model = object.__new__(llm_module.OpenAILargeLanguageModel)
        model._to_credential_kwargs = self.llm._to_credential_kwargs
        model._calc_response_usage = self.llm._calc_response_usage
        with patch.object(llm_module, "OpenAI", factory), patch.object(booklet_bounded, "_verify_stdio_sdk", adapter._verify_stdio_sdk):
            result = model._chat_generate("gpt-6-luna", {}, messages, self.params, None, None, False, None)
        self.assertEqual(json.loads(result.message.content)["providerEvidence"]["requestDigest"], body["finalRequestDigest"])
        self.assertIsNotNone(factory.create_payload)


if __name__ == "__main__":
    unittest.main()
