"""Read-only parity check against the audited provider; never invokes a client.

Usage: python THIS_FILE PATH_TO_CANDIDATE_PACKAGE PATH_TO_REQUEST_VECTORS_JSON
Export vectors with tests/helpers/m4-request-vectors.ts in an ignored workspace.
"""
import hashlib
import json
from pathlib import Path
import socket
import sys
from types import SimpleNamespace


def forbidden(*args, **kwargs):
    raise AssertionError("Real socket access is forbidden during request parity.")


socket.socket.connect = forbidden
socket.create_connection = forbidden
sys.path.insert(0, str(Path(sys.argv[1]).resolve()))
from models.llm import responses, booklet_bounded  # noqa: E402
from dify_plugin.entities.model.message import SystemPromptMessage, UserPromptMessage  # noqa: E402
from dify_plugin.entities.model.llm import LLMUsage  # noqa: E402

vectors = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
assert len(vectors) == 48, "Expected the complete synthetic role/persona matrix."
for index, vector in enumerate(vectors):
    expected = json.loads(vector["requestJson"])
    translated = {
        "model": expected["model"],
        "input": responses.input_items([SystemPromptMessage(content=vector["systemPrompt"]), UserPromptMessage(content=vector["contextJson"])]),
        **responses.parameters(expected["model"], vector["modelParameters"], None, None, {}),
    }
    translated.update(store=False, truncation="disabled")
    encoded = json.dumps(translated, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    assert encoded == vector["requestJson"], f"Vector {index}: provider translation differs."
    assert hashlib.sha256(encoded.encode()).hexdigest() == vector["requestDigest"], f"Vector {index}: digest differs."

    calls = []
    class FakeClient:
        def __init__(self, **kwargs):
            assert kwargs["max_retries"] == 0 and kwargs["timeout"] == 60
            assert kwargs["base_url"] == "https://api.openai.com/v1"
            self.responses = SimpleNamespace(input_tokens=SimpleNamespace(count=self.count), create=self.create)
        def __enter__(self): return self
        def __exit__(self, *args): return None
        def count(self, **kwargs):
            assert kwargs == {key: value for key, value in expected.items() if key in {"model", "input", "reasoning", "text", "truncation"}}
            calls.append("count")
            return {"input_tokens": 100}
        def create(self, **kwargs):
            timeout = kwargs.pop("timeout")
            assert 0 < timeout <= 60 and kwargs == expected
            calls.append("generation")
            return {"id": "resp_fake", "_request_id": "req_fake", "model": expected["model"], "service_tier": "default", "status": "completed",
                    "usage": {"input_tokens": 100, "output_tokens": 10},
                    "output": [{"type": "message", "content": [{"type": "output_text", "text": "{}"}]}]}

    llm = SimpleNamespace(_to_credential_kwargs=lambda _credentials: {"api_key": "fake-not-a-key"},
                          _calc_response_usage=lambda *args: LLMUsage.empty_usage())
    parameters = {key: value for key, value in vector["modelParameters"].items() if key not in {"response_format", "json_schema"}}
    parameters.update(booklet_bounded_execution=True, booklet_prepared_request=True, booklet_timeout_seconds=60,
                      booklet_deadline_at_ms=4102444800000, booklet_request_digest="sha256:" + vector["requestDigest"])
    result = booklet_bounded.generate(llm, FakeClient, expected["model"], {"api_protocol": "responses"},
        [UserPromptMessage(content=vector["requestJson"])], parameters, None, None, False, None)
    assert calls == ["count", "generation"]
    assert json.loads(result.message.content)["providerEvidence"]["requestDigest"] == vector["requestDigest"]
print(f"PASS: {len(vectors)} exact Node/Python translations and fake carrier invocations; zero HTTP requests or sockets.")
