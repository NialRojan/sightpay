from dataclasses import dataclass, field

from app.services.memory.base import MerchantContext

COMPLIANT_MIN_SCORE = 70
MIN_CONFIDENCE = 0.6


@dataclass(frozen=True)
class AuditFacts:
    paytm_qr_visible: bool
    qr_visibility_score: int
    soundbox_visible: bool
    qr_obstructed: bool
    image_quality: str
    confidence: float
    recommended_action: str
    suspicious_signals: tuple[str, ...] = ()

    @classmethod
    def from_audit(cls, a) -> "AuditFacts":
        return cls(a.paytm_qr_visible, a.qr_visibility_score, a.soundbox_visible, a.qr_obstructed,
                   a.image_quality, a.confidence, a.recommended_action, tuple(a.suspicious_signals or ()))


@dataclass
class Decision:
    outcome: str  # compliant | non_compliant | low_confidence | fraud
    reasons: list[str] = field(default_factory=list)


def decide(verdict: str, audit: AuditFacts, ctx: MerchantContext | None = None, *, manager_override: bool = False) -> Decision:
    if verdict == "BLOCKED":
        return Decision("fraud", ["Visit failed authenticity checks"])
    if not manager_override:
        if verdict == "REVIEW_REQUIRED":
            return Decision("low_confidence", ["Visit authenticity needs manager review"])
        if audit.image_quality != "ok":
            return Decision("low_confidence", [f"Photo is {audit.image_quality}"])
        if audit.suspicious_signals:
            return Decision("low_confidence", [f"Suspicious image: {', '.join(audit.suspicious_signals)}"])
        if audit.confidence < MIN_CONFIDENCE:
            return Decision("low_confidence", [f"Vision confidence {audit.confidence:.2f} below {MIN_CONFIDENCE}"])

    issues = []
    if not audit.paytm_qr_visible:
        issues.append("Paytm QR not visible")
    elif audit.qr_visibility_score < COMPLIANT_MIN_SCORE:
        issues.append(f"QR visibility {audit.qr_visibility_score} below {COMPLIANT_MIN_SCORE}")
    if audit.qr_obstructed:
        issues.append("Paytm QR obstructed")
    if not audit.soundbox_visible:
        issues.append("Soundbox not visible")

    if not issues:
        reasons = ["Paytm QR clearly visible and Soundbox present"]
        if ctx and ctx.previous_scores and ctx.previous_scores[0] < COMPLIANT_MIN_SCORE:
            reasons.append(f"Improved from previous score {ctx.previous_scores[0]} to {audit.qr_visibility_score}")
        return Decision("compliant", reasons)

    if ctx and ctx.consecutive_non_compliant >= 1:
        issues.append(f"Repeat issue: {ctx.consecutive_non_compliant + 1} non-compliant visits in a row")
    return Decision("non_compliant", issues)
