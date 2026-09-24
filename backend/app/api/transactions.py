from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models
from app.db import get_db

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("")
def transactions(merchant_id: int, days: int = 30, db: Session = Depends(get_db)):
    last = db.scalar(select(func.max(models.Transaction.txn_date)).where(models.Transaction.merchant_id == merchant_id))
    if last is None:
        return []
    rows = db.scalars(
        select(models.Transaction)
        .where(models.Transaction.merchant_id == merchant_id, models.Transaction.txn_date > last - timedelta(days=days))
        .order_by(models.Transaction.txn_date)
    ).all()
    return [{"txn_date": r.txn_date.isoformat(), "amount_inr": r.amount_inr, "txn_count": r.txn_count} for r in rows]
