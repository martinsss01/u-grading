"""Minimal OpenRouter client (OpenAI-compatible chat completions) with structured output.

Every call asks for a JSON-schema response and validates it into a Pydantic
model, so callers never parse free text.
"""

import asyncio
import base64
import json
import logging
from collections import defaultdict
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Running token totals per model, for cost reports (e.g. scripts/eval_llm.py).
USAGE: dict[str, dict[str, int]] = defaultdict(lambda: {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0})

MAX_ATTEMPTS = 3
RETRY_STATUS = {408, 409, 429, 500, 502, 503, 504}


class LLMError(Exception):
    pass


class _Transient(LLMError):
    """Worth retrying: rate limits, provider hiccups, malformed output."""


def text_part(text: str) -> dict[str, Any]:
    return {"type": "text", "text": text}


def image_part(png: bytes) -> dict[str, Any]:
    return {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(png).decode()}}


def _strict_schema(model: type[BaseModel]) -> dict[str, Any]:
    """Pydantic's schema, tightened for strict structured output: every object
    closed and every property required (nullable fields stay `anyOf ... null`)."""
    schema = model.model_json_schema()

    def tighten(node: Any) -> None:
        """`node` is always a schema object, never a `properties`/`$defs` mapping,
        so a property that happens to be called "title" is left alone."""
        if isinstance(node, list):
            for item in node:
                tighten(item)
            return
        if not isinstance(node, dict):
            return
        node.pop("default", None)
        node.pop("title", None)
        if "properties" in node:
            node["additionalProperties"] = False
            node["required"] = list(node["properties"])
            for prop in node["properties"].values():
                tighten(prop)
        for defn in node.get("$defs", {}).values():
            tighten(defn)
        for key in ("items", "anyOf", "allOf", "oneOf"):
            if key in node:
                tighten(node[key])

    tighten(schema)
    return schema


async def complete_json(
    *,
    model: str,
    system: str,
    content: list[dict[str, Any]],
    output: type[T],
    max_tokens: int = 8000,
    transport: httpx.AsyncBaseTransport | None = None,
) -> T:
    """One chat completion whose answer is validated into `output`. Retries transient failures."""
    if not settings.OPENROUTER_API_KEY:
        raise LLMError("OPENROUTER_API_KEY no está configurada en backend/.env")

    body = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": output.__name__, "strict": True, "schema": _strict_schema(output)},
        },
        # Only providers that honour the schema, and (by default) that don't retain prompts.
        "provider": {"require_parameters": True, "data_collection": settings.LLM_DATA_COLLECTION},
    }
    headers = {"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}", "X-Title": "U-Grading"}

    last_error: Exception | None = None
    async with httpx.AsyncClient(
        base_url=settings.OPENROUTER_BASE_URL, timeout=settings.LLM_TIMEOUT_SECONDS, transport=transport
    ) as client:
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                resp = await client.post("/chat/completions", json=body, headers=headers)
                if resp.status_code in RETRY_STATUS:
                    raise _Transient(f"OpenRouter HTTP {resp.status_code}: {resp.text[:300]}")
                if resp.status_code != 200:
                    # Other 4xx won't get better on retry (bad key, bad request).
                    raise LLMError(f"OpenRouter HTTP {resp.status_code}: {resp.text[:300]}")
                data = resp.json()
                if "error" in data:
                    raise _Transient(f"OpenRouter error: {data['error']}")
                choice = data["choices"][0]
                usage = data.get("usage") or {}
                totals = USAGE[model]
                totals["calls"] += 1
                totals["prompt_tokens"] += usage.get("prompt_tokens") or 0
                totals["completion_tokens"] += usage.get("completion_tokens") or 0
                logger.info(
                    "LLM %s: %s prompt / %s completion tokens (%s)",
                    model, usage.get("prompt_tokens"), usage.get("completion_tokens"), choice.get("finish_reason"),
                )
                if choice.get("finish_reason") == "length":
                    raise LLMError("La respuesta del modelo se cortó (max_tokens)")
                return output.model_validate(json.loads(choice["message"]["content"]))
            except LLMError as exc:
                if not isinstance(exc, _Transient):
                    raise
                last_error = exc
            # Network errors and output that isn't valid JSON / doesn't match the schema.
            except (httpx.TransportError, ValueError, KeyError) as exc:
                last_error = exc
            if attempt < MAX_ATTEMPTS:
                logger.warning("LLM call failed (attempt %s): %s", attempt, last_error)
                await asyncio.sleep(2**attempt)
    raise LLMError(str(last_error)) from last_error
