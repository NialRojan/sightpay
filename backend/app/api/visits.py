from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from PIL import UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.schemas import VisitOut, VisitSummary, visit_summary, visit_to_out
from app.services.photos import ALLOWED_MEDIA_TYPES, fingerprint, store_photo
from app.services.pipeline import start_analysis
from app.timeutil import to_utc_naive, utcnow

router = APIRouter(prefix="/visits", tags=["visits"])
MAX_PHOTO_BYTES = 10 * 1024 * 1024
ANALYZABLE = ("submitted", "failed")


def _get_visit(db: Session, visit_id: int) -> models.Visit:
    visit = db.get(models.Visit, visit_id)
    if visit is None:
        raise HTTPException(404, "Visit not found")
    return visit


def _analyze(db: Session, visit: models.Visit, background: BackgroundTasks) -> None:
    try:
        start_analysis(db, visit, background)
    except Exception:
        pass  # visit.status == "failed" and pipeline_log has the error; the client sees it in the response


@router.post("", response_model=VisitOut, status_code=201)
def create_visit(
    background: BackgroundTasks,
    merchant_id: int = Form(...),
    fse_id: int = Form(...),
    lat: float = Form(...),
    lng: float = Form(...),
    captured_at: datetime | None = Form(None),
    capture_source: str = Form("unknown"),
    analyze: bool = Form(False),
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if db.get(models.Merchant, merchant_id) is None:
        raise HTTPException(404, "Merchant not found")
    if db.get(models.FseProfile, fse_id) is None:
        raise HTTPException(404, "FSE not found")
    if photo.content_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(415, f"Unsupported image type {photo.content_type}")
    data = photo.file.read()
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Photo larger than 10 MB")
    try:
        sha, phash = fingerprint(data)
    except UnidentifiedImageError:
        raise HTTPException(422, "File is not a readable image")

    visit = models.Visit(
        merchant_id=merchant_id, fse_id=fse_id, photo_path=store_photo(data, photo.content_type),
        photo_media_type=photo.content_type, photo_sha256=sha, photo_phash=phash, lat=lat, lng=lng,
        client_captured_at=to_utc_naive(captured_at), received_at=utcnow(),
        capture_source=capture_source if capture_source in ("camera", "gallery") else "unknown",
    )
    db.add(visit)
    db.commit()
    if analyze:
        _analyze(db, visit, background)
    return visit_to_out(db, visit)


@router.post("/{visit_id}/analyze", response_model=VisitOut)
def analyze_visit(visit_id: int, background: BackgroundTasks, db: Session = Depends(get_db)):
    visit = _get_visit(db, visit_id)
    if visit.status not in ANALYZABLE:
        raise HTTPException(409, f"Visit is already {visit.status}")
    _analyze(db, visit, background)
    return visit_to_out(db, visit)


@router.get("/{visit_id}", response_model=VisitOut)
def get_visit(visit_id: int, db: Session = Depends(get_db)):
    return visit_to_out(db, _get_visit(db, visit_id))


@router.get("", response_model=list[VisitSummary])
def list_visits(fse_id: int | None = None, merchant_id: int | None = None, limit: int = 50, db: Session = Depends(get_db)):
    q = select(models.Visit).order_by(models.Visit.received_at.desc()).limit(min(limit, 200))
    if fse_id is not None:
        q = q.where(models.Visit.fse_id == fse_id)
    if merchant_id is not None:
        q = q.where(models.Visit.merchant_id == merchant_id)
    return [visit_summary(v) for v in db.scalars(q).all()]
