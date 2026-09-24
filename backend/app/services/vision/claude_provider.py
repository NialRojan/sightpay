import base64
import io

import anthropic
import pydantic
from PIL import Image, ImageOps

from app.config import settings
from app.services.vision.schema import CounterAudit, VisionUnavailable

PROMPT = """You are auditing a photo of a small Indian merchant's billing counter for Paytm. \
A field sales executive took the photo during a visit. Report only what is actually visible in the frame.

- paytm_qr_visible: a Paytm-branded QR standee or sticker is visible.
- qr_visibility_score: 0-100. How easily could a customer standing at the counter see and scan the Paytm QR? \
Consider placement, size, angle and lighting. Use 0 if it is not visible.
- soundbox_visible: a Paytm Soundbox device is visible.
- competitor: the most prominent non-Paytm payment QR brand (PhonePe, Google Pay, BharatPe, Amazon Pay, or Other), or null if none.
- competitor_dominance: how much more prominent competitor QRs are than Paytm's: none, low, medium or high.
- qr_obstructed: something partially blocks the Paytm QR.
- suspicious_image_signals: any of photo_of_screen, photo_of_printout, heavily_edited, stock_or_web_image, \
not_a_shop_counter. Use an empty list if none apply.
- recommended_action: the single most useful fix.
- confidence: 0-1, your overall confidence in this assessment. Use a low value if the image is unclear or the counter is out of frame.
- notes: one short sentence the field rep can act on."""

# Worst case timeout x (retries + 1) = 80 s must stay under the n8n Vision node timeout (90 s).
CLIENT_TIMEOUT_S = 40.0
CLIENT_MAX_RETRIES = 1
MAX_LONG_EDGE_PX = 1568
JPEG_QUALITY = 85


def prepare_image(image_bytes: bytes) -> bytes:
    """Re-encode any phone photo as an upright RGB JPEG with long edge <= 1568 px (size/format-safe for the API)."""
    with Image.open(io.BytesIO(image_bytes)) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((MAX_LONG_EDGE_PX, MAX_LONG_EDGE_PX))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=JPEG_QUALITY)
    return buf.getvalue()


class ClaudeVisionProvider:
    name = "claude"

    def __init__(self, client=None, model: str | None = None):
        if client is None:
            kwargs = {"api_key": settings.anthropic_api_key} if settings.anthropic_api_key else {}
            client = anthropic.Anthropic(timeout=CLIENT_TIMEOUT_S, max_retries=CLIENT_MAX_RETRIES, **kwargs)
        self._client = client
        self._model = model or settings.anthropic_model

    def analyze(self, image_bytes: bytes, media_type: str) -> CounterAudit:
        try:
            image_b64 = base64.standard_b64encode(prepare_image(image_bytes)).decode("utf-8")
        except Exception as exc:
            raise VisionUnavailable(f"could not prepare image: {exc}") from exc
        try:
            response = self._client.messages.parse(
                model=self._model,
                max_tokens=16000,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": image_b64}},
                        {"type": "text", "text": PROMPT},
                    ],
                }],
                output_format=CounterAudit,
            )
        except (anthropic.APIError, pydantic.ValidationError) as exc:
            raise VisionUnavailable(str(exc)) from exc
        except Exception as exc:  # e.g. TypeError when no API key resolves
            raise VisionUnavailable(f"{type(exc).__name__}: {exc}") from exc
        if response.stop_reason == "refusal" or response.parsed_output is None:
            raise VisionUnavailable(f"no structured output (stop_reason={response.stop_reason})")
        return response.parsed_output
