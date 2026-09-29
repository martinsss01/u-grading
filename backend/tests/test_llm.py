import asyncio
import json

import httpx
import pytest
from pydantic import BaseModel, ConfigDict

from app.core.config import settings
from app.services import llm


class Answer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    score: int | None


def _ok(content: dict) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "choices": [{"message": {"content": json.dumps(content)}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
        },
    )


def _run(handler, **kwargs):
    return asyncio.run(
        llm.complete_json(
            model="test/model",
            system="sys",
            content=[llm.text_part("hi")],
            output=Answer,
            transport=httpx.MockTransport(handler),
            **kwargs,
        )
    )


@pytest.fixture(autouse=True)
def _key(monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "test-key")
    real_sleep = asyncio.sleep
    monkeypatch.setattr(llm.asyncio, "sleep", lambda *_: real_sleep(0))  # no backoff waits


def test_sends_strict_schema_and_privacy_routing():
    seen = {}

    def handler(request: httpx.Request):
        seen["body"] = json.loads(request.content)
        seen["auth"] = request.headers["authorization"]
        return _ok({"title": "x", "score": None})

    result = _run(handler)
    assert result == Answer(title="x", score=None)
    body = seen["body"]
    schema = body["response_format"]["json_schema"]["schema"]
    # A property literally named "title" must survive schema tightening.
    assert set(schema["properties"]) == {"title", "score"}
    assert schema["required"] == ["title", "score"]
    assert schema["additionalProperties"] is False
    assert body["provider"] == {"require_parameters": True, "data_collection": "deny"}
    assert seen["auth"] == "Bearer test-key"


def test_retries_transient_errors_then_succeeds():
    calls = []

    def handler(request):
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(429, text="rate limited")
        if len(calls) == 2:
            return httpx.Response(200, json={"choices": [{"message": {"content": "not json"}}]})
        return _ok({"title": "ok", "score": 3})

    assert _run(handler).score == 3
    assert len(calls) == 3


def test_does_not_retry_client_errors():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(401, text="bad key")

    with pytest.raises(llm.LLMError, match="401"):
        _run(handler)
    assert len(calls) == 1


def test_missing_key_fails_fast(monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "")
    with pytest.raises(llm.LLMError, match="OPENROUTER_API_KEY"):
        _run(lambda r: _ok({}))
