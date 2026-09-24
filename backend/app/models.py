from datetime import date, datetime
from typing import Optional

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import settings
from app.db import Base
from app.timeutil import utcnow


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(20))
    role: Mapped[str] = mapped_column(String(20))  # fse | manager | merchant
    language: Mapped[str] = mapped_column(String(10), default="en-IN")


class FseProfile(Base):
    __tablename__ = "fse_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    territory: Mapped[str] = mapped_column(String(80))
    home_lat: Mapped[float] = mapped_column(Float)
    home_lng: Mapped[float] = mapped_column(Float)
    manager_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    user: Mapped[User] = relationship(foreign_keys=[user_id])


class Merchant(Base):
    __tablename__ = "merchants"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    owner_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(20))
    language: Mapped[str] = mapped_column(String(10), default="hi-IN")
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    address: Mapped[str] = mapped_column(String(200), default="")
    category: Mapped[str] = mapped_column(String(40), default="kirana")
    assigned_fse_id: Mapped[int | None] = mapped_column(ForeignKey("fse_profiles.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    fse: Mapped[FseProfile | None] = relationship()


class Visit(Base):
    __tablename__ = "visits"
    id: Mapped[int] = mapped_column(primary_key=True)
    merchant_id: Mapped[int] = mapped_column(ForeignKey("merchants.id"), index=True)
    fse_id: Mapped[int] = mapped_column(ForeignKey("fse_profiles.id"), index=True)
    photo_path: Mapped[str | None] = mapped_column(String(200))
    photo_media_type: Mapped[str | None] = mapped_column(String(40))
    photo_sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    photo_phash: Mapped[str | None] = mapped_column(String(16), index=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    client_captured_at: Mapped[datetime | None] = mapped_column(DateTime)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    capture_source: Mapped[str] = mapped_column(String(20), default="unknown")  # camera | gallery | unknown
    status: Mapped[str] = mapped_column(String(20), default="submitted")
    # submitted | analyzing | completed | escalated | blocked | rejected | failed
    decision: Mapped[str | None] = mapped_column(String(20))
    decision_reasons: Mapped[list] = mapped_column(JSON, default=list)
    authenticity_score: Mapped[int | None] = mapped_column(Integer)
    authenticity_verdict: Mapped[str | None] = mapped_column(String(20))
    pipeline_mode: Mapped[str | None] = mapped_column(String(20))  # n8n | inline | inline_fallback
    pipeline_log: Mapped[list] = mapped_column(JSON, default=list)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    merchant: Mapped[Merchant] = relationship()
    fse: Mapped[FseProfile] = relationship()
    audit: Mapped[Optional["VisitAudit"]] = relationship(uselist=False)
    fraud_signals: Mapped[list["FraudSignal"]] = relationship(order_by="FraudSignal.id")
    incentive: Mapped[Optional["Incentive"]] = relationship(uselist=False)
    intervention: Mapped[Optional["Intervention"]] = relationship(uselist=False)
    escalation: Mapped[Optional["Escalation"]] = relationship(uselist=False, back_populates="visit")
    notifications: Mapped[list["Notification"]] = relationship(order_by="Notification.id")

    @property
    def photo_url(self) -> str | None:
        return f"{settings.public_base_url}/media/{self.photo_path}" if self.photo_path else None


class VisitAudit(Base):
    __tablename__ = "visit_audits"
    id: Mapped[int] = mapped_column(primary_key=True)
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id"), unique=True)
    paytm_qr_visible: Mapped[bool] = mapped_column(Boolean)
    qr_visibility_score: Mapped[int] = mapped_column(Integer)
    soundbox_visible: Mapped[bool] = mapped_column(Boolean)
    competitor: Mapped[str | None] = mapped_column(String(40))
    competitor_dominance: Mapped[str] = mapped_column(String(10), default="none")
    qr_obstructed: Mapped[bool] = mapped_column(Boolean, default=False)
    image_quality: Mapped[str] = mapped_column(String(10), default="ok")  # ok | blurry | dark
    blur_score: Mapped[float] = mapped_column(Float, default=0.0)
    suspicious_signals: Mapped[list] = mapped_column(JSON, default=list)
    recommended_action: Mapped[str] = mapped_column(String(40))
    confidence: Mapped[float] = mapped_column(Float)
    notes: Mapped[str] = mapped_column(Text, default="")
    provider: Mapped[str] = mapped_column(String(20))
    raw: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class FraudSignal(Base):
    __tablename__ = "fraud_signals"
    id: Mapped[int] = mapped_column(primary_key=True)
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id"), index=True)
    signal: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(10))  # pass | warn | fail
    penalty: Mapped[int] = mapped_column(Integer)
    detail: Mapped[str] = mapped_column(Text)


class Intervention(Base):
    __tablename__ = "interventions"
    id: Mapped[int] = mapped_column(primary_key=True)
    merchant_id: Mapped[int] = mapped_column(ForeignKey("merchants.id"), index=True)
    visit_id: Mapped[int | None] = mapped_column(ForeignKey("visits.id"), unique=True, index=True)
    action: Mapped[str] = mapped_column(String(40))
    issue: Mapped[str] = mapped_column(String(80))
    message_text_en: Mapped[str] = mapped_column(Text)
    message_text: Mapped[str] = mapped_column(Text)
    message_language: Mapped[str] = mapped_column(String(10))
    audio_path: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    @property
    def audio_url(self) -> str | None:
        return f"{settings.public_base_url}/media/{self.audio_path}" if self.audio_path else None


class Incentive(Base):
    __tablename__ = "incentives"
    id: Mapped[int] = mapped_column(primary_key=True)
    fse_id: Mapped[int] = mapped_column(ForeignKey("fse_profiles.id"), index=True)
    merchant_id: Mapped[int] = mapped_column(ForeignKey("merchants.id"))
    visit_id: Mapped[int | None] = mapped_column(ForeignKey("visits.id"), unique=True)
    amount_inr: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="approved")  # pending | approved | paid
    reason: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Transaction(Base):
    """Daily aggregate of a merchant's Paytm transactions."""

    __tablename__ = "transactions"
    __table_args__ = (UniqueConstraint("merchant_id", "txn_date"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    merchant_id: Mapped[int] = mapped_column(ForeignKey("merchants.id"), index=True)
    txn_date: Mapped[date] = mapped_column(Date)
    amount_inr: Mapped[float] = mapped_column(Float)
    txn_count: Mapped[int] = mapped_column(Integer)


class Escalation(Base):
    __tablename__ = "escalations"
    id: Mapped[int] = mapped_column(primary_key=True)
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id"), unique=True)
    merchant_id: Mapped[int] = mapped_column(ForeignKey("merchants.id"))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | approved | rejected
    note: Mapped[str | None] = mapped_column(Text)
    resolved_by: Mapped[str | None] = mapped_column(String(120))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    visit: Mapped[Visit] = relationship(back_populates="escalation")
    merchant: Mapped[Merchant] = relationship()


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    merchant_id: Mapped[int] = mapped_column(ForeignKey("merchants.id"))
    visit_id: Mapped[int | None] = mapped_column(ForeignKey("visits.id"), index=True)
    channel: Mapped[str] = mapped_column(String(20), default="whatsapp")
    to_phone: Mapped[str] = mapped_column(String(20))
    body: Mapped[str] = mapped_column(Text)
    audio_url: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20))  # dry_run | sent | failed
    provider_ref: Mapped[str | None] = mapped_column(String(80))
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
