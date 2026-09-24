from app.timeutil import utcnow


def append_step(visit, step: str, summary: str, data: dict | None = None) -> None:
    """Append to visit.pipeline_log. Reassigns the list so SQLAlchemy detects the JSON change."""
    entry = {"step": step, "at": utcnow().isoformat(), "summary": summary}
    if data:
        entry["data"] = data
    visit.pipeline_log = [*(visit.pipeline_log or []), entry]
