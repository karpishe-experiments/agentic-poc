"""Read-only parity check against the audited provider; never invokes a client.

Usage: python THIS_FILE PATH_TO_CANDIDATE_PACKAGE PATH_TO_REQUEST_VECTORS_JSON
Export vectors with tests/helpers/m4-request-vectors.ts in an ignored workspace.
"""
import hashlib
import json
from pathlib import Path
import socket
import sys


def forbidden(*args, **kwargs):
    raise AssertionError("Real socket access is forbidden during request parity.")


socket.socket.connect = forbidden
socket.create_connection = forbidden
sys.path.insert(0, str(Path(sys.argv[1]).resolve()))
from models.llm import responses  # noqa: E402
from dify_plugin.entities.model.message import SystemPromptMessage, UserPromptMessage  # noqa: E402

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
print(f"PASS: {len(vectors)} exact Node/Python provider request translations; zero clients or sockets.")
