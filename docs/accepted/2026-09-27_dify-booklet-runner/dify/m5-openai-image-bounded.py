"""Opt-in Booklet image tool candidate for the audited openai_tool 0.2.2 package.

Copy this module into the plugin only during a reviewed private package build.
The caller owns admission, reservation, callback settlement and original-byte storage.
No provider request is made while validating the carrier or native Dify files.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import inspect
import io
import json
import re
import struct
import time
import httpx
from importlib.metadata import version
from pathlib import Path
from collections.abc import Generator
from typing import Any
from urllib.parse import urlsplit
from urllib.parse import urlencode

from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage
from dify_plugin.file.file import File
from openai import OpenAI

from openai_client import normalize_openai_base_url


IDENTITY = "m5-openai-image-bounded@1"
MODEL = "gpt-image-2.5-sunburst-2026-09-08"
SCHEMA = "booklet_real_image_request_v1"
RESULT_SCHEMA = "booklet_real_image_result_v1"
MAX_REFERENCE_BYTES = 10 * 1024 * 1024
MAX_OUTPUT_BYTES = 20 * 1024 * 1024
HEX = re.compile(r"[0-9a-f]{64}\Z")
STDIO_READER_SHA = "546de8f0c5171a924e80190df2f917782ae6ddda85db4515b6c021c4d9ce6e22"
TRUSTED_FILE_ORIGIN = "https://dify.uniwares.co.uk"
BOOKLET_CALLBACK_ORIGIN = "https://booklet-staging.uniwares.co.uk"
EVIDENCE_PATH = "/api/experiments/booklet-tools/image-evidence"
IMAGE_UPLOAD_PATH = "/api/experiments/booklet-tools/image"
UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\Z")


class Rejected(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def verified_identity(request_json: Any) -> dict[str, Any] | None:
    """Recover only a canonical, digest-bound identity for pre-call rejection."""
    if not isinstance(request_json, str):
        return None
    try:
        value = json.loads(request_json)
        digest = value["requestDigest"]
        body = {key: item for key, item in value.items() if key != "requestDigest"}
        if (not isinstance(value, dict) or request_json != canonical(value)
                or not isinstance(digest, str) or not HEX.fullmatch(digest)
                or hashlib.sha256(canonical(body).encode("utf-8")).hexdigest() != digest
                or value.get("model") != MODEL):
            return None
        return value
    except (TypeError, ValueError, KeyError, AttributeError):
        return None


def field(obj: Any, name: str) -> Any:
    return obj.get(name) if isinstance(obj, dict) else getattr(obj, name, None)


def integer(value: Any) -> bool:
    return type(value) is int and 0 <= value <= 9007199254740991


def verify_stdio_sdk() -> None:
    # The audited daemon can replay an incomplete stdin write. The pinned reader
    # dispatches only complete newline-terminated frames before paid image I/O.
    try:
        from dify_plugin.core.server.stdio.request_reader import StdioRequestReader
        digest = hashlib.sha256(Path(inspect.getfile(StdioRequestReader)).read_bytes()).hexdigest()
        if version("dify-plugin") != "0.10.2" or digest != STDIO_READER_SHA:
            raise Rejected("stdio_dependency")
    except Exception:
        raise Rejected("stdio_dependency") from None


def image_info(blob: bytes) -> tuple[str, int, int]:
    if len(blob) >= 24 and blob[:8] == b"\x89PNG\r\n\x1a\n" and blob[12:16] == b"IHDR":
        width, height = struct.unpack(">II", blob[16:24])
        if width and height:
            return "image/png", width, height
    if len(blob) >= 12 and blob[:4] == b"RIFF" and blob[8:12] == b"WEBP":
        if blob[12:16] == b"VP8X" and len(blob) >= 30:
            return "image/webp", 1 + int.from_bytes(blob[24:27], "little"), 1 + int.from_bytes(blob[27:30], "little")
        if blob[12:16] == b"VP8 " and len(blob) >= 30 and blob[23:26] == b"\x9d\x01\x2a":
            return "image/webp", int.from_bytes(blob[26:28], "little") & 0x3fff, int.from_bytes(blob[28:30], "little") & 0x3fff
        if blob[12:16] == b"VP8L" and len(blob) >= 25 and blob[20] == 0x2f:
            packed = int.from_bytes(blob[21:25], "little")
            return "image/webp", (packed & 0x3fff) + 1, ((packed >> 14) & 0x3fff) + 1
    if blob[:2] == b"\xff\xd8":
        pos = 2
        while pos + 4 < len(blob):
            if blob[pos] != 0xff:
                break
            marker = blob[pos + 1]
            pos += 2
            if marker in (0xd8, 0xd9) or 0xd0 <= marker <= 0xd7:
                continue
            size = int.from_bytes(blob[pos:pos + 2], "big")
            if size < 2 or pos + size > len(blob):
                break
            if marker in (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf) and size >= 7:
                height = int.from_bytes(blob[pos + 3:pos + 5], "big")
                width = int.from_bytes(blob[pos + 5:pos + 7], "big")
                if width and height:
                    return "image/jpeg", width, height
            pos += size
    raise Rejected("unsupported_image_bytes")


def native_file_url(source: File) -> str:
    url = source.url
    if (not isinstance(url, str) or len(url) > 4096 or any(ord(char) < 33 or ord(char) > 126 for char in url)):
        raise Rejected("reference_origin")
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or parsed.netloc != "dify.uniwares.co.uk" or parsed.username is not None
            or parsed.password is not None or parsed.port not in (None, 443) or parsed.fragment
            or not parsed.path.startswith("/files/") or len(parsed.path) > 1024
            or "%" in parsed.path or "\\" in parsed.path
            or any(segment in ("", ".", "..") for segment in parsed.path.split("/")[1:])
            or len(parsed.query) > 2048):
        raise Rejected("reference_origin")
    if (source.dify_model_identity != "__dify__file__" or source.type != "image"
            or source.mime_type not in ("image/png", "image/jpeg", "image/webp")):
        raise Rejected("reference_type")
    return url


def read_native_file(source: File, deadline_at_ms: int, *, now=time.time, stream_factory=httpx.stream) -> bytes:
    url = native_file_url(source)  # Validate origin and path before any network I/O.
    remaining = (deadline_at_ms - int(now() * 1000)) / 1000
    if remaining <= 0:
        raise Rejected("deadline")
    try:
        with stream_factory("GET", url, follow_redirects=False, timeout=remaining) as response:
            if response.status_code != 200:
                raise Rejected("reference_fetch")
            chunks: list[bytes] = []
            size = 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > MAX_REFERENCE_BYTES or int(now() * 1000) >= deadline_at_ms:
                    raise Rejected("reference_limit")
                chunks.append(chunk)
        return b"".join(chunks)
    except Rejected:
        raise
    except Exception:
        raise Rejected("reference_fetch") from None


def validate(request_json: str, reference_files: Any, *, now_ms: int, now=time.time, stream_factory=httpx.stream) -> tuple[dict[str, Any], list[io.BytesIO]]:
    if not isinstance(request_json, str) or len(request_json.encode("utf-8")) > 2 * 1024 * 1024:
        raise Rejected("request_size")
    try:
        request = json.loads(request_json)
        digest = request.pop("requestDigest")
        encoded = canonical(request)
    except (ValueError, TypeError, AttributeError, KeyError):
        raise Rejected("request_json") from None
    if not isinstance(request, dict) or set(request) != {"schemaVersion", "operation", "prompt", "model", "size", "quality", "background", "outputFormat", "n", "retries", "timeoutSeconds", "deadlineAtMs", "references"}:
        raise Rejected("request_fields")
    if request_json != canonical({**request, "requestDigest": digest}) or not isinstance(digest, str) or not HEX.fullmatch(digest) or hashlib.sha256(encoded.encode("utf-8")).hexdigest() != digest:
        raise Rejected("request_digest")
    if request["schemaVersion"] != SCHEMA or request["operation"] not in ("generate", "edit") or request["model"] != MODEL:
        raise Rejected("request_policy")
    if not isinstance(request["prompt"], str) or not request["prompt"].strip() or len(request["prompt"].encode("utf-16-le")) // 2 > 32000:
        raise Rejected("prompt")
    if request["n"] != 1 or type(request["n"]) is not int or request["retries"] != 0 or type(request["retries"]) is not int:
        raise Rejected("call_count")
    if request["size"] not in ("1024x1024", "1536x1024", "1024x1536") or request["quality"] not in ("low", "medium", "high", "xhigh", "max") or request["background"] not in ("opaque", "transparent") or request["outputFormat"] not in ("png", "jpeg", "webp"):
        raise Rejected("image_settings")
    if request["background"] == "transparent" and request["outputFormat"] == "jpeg":
        raise Rejected("image_settings")
    if not integer(request["timeoutSeconds"]) or not 1 <= request["timeoutSeconds"] <= 270 or not integer(request["deadlineAtMs"]) or request["deadlineAtMs"] <= now_ms:
        raise Rejected("deadline")
    refs = request["references"]
    if not isinstance(refs, list) or len(refs) > 15 or (request["operation"] == "generate") != (len(refs) == 0):
        raise Rejected("reference_count")
    if len({(item.get("assetId"), item.get("versionId")) for item in refs if isinstance(item, dict)}) != len(refs):
        raise Rejected("reference_identity")
    # Dify 1.17.1 casts an absent FILES value to [None] before plugin invocation.
    # Only a no-reference generation may treat that exact placeholder as empty.
    empty_placeholder = (isinstance(reference_files, list) and len(reference_files) == 1
                         and reference_files[0] is None)
    if not refs and (reference_files is None or empty_placeholder):
        reference_files = []
    if not isinstance(reference_files, list) or len(reference_files) != len(refs):
        raise Rejected("reference_count")
    streams: list[io.BytesIO] = []
    for index, (manifest, source) in enumerate(zip(refs, reference_files)):
        if not isinstance(manifest, dict) or set(manifest) != {"assetId", "versionId", "sha256", "byteLength", "mimeType", "width", "height"} or not isinstance(source, File):
            raise Rejected("reference_type")
        if any(not isinstance(manifest[key], str) or not manifest[key] for key in ("assetId", "versionId")) or not isinstance(manifest["sha256"], str) or not HEX.fullmatch(manifest["sha256"]):
            raise Rejected("reference_identity")
        if source.mime_type != manifest["mimeType"] or (source.size is not None and source.size != manifest["byteLength"]):
            raise Rejected("reference_image")
        blob = read_native_file(source, request["deadlineAtMs"], now=now, stream_factory=stream_factory)
        if not isinstance(blob, bytes) or not blob or len(blob) > MAX_REFERENCE_BYTES or not integer(manifest["byteLength"]) or len(blob) != manifest["byteLength"] or hashlib.sha256(blob).hexdigest() != manifest["sha256"]:
            raise Rejected("reference_bytes")
        mime, width, height = image_info(blob)
        if width * height > 64_000_000 or (mime, width, height) != (manifest["mimeType"], manifest["width"], manifest["height"]):
            raise Rejected("reference_image")
        stream = io.BytesIO(blob)
        stream.name = f"reference-{index}.{mime.split('/')[1]}"
        streams.append(stream)
    return {**request, "requestDigest": digest}, streams


def usage_of(response: Any) -> dict[str, int] | None:
    usage = field(response, "usage")
    input_total, output_total = field(usage, "input_tokens"), field(usage, "output_tokens")
    if not integer(input_total) or not integer(output_total):
        return None
    result = {"inputTokens": input_total, "outputTokens": output_total}
    for details_name, pairs in (("input_tokens_details", (("text_tokens", "inputTextTokens"), ("image_tokens", "inputImageTokens"))),
                                ("output_tokens_details", (("text_tokens", "outputTextTokens"), ("image_tokens", "outputImageTokens")))):
        details = field(usage, details_name)
        for source, target in pairs:
            value = field(details, source)
            if integer(value):
                result[target] = value
    return result


def safe_id(value: Any) -> str | None:
    return value if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,200}", value) else None


def evidence(request: dict[str, Any] | None, status: str, stage: str | None = None, code: str | None = None, response: Any = None) -> dict[str, Any]:
    result: dict[str, Any] = {
        "schemaVersion": RESULT_SCHEMA, "requestDigest": request["requestDigest"] if request else None,
        "adapterIdentity": IDENTITY, "requestedModel": request["model"] if request else None,
        "status": status, "dispatchStarted": status != "rejected_pre_provider",
        "usage": usage_of(response) if response is not None else None, "output": None,
        "failure": {"stage": stage, "code": code} if stage else None,
    }
    if response is not None:
        for source, target in (("id", "providerResponseId"), ("_request_id", "providerRequestId")):
            value = safe_id(field(response, source))
            if value:
                result[target] = value
        provider_model = field(response, "model")
        if isinstance(provider_model, str) and re.fullmatch(r"[A-Za-z0-9_.-]{1,200}", provider_model):
            result["providerModel"] = provider_model
    return result


def run(request_json: str, reference_files: Any, credentials: dict[str, Any], *, client_factory=OpenAI, now=time.time, stream_factory=httpx.stream) -> tuple[dict[str, Any], bytes | None]:
    request: dict[str, Any] | None = None
    try:
        request, streams = validate(request_json, reference_files, now_ms=int(now() * 1000), now=now, stream_factory=stream_factory)
        remaining = min(request["timeoutSeconds"], (request["deadlineAtMs"] - int(now() * 1000)) / 1000)
        if remaining <= 0:
            raise Rejected("deadline")
        args = {"model": request["model"], "prompt": request["prompt"], "size": request["size"], "quality": request["quality"], "background": request["background"], "output_format": request["outputFormat"], "n": 1}
        if request["operation"] == "edit":
            args["image"] = streams
        # No arbitrary URL download. The only inputs are verified native Dify bytes.
        endpoint = normalize_openai_base_url(credentials.get("openai_base_url"))
        if endpoint is not None and endpoint.rstrip("/") != "https://api.openai.com/v1":
            raise Rejected("provider_endpoint")
        verify_stdio_sdk()
        client = client_factory(api_key=credentials["openai_api_key"], base_url="https://api.openai.com/v1", organization=credentials.get("openai_organization_id") or None, max_retries=0, timeout=remaining)
    except (Rejected, KeyError) as exc:
        request = request or verified_identity(request_json)
        return evidence(request, "rejected_pre_provider", "pre_provider", exc.code if isinstance(exc, Rejected) else "credentials"), None
    except Exception:
        request = request or verified_identity(request_json)
        return evidence(request, "rejected_pre_provider", "pre_provider", "client_setup"), None
    response = None
    try:
        remaining = min(request["timeoutSeconds"], (request["deadlineAtMs"] - int(now() * 1000)) / 1000)
        if remaining <= 0:
            return evidence(request, "rejected_pre_provider", "pre_provider", "deadline"), None
        response = client.images.generate(**args, timeout=remaining) if request["operation"] == "generate" else client.images.edit(**args, timeout=remaining)
    except Exception:
        return evidence(request, "unknown_outcome", "provider", "request_failed"), None
    finally:
        for stream in streams:
            stream.close()
    result = evidence(request, "failed_after_provider" if usage_of(response) is not None else "unknown_outcome", "post_provider", "output_invalid", response)
    try:
        items = field(response, "data")
        if not isinstance(items, list) or len(items) != 1 or not isinstance(field(items[0], "b64_json"), str):
            return result, None
        encoded = field(items[0], "b64_json")
        if encoded.startswith("data:image/"):
            header, separator, encoded = encoded.partition(",")
            if not separator or header != f"data:image/{request['outputFormat']};base64":
                return result, None
        if len(encoded) > MAX_OUTPUT_BYTES * 2:
            return result, None
        blob = base64.b64decode(encoded, validate=True)
        if not blob or len(blob) > MAX_OUTPUT_BYTES:
            return result, None
        mime, width, height = image_info(blob)
        if mime != "image/" + request["outputFormat"] or width * height > 64_000_000:
            return result, None
        result.update(status="succeeded", failure=None, output={"sha256": hashlib.sha256(blob).hexdigest(), "byteLength": len(blob), "mimeType": mime, "width": width, "height": height})
        return result, blob
    except (Rejected, ValueError, binascii.Error, TypeError):
        return result, None


def delivery_identity(parameters: dict[str, Any]) -> tuple[dict[str, Any], str]:
    names = ("run_id", "operation_id", "workflow_run_id", "parent_workflow_run_id", "input_fingerprint")
    values = [parameters.get(name) for name in names]
    if (any(not isinstance(value, str) or not UUID.fullmatch(value) for value in values[:3])
            or values[3] not in (None, "") and (not isinstance(values[3], str) or not UUID.fullmatch(values[3]))
            or not isinstance(values[4], str) or not HEX.fullmatch(values[4])):
        raise Rejected("delivery_identity")
    key = parameters.get("booklet_tool_key")
    if not isinstance(key, str) or not key or len(key) > 4096:
        raise Rejected("delivery_auth")
    return {"runId": values[0], "operationId": values[1], "workflowRunId": values[2],
            "parentWorkflowRunId": values[3] or None, "inputFingerprint": values[4]}, key


def deliver(result: dict[str, Any], blob: bytes | None, identity: dict[str, Any], key: str,
            deadline_at_ms: int, *, now=time.time, post=httpx.post) -> dict[str, Any]:
    """Settle known usage before storing original bytes; never dispatch a model."""
    headers = {"x-booklet-tool-key": key, "content-type": "application/json"}
    remaining = (deadline_at_ms + 30000 - int(now() * 1000)) / 1000
    if remaining <= 0:
        raise Rejected("evidence_deadline")
    body = {**identity, "result": result}
    try:
        response = post(BOOKLET_CALLBACK_ORIGIN + EVIDENCE_PATH, json=body, headers=headers,
                        follow_redirects=False, timeout=min(remaining, 30))
        if response.status_code != 200 or len(response.content) > 4096:
            raise Rejected("evidence_callback")
        receipt = response.json().get("data")
        if (not isinstance(receipt, dict) or type(receipt.get("reused")) is not bool
                or not isinstance(receipt.get("status"), str)
                or not (integer(receipt.get("chargeMicrodollars")) or
                        receipt.get("chargeMicrodollars") is None and result.get("usage") is None and
                        result.get("status") in ("unknown_outcome", "succeeded"))
                or not integer(receipt.get("overrunMicrodollars"))):
            raise Rejected("evidence_callback")
    except Rejected:
        raise
    except Exception:
        raise Rejected("evidence_callback") from None
    wrapper = {"result": result}
    if blob is None:
        return wrapper
    if result["status"] != "succeeded" or not isinstance(result.get("output"), dict):
        raise Rejected("upload_state")
    remaining = (deadline_at_ms + 30000 - int(now() * 1000)) / 1000
    if remaining <= 0:
        raise Rejected("upload_deadline")
    query = urlencode({**identity, "parentWorkflowRunId": identity["parentWorkflowRunId"] or ""})
    try:
        response = post(BOOKLET_CALLBACK_ORIGIN + IMAGE_UPLOAD_PATH + "?" + query, content=blob,
                        headers={"x-booklet-tool-key": key, "content-type": result["output"]["mimeType"]},
                        follow_redirects=False, timeout=min(remaining, 30))
        if response.status_code != 200 or len(response.content) > 4096:
            raise Rejected("original_upload")
        upload = response.json().get("data")
        if (not isinstance(upload, dict) or not isinstance(upload.get("assetId"), str)
                or not UUID.fullmatch(upload["assetId"]) or upload.get("sha256") != result["output"]["sha256"]
                or upload.get("state") != "succeeded" or type(upload.get("reused")) is not bool):
            raise Rejected("original_upload")
    except Rejected:
        raise
    except Exception:
        raise Rejected("original_upload") from None
    wrapper["upload"] = {name: upload[name] for name in ("assetId", "sha256", "state", "reused")}
    return wrapper


class BookletRealImageTool(Tool):
    def _invoke(self, tool_parameters: dict) -> Generator[ToolInvokeMessage, None, None]:
        try:
            identity, key = delivery_identity(tool_parameters)
        except Rejected:
            yield self.create_text_message("Booklet image evidence context is invalid.")
            return
        result, blob = run(tool_parameters.get("request_json"), tool_parameters.get("reference_files"), self.runtime.credentials)
        request = verified_identity(tool_parameters.get("request_json"))
        if request is None:
            yield self.create_text_message("Booklet image request identity is invalid.")
            return
        try:
            wrapper = deliver(result, blob, identity, key, request["deadlineAtMs"])
        except Rejected:
            # After a paid response, the application keeps the planning hold
            # until its protected callback establishes attributable usage.
            yield self.create_text_message("Booklet image evidence or original upload failed; inspect the saved operation.")
            return
        yield self.create_json_message(wrapper)
