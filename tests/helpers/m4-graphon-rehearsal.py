"""Offline boundary rehearsal using actual AST from the pinned Graphon wheel.

stdin: generated graph decoder/LLM params, authorization args. No provider or network.
The wheel is an explicitly supplied retained audit input, not a CI dependency.
"""
import ast
import hashlib
import json
import logging
from pathlib import Path
import socket
import sys
from types import SimpleNamespace
from zipfile import ZipFile

sys.stdout.reconfigure(encoding="utf-8")
socket.socket = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("Network forbidden"))
fixture = json.load(sys.stdin)
wheel = Path(sys.argv[1])
assert hashlib.sha256(wheel.read_bytes()).hexdigest() == "6f7608aaaa65607c4935735137ed4b7029b1e6ca80202cbe829af3370cf4404e"
scope = {"json": json, "logger": logging.getLogger("rehearsal")}


def extract(source, names):
    tree = ast.parse(source)
    selected = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in names:
            selected.append(node)
        elif isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in names for t in node.targets):
            selected.append(node)
    assert len(selected) == len(names), names
    module = ast.Module(body=[ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0), *selected], type_ignores=[])
    exec(compile(ast.fix_missing_locations(module), "pinned-graphon", "exec"), scope)


class Segment:
    def __init__(self, value):
        self.value = value

    @property
    def text(self):
        return str(self.value)


scope.update(Segment=Segment, SegmentType=SimpleNamespace(GROUP="group"), build_segment=Segment, re=__import__("re"))
with ZipFile(wheel) as archive:
    extract(archive.read("graphon/variables/segment_group.py").decode(), {"SegmentGroup"})
    extract(archive.read("graphon/variables/template_resolution.py").decode(), {"VARIABLE_PATTERN", "convert_template"})
    extract(archive.read("graphon/nodes/llm/llm_utils.py").decode(),
            {"MAX_RESOLVED_VALUE_LENGTH", "_coerce_resolved_value", "resolve_completion_params_variables", "_filter_prompt_messages"})
    extract(archive.read("graphon/nodes/code/code_node.py").decode(), {"_check_string"})

decoder = {}
exec(fixture["source"], decoder)
values = decoder["main"](**fixture["args"])
assert values["authorized"] == "yes"


class Pool:
    def get(self, selector):
        if len(selector) == 2 and selector[0] == "m4_decode" and selector[1] in values:
            return Segment(values[selector[1]])
        return None


pool = Pool()
carrier = scope["convert_template"](pool, fixture["prompt"]).text
expected = json.loads(fixture["args"]["authorization_body"])["data"]["m4"]["requestJson"]
assert carrier == expected
# Real Graphon prompt normalization collapses exactly one text item unchanged.
scope.update(PromptMessageContentType=SimpleNamespace(TEXT="text"), NoPromptFoundError=ValueError)
message = SimpleNamespace(content=[SimpleNamespace(type="text", data=carrier)])
messages = scope["_filter_prompt_messages"](prompt_messages=[message],
    model_schema=SimpleNamespace(supports_prompt_content_type=lambda _: True))
assert messages[0].content == expected
resolved = scope["resolve_completion_params_variables"](fixture["params"], pool)
assert resolved["enable_stream"] is False
assert resolved["booklet_prepared_request"] is True
assert resolved["booklet_request_digest"] == values["digest"]
assert resolved["booklet_timeout_seconds"] == values["timeout_seconds"]
assert resolved["booklet_deadline_at_ms"] == values["deadline_at_ms"]
# Actual Code-node validation preserves every admitted chunk, even with the
# stricter 65536-character limit. Literal NUL is already rejected by the decoder.
scope["OutputValidationError"] = ValueError
limits = SimpleNamespace(_limits=SimpleNamespace(max_string_length=65536))
for index in range(32):
    value = values["request_%02d" % index]
    assert scope["_check_string"](limits, value, "request") == value
# Isolate all 32 prompt fields at maximum character length. This is a transport
# boundary fixture only: the authorization HTTP envelope has a tighter 1 MiB cap.
for index in range(32):
    values["request_%02d" % index] = "x" * 65535 + chr(0x600 + index)
all_chunks = "".join(values["request_%02d" % index] for index in range(32))
assert scope["convert_template"](pool, fixture["prompt"]).text == all_chunks
# Prove why the request/schema cannot use a dynamic completion parameter.
values["oversized"] = "x" * 1025
assert len(scope["resolve_completion_params_variables"]({"probe": "{{#m4_decode.oversized#}}"}, pool)["probe"]) == 1024
# A prefixed all-numeric digest remains a string; raw digits do not.
values["digest"] = "sha256:" + "1" * 64
assert scope["resolve_completion_params_variables"]({"probe": "{{#m4_decode.digest#}}"}, pool)["probe"] == values["digest"]
print(json.dumps({"carrierBytes": len(carrier.encode()), "exact": True, "parameters": resolved}))
