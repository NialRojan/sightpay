from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.analytics import build_dashboard

router = APIRouter(tags=["analytics"])


@router.get("/dashboard")
@router.get("/analytics/dashboard")
def dashboard(db: Session = Depends(get_db)):
    return build_dashboard(db)
