from dataclasses import dataclass

from app.services.fraud.signals import Signal

VERIFIED_MIN = 70
REVIEW_MIN = 30
HARD_FAIL_SIGNALS = {"duplicate_image"}


@dataclass(frozen=True)
class FraudResult:
    score: int
    verdict: str  # VERIFIED | REVIEW_REQUIRED | BLOCKED
    signals: list[Signal]


def score_signals(signals: list[Signal]) -> FraudResult:
    """Combine independent evidence signals. No single weak signal (e.g. missing EXIF) decides alone."""
    score = max(0, 100 - sum(s.penalty for s in signals))
    hard_fail = any(s.status == "fail" and s.name in HARD_FAIL_SIGNALS for s in signals)
    if hard_fail or score < REVIEW_MIN:
        verdict = "BLOCKED"
    elif score >= VERIFIED_MIN:
        verdict = "VERIFIED"
    else:
        verdict = "REVIEW_REQUIRED"
    return FraudResult(score=score, verdict=verdict, signals=list(signals))
