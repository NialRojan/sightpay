import base64
import io
from types import SimpleNamespace

import numpy as np
import pytest
from PIL import Image

from app.services.vision.claude_provider import ClaudeVisionProvider
from app.services.vision.fixture_provider import PRESETS
from app.services.vision.schema import CounterAudit, VisionUnavailable
from tests.factories import sharp_jpeg


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
    out = ClaudeVisionProvider(client=client, model="claude-opus-5").analyze(sharp_jpeg(1), "image/jpeg")
    assert out.qr_visibility_score == 38
    call = client.messages.calls[0]
    assert call["model"] == "claude-opus-5"
    assert call["output_format"] is CounterAudit
    image_block = call["messages"][0]["content"][0]
    assert image_block["type"] == "image" and image_block["source"]["media_type"] == "image/jpeg"


def test_refusal_raises_vision_unavailable():
    client = _client(SimpleNamespace(stop_reason="refusal", parsed_output=None))
    with pytest.raises(VisionUnavailable):
        ClaudeVisionProvider(client=client).analyze(sharp_jpeg(2), "image/jpeg")


def test_settings_read_anthropic_api_key(monkeypatch):
    from app.config import Settings

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-123")
    assert Settings().anthropic_api_key == "sk-test-123"


def test_real_client_gets_api_key_from_settings(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "anthropic_api_key", "sk-from-dotenv")
    provider = ClaudeVisionProvider()
    assert provider._client.api_key == "sk-from-dotenv"


def test_large_png_is_sent_as_downscaled_jpeg():
    buf = io.BytesIO()
    Image.fromarray(np.random.default_rng(3).integers(0, 256, (3000, 4000, 3), dtype=np.uint8)).save(buf, "PNG")
    client = _client(SimpleNamespace(stop_reason="end_turn", parsed_output=PRESETS["compliant"]))
    ClaudeVisionProvider(client=client).analyze(buf.getvalue(), "image/png")
    source = client.messages.calls[0]["messages"][0]["content"][0]["source"]
    assert source["media_type"] == "image/jpeg"
    with Image.open(io.BytesIO(base64.standard_b64decode(source["data"]))) as sent:
        assert sent.format == "JPEG" and sent.mode == "RGB"
        assert max(sent.size) <= 1568 and sent.size == (1568, 1176)


def test_unexpected_client_error_becomes_vision_unavailable():
    class Broken:
        def parse(self, **kwargs):
            raise TypeError("Could not resolve authentication method")

    with pytest.raises(VisionUnavailable):
        ClaudeVisionProvider(client=SimpleNamespace(messages=Broken())).analyze(sharp_jpeg(4), "image/jpeg")
