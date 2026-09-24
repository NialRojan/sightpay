"""Seed realistic Pune demo data.  Usage: python -m app.seed [--demo-location LAT,LNG]"""

import argparse
import math
import random
from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from app import models
from app.db import Base, SessionLocal, engine
from app.services.labels import ACTION_LABELS

AREAS = {
    "Kothrud": (18.5074, 73.8077),
    "Shivajinagar": (18.5308, 73.8475),
    "Hadapsar": (18.5089, 73.9260),
}
FSES = [("Amit Patil", "+919800000001", "Kothrud"), ("Sneha Joshi", "+919800000002", "Shivajinagar"), ("Rahul Verma", "+919800000003", "Hadapsar")]
MERCHANTS = [  # name, owner, category, language
    ("Ramesh General Store", "Ramesh Shinde", "kirana", "hi-IN"),
    ("Shree Ganesh Medical", "Suresh Kale", "pharmacy", "mr-IN"),
    ("Annapurna Snacks", "Sunita Deshmukh", "food", "mr-IN"),
    ("Kumar Mobile Point", "Vijay Kumar", "electronics", "hi-IN"),
    ("Sai Dairy", "Prakash Gaikwad", "dairy", "mr-IN"),
    ("New Bombay Bakery", "Imran Shaikh", "bakery", "hi-IN"),
    ("Mahalaxmi Kirana", "Lata Pawar", "kirana", "mr-IN"),
    ("Royal Tailors", "Anil Jadhav", "tailor", "mr-IN"),
    ("Balaji Vegetables", "Venkatesh Rao", "grocery", "en-IN"),
    ("Om Sweets", "Deepak Agarwal", "sweets", "hi-IN"),
    ("Green Leaf Tea Stall", "Santosh More", "food", "mr-IN"),
    ("City Stationery", "Farah Khan", "stationery", "hi-IN"),
    ("Jai Bhavani Hardware", "Ganesh Salunke", "hardware", "mr-IN"),
    ("Fresh Fruits Corner", "Rakesh Yadav", "grocery", "hi-IN"),
    ("Swami Samarth Xerox", "Nilesh Kulkarni", "services", "mr-IN"),
    ("Karim Chicken Centre", "Karim Sayyed", "meat", "hi-IN"),
    ("Pooja Cosmetics", "Pooja Mehta", "cosmetics", "hi-IN"),
    ("Datta Pan Shop", "Datta Bhosale", "pan", "mr-IN"),
    ("Lucky Footwear", "Harpreet Singh", "footwear", "hi-IN"),
    ("Shivam Electricals", "Shivam Mishra", "electronics", "hi-IN"),
    ("Vaishnavi Flowers", "Vaishnavi Patil", "flowers", "mr-IN"),
    ("Metro Medicos", "Arun Nair", "pharmacy", "en-IN"),
    ("Hotel Sahyadri", "Mahesh Pingale", "food", "mr-IN"),
    ("Krishna Provision", "Krishna Iyer", "kirana", "en-IN"),
]
DEMO_SPREAD_M = (30, 50, 70, 90, 110)  # every merchant stays well inside ~150 m of the demo venue


def _demo_spot(i: int, venue: tuple[float, float]) -> tuple[float, float]:
    """Deterministic spot near the venue: Ramesh (i == 0) exactly on it, the others on small rings around it."""
    lat, lng = venue
    if i == 0:
        return lat, lng
    r = DEMO_SPREAD_M[i % len(DEMO_SPREAD_M)]
    angle = math.radians(i * 137.5)  # golden angle, so neighbours do not stack
    return (lat + r * math.cos(angle) / 111_320,
            lng + r * math.sin(angle) / (111_320 * math.cos(math.radians(lat))))


ACTIONS = ["reposition_paytm_qr", "clear_qr_obstruction", "install_soundbox", "reduce_competitor_dominance"]


def _at(day: date, hour: int) -> datetime:
    return datetime.combine(day, time(hour, 0))


def _past_visit(db, rng, merchant, fse, day, score, action, obstructed=False, competitor="PhonePe", dominance="medium"):
    compliant = score >= 70 and action == "none"
    visit = models.Visit(
        merchant_id=merchant.id, fse_id=fse.id, lat=merchant.lat, lng=merchant.lng,
        client_captured_at=_at(day, 5), received_at=_at(day, 5), capture_source="camera",
        status="completed", decision="compliant" if compliant else "non_compliant",
        decision_reasons=[] if compliant else [ACTION_LABELS[action]],
        authenticity_score=rng.randint(85, 100), authenticity_verdict="VERIFIED",
        pipeline_mode="inline", pipeline_log=[], completed_at=_at(day, 5),
    )
    db.add(visit)
    db.flush()
    db.add(models.VisitAudit(
        visit_id=visit.id, paytm_qr_visible=score > 0, qr_visibility_score=score, soundbox_visible=action != "install_soundbox",
        competitor=competitor, competitor_dominance=dominance, qr_obstructed=obstructed, image_quality="ok",
        blur_score=250.0, suspicious_signals=[], recommended_action=action, confidence=0.9, notes="", provider="seed", raw={},
    ))
    if compliant:
        db.add(models.Incentive(fse_id=fse.id, merchant_id=merchant.id, visit_id=visit.id, amount_inr=50, status="paid", reason="Verified compliant visit", created_at=_at(day, 5)))
    elif action != "retake_photo":
        db.add(models.Intervention(
            merchant_id=merchant.id, visit_id=visit.id, action=action, issue=ACTION_LABELS[action],
            message_text_en=f"Guidance sent: {ACTION_LABELS[action]}", message_text=f"Guidance sent: {ACTION_LABELS[action]}",
            message_language=merchant.language, created_at=_at(day, 5),
        ))
    return visit


def seed(db: Session, today: date | None = None, demo_location: tuple[float, float] | None = None) -> dict[str, int]:
    rng = random.Random(42)
    today = today or date.today()

    manager = models.User(name="Priya Kulkarni", phone="+919800000100", role="manager", language="en-IN")
    db.add(manager)
    db.flush()
    fses = {}
    for name, phone, area in FSES:
        user = models.User(name=name, phone=phone, role="fse", language="hi-IN")
        db.add(user)
        db.flush()
        lat, lng = AREAS[area]
        fse = models.FseProfile(user_id=user.id, territory=area, home_lat=lat, home_lng=lng, manager_id=manager.id)
        db.add(fse)
        fses[area] = fse
    db.flush()

    merchants = []
    area_names = list(AREAS)
    for i, (name, owner, category, language) in enumerate(MERCHANTS):
        area = area_names[i % 3]
        clat, clng = AREAS[area]
        lat, lng = clat + rng.uniform(-0.01, 0.01), clng + rng.uniform(-0.01, 0.01)
        if demo_location:
            lat, lng = _demo_spot(i, demo_location)
        m = models.Merchant(
            name=name, owner_name=owner, phone=f"+9198{10000000 + i:08d}", language=language,
            lat=round(lat, 6), lng=round(lng, 6), address=f"{area}, Pune", category=category,
            assigned_fse_id=fses[area].id,
        )
        db.add(m)
        merchants.append(m)
    db.flush()

    # Transactions: 60 days of daily aggregates
    intervention_day = today - timedelta(days=20)
    for idx, m in enumerate(merchants):
        base = rng.uniform(2000, 9000)
        for d in range(60, 0, -1):
            day = today - timedelta(days=d)
            if idx == 0:  # Ramesh: ₹4,200/day before intervention, ₹4,950/day after
                amount = (4950 if day > intervention_day else 4200) * rng.uniform(0.97, 1.03)
            else:
                weekend = 1.15 if day.weekday() >= 5 else 1.0
                amount = base * weekend * rng.uniform(0.92, 1.08)
            db.add(models.Transaction(merchant_id=m.id, txn_date=day, amount_inr=round(amount, 2), txn_count=max(1, int(amount / rng.uniform(80, 200)))))

    # Visit history
    ramesh = merchants[0]
    amit = fses["Kothrud"]
    _past_visit(db, rng, ramesh, amit, today - timedelta(days=45), 38, "reposition_paytm_qr", dominance="high")
    _past_visit(db, rng, ramesh, amit, intervention_day, 42, "clear_qr_obstruction", obstructed=True, dominance="high")
    for m in merchants[1:]:
        fse = next(f for f in fses.values() if f.id == m.assigned_fse_id)
        for days_ago in (rng.randint(35, 50), rng.randint(8, 25)):
            score = rng.randint(30, 95)
            action = "none" if score >= 70 else rng.choice(ACTIONS)
            _past_visit(db, rng, m, fse, today - timedelta(days=days_ago), score, action)

    # A pending manager escalation so the queue is not empty
    m = merchants[4]
    fse = next(f for f in fses.values() if f.id == m.assigned_fse_id)
    v = _past_visit(db, rng, m, fse, today - timedelta(days=1), 55, "retake_photo")
    db.flush()
    db.refresh(v)  # autoflush is off; load the audit just added
    v.status, v.decision, v.decision_reasons = "escalated", "low_confidence", ["Vision confidence 0.41 below 0.6"]
    v.audit.confidence = 0.41
    db.add(models.Escalation(visit_id=v.id, merchant_id=m.id, reason="Vision confidence 0.41 below 0.6", status="open"))

    db.commit()
    return {"merchants": len(merchants), "fse_profiles": len(fses)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo-location", help="LAT,LNG of the demo venue: Ramesh General Store is placed on it, every other merchant within ~150 m")
    args = parser.parse_args()
    loc = tuple(float(x) for x in args.demo_location.split(",")) if args.demo_location else None
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        print(seed(db, demo_location=loc))


if __name__ == "__main__":
    main()
