from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.services.fraud.exif import check_exif, extract_exif
from app.services.fraud.image_hash import check_duplicate
from app.services.fraud.scoring import FraudResult, score_signals
from app.services.fraud.signals import check_gps, check_live_capture, check_timestamp
from app.services.photos import read_photo


def _prior_hashes(db: Session, visit: models.Visit) -> list[tuple[int, str]]:
    rows = db.execute(
        select(models.Visit.id, models.Visit.photo_phash).where(
            models.Visit.id != visit.id, models.Visit.photo_phash.is_not(None)
        )
    ).all()
    return [(r[0], r[1]) for r in rows]


def run_fraud_checks(db: Session, visit: models.Visit) -> FraudResult:
    merchant = visit.merchant
    signals = [
        check_gps(visit.lat, visit.lng, merchant.lat, merchant.lng, settings.gps_radius_m),
        check_timestamp(visit.client_captured_at, visit.received_at),
        check_duplicate(visit.photo_phash, _prior_hashes(db, visit)),
        check_exif(extract_exif(read_photo(visit)), visit.lat, visit.lng, visit.client_captured_at),
        check_live_capture(visit.capture_source),
    ]
    result = score_signals(signals)
    db.execute(delete(models.FraudSignal).where(models.FraudSignal.visit_id == visit.id))
    db.add_all(
        models.FraudSignal(visit_id=visit.id, signal=s.name, status=s.status, penalty=s.penalty, detail=s.detail)
        for s in signals
    )
    visit.authenticity_score = result.score
    visit.authenticity_verdict = result.verdict
    db.commit()
    db.expire(visit, ["fraud_signals"])
    return result
