from dataclasses import asdict

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.schemas import AuditOut
from app.api.visits import read_upload
from app.services.vision.engine import analyze_bytes

router = APIRouter(prefix="/audit", tags=["audit"])


@router.post("/analyze-image")
def analyze_image(photo: UploadFile = File(...)):
    data, media_type = read_upload(photo)
    quality, audit, provider = analyze_bytes(data, media_type)
    return {"quality": asdict(quality), "audit": audit.model_dump(), "provider": provider}


@router.get("/{visit_id}", response_model=AuditOut)
def get_audit(visit_id: int, db: Session = Depends(get_db)):
    audit = db.query(models.VisitAudit).filter_by(visit_id=visit_id).one_or_none()
    if audit is None:
        raise HTTPException(404, "No audit for this visit yet")
    return audit
