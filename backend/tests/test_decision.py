import pytest

from app.services.decision import AuditFacts, decide
from app.services.memory.base import MerchantContext

GOOD = AuditFacts(True, 89, True, False, "ok", 0.93, "none", ())


def _ctx(**kw):
    base = dict(merchant_id=1, merchant_name="Ramesh General Store", rep_name="Amit Patil", previous_scores=[],
                previous_issues=[], previous_interventions=[], consecutive_non_compliant=0, last_visit_at=None)
    return MerchantContext(**{**base, **kw})


@pytest.mark.parametrize(
    "verdict, audit, outcome",
    [
        ("BLOCKED", GOOD, "fraud"),
        ("REVIEW_REQUIRED", GOOD, "low_confidence"),
        ("VERIFIED", AuditFacts(False, 0, False, False, "blurry", 0.0, "retake_photo", ()), "low_confidence"),
        ("VERIFIED", AuditFacts(True, 60, True, False, "ok", 0.41, "retake_photo", ()), "low_confidence"),
        ("VERIFIED", AuditFacts(True, 80, True, False, "ok", 0.8, "none", ("photo_of_screen",)), "low_confidence"),
        ("VERIFIED", GOOD, "compliant"),
        ("VERIFIED", AuditFacts(True, 38, True, True, "ok", 0.93, "reposition_paytm_qr", ()), "non_compliant"),
        ("VERIFIED", AuditFacts(True, 85, False, False, "ok", 0.9, "install_soundbox", ()), "non_compliant"),
    ],
)
def test_decision_table(verdict, audit, outcome):
    assert decide(verdict, audit).outcome == outcome


def test_compliant_mentions_improvement_from_memory():
    d = decide("VERIFIED", GOOD, _ctx(previous_scores=[42]))
    assert any("previous score 42" in r for r in d.reasons)


def test_repeat_non_compliance_is_called_out():
    bad = AuditFacts(True, 38, True, True, "ok", 0.93, "reposition_paytm_qr", ())
    d = decide("VERIFIED", bad, _ctx(consecutive_non_compliant=2))
    assert any("3 non-compliant visits in a row" in r for r in d.reasons)


def test_manager_override_skips_low_confidence_rules_but_never_fraud():
    low = AuditFacts(True, 85, True, False, "ok", 0.41, "none", ())
    assert decide("REVIEW_REQUIRED", low, manager_override=True).outcome == "compliant"
    assert decide("BLOCKED", GOOD, manager_override=True).outcome == "fraud"
