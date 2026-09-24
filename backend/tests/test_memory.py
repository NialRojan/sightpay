from datetime import date

from sqlalchemy import select

from app import models
from app.seed import seed
from app.services.memory import get_memory


def test_sql_memory_recalls_ramesh_history(db):
    seed(db, today=date(2026, 9, 25))
    ramesh = db.scalar(select(models.Merchant).where(models.Merchant.name == "Ramesh General Store"))
    ctx = get_memory().get_context(db, ramesh.id)
    assert ctx.previous_scores == [42, 38]
    assert ctx.previous_issues[0] == "QR obstruction"
    assert ctx.previous_interventions[0] == "clear_qr_obstruction"
    assert ctx.consecutive_non_compliant == 2
    assert ctx.rep_name == "Amit Patil"
    assert "42" in ctx.summary and "QR obstruction" in ctx.summary
    assert ctx.to_dict()["last_visit_at"].startswith("2026-09-05")
