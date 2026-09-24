from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class AuditOut(ORM):
    paytm_qr_visible: bool
    qr_visibility_score: int
    soundbox_visible: bool
    competitor: str | None
    competitor_dominance: str
    qr_obstructed: bool
    image_quality: str
    blur_score: float
    suspicious_signals: list[str]
    recommended_action: str
    confidence: float
    notes: str
    provider: str
    created_at: datetime


class FraudSignalOut(ORM):
    signal: str
    status: str
    penalty: int
    detail: str


class AuthenticityOut(BaseModel):
    score: int | None
    verdict: str | None
    signals: list[FraudSignalOut]


class IncentiveOut(ORM):
    id: int
    fse_id: int
    merchant_id: int
    visit_id: int | None
    amount_inr: int
    status: str
    reason: str
    created_at: datetime


class InterventionOut(ORM):
    id: int
    merchant_id: int
    visit_id: int | None
    action: str
    issue: str
    message_text_en: str
    message_text: str
    message_language: str
    audio_url: str | None
    created_at: datetime


class EscalationOut(ORM):
    id: int
    visit_id: int
    merchant_id: int
    reason: str
    status: str
    note: str | None
    resolved_by: str | None
    resolved_at: datetime | None
    created_at: datetime


class NotificationOut(ORM):
    id: int
    channel: str
    to_phone: str
    body: str
    audio_url: str | None
    status: str
    provider_ref: str | None
    error: str | None
    created_at: datetime


class ActionsOut(BaseModel):
    incentive: IncentiveOut | None = None
    intervention: InterventionOut | None = None
    escalation: EscalationOut | None = None
    notifications: list[NotificationOut] = []


class VisitOut(BaseModel):
    id: int
    merchant_id: int
    merchant_name: str
    fse_id: int
    fse_name: str
    status: str
    decision: str | None
    decision_reasons: list[str]
    photo_url: str | None
    lat: float
    lng: float
    captured_at: datetime | None
    received_at: datetime
    capture_source: str
    pipeline_mode: str | None
    pipeline_log: list[dict]
    completed_at: datetime | None
    authenticity: AuthenticityOut
    audit: AuditOut | None
    actions: ActionsOut


class VisitSummary(BaseModel):
    id: int
    merchant_id: int
    merchant_name: str
    fse_id: int
    fse_name: str
    status: str
    decision: str | None
    qr_visibility_score: int | None
    authenticity_score: int | None
    lat: float
    lng: float
    received_at: datetime


def _opt(model, obj):
    return model.model_validate(obj) if obj is not None else None


def visit_to_out(db, visit) -> VisitOut:
    db.expire(visit)  # callers commit first; reload so newly-added children appear
    return VisitOut(
        id=visit.id, merchant_id=visit.merchant_id, merchant_name=visit.merchant.name,
        fse_id=visit.fse_id, fse_name=visit.fse.user.name, status=visit.status, decision=visit.decision,
        decision_reasons=visit.decision_reasons or [], photo_url=visit.photo_url, lat=visit.lat, lng=visit.lng,
        captured_at=visit.client_captured_at, received_at=visit.received_at, capture_source=visit.capture_source,
        pipeline_mode=visit.pipeline_mode, pipeline_log=visit.pipeline_log or [], completed_at=visit.completed_at,
        authenticity=AuthenticityOut(
            score=visit.authenticity_score, verdict=visit.authenticity_verdict,
            signals=[FraudSignalOut.model_validate(s) for s in visit.fraud_signals],
        ),
        audit=_opt(AuditOut, visit.audit),
        actions=ActionsOut(
            incentive=_opt(IncentiveOut, visit.incentive),
            intervention=_opt(InterventionOut, visit.intervention),
            escalation=_opt(EscalationOut, visit.escalation),
            notifications=[NotificationOut.model_validate(n) for n in visit.notifications],
        ),
    )


def visit_summary(visit) -> VisitSummary:
    return VisitSummary(
        id=visit.id, merchant_id=visit.merchant_id, merchant_name=visit.merchant.name, fse_id=visit.fse_id,
        fse_name=visit.fse.user.name, status=visit.status, decision=visit.decision,
        qr_visibility_score=visit.audit.qr_visibility_score if visit.audit else None,
        authenticity_score=visit.authenticity_score, lat=visit.lat, lng=visit.lng, received_at=visit.received_at,
    )
