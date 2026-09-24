"""Load seeded visit history into Cognee.  Usage: MEMORY_BACKEND=cognee python -m app.memory_backfill"""

from sqlalchemy import select

from app import models
from app.db import SessionLocal
from app.services.memory.cognee_memory import CogneeMemory


def main() -> None:
    mem = CogneeMemory()
    with SessionLocal() as db:
        visits = db.scalars(
            select(models.Visit)
            .where(models.Visit.decision.is_not(None), models.Visit.decision != "fraud")  # as in actions.complete_visit
            .order_by(models.Visit.received_at)
        ).all()
        for i, v in enumerate(visits, 1):
            mem.record_visit_outcome(db, v, background=False)
            print(f"{i}/{len(visits)} visit {v.id} -> merchant_{v.merchant_id}")


if __name__ == "__main__":
    main()
