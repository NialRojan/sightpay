from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.schemas import visit_summary
from app.services.rep import fse_summary, priority_queue
from app.timeutil import utcnow

router = APIRouter(prefix="/fse", tags=["rep intelligence"])


def _fse(db: Session, fse_id: int) -> models.FseProfile:
    fse = db.get(models.FseProfile, fse_id)
    if fse is None:
        raise HTTPException(404, "FSE not found")
    return fse


@router.get("")
def list_fse(db: Session = Depends(get_db)):
    return [{"id": f.id, "name": f.user.name, "territory": f.territory, "home_lat": f.home_lat, "home_lng": f.home_lng}
            for f in db.scalars(select(models.FseProfile).order_by(models.FseProfile.id)).all()]


@router.get("/{fse_id}/queue")
def queue(fse_id: int, lat: float | None = None, lng: float | None = None, db: Session = Depends(get_db)):
    _fse(db, fse_id)
    return priority_queue(db, fse_id, lat, lng)


@router.get("/{fse_id}/summary")
def summary(fse_id: int, lat: float | None = None, lng: float | None = None, db: Session = Depends(get_db)):
    _fse(db, fse_id)
    return fse_summary(db, fse_id, lat, lng)


@router.get("/{fse_id}/visits")
def visit_map(fse_id: int, days: int = Query(7, ge=1, le=365), db: Session = Depends(get_db)):
    _fse(db, fse_id)
    q = (select(models.Visit)
         .where(models.Visit.fse_id == fse_id, models.Visit.received_at >= utcnow() - timedelta(days=days))
         .order_by(models.Visit.received_at))
    return [visit_summary(v).model_dump() for v in db.scalars(q).all()]
