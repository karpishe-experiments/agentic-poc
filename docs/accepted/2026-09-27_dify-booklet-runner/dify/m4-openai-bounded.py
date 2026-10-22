"""Opt-in Booklet adapter for the audited OpenAI provider, never a host entrypoint.

Copied into models/llm/booklet_bounded.py by the reviewed provider patch.
The application must reserve before invoking this path. Token counting is a
separate, non-generating API request; this module performs at most one generation.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import time
from copy import deepcopy
from typing import Any

from dify_plugin.entities.model.llm import LLMResult, LLMUsage
from dify_plugin.entities.model.message import AssistantPromptMessage
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


def _count_failure(model: str, digest: str, stdio_sdk: dict[str, str], code: str,
                   counted: int | None, request_id: str | None, elapsed: float) -> LLMResult:
    # This is transport evidence only. It does not assert usage or a free count
    # request, and can only be returned before entering responses.create.
    wrapper = {
        "schemaVersion": "booklet_pre_generation_failure_v1", "content": "",
        "failureEvidence": {
            "provider": "openai", "apiBaseUrl": "https://api.openai.com/v1",
            "stdioSdk": stdio_sdk, "model": model, "serviceTier": "default",
            "requestDigest": digest, "stage": "input_count", "code": code,
            "adapterVersion": "1.0.7-dev4", "countedInputTokens": counted, "limit": 32000, "generationStarted": False,
            "elapsedMs": max(0, int(elapsed * 1000)), "countRequestId": request_id,
        },
    }
    return LLMResult(model=model, message=AssistantPromptMessage(content=json.dumps(wrapper)),
                     usage=LLMUsage.empty_usage())


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
    params = parameters.copy()
    enabled = params.pop("booklet_bounded_execution", None)
    seconds = params.pop("booklet_timeout_seconds", None)
    expected_digest = params.pop("booklet_request_digest", None)
    carrier = params.pop("booklet_prepared_request", False)
    deadline_at_ms = params.pop("booklet_deadline_at_ms", None)
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
    if carrier:
        if (len(messages) != 1 or messages[0].role.value != "user"
                or len(messages[0].content.encode("utf-8")) > 2 * 1024 * 1024):
            raise InvokeBadRequestError("Booklet requires one bounded prepared-request carrier.")
        try:
            payload = json.loads(messages[0].content)
        except (ValueError, TypeError):
            raise InvokeBadRequestError("Booklet prepared request is invalid.") from None
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
    if carrier and messages[0].content != encoded.decode():
        raise InvokeBadRequestError("Booklet prepared carrier must preserve exact canonical bytes.")
    digest = hashlib.sha256(encoded).hexdigest()
    if digest != expected_digest:
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
        except Exception:
            # Never persist exception text, credentials or provider error bodies.
            # Generation errors are deliberately outside this catch boundary.
            return _count_failure(model, digest, stdio_sdk, "input_count_request_failed",
                                  None, None, clock() - started)
        raw_count = _field(count, "input_tokens")
        input_count = _integer(raw_count)
        code = ("input_count_unavailable" if raw_count is None else
                "input_count_invalid" if input_count is None or input_count > 9007199254740991 else
                "input_limit_exceeded" if input_count > 32000 else None)
        if code:
            return _count_failure(model, digest, stdio_sdk, code,
                                  input_count if code == "input_limit_exceeded" else None,
                                  _count_request_id(count), clock() - started)
        remaining = seconds - (clock() - started)
        if carrier:
            remaining = min(remaining, (deadline_at_ms - time.time() * 1000) / 1000)
        if remaining <= 0:
            raise InvokeBadRequestError("Booklet timeout expired before generation.")
        response = client.responses.create(**payload, timeout=remaining)
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
    }
    # Dify LLM nodes expose text. Do not depend on opaque_body being exported.
    # Creative output remains a string for the trusted downstream parser to validate.
    wrapper = {"schemaVersion": "booklet_provider_v1", "content": _final_content(response),
               "providerEvidence": evidence}
    measured = (llm._calc_response_usage(model, credentials, usage["inputTokens"], usage["outputTokens"])
                if usage["source"] == "provider_reported" else LLMUsage.empty_usage())
    # Graphon separates inline <think> blocks without understanding JSON strings.
    # Escape angle brackets at the wire boundary; JSON decoding restores originals.
    wire = json.dumps(wrapper, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e")
    return LLMResult(model=_field(response, "model") or model,
                     message=AssistantPromptMessage(content=wire), usage=measured)
