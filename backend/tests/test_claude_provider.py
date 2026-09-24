from types import SimpleNamespace

import pytest

from app.services.vision.claude_provider import ClaudeVisionProvider
from app.services.vision.fixture_provider import PRESETS
from app.services.vision.schema import CounterAudit, VisionUnavailable


class FakeMessages:
    def __init__(self, response):
        self.response, self.calls = response, []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


def _client(response):
    return SimpleNamespace(messages=FakeMessages(response))


def test_sends_image_and_schema_and_returns_parsed_output():
    client = _client(SimpleNamespace(stop_reason="end_turn", parsed_output=PRESETS["non_compliant"]))
    out = ClaudeVisionProvider(client=client, model="claude-opus-5").analyze(b"\xff\xd8jpeg", "image/jpeg")
    assert out.qr_visibility_score == 38
    call = client.messages.calls[0]
    assert call["model"] == "claude-opus-5"
    assert call["output_format"] is CounterAudit
    image_block = call["messages"][0]["content"][0]
    assert image_block["type"] == "image" and image_block["source"]["media_type"] == "image/jpeg"


def test_refusal_raises_vision_unavailable():
    client = _client(SimpleNamespace(stop_reason="refusal", parsed_output=None))
    with pytest.raises(VisionUnavailable):
        ClaudeVisionProvider(client=client).analyze(b"x", "image/jpeg")


def test_settings_read_anthropic_api_key(monkeypatch):
    from app.config import Settings

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-123")
    assert Settings().anthropic_api_key == "sk-test-123"


def test_real_client_gets_api_key_from_settings(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "anthropic_api_key", "sk-from-dotenv")
    provider = ClaudeVisionProvider()
    assert provider._client.api_key == "sk-from-dotenv"
