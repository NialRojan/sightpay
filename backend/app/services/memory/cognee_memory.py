import asyncio
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.services.labels import ACTION_LABELS
from app.services.memory.base import MerchantContext
from app.services.memory.sql_memory import SqlMemory, summarize

log = logging.getLogger(__name__)
# Small and bounded: a timed-out search keeps its worker busy until cognee returns, so this caps the backlog.
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="cognee")


def flatten_search_results(results) -> str:
    """Readable text from cognee.search output (verified against cognee 1.6.1).

    GRAPH_COMPLETION returns list[str] without backend access control, and list[dict] with it
    (`{"dataset_name": ..., "search_result": [str, ...]}`), which local DBs enable by default.
    """
    parts: list[str] = []

    def _walk(r) -> None:
        if r is None:
            return
        if isinstance(r, str):
            if r.strip():
                parts.append(r.strip())
        elif isinstance(r, dict):
            _walk(r.get("search_result", r.get("text_result")))
        elif isinstance(r, (list, tuple)):
            for item in r:
                _walk(item)
        elif hasattr(r, "search_result"):
            _walk(r.search_result)
        else:
            parts.append(str(r))

    _walk(results)
    return "\n".join(parts)


class CogneeAdapter:
    """The only place that touches the cognee library (API checked against cognee 1.6.1)."""

    def add(self, text: str, dataset: str) -> None:
        import cognee

        async def _run():
            await cognee.add(text, dataset_name=dataset)
            await cognee.cognify(datasets=[dataset])

        asyncio.run(_run())

    def search(self, query: str, dataset: str) -> str:
        import cognee
        from cognee import SearchType

        async def _run():
            return await cognee.search(query_text=query, query_type=SearchType.GRAPH_COMPLETION, datasets=[dataset])

        return flatten_search_results(asyncio.run(_run()))


def visit_memory_document(visit: models.Visit) -> str:
    a, m = visit.audit, visit.merchant
    rep = visit.fse.user.name if visit.fse and visit.fse.user else "unknown"
    lines = [
        f"Merchant: {m.name} (id {m.id}, owner {m.owner_name}, {m.category}, {m.address})",
        f"Rep: {rep}",
    ]
    if visit.received_at:
        lines.append(f"Visit date: {visit.received_at.date().isoformat()}")
    if visit.authenticity_score is not None:
        lines.append(f"Authenticity: {visit.authenticity_score}/100 {visit.authenticity_verdict}")
    if a:
        lines += [
            f"QR visibility score: {a.qr_visibility_score}",
            f"Issue: {ACTION_LABELS.get(a.recommended_action, a.recommended_action)}",
            f"Competitor: {a.competitor or 'none'} ({a.competitor_dominance})",
            f"Soundbox visible: {'yes' if a.soundbox_visible else 'no'}",
        ]
    if visit.intervention:
        lines.append(f"Intervention: {visit.intervention.action} ({visit.intervention.message_language})")
    if visit.incentive:
        lines.append(f"Incentive: ₹{visit.incentive.amount_inr} {visit.incentive.status}")
    lines.append(f"Outcome: {visit.decision or 'pending'}")
    return "\n".join(lines)


class CogneeMemory:
    def __init__(self, adapter=None, fallback: SqlMemory | None = None):
        self.adapter = adapter or CogneeAdapter()
        self.fallback = fallback or SqlMemory()

    def get_context(self, db: Session, merchant_id: int, exclude_visit_id: int | None = None) -> MerchantContext:
        ctx = self.fallback.get_context(db, merchant_id, exclude_visit_id)
        query = (f"Summarize what we know about merchant {ctx.merchant_name}: previous QR issues, competitors, "
                 f"interventions and their outcomes. Two sentences.")
        future = None
        try:  # submit too: a pool failure must fall back to SQL, never fail the visit
            future = _pool.submit(self.adapter.search, query, f"merchant_{merchant_id}")
            answer = future.result(timeout=settings.cognee_timeout_s)
        except (FutureTimeout, Exception) as exc:
            if future is not None:
                future.cancel()  # only helps if it never started; a running search finishes in its worker
            log.warning("Cognee context unavailable (%r); using SQL memory", exc)
            ctx.source = "sql_fallback"
            return ctx
        if answer and answer.strip():
            ctx.summary, ctx.source = answer.strip(), "cognee"
            ctx.extra["sql_summary"] = summarize(ctx)
        else:
            ctx.source = "sql_fallback"
        return ctx

    def record_visit_outcome(self, db: Session, visit: models.Visit, background: bool = True) -> None:
        # Read everything from the ORM here, on the caller's thread: the Session is not thread-safe.
        doc, dataset, visit_id = visit_memory_document(visit), f"merchant_{visit.merchant_id}", visit.id

        def _add():
            try:
                self.adapter.add(doc, dataset)
            except Exception:
                log.exception("Cognee add failed for visit %s", visit_id)

        if background:
            threading.Thread(target=_add, daemon=True).start()
        else:
            _add()
