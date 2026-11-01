"""Opt-in Real judge extension of the audited M4 OpenAI provider adapter.

Copied into models/llm/booklet_bounded.py by the reviewed provider patch.
The application must reserve before invoking this path. Token counting is a
separate, non-generating API request; this module performs at most one generation.
"""
from __future__ import annotations

import hashlib
import base64
import binascii
import json
import math
import re
import struct
import time
import traceback
from copy import deepcopy
from typing import Any

from dify_plugin.entities.model.llm import LLMResult, LLMUsage
from dify_plugin.entities.model.message import AssistantPromptMessage, ImagePromptMessageContent, TextPromptMessageContent
from dify_plugin.errors.model import InvokeBadRequestError

from . import responses


def _verify_stdio_sdk() -> dict[str, str]:
    # The pinned daemon can retry an incomplete local stdin write. At-most-once
    # delivery depends on this SDK dispatching only newline-terminated frames.
    # Verify the audited reader before paid I/O, without a host inspection action.
    import inspect
    from importlib.metadata import version
    from pathlib import Path
    from dify_plugin.core.server.stdio.request_reader import StdioRequestReader
    expected = "546de8f0c5171a924e80190df2f917782ae6ddda85db4515b6c021c4d9ce6e22"
    try:
        sdk_version = version("dify-plugin")
        reader_digest = hashlib.sha256(Path(inspect.getfile(StdioRequestReader)).read_bytes()).hexdigest()
    except (OSError, TypeError, ValueError):
        raise InvokeBadRequestError("Booklet cannot verify its audited stdio dependency.") from None
    if sdk_version != "0.10.2" or reader_digest != expected:
        raise InvokeBadRequestError("Booklet stdio dependency differs from its audited delivery contract.")
    return {"version": sdk_version, "readerSha256": reader_digest}


def _integer(value: Any) -> int | None:
    return value if type(value) is int and value >= 0 else None


def _field(value: Any, name: str) -> Any:
    return responses.field(value, name)


def _count_request_id(value: Any) -> str | None:
    value = _field(value, "_request_id")
    return value if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,200}", value) else None


def provider_error(exc: Exception, secrets=()) -> dict[str, Any]:
    """Retain useful provider evidence without credentials or signed URLs."""
    truncated = False
    redacted = False
    def read(value, name, default=None):
        try:
            return getattr(value, name, default)
        except Exception:
            return '[UNREADABLE PROPERTY]'
    def clean(value):
        nonlocal truncated, redacted
        try:
            original = str(value)
        except Exception:
            original = '[UNREADABLE ERROR]'
        text = original
        for secret in secrets:
            if isinstance(secret, str) and len(secret) >= 8:
                text = text.replace(secret, '[REDACTED]')
        text = re.sub(r'(?i)(Bearer|Basic)\s+[A-Za-z0-9+/=_.-]+', '[REDACTED]', text)
        text = re.sub(r'\bsk-[A-Za-z0-9_-]+', '[REDACTED]', text)
        text = re.sub(r'''(?i)((?:set-cookie|cookie|authorization)["']?\s*:\s*)(?:"[^"]*"|'[^']*'|[^\r\n}]*)''', r'\1[REDACTED]', text)
        text = re.sub(r'(?i)([?&]sig=)[^&\s\"\x27]+', r'\1[REDACTED]', text)
        text = re.sub(r'(?i)((?:password|secret|api[_-]?key|token|signature|sign|nonce)[\"\x27]?\s*[:=]\s*[\"\x27]?)[^\s\"\x27&,}]+', r'\1[REDACTED]', text)
        text = re.sub(r'(?i)(mongodb(?:\+srv)?://)[^/@\s]+@', r'\1[REDACTED]@', text)
        text = re.sub(r'(?i)(https?://)[^/@\s]+:[^/@\s]+@', r'\1[REDACTED]@', text)
        text = re.sub(r'(?i)([?&](?:X-Amz-[^=]+|timestamp|expires)=[^&\s]*)', '[REDACTED]', text)
        redacted = redacted or text != original
        truncated = truncated or len(text) > 4096
        return text[:4096]
    response = read(exc, 'response', None)
    return {'exceptionClass': type(exc).__name__, 'message': clean(exc),
            'stack': clean(''.join(traceback.format_exception(type(exc), exc, exc.__traceback__))),
            'status': read(exc, 'status_code', None),
            'code': clean(read(exc, 'code', '')),
            'requestId': clean(read(exc, 'request_id', '')),
            'body': clean(read(exc, 'body', None) or read(response, 'text', '')),
            'cause': clean(read(exc, '__cause__', None)),
            'redacted': redacted, 'truncated': truncated}


def _count_failure(model: str, digest: str, stdio_sdk: dict[str, str], code: str,
                   counted: int | None, request_id: str | None, elapsed: float,
                   effective_policy: dict[str, Any] | None,
                   real_carrier: dict[str, Any] | None = None, diagnostic: dict[str, Any] | None = None) -> LLMResult:
    # This is transport evidence only. It does not assert usage or a free count
    # request, and can only be returned before entering responses.create.
    wrapper = {
        "schemaVersion": "booklet_pre_generation_failure_v2" if effective_policy else "booklet_pre_generation_failure_v1", "content": "",
        "failureEvidence": {
            "provider": "openai", "apiBaseUrl": "https://api.openai.com/v1",
            "stdioSdk": stdio_sdk, "model": model, "serviceTier": "default",
            "requestDigest": digest, "stage": "input_count", "code": code,
            "adapterVersion": REAL_REPORT_IDENTITY if real_carrier else "1.0.7-dev5", "countedInputTokens": counted,
            "limit": effective_policy["maxInputTokens"] if effective_policy else 32000, "generationStarted": False,
            "elapsedMs": max(0, int(elapsed * 1000)), "countRequestId": request_id,
            **({"diagnostic": diagnostic} if diagnostic else {}),
            **({"effectivePolicy": effective_policy, "contextWarnings": _context_warnings(counted, effective_policy)}
               if effective_policy else {}),
            **({"manifestDigest": real_carrier["manifestDigest"],
                "textRequestDigest": real_carrier["textRequestDigest"],
                "inspectedAssetIds": [item["assetId"] for item in real_carrier["orderedImages"]]}
               if real_carrier else {}),
        },
    }
    return LLMResult(model=model, message=AssistantPromptMessage(content=json.dumps(wrapper)),
                     usage=LLMUsage.empty_usage())


def _context_warnings(counted: int | None, policy: dict[str, Any] | None) -> list[str]:
    return (["input_tokens_above_32000"] if policy and counted is not None
            and counted > policy["warningInputTokens"] else [])


def _effective_policy(params: dict[str, Any]) -> dict[str, Any] | None:
    names = ("booklet_token_policy_version", "booklet_token_policy_hash",
             "booklet_max_input_tokens", "booklet_warning_input_tokens")
    present = [name in params for name in names]
    if not any(present):
        return None
    if not all(present):
        raise InvokeBadRequestError("Booklet token policy parameters are incomplete.")
    version, digest, maximum, warning = (params.pop(name) for name in names)
    if (version == "m4_legacy_v1" and digest == "none" and
            type(maximum) is int and maximum == 32000 and
            type(warning) is int and warning == 32000):
        return None
    if isinstance(digest, str) and digest.startswith("sha256:"):
        digest = digest[len("sha256:"):]
    if (version != "m4_context_policy_v2" or type(digest) is not str or
            re.fullmatch(r"[0-9a-f]{64}", digest) is None or
            type(maximum) is not int or maximum != 128000 or
            type(warning) is not int or warning != 32000):
        raise InvokeBadRequestError("Booklet token policy differs from the fixed amendment.")
    return {"version": version, "hash": digest, "maxInputTokens": maximum,
            "warningInputTokens": warning}


def _usage(response: Any) -> dict[str, Any]:
    raw = _field(response, "usage")
    input_tokens = _integer(_field(raw, "input_tokens"))
    output_tokens = _integer(_field(raw, "output_tokens"))
    available = input_tokens is not None and output_tokens is not None
    input_details = _field(raw, "input_tokens_details")
    output_details = _field(raw, "output_tokens_details")
    return {
        "source": "provider_reported" if available else "unavailable",
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "cachedInputTokens": _integer(_field(input_details, "cached_tokens")),
        "cacheWriteInputTokens": _integer(_field(input_details, "cache_write_tokens")),
        "reasoningOutputTokens": _integer(_field(output_details, "reasoning_tokens")),
    }


def _final_content(response: Any) -> str:
    """Select one assistant answer without joining commentary or reasoning.

    Phase is optional for older responses. Accept one phase-less message only
    when no message has a phase. Ambiguous output stays invalid creative content;
    return it empty so the wrapper still preserves authoritative usage evidence.
    Never recover JSON substrings or choose among multiple possible answers.
    """
    output = _field(response, "output")
    if not isinstance(output, list):
        return ""
    messages = [item for item in output
                if _field(item, "type") == "message"]
    if any(_field(item, "role") != "assistant" for item in messages):
        return ""
    phases = [_field(item, "phase") for item in messages]
    if any(phase not in (None, "commentary", "final_answer") for phase in phases):
        return ""
    if all(phase is None for phase in phases):
        selected = messages if len(messages) == 1 else []
    else:
        # Mixed phase-less/phased output cannot establish which answer is final.
        selected = [item for item in messages if _field(item, "phase") == "final_answer"] if None not in phases else []
    if len(selected) != 1:
        return ""
    if _field(selected[0], "status") != "completed":
        return ""
    parts = _field(selected[0], "content")
    if not isinstance(parts, list) or not parts or any(_field(part, "type") not in ("output_text", "refusal") for part in parts):
        return ""
    # Refusal bytes remain inspectable, but the independent refused flag always
    # prevents materialization, even when a refusal happens to be valid JSON.
    texts = [_field(part, "text" if _field(part, "type") == "output_text" else "refusal") for part in parts]
    return "".join(texts) if all(isinstance(value, str) for value in texts) else ""


def generate(llm, client_factory, model, credentials, messages, parameters,
             tools, stop, stream, user, *, clock=time.monotonic) -> LLMResult:
    """Validate policy, count exact input, generate once, expose trusted evidence.

    SDK timeout limits I/O phases, not wall-clock duration. The caller retains
    the original operation deadline and must inspect late/uncertain completion.
    """
    if parameters.get("booklet_real_report_execution") is True:
        return _generate_real_report(llm, client_factory, model, credentials, messages,
                                     parameters, tools, stop, stream, clock=clock)
    params = parameters.copy()
    # Dify supplies descriptor defaults to the existing bounded route. Only
    # explicit False means that the new Real-only branch was not selected.
    if params.get("booklet_real_report_execution") is False:
        params.pop("booklet_real_report_execution")
    enabled = params.pop("booklet_bounded_execution", None)
    seconds = params.pop("booklet_timeout_seconds", None)
    expected_digest = params.pop("booklet_request_digest", None)
    carrier = params.pop("booklet_prepared_request", False)
    deadline_at_ms = params.pop("booklet_deadline_at_ms", None)
    dynamic_policy_present = any(name in params for name in (
        "booklet_token_policy_version", "booklet_token_policy_hash",
        "booklet_max_input_tokens", "booklet_warning_input_tokens"))
    effective_policy = _effective_policy(params)
    # Graphon coerces all-numeric dynamic parameter strings to numbers. The
    # explicit prefix keeps the authorized digest a string through that boundary.
    if isinstance(expected_digest, str) and expected_digest.startswith("sha256:"):
        expected_digest = expected_digest[len("sha256:"):]
    if (type(expected_digest) is not str or len(expected_digest) != 64
            or any(char not in "0123456789abcdef" for char in expected_digest)):
        raise InvokeBadRequestError("Booklet requires an authorized request digest.")
    if enabled is not True or type(seconds) not in (int, float) or not math.isfinite(seconds) or not 0 < seconds <= 120:
        raise InvokeBadRequestError("Booklet bounded execution needs a remaining timeout in (0, 120].")
    if type(carrier) is not bool:
        raise InvokeBadRequestError("Booklet prepared-request mode must be Boolean.")
    if carrier and (type(deadline_at_ms) not in (int, float) or not math.isfinite(deadline_at_ms)
                    or deadline_at_ms <= time.time() * 1000):
        raise InvokeBadRequestError("Booklet original operation deadline has expired or is missing.")
    if model not in ("gpt-6-luna", "gpt-6-sol") or stream or tools or stop:
        raise InvokeBadRequestError("Booklet bounded execution permits only non-streaming Luna/Sol text.")
    if credentials.get("api_protocol", "responses") != "responses":
        raise InvokeBadRequestError("Booklet bounded execution requires Responses.")
    allowed = {"max_tokens", "reasoning_effort", "reasoning_mode", "service_tier", "response_format", "json_schema", "verbosity"}
    if set(params) - allowed:
        raise InvokeBadRequestError("Unsupported Booklet model parameters.")
    ceiling = params.get("max_tokens")
    if type(ceiling) is not int or not 1 <= ceiling <= 8192:
        raise InvokeBadRequestError("Booklet output limit must be in [1, 8192].")
    effort = params.get("reasoning_effort")
    if effort not in ("none", "low") or model == "gpt-6-sol" and effort != "low":
        raise InvokeBadRequestError("Unsupported Booklet reasoning effort.")
    if params.get("reasoning_mode") != "standard" or params.get("service_tier") != "default":
        raise InvokeBadRequestError("Booklet requires Standard reasoning and service tier.")
    if not carrier and (params.get("response_format") != "json_schema" or not params.get("json_schema")):
        raise InvokeBadRequestError("Booklet requires a structured output schema.")
    # No assistant/tool history or opaque replay is permitted in this request.
    if any(message.role.value not in ("system", "developer", "user") or not isinstance(message.content, str)
           for message in messages):
        raise InvokeBadRequestError("Booklet requires explicit text-only context.")
    carrier_provider_digest = None
    if carrier:
        if (len(messages) != 1 or messages[0].role.value != "user"
                or len(messages[0].content.encode("utf-8")) > 2 * 1024 * 1024):
            raise InvokeBadRequestError("Booklet requires one bounded prepared-request carrier.")
        try:
            payload = json.loads(messages[0].content)
        except (ValueError, TypeError):
            raise InvokeBadRequestError("Booklet prepared request is invalid.") from None
        # The published graph relays this canonical carrier unchanged. Bind its
        # metadata to the authorization digest before extracting provider fields.
        try:
            carrier_encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"),
                                         ensure_ascii=False, allow_nan=False).encode()
        except (TypeError, ValueError):
            raise InvokeBadRequestError("Booklet prepared carrier is not canonical JSON.") from None
        if (len(carrier_encoded) > 2 * 1024 * 1024 or
                messages[0].content != carrier_encoded.decode() or
                hashlib.sha256(carrier_encoded).hexdigest() != expected_digest):
            raise InvokeBadRequestError("Booklet prepared carrier differs from authorization.")
        if isinstance(payload, dict) and "bookletPolicy" in payload:
            metadata = payload["bookletPolicy"]
            if (not isinstance(metadata, dict) or
                    set(metadata) != {"contractVersion", "requestDigest", "tokenPolicy"} or
                    metadata["contractVersion"] != "booklet_carrier_v2" or
                    type(metadata["requestDigest"]) is not str or
                    re.fullmatch(r"[0-9a-f]{64}", metadata["requestDigest"]) is None or
                    not isinstance(metadata["tokenPolicy"], dict) or
                    set(metadata["tokenPolicy"]) != {"version", "hash", "maxInputTokens", "warningInputTokens"}):
                raise InvokeBadRequestError("Booklet carrier policy metadata is invalid.")
            token_policy = metadata["tokenPolicy"]
            carrier_policy = _effective_policy({
                "booklet_token_policy_version": token_policy["version"],
                "booklet_token_policy_hash": token_policy["hash"],
                "booklet_max_input_tokens": token_policy["maxInputTokens"],
                "booklet_warning_input_tokens": token_policy["warningInputTokens"],
            })
            if carrier_policy is None or dynamic_policy_present and effective_policy != carrier_policy:
                raise InvokeBadRequestError("Booklet carrier and dynamic token policies differ.")
            effective_policy = carrier_policy
            carrier_provider_digest = metadata["requestDigest"]
            payload = {key: value for key, value in payload.items() if key != "bookletPolicy"}
        if (not isinstance(payload, dict)
                or set(payload) != {"model", "input", "max_output_tokens", "reasoning", "service_tier", "text", "store", "truncation", "include"}
                or payload["model"] != model or type(payload["max_output_tokens"]) is not int
                or payload["max_output_tokens"] != ceiling
                or payload["reasoning"] != {"effort": effort, "mode": "standard"}
                or payload["service_tier"] != "default" or payload["store"] is not False
                or payload["truncation"] != "disabled" or payload["include"] != ["reasoning.encrypted_content"]
                or not isinstance(payload["input"], list) or len(payload["input"]) != 2
                or any(not isinstance(item, dict) or set(item) != {"type", "role", "content"}
                       or item["type"] != "message" or item["role"] != role or not isinstance(item["content"], str)
                       for item, role in zip(payload["input"], ("system", "user")))
                or not isinstance(payload["text"], dict) or set(payload["text"]) != {"format"}):
            raise InvokeBadRequestError("Booklet prepared request differs from the bounded role policy.")
    else:
        payload = {"model": model, "input": responses.input_items(messages),
                   **responses.parameters(model, params, None, None, {})}
    output_format = payload.get("text", {}).get("format", {})
    if not isinstance(output_format, dict):
        raise InvokeBadRequestError("Booklet requires a strict object output schema.")
    schema = output_format.get("schema")
    if (output_format.get("type") != "json_schema" or output_format.get("strict") is not True
            or not isinstance(schema, dict) or not schema or schema.get("type") != "object"):
        raise InvokeBadRequestError("Booklet requires a strict object output schema.")
    payload["store"] = False
    payload["truncation"] = "disabled"
    # Own the admitted snapshot; callers and counting must not mutate generation.
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()
    if carrier and len(encoded) > 2 * 1024 * 1024:
        raise InvokeBadRequestError("Booklet canonical prepared carrier exceeds its limit.")
    if carrier and carrier_provider_digest is None and messages[0].content != encoded.decode():
        raise InvokeBadRequestError("Booklet prepared carrier must preserve exact canonical bytes.")
    digest = hashlib.sha256(encoded).hexdigest()
    if digest != (carrier_provider_digest or expected_digest):
        raise InvokeBadRequestError("Booklet request differs from authorized preparation.")
    payload = json.loads(encoded)
    stdio_sdk = _verify_stdio_sdk()
    count_payload = {key: value for key, value in payload.items()
                     if key in {"model", "input", "reasoning", "text", "truncation"}}
    started = clock()
    if carrier:
        seconds = min(seconds, (deadline_at_ms - time.time() * 1000) / 1000)
        if seconds <= 0:
            raise InvokeBadRequestError("Booklet original deadline expired before counting.")
    kwargs = llm._to_credential_kwargs(credentials)
    endpoint = kwargs.get("base_url", "https://api.openai.com/v1")
    if not isinstance(endpoint, str) or endpoint.rstrip("/") != "https://api.openai.com/v1":
        raise InvokeBadRequestError("Booklet requires the frozen global OpenAI endpoint.")
    # Do not inherit OPENAI_BASE_URL or select a regional/FedRAMP price premium.
    kwargs["base_url"] = "https://api.openai.com/v1"
    kwargs.update(max_retries=0, timeout=seconds)
    with client_factory(**kwargs) as client:
        try:
            count = client.responses.input_tokens.count(**deepcopy(count_payload))
        except Exception as exc:
            # Counting remains a proven pre-generation failure; retain its diagnostic separately.
            return _count_failure(model, digest, stdio_sdk, "input_count_request_failed",
                                  None, None, clock() - started, effective_policy, diagnostic=provider_error(exc, credentials.values()))
        raw_count = _field(count, "input_tokens")
        input_count = _integer(raw_count)
        code = ("input_count_unavailable" if raw_count is None else
                "input_count_invalid" if input_count is None or input_count > 9007199254740991 else
                "input_limit_exceeded" if input_count > (effective_policy["maxInputTokens"] if effective_policy else 32000) else None)
        if code:
            return _count_failure(model, digest, stdio_sdk, code,
                                  input_count if code == "input_limit_exceeded" else None,
                                  _count_request_id(count), clock() - started, effective_policy)
        remaining = seconds - (clock() - started)
        if carrier:
            remaining = min(remaining, (deadline_at_ms - time.time() * 1000) / 1000)
        if remaining <= 0:
            raise InvokeBadRequestError("Booklet timeout expired before generation.")
        try:
            response = client.responses.create(**payload, timeout=remaining)
        except Exception as exc:
            raise InvokeBadRequestError("Booklet provider outcome unknown: " + json.dumps(provider_error(exc, credentials.values()), sort_keys=True)) from None
    # Avoid putting API error messages or opaque reasoning into saved evidence.
    status = _field(response, "status")
    if status not in ("completed", "incomplete", "failed", "cancelled"):
        raise InvokeBadRequestError("Unexpected Booklet provider status; inspect the original request.")
    usage = _usage(response)
    output = _field(response, "output")
    refused = any(_field(part, "type") == "refusal"
                  for item in (output if isinstance(output, list) else [])
                  if _field(item, "type") == "message" and isinstance(_field(item, "content"), list)
                  for part in _field(item, "content"))
    incomplete_reason = _field(_field(response, "incomplete_details"), "reason")
    if incomplete_reason not in (None, "max_output_tokens", "content_filter"):
        incomplete_reason = "unknown"
    evidence = {
        "provider": "openai", "responseId": _field(response, "id"),
        "stdioSdk": stdio_sdk,
        "apiBaseUrl": "https://api.openai.com/v1",
        "requestId": _field(response, "_request_id"), "model": _field(response, "model"),
        "serviceTier": _field(response, "service_tier"), "status": status,
        "refused": refused, "incompleteReason": incomplete_reason,
        "requestDigest": digest, "countedInputTokens": input_count,
        "usage": usage,
        **({"effectivePolicy": effective_policy,
            "contextWarnings": _context_warnings(input_count, effective_policy)} if effective_policy else {}),
    }
    # Dify LLM nodes expose text. Do not depend on opaque_body being exported.
    # Creative output remains a string for the trusted downstream parser to validate.
    wrapper = {"schemaVersion": "booklet_provider_v2" if effective_policy else "booklet_provider_v1", "content": _final_content(response),
               "providerEvidence": evidence}
    measured = (llm._calc_response_usage(model, credentials, usage["inputTokens"], usage["outputTokens"])
                if usage["source"] == "provider_reported" else LLMUsage.empty_usage())
    # Graphon separates inline <think> blocks without understanding JSON strings.
    # Escape angle brackets at the wire boundary; JSON decoding restores originals.
    wire = json.dumps(wrapper, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e")
    return LLMResult(model=_field(response, "model") or model,
                     message=AssistantPromptMessage(content=wire), usage=measured)


REAL_REPORT_IDENTITY = "m5-openai-bounded@1"


def _real_reject(code: str) -> None:
    raise InvokeBadRequestError(f"Booklet Real report {code}.")


def _real_canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def _real_sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _real_image_info(blob: bytes) -> tuple[str, int, int]:
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
    _real_reject("image bytes invalid")


def _prepare_real_report(model: str, messages: list[Any], params: dict[str, Any], now_ms: int, effective_policy: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], int]:
    if len(messages) != 1 or messages[0].role.value != "user" or not isinstance(messages[0].content, list):
        _real_reject("native message missing")
    parts = messages[0].content
    if (not 2 <= len(parts) <= 16 or sum(isinstance(part, TextPromptMessageContent) for part in parts) != 1
            or any(not isinstance(part, (TextPromptMessageContent, ImagePromptMessageContent)) for part in parts)):
        _real_reject("native image parts invalid")
    carrier_text = next(part.data for part in parts if isinstance(part, TextPromptMessageContent))
    native_images = [part for part in parts if isinstance(part, ImagePromptMessageContent)]
    if len(carrier_text.encode("utf-8")) > 2 * 1024 * 1024:
        _real_reject("carrier too large")
    try:
        carrier = json.loads(carrier_text)
        if carrier_text != _real_canonical(carrier):
            _real_reject("carrier not canonical")
    except (TypeError, ValueError):
        _real_reject("carrier JSON invalid")
    if not isinstance(carrier, dict) or set(carrier) != {"schemaVersion", "textRequestJson", "textRequestDigest", "orderedImages", "manifestDigest", "finalRequestDigest", "deadlineAtMs", "adapterIdentity"}:
        _real_reject("carrier fields invalid")
    if carrier["schemaVersion"] != "booklet_real_report_carrier_v1" or carrier["adapterIdentity"] != REAL_REPORT_IDENTITY:
        _real_reject("carrier policy invalid")
    deadline = carrier["deadlineAtMs"]
    if type(deadline) is not int or deadline <= now_ms or deadline > 9007199254740991:
        _real_reject("deadline expired")
    request_json = carrier["textRequestJson"]
    if not isinstance(request_json, str) or len(request_json.encode("utf-8")) > 2 * 1024 * 1024:
        _real_reject("text request invalid")
    try:
        payload = json.loads(request_json)
        if request_json != _real_canonical(payload) or _real_sha(request_json) != carrier["textRequestDigest"]:
            _real_reject("text request digest differs")
    except (TypeError, ValueError):
        _real_reject("text request JSON invalid")
    policy = payload.pop("bookletPolicy", None)
    if (not isinstance(policy, dict) or set(policy) != {"contractVersion", "requestDigest", "tokenPolicy"}
            or policy["contractVersion"] != "booklet_carrier_v2" or policy["requestDigest"] != _real_sha(_real_canonical(payload))
            or policy["tokenPolicy"] != effective_policy):
        _real_reject("text policy differs")
    if (not isinstance(payload, dict) or set(payload) != {"model", "input", "max_output_tokens", "reasoning", "service_tier", "text", "store", "truncation", "include"}
            or payload["model"] != model or model not in ("gpt-6-luna", "gpt-6-sol")
            or type(payload["max_output_tokens"]) is not int or not 1 <= payload["max_output_tokens"] <= 8192
            or not isinstance(payload["reasoning"], dict)
            or payload["reasoning"] != {"effort": "low" if model == "gpt-6-sol" else payload["reasoning"].get("effort"), "mode": "standard"}
            or payload["reasoning"].get("effort") not in ("none", "low")
            or payload["service_tier"] != "default" or payload["store"] is not False or payload["truncation"] != "disabled"
            or payload["include"] != ["reasoning.encrypted_content"] or not isinstance(payload["input"], list) or len(payload["input"]) != 2
            or any(not isinstance(item, dict) or set(item) != {"type", "role", "content"} or item["type"] != "message" or item["role"] != role or not isinstance(item["content"], str) for item, role in zip(payload["input"], ("system", "user")))
            or not isinstance(payload["text"], dict) or not isinstance(payload["text"].get("format"), dict)
            or payload["text"]["format"].get("type") != "json_schema" or payload["text"]["format"].get("strict") is not True
            or not isinstance(payload["text"]["format"].get("schema"), dict)
            or payload["text"]["format"]["schema"].get("type") != "object"):
        _real_reject("text request policy invalid")
    refs = carrier["orderedImages"]
    if not isinstance(refs, list) or len(refs) != len(native_images) or not 1 <= len(refs) <= 15 or _real_sha(_real_canonical(refs)) != carrier["manifestDigest"]:
        _real_reject("manifest digest differs")
    images = []
    total = 0
    for part, manifest in zip(native_images, refs):
        if (not isinstance(manifest, dict) or set(manifest) != {"assetId", "versionId", "sha256", "byteLength", "mimeType", "width", "height"}
                or any(not isinstance(manifest[key], str) or not manifest[key] for key in ("assetId", "versionId"))
                or not isinstance(manifest["sha256"], str) or re.fullmatch("[0-9a-f]{64}", manifest["sha256"]) is None
                or part.url or not part.base64_data or part.detail.value != "high"):
            _real_reject("image identity invalid")
        if len(part.base64_data) > 10 * 1024 * 1024 * 2:
            _real_reject("image encoding too large")
        try:
            blob = base64.b64decode(part.base64_data, validate=True)
        except (ValueError, binascii.Error):
            _real_reject("image encoding invalid")
        total += len(blob)
        if (not blob or len(blob) > 10 * 1024 * 1024 or total > 150 * 1024 * 1024
                or type(manifest["byteLength"]) is not int or len(blob) != manifest["byteLength"]
                or hashlib.sha256(blob).hexdigest() != manifest["sha256"]):
            _real_reject("image bytes differ")
        mime, width, height = _real_image_info(blob)
        if (mime, width, height) != (manifest["mimeType"], manifest["width"], manifest["height"]) or width * height > 64_000_000 or part.mime_type != mime or part.format not in (mime.split("/")[1], "jpg" if mime == "image/jpeg" else mime.split("/")[1]):
            _real_reject("image metadata differs")
        images.append({"type": "input_image", "image_url": f"data:{mime};base64,{base64.b64encode(blob).decode('ascii')}", "detail": "high"})
    payload["input"][1]["content"] = [{"type": "input_text", "text": payload["input"][1]["content"]}, *images]
    digest = _real_sha(_real_canonical(payload))
    if digest != carrier["finalRequestDigest"]:
        _real_reject("final request digest differs")
    return payload, carrier, deadline


def _generate_real_report(llm, client_factory, model, credentials, messages, parameters,
                          tools, stop, stream, *, clock=time.monotonic) -> LLMResult:
    params = parameters.copy()
    if params.pop("booklet_real_report_execution", None) is not True or tools or stop or stream:
        _real_reject("execution mode invalid")
    seconds = params.pop("booklet_timeout_seconds", None)
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or not 0 < seconds <= 120:
        _real_reject("timeout invalid")
    for key in ("booklet_bounded_execution", "booklet_request_digest", "booklet_prepared_request", "booklet_deadline_at_ms"):
        params.pop(key, None)
    effective_policy = _effective_policy(params)
    if effective_policy is None:
        _real_reject("token policy missing")
    if set(params) - {"max_tokens", "reasoning_effort", "reasoning_mode", "service_tier", "response_format", "json_schema", "verbosity"}:
        _real_reject("model parameters invalid")
    payload, carrier, deadline = _prepare_real_report(model, messages, params, int(time.time() * 1000), effective_policy)
    if (payload["max_output_tokens"] != params.get("max_tokens")
            or payload["reasoning"]["effort"] != params.get("reasoning_effort")
            or params.get("reasoning_mode") != "standard" or params.get("service_tier") != "default"
            or params.get("response_format") != "json_schema" or not params.get("json_schema")):
        _real_reject("model parameters differ")
    sdk = _verify_stdio_sdk()
    kwargs = llm._to_credential_kwargs(credentials)
    if kwargs.get("base_url", "https://api.openai.com/v1").rstrip("/") != "https://api.openai.com/v1":
        _real_reject("provider endpoint differs")
    kwargs.update(base_url="https://api.openai.com/v1", max_retries=0, timeout=min(seconds, (deadline - int(time.time() * 1000)) / 1000))
    if kwargs["timeout"] <= 0:
        _real_reject("deadline expired")
    count_payload = {key: deepcopy(value) for key, value in payload.items() if key in {"model", "input", "reasoning", "text", "truncation"}}
    started = clock()
    with client_factory(**kwargs) as client:
        count_remaining = min(seconds - (clock() - started), (deadline - int(time.time() * 1000)) / 1000)
        if count_remaining <= 0:
            _real_reject("deadline expired before counting")
        try:
            count = client.responses.input_tokens.count(**count_payload, timeout=count_remaining)
        except Exception as exc:
            return _count_failure(model, carrier["finalRequestDigest"], sdk, "input_count_request_failed",
                                  None, None, clock() - started, effective_policy, carrier, provider_error(exc, credentials.values()))
        input_count = _integer(_field(count, "input_tokens"))
        if input_count is None or input_count > effective_policy["maxInputTokens"]:
            return _count_failure(model, carrier["finalRequestDigest"], sdk, "input_limit_exceeded" if input_count else "input_count_invalid", input_count, _count_request_id(count), clock() - started, effective_policy, carrier)
        remaining = min(seconds - (clock() - started), (deadline - int(time.time() * 1000)) / 1000)
        if remaining <= 0:
            _real_reject("deadline expired before generation")
        try:
            response = client.responses.create(**deepcopy(payload), timeout=remaining)
        except Exception as exc:
            # The request may have reached the provider. The application must
            # retain the full held liability until readback can establish usage.
            _real_reject("provider outcome unknown: " + json.dumps(provider_error(exc, credentials.values()), sort_keys=True))
    usage = _usage(response)
    status = _field(response, "status")
    if status not in ("completed", "incomplete", "failed", "cancelled"):
        status = "unknown"
    output = _field(response, "output")
    refused = any(_field(part, "type") == "refusal"
                  for item in (output if isinstance(output, list) else [])
                  if _field(item, "type") == "message" and isinstance(_field(item, "content"), list)
                  for part in _field(item, "content"))
    incomplete_reason = _field(_field(response, "incomplete_details"), "reason")
    if incomplete_reason not in (None, "max_output_tokens", "content_filter"):
        incomplete_reason = "unknown"
    evidence = {"provider": "openai", "apiBaseUrl": "https://api.openai.com/v1", "stdioSdk": sdk,
                "responseId": _field(response, "id"), "requestId": _field(response, "_request_id"),
                "model": _field(response, "model"), "serviceTier": _field(response, "service_tier"),
                "status": status, "refused": refused, "incompleteReason": incomplete_reason,
                "requestDigest": carrier["finalRequestDigest"], "adapterVersion": REAL_REPORT_IDENTITY,
                "manifestDigest": carrier["manifestDigest"], "textRequestDigest": carrier["textRequestDigest"],
                "inspectedAssetIds": [item["assetId"] for item in carrier["orderedImages"]],
                "orderedImages": carrier["orderedImages"], "countedInputTokens": input_count, "usage": usage,
                "effectivePolicy": effective_policy, "contextWarnings": _context_warnings(input_count, effective_policy)}
    wrapper = {"schemaVersion": "booklet_provider_v3", "content": _final_content(response), "providerEvidence": evidence}
    measured = (llm._calc_response_usage(model, credentials, usage["inputTokens"], usage["outputTokens"])
                if usage["source"] == "provider_reported" else LLMUsage.empty_usage())
    wire = json.dumps(wrapper, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e")
    return LLMResult(model=_field(response, "model") or model,
                     message=AssistantPromptMessage(content=wire), usage=measured)
