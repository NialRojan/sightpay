from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.schemas import IncentiveOut

router = APIRouter(prefix="/incentives", tags=["incentives"])


@router.get("")
def incentives(fse_id: int | None = None, db: Session = Depends(get_db)):
    q = select(models.Incentive).order_by(models.Incentive.created_at.desc())
    if fse_id is not None:
        q = q.where(models.Incentive.fse_id == fse_id)
    items = [IncentiveOut.model_validate(i).model_dump() for i in db.scalars(q).all()]
    return {"total_inr": sum(i["amount_inr"] for i in items), "items": items}
