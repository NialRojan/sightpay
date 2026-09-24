from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Protocol


@dataclass
class MerchantContext:
    merchant_id: int
    merchant_name: str
    rep_name: str | None
    previous_scores: list[int]  # newest first
    previous_issues: list[str]  # human labels, newest first
    previous_interventions: list[str]  # action codes, newest first
    consecutive_non_compliant: int
    last_visit_at: datetime | None
    transaction_trend_pct: float | None = None
    summary: str = ""
    source: str = "sql"
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["last_visit_at"] = self.last_visit_at.isoformat() if self.last_visit_at else None
        return d


class MemoryStore(Protocol):
    def get_context(self, db, merchant_id: int, exclude_visit_id: int | None = None) -> MerchantContext: ...

    def record_visit_outcome(self, db, visit) -> None: ...
