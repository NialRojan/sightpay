from types import SimpleNamespace

from app.services.guidance import build_guidance, pick_action
from app.services.memory.base import MerchantContext


def _audit(**kw):
    base = dict(recommended_action="reposition_paytm_qr", soundbox_visible=True, qr_obstructed=False)
    return SimpleNamespace(**{**base, **kw})


def _ctx(interventions=()):
    return MerchantContext(1, "Ramesh General Store", "Amit", [42], ["QR obstruction"], list(interventions), 1, None)


def test_hindi_guidance_for_ramesh():
    merchant = SimpleNamespace(owner_name="Ramesh Shinde", language="hi-IN")
    g = build_guidance(merchant, _audit(), _ctx())
    assert g.language == "hi-IN"
    assert g.text_local.startswith("नमस्ते Ramesh जी")
    assert "billing counter" in g.text_en
    assert g.issue == "QR poorly positioned"


def test_repeat_issue_adds_memory_line():
    merchant = SimpleNamespace(owner_name="Ramesh Shinde", language="hi-IN")
    g = build_guidance(merchant, _audit(), _ctx(["reposition_paytm_qr"]))
    assert "last visit" in g.text_en
    assert "पिछली विज़िट" in g.text_local


def test_marathi_and_english_fallback():
    assert build_guidance(SimpleNamespace(owner_name="Lata Pawar", language="mr-IN"), _audit(), _ctx()).text_local.startswith("नमस्कार")
    g = build_guidance(SimpleNamespace(owner_name="Arun Nair", language="ta-IN"), _audit(), _ctx())
    assert g.text_local == g.text_en


def test_pick_action_derives_fix_when_model_said_none():
    assert pick_action(_audit(recommended_action="none", soundbox_visible=False)) == "install_soundbox"
    assert pick_action(_audit(recommended_action="retake_photo", qr_obstructed=True)) == "clear_qr_obstruction"
