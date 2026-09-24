from sqlalchemy.orm import Session

from app import models
from app.services import actions
from app.services.decision import AuditFacts, decide
from app.services.memory import get_memory
from app.services.steps import append_step
from app.timeutil import utcnow


def resolve_escalation(db: Session, esc: models.Escalation, approve: bool, resolved_by: str, note: str | None) -> models.Escalation:
    if esc.status != "open":
        raise ValueError(f"Escalation already {esc.status}")
    esc.status = "approved" if approve else "rejected"
    esc.resolved_by, esc.note, esc.resolved_at = resolved_by, note, utcnow()
    visit = esc.visit

    if not approve:
        visit.status = "rejected"
        append_step(visit, "manager_review", f"Rejected by {resolved_by}: {note or 'no note'}")
        db.commit()
        return esc

    facts = AuditFacts.from_audit(visit.audit)
    if facts.recommended_action == "retake_photo":
        visit.status = "completed"
        append_step(visit, "manager_review", f"Approved by {resolved_by}; photo unusable, so no automated action")
        db.commit()
        return esc

    ctx = get_memory().get_context(db, visit.merchant_id, exclude_visit_id=visit.id)
    d = decide(visit.authenticity_verdict, facts, ctx, manager_override=True)
    visit.decision = d.outcome
    visit.decision_reasons = [f"Manager approved ({resolved_by})", *d.reasons]
    append_step(visit, "manager_review", f"Approved by {resolved_by} → {d.outcome}")
    db.commit()
    if d.outcome == "compliant":
        actions.grant_incentive(db, visit)
    elif d.outcome == "non_compliant":
        actions.create_guidance(db, visit, ctx)
        actions.send_whatsapp(db, visit)
    visit.status = "completed"
    db.commit()
    return esc
