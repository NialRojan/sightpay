from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.merchants import list_merchants, merchant_detail

router = APIRouter(prefix="/merchants", tags=["merchants"])


@router.get("")
def merchants(db: Session = Depends(get_db)):
    return list_merchants(db)


@router.get("/{merchant_id}")
def merchant(merchant_id: int, db: Session = Depends(get_db)):
    detail = merchant_detail(db, merchant_id)
    if detail is None:
        raise HTTPException(404, "Merchant not found")
    return detail
