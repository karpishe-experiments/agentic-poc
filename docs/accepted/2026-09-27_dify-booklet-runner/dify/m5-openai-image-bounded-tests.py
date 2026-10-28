"""Nonbillable contract tests for the opt-in image adapter candidate."""
import base64
import hashlib
import importlib.util
import pathlib
import struct
import sys
import types
import unittest
from types import SimpleNamespace


SOURCE = pathlib.Path(__file__).with_name("m5-openai-image-bounded.py")
openai_client = types.ModuleType("openai_client")
openai_client.normalize_openai_base_url = lambda value: value or "https://api.openai.com/v1"
sys.modules["openai_client"] = openai_client
spec = importlib.util.spec_from_file_location("m5_image", SOURCE)
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


def png(width=1024, height=1024):
    return b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0dIHDR" + struct.pack(">II", width, height) + b"\x08\x02\x00\x00\x00" + b"\x00\x00\x00\x00"


class NativeFile:
    def __init__(self, blob, url=None):
        self.url = url or f"https://dify.uniwares.co.uk/files/{hashlib.sha256(blob).hexdigest()}?timestamp=1&sign=fixture"
        self.mime_type = "image/png"
        self.size = len(blob)
        self.type = "image"
        self.dify_model_identity = "__dify__file__"
        NATIVE_BLOBS[self.url] = blob

    @property
    def blob(self):
        raise AssertionError("Unbounded SDK File.blob must not be read")


NATIVE_BLOBS = {}
FETCHED_URLS = []


class FakeResponse:
    status_code = 200

    def __init__(self, url):
        self.url = url

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def iter_bytes(self):
        yield NATIVE_BLOBS[self.url]


def fake_stream(method, url, **kwargs):
    FETCHED_URLS.append(url)
    assert method == "GET" and kwargs["follow_redirects"] is False
    return FakeResponse(url)


def run(*args, **kwargs):
    return adapter.run(*args, stream_factory=fake_stream, **kwargs)


adapter.File = NativeFile
adapter.verify_stdio_sdk = lambda: None


def request(operation="generate", blobs=(), prompt="A Persian قاصدک"):
    refs = [dict(assetId=f"00000000-0000-4000-8000-{i + 1:012d}", versionId=f"00000000-0000-4000-8000-{i + 101:012d}", sha256=hashlib.sha256(blob).hexdigest(), byteLength=len(blob), mimeType="image/png", width=1024, height=1024) for i, blob in enumerate(blobs)]
    body = dict(schemaVersion=adapter.SCHEMA, operation=operation, prompt=prompt, model=adapter.MODEL, size="1024x1024", quality="high", background="opaque", outputFormat="png", n=1, retries=0, timeoutSeconds=60, deadlineAtMs=120000, references=refs)
    digest = hashlib.sha256(adapter.canonical(body).encode()).hexdigest()
    return adapter.canonical({**body, "requestDigest": digest}), digest


class Factory:
    def __init__(self, response=None, failure=False):
        self.response = response
        self.failure = failure
        self.calls = []
        self.methods = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(images=SimpleNamespace(generate=lambda **args: self.invoke("generate", args), edit=lambda **args: self.invoke("edit", args)))

    def invoke(self, method, args):
        self.methods.append((method, {**args, **({"image": [stream.getvalue() for stream in args["image"]]} if "image" in args else {})}))
        if self.failure:
            raise RuntimeError("secret provider response")
        return self.response


def provider_response(encoded=None):
    return SimpleNamespace(id="img_123", _request_id="req_123", model=adapter.MODEL, usage=SimpleNamespace(input_tokens=5, output_tokens=10, input_tokens_details=SimpleNamespace(text_tokens=2, image_tokens=3), output_tokens_details=SimpleNamespace(image_tokens=8, text_tokens=2)), data=[SimpleNamespace(b64_json=encoded if encoded is not None else base64.b64encode(png()).decode())])


class ImageContract(unittest.TestCase):
    @staticmethod
    def delivery_parameters():
        return {"run_id": "00000000-0000-4000-8000-000000000001",
            "operation_id": "00000000-0000-4000-8000-000000000002",
            "workflow_run_id": "00000000-0000-4000-8000-000000000003",
            "parent_workflow_run_id": "", "input_fingerprint": "a" * 64,
            "booklet_tool_key": "private-test-key"}

    def test_generate_single_call_and_original_bytes(self):
        raw, digest = request()
        factory = Factory(provider_response())
        result, blob = run(raw, [], {"openai_api_key": "test"}, client_factory=factory, now=lambda: 1)
        self.assertEqual((result["status"], result["requestDigest"], blob), ("succeeded", digest, png()))
        self.assertEqual(result["usage"], {"inputTokens": 5, "inputTextTokens": 2, "inputImageTokens": 3, "outputTokens": 10, "outputImageTokens": 8, "outputTextTokens": 2})
        self.assertEqual(result["output"]["sha256"], hashlib.sha256(png()).hexdigest())
        self.assertEqual(result["providerModel"], adapter.MODEL)
        self.assertEqual([method for method, _ in factory.methods], ["generate"])
        self.assertEqual(factory.calls[0]["max_retries"], 0)
        self.assertEqual(factory.calls[0]["timeout"], 60)
        self.assertEqual({key: factory.methods[0][1][key] for key in ("model", "n", "size", "quality", "background", "output_format")}, {"model": adapter.MODEL, "n": 1, "size": "1024x1024", "quality": "high", "background": "opaque", "output_format": "png"})

    def test_edit_preserves_verified_order(self):
        blobs = (png(), png(1024, 1024) + b"second")
        raw, _ = request("edit", blobs)
        factory = Factory(provider_response())
        result, _ = run(raw, list(map(NativeFile, blobs)), {"openai_api_key": "test"}, client_factory=factory, now=lambda: 1)
        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(factory.methods[0][1]["image"], list(blobs))
        self.assertEqual([method for method, _ in factory.methods], ["edit"])

    def test_generate_accepts_omitted_native_file_parameter(self):
        raw, _ = request()
        result, _ = run(raw, None, {"openai_api_key": "test"}, client_factory=Factory(provider_response()), now=lambda: 1)
        self.assertEqual(result["status"], "succeeded")

    def test_untrusted_native_url_is_rejected_before_fetch(self):
        raw, _ = request("edit", (png(),))
        FETCHED_URLS.clear()
        factory = Factory()
        bad = NativeFile(png(), "https://evil.invalid/files/image?sign=fixture")
        result, _ = run(raw, [bad], {"openai_api_key": "test"}, client_factory=factory, now=lambda: 1)
        self.assertEqual(result["failure"]["code"], "reference_origin")
        self.assertEqual(FETCHED_URLS, [])
        self.assertEqual(factory.calls, [])

    def test_client_setup_cannot_dispatch_after_deadline(self):
        raw, _ = request()
        current = [1.0]
        clock = lambda: current[0]
        class DelayedFactory(Factory):
            def __call__(self, **kwargs):
                current[0] = 121.0
                return super().__call__(**kwargs)
        factory = DelayedFactory(provider_response())
        result, blob = run(raw, None, {"openai_api_key": "test"}, client_factory=factory, now=clock)
        self.assertEqual(result["status"], "rejected_pre_provider")
        self.assertEqual(result["failure"]["code"], "deadline")
        self.assertEqual(factory.methods, [])
        self.assertIsNone(blob)

    def test_missing_or_changed_reference_rejected_without_client(self):
        raw, _ = request("edit", (png(),))
        factory = Factory()
        for files in ([], [NativeFile(png() + b"changed")]):
            result, blob = run(raw, files, {"openai_api_key": "test"}, client_factory=factory, now=lambda: 1)
            self.assertEqual(result["status"], "rejected_pre_provider")
            self.assertFalse(result["dispatchStarted"])
            self.assertEqual(result["requestDigest"], __import__("json").loads(raw)["requestDigest"])
            self.assertEqual(result["requestedModel"], adapter.MODEL)
            self.assertIsNone(blob)
        self.assertEqual(factory.calls, [])

    def test_deadline_and_bound(self):
        raw, _ = request()
        factory = Factory(provider_response())
        result, _ = run(raw, [], {}, client_factory=factory, now=lambda: 121)
        self.assertEqual(result["status"], "rejected_pre_provider")
        self.assertEqual(factory.calls, [])
        run(raw, [], {"openai_api_key": "test"}, client_factory=factory, now=lambda: 119.5)
        self.assertLessEqual(factory.calls[0]["timeout"], 0.5)

    def test_post_paid_decode_failure_retains_usage(self):
        raw, _ = request()
        result, blob = run(raw, [], {"openai_api_key": "test"}, client_factory=Factory(provider_response("%%%")), now=lambda: 1)
        self.assertEqual(result["status"], "failed_after_provider")
        self.assertEqual(result["usage"]["outputTokens"], 10)
        self.assertEqual(result["providerRequestId"], "req_123")
        self.assertIsNone(blob)

    def test_provider_exception_is_unknown_without_leaking_body(self):
        raw, _ = request()
        result, blob = run(raw, [], {"openai_api_key": "test"}, client_factory=Factory(failure=True), now=lambda: 1)
        self.assertEqual(result["status"], "unknown_outcome")
        self.assertNotIn("secret", adapter.canonical(result))
        self.assertIsNone(blob)

    def test_non_ascii_digest_vector(self):
        raw, digest = request("edit", (png(),), "قاصدک 🪁")
        self.assertIn("قاصدک 🪁", raw)
        self.assertEqual(digest, hashlib.sha256(adapter.canonical({key: value for key, value in __import__("json").loads(raw).items() if key != "requestDigest"}).encode("utf-8")).hexdigest())

    def test_output_category_absence_keeps_reported_totals(self):
        raw, _ = request()
        response = provider_response()
        response.usage.output_tokens_details = None
        result, _ = run(raw, [], {"openai_api_key": "test"}, client_factory=Factory(response), now=lambda: 1)
        self.assertEqual(result["usage"]["outputTokens"], 10)
        self.assertNotIn("outputImageTokens", result["usage"])

    def test_prompt_provider_limit_rejects_utf16_length(self):
        raw, _ = request(prompt="🪁" * 16001)
        factory = Factory()
        result, _ = run(raw, [], {"openai_api_key": "test"}, client_factory=factory, now=lambda: 1)
        self.assertEqual(result["failure"]["code"], "prompt")
        self.assertEqual(factory.calls, [])

    def test_stdio_reader_mismatch_rejects_before_client(self):
        raw, _ = request()
        factory = Factory()
        original = adapter.verify_stdio_sdk
        try:
            adapter.verify_stdio_sdk = lambda: (_ for _ in ()).throw(adapter.Rejected("stdio_dependency"))
            result, _ = run(raw, [], {"openai_api_key": "test"}, client_factory=factory, now=lambda: 1)
        finally:
            adapter.verify_stdio_sdk = original
        self.assertEqual(result["failure"]["code"], "stdio_dependency")
        self.assertFalse(result["dispatchStarted"])
        self.assertEqual(result["requestDigest"], __import__("json").loads(raw)["requestDigest"])
        self.assertEqual(factory.calls, [])

    def test_evidence_callback_precedes_direct_original_upload(self):
        raw, _ = request()
        result, blob = run(raw, None, {"openai_api_key": "test"}, client_factory=Factory(provider_response()), now=lambda: 1)
        identity, key = adapter.delivery_identity(self.delivery_parameters())
        calls = []
        def post(url, **kwargs):
            calls.append((url, kwargs))
            data = ({"reused": False, "status": "succeeded", "chargeMicrodollars": 12, "overrunMicrodollars": 0}
                    if len(calls) == 1 else {"assetId": "00000000-0000-4000-8000-000000000004",
                    "sha256": result["output"]["sha256"], "state": "succeeded", "reused": False})
            return SimpleNamespace(status_code=200, content=b"{}", json=lambda: {"data": data})
        wrapper = adapter.deliver(result, blob, identity, key, 120000, now=lambda: 1, post=post)
        self.assertEqual(len(calls), 2)
        self.assertTrue(calls[0][0].endswith("/image-evidence"))
        self.assertIn("/image?", calls[1][0])
        self.assertEqual(calls[0][1]["json"]["result"]["usage"]["outputTokens"], 10)
        self.assertEqual(calls[1][1]["content"], png())
        self.assertEqual(wrapper["upload"]["sha256"], result["output"]["sha256"])
        self.assertNotIn(key, adapter.canonical(wrapper))

    def test_failed_evidence_callback_prevents_upload(self):
        raw, _ = request()
        result, blob = run(raw, None, {"openai_api_key": "test"}, client_factory=Factory(provider_response()), now=lambda: 1)
        identity, key = adapter.delivery_identity(self.delivery_parameters())
        calls = []
        def post(url, **kwargs):
            calls.append(url)
            return SimpleNamespace(status_code=500, content=b"private response", json=lambda: {})
        with self.assertRaises(adapter.Rejected) as caught:
            adapter.deliver(result, blob, identity, key, 120000, now=lambda: 1, post=post)
        self.assertEqual(caught.exception.code, "evidence_callback")
        self.assertEqual(len(calls), 1)

    def test_unknown_usage_saved_receipt_keeps_null_charge_without_upload(self):
        raw, _ = request()
        factory = Factory(failure=True)
        result, blob = run(raw, None, {"openai_api_key": "test"}, client_factory=factory, now=lambda: 1)
        self.assertEqual(result["status"], "unknown_outcome")
        self.assertIsNone(result["usage"])
        self.assertIsNone(blob)
        identity, key = adapter.delivery_identity(self.delivery_parameters())
        calls = []
        def post(url, **kwargs):
            calls.append((url, kwargs))
            return SimpleNamespace(status_code=200, content=b"{}", json=lambda: {"data": {
                "reused": False, "status": "unknown_outcome", "chargeMicrodollars": None,
                "overrunMicrodollars": 0}})
        wrapper = adapter.deliver(result, blob, identity, key, 120000, now=lambda: 1, post=post)
        self.assertEqual(wrapper, {"result": result})
        self.assertEqual(len(calls), 1)
        self.assertTrue(calls[0][0].endswith("/image-evidence"))
        self.assertIsNone(calls[0][1]["json"]["result"]["usage"])
        self.assertNotIn("upload", wrapper)
        self.assertEqual(len(factory.methods), 1)
        self.assertNotIn(key, adapter.canonical(wrapper))

    def test_null_charge_cannot_acknowledge_reported_paid_usage(self):
        raw, _ = request()
        result, blob = run(raw, None, {"openai_api_key": "test"}, client_factory=Factory(provider_response()), now=lambda: 1)
        identity, key = adapter.delivery_identity(self.delivery_parameters())
        calls = []
        def post(url, **kwargs):
            calls.append(url)
            return SimpleNamespace(status_code=200, content=b"{}", json=lambda: {"data": {
                "reused": False, "status": "succeeded", "chargeMicrodollars": None,
                "overrunMicrodollars": 0}})
        with self.assertRaises(adapter.Rejected) as caught:
            adapter.deliver(result, blob, identity, key, 120000, now=lambda: 1, post=post)
        self.assertEqual(caught.exception.code, "evidence_callback")
        self.assertEqual(len(calls), 1)

    def test_tool_emits_one_json_after_delivery_without_native_blob(self):
        raw, _ = request()
        result, blob = run(raw, None, {"openai_api_key": "test"}, client_factory=Factory(provider_response()), now=lambda: 1)
        params = self.delivery_parameters() | {"request_json": raw, "reference_files": None}
        tool = adapter.BookletRealImageTool.from_credentials({"openai_api_key": "test"})
        original_run, original_deliver = adapter.run, adapter.deliver
        seen = []
        try:
            adapter.run = lambda *args, **kwargs: (result, blob)
            def delivered(*args, **kwargs):
                seen.append("protected_callback_and_upload")
                return {"result": result, "upload": {"assetId": "00000000-0000-4000-8000-000000000004",
                    "sha256": result["output"]["sha256"], "state": "succeeded", "reused": False}}
            adapter.deliver = delivered
            messages = list(tool._invoke(params))
        finally:
            adapter.run, adapter.deliver = original_run, original_deliver
        self.assertEqual(seen, ["protected_callback_and_upload"])
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0].message.json_object["upload"]["sha256"], result["output"]["sha256"])


if __name__ == "__main__":
    unittest.main()
