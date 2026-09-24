# SightPay Backend P0 — Core Demo Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One merchant visit travels live through the whole system: FSE photo upload → fraud/evidence checks → vision AI audit → n8n decision → action (incentive / guidance + WhatsApp / manager escalation / block) → dashboard. The frontend (Person A) consumes it over a stable REST contract.

**Architecture:** A FastAPI + SQLAlchemy backend owns all data and all business logic as small, testable service modules (fraud, vision, memory, decision, actions). The pipeline is exposed as idempotent internal step endpoints. n8n orchestrates those steps visibly during the demo (Webhook → Fraud → Vision → Context → Decision Switch → 4 action branches). When n8n is unset or unreachable, the backend runs the same steps inline. The demo can't die because of the orchestrator.

**Tech Stack:** Python 3.12+ (machine has 3.14), FastAPI, SQLAlchemy 2 (SQLite file DB), Pydantic v2 + pydantic-settings, Pillow + NumPy (blur detection, dHash, EXIF), Anthropic Python SDK (`claude-opus-5`, vision + structured output via `messages.parse`), httpx, pytest + respx, n8n (Docker).

**Spec:** The "PERSON B — AI, Backend, n8n & Intelligence" brief (save it verbatim to `docs/spec-person-b.md` in Task 1). Follow-on plans: `2026-09-25-sightpay-p1-sponsors-and-rep-intel.md`, `2026-09-25-sightpay-p2-impact-engine.md`.

## Global Constraints

- All public routes live under `/api`. The frontend base URL is `http://<host>:8000/api`. Internal (n8n-only) routes live under `/api/internal` and require the header `X-Internal-Token`.
- JSON is snake_case. Datetimes are stored and returned as **naive UTC** ISO-8601. Clients may send tz-aware times; convert them with `to_utc_naive`.
- Contract endpoints that must exist (spec): `POST /visits`, `POST /visits/{id}/analyze`, `GET /visits/{id}`, `GET /merchants/{id}`, `GET /merchants/{id}/impact` (P2), `GET /dashboard`, `GET /escalations`, `POST /escalations/{id}/approve`.
- Decision outcomes are exactly `compliant | non_compliant | low_confidence | fraud`.
- Authenticity verdicts are exactly `VERIFIED | REVIEW_REQUIRED | BLOCKED`. Never claim EXIF alone proves a photo is genuine: it is one weighted signal among GPS, timestamp, perceptual hash and capture source.
- Transaction change is always labelled "observed change", never causal uplift (P2).
- Every external dependency (Claude, n8n, Sarvam, WhatsApp, Cognee) has an offline fallback, so the P0 loop works with no API keys.
- Claude model: `claude-opus-5` (configurable via `ANTHROPIC_MODEL`).
- Action steps are idempotent per visit, so n8n retries never create duplicate incentives, escalations or messages.
- Vision JSON fields (spec): `paytm_qr_visible, qr_visibility_score, soundbox_visible, competitor, competitor_dominance, recommended_action, confidence`, plus `qr_obstructed, suspicious_image_signals, notes`.

## File Structure

```
.gitignore
docs/spec-person-b.md                 # the brief, verbatim
docs/api-contract.md                  # contract for Person A (Task 13)
backend/
  pyproject.toml
  .env.example
  app/
    __init__.py
    config.py                         # Settings (env-driven)
    db.py                             # engine, SessionLocal, Base, get_db
    timeutil.py                       # utcnow, to_utc_naive
    models.py                         # all 11 tables
    schemas.py                        # response models + visit_to_out
    seed.py                           # realistic Pune demo data (CLI)
    main.py                           # app factory, routers, /media
    api/
      __init__.py
      visits.py  audit.py  fraud.py  merchants.py  transactions.py
      incentives.py  escalations.py  analytics.py  internal.py
    services/
      __init__.py
      labels.py                       # action -> human issue label
      steps.py                        # append_step (pipeline_log)
      photos.py                       # store/read photos, fingerprint
      fraud/
        __init__.py
        signals.py                    # Signal, haversine, gps/timestamp/live checks
        image_hash.py                 # dhash, hamming, duplicate check
        exif.py                       # ExifInfo, extract_exif, check_exif
        scoring.py                    # FraudResult, score_signals
        engine.py                     # run_fraud_checks (persists)
      vision/
        __init__.py
        schema.py                     # CounterAudit, VisionUnavailable
        quality.py                    # blur/brightness gate
        fixture_provider.py           # deterministic offline provider
        claude_provider.py            # Anthropic vision provider
        engine.py                     # get_vision_provider, analyze_bytes, run_vision
      memory/
        __init__.py                   # get_memory()
        base.py                       # MerchantContext, MemoryStore
        sql_memory.py                 # context from DB history
      decision.py                     # AuditFacts, Decision, decide
      guidance.py                     # localized guidance text
      whatsapp.py                     # send_whatsapp_message (dry-run in P0)
      actions.py                      # incentive/guidance/whatsapp/escalate/block/complete
      pipeline.py                     # step_* + run_inline + start_analysis (n8n or inline)
      escalations.py                  # resolve_escalation
      merchants.py                    # list/detail builders
      analytics.py                    # build_dashboard
  fixtures/vision_fixtures.json       # sha256 -> preset (offline demo)
  scripts/register_fixture.py
  scripts/demo_visit.sh               # end-to-end smoke from the shell
  tests/
    __init__.py
    conftest.py
    factories.py
    test_*.py
n8n/
  docker-compose.yml
  workflows/sightpay_visit_pipeline.json
  README.md
```

---

### Task 1: Backend scaffold, config, DB session, health endpoint

**Files:**
- Create: `.gitignore`, `docs/spec-person-b.md`, `backend/pyproject.toml`, `backend/.env.example`, `backend/app/__init__.py`, `backend/app/config.py`, `backend/app/db.py`, `backend/app/timeutil.py`, `backend/app/main.py`, `backend/app/api/__init__.py`, `backend/app/services/__init__.py`, `backend/tests/__init__.py`, `backend/tests/conftest.py`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Produces: `app.config.settings` (a mutable `Settings` instance; tests `monkeypatch.setattr(settings, ...)`), `app.db.Base`, `app.db.engine`, `app.db.SessionLocal`, `app.db.get_db()`, `app.timeutil.utcnow() -> datetime`, `app.timeutil.to_utc_naive(dt | None) -> datetime | None`, `app.main.app`, `app.main.create_app()`. Test fixtures `db` (Session on in-memory SQLite) and `client` (TestClient bound to `db`).

- [ ] **Step 1: Init repo and save the spec**

```bash
cd /home/nial-rojan/Paytm
git init
mkdir -p docs backend/app/api backend/app/services backend/tests backend/fixtures backend/scripts n8n/workflows
```
Paste the full Person B brief into `docs/spec-person-b.md`.

`.gitignore`:
```
__pycache__/
*.pyc
.venv/
backend/.env
backend/sightpay.db
backend/storage/
n8n/data/
.pytest_cache/
```

- [ ] **Step 2: Write `backend/pyproject.toml`**

```toml
[project]
name = "sightpay-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.30",
  "sqlalchemy>=2.0.36",
  "pydantic>=2.9",
  "pydantic-settings>=2.5",
  "python-multipart>=0.0.12",
  "pillow>=11.0",
  "numpy>=2.1",
  "httpx>=0.27",
  "anthropic>=0.75",
]

[project.optional-dependencies]
dev = ["pytest>=8", "respx>=0.21"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["app*"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 3: Create venv and install**

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
```
Expected: installs cleanly. If a wheel is missing for Python 3.14, install `python3.12` (e.g. `uv python install 3.12`) and recreate the venv with it.

- [ ] **Step 4: Write the failing test `backend/tests/test_health.py`**

```python
def test_health_reports_modes(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["vision_provider"] == "fixture"
    assert body["n8n"] is False
```

- [ ] **Step 5: Write `backend/tests/conftest.py` and `backend/tests/__init__.py` (empty)**

```python
import os

# Must be set before app modules are imported.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["VISION_PROVIDER"] = "fixture"
os.environ["N8N_WEBHOOK_URL"] = ""
os.environ["WHATSAPP_MODE"] = "dry_run"
os.environ["MEMORY_BACKEND"] = "sql"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.db import Base, get_db
from app.main import app


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "vision_fixtures_path", str(tmp_path / "fixtures.json"))
    (tmp_path / "uploads").mkdir()
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    import app.models  # noqa: F401  (registers tables once Task 2 exists)

    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


@pytest.fixture
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()
```

Until Task 2 exists, create an empty `backend/app/models.py` so the import works.

- [ ] **Step 6: Run the test to verify it fails**

Run: `pytest tests/test_health.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.config'`

- [ ] **Step 7: Implement config, db, timeutil, main**

`backend/app/config.py`:
```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./sightpay.db"
    upload_dir: str = "./storage/uploads"
    public_base_url: str = "http://localhost:8000"
    cors_origins: list[str] = ["*"]

    vision_provider: str = "fixture"  # "claude" | "fixture"
    vision_fixtures_path: str = "./fixtures/vision_fixtures.json"
    anthropic_model: str = "claude-opus-5"
    blur_threshold: float = 60.0
    dark_threshold: float = 40.0

    gps_radius_m: float = 100.0

    n8n_webhook_url: str | None = None
    internal_token: str = "dev-internal-token"

    whatsapp_mode: str = "dry_run"  # "dry_run" | "twilio" (P1)
    memory_backend: str = "sql"  # "sql" | "cognee" (P1)


settings = Settings()
```

`backend/app/db.py`:
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

`backend/app/timeutil.py`:
```python
from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_utc_naive(dt: datetime | None) -> datetime | None:
    if dt is None or dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)
```

`backend/app/main.py`:
```python
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title="SightPay API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health():
        return {
            "status": "ok",
            "vision_provider": settings.vision_provider,
            "n8n": bool(settings.n8n_webhook_url),
            "memory": settings.memory_backend,
            "whatsapp": settings.whatsapp_mode,
        }

    os.makedirs(settings.upload_dir, exist_ok=True)
    app.mount("/media", StaticFiles(directory=settings.upload_dir, check_dir=False), name="media")
    return app


app = create_app()
```

Create empty `app/__init__.py`, `app/api/__init__.py`, `app/services/__init__.py`.

`backend/.env.example`:
```
DATABASE_URL=sqlite:///./sightpay.db
PUBLIC_BASE_URL=http://localhost:8000
VISION_PROVIDER=fixture            # set to "claude" for live AI
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-opus-5
N8N_WEBHOOK_URL=                   # e.g. http://localhost:5678/webhook/sightpay-visit
INTERNAL_TOKEN=dev-internal-token
WHATSAPP_MODE=dry_run
MEMORY_BACKEND=sql
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pytest tests/test_health.py -v`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd /home/nial-rojan/Paytm
git add .gitignore docs/spec-person-b.md backend
git commit -m "feat(backend): scaffold FastAPI app, settings, db session, health endpoint"
```

---

### Task 2: Data model (11 tables) and realistic seed data

**Files:**
- Create: `backend/app/models.py` (replace the empty stub), `backend/app/services/labels.py`, `backend/app/seed.py`, `backend/tests/factories.py`
- Modify: `backend/app/main.py` (create tables on startup)
- Test: `backend/tests/test_models_seed.py`

**Interfaces:**
- Consumes: `Base`, `settings`, `utcnow`.
- Produces: ORM classes `User, FseProfile, Merchant, Visit, VisitAudit, FraudSignal, Intervention, Incentive, Transaction, Escalation, Notification`. Visit relationships: `merchant, fse, audit, fraud_signals, incentive, intervention, escalation, notifications`. Properties: `Visit.photo_url`, `Intervention.audio_url`. `labels.ACTION_LABELS: dict[str, str]`. `seed.seed(db, today: date | None = None, demo_location: tuple[float, float] | None = None) -> dict[str, int]`. Test helpers `factories.make_world(db) -> SimpleNamespace(manager, fse, merchant)`, `factories.sharp_jpeg(seed=0) -> bytes`, `factories.blurry_jpeg() -> bytes`, `factories.dark_jpeg() -> bytes`.

- [ ] **Step 1: Write the failing test `backend/tests/test_models_seed.py`**

```python
from datetime import date, timedelta

from sqlalchemy import func, select

from app import models
from app.seed import seed


def test_seed_creates_living_demo_world(db):
    today = date(2026, 9, 25)
    counts = seed(db, today=today)

    assert counts["merchants"] == 24
    assert counts["fse_profiles"] == 3
    assert db.scalar(select(func.count()).select_from(models.Transaction)) == 24 * 60

    ramesh = db.scalar(select(models.Merchant).where(models.Merchant.name == "Ramesh General Store"))
    assert ramesh.language == "hi-IN"
    assert ramesh.fse.user.name == "Amit Patil"

    # Ramesh's story: last audit score 42 with QR obstruction, then an intervention
    last = db.scalars(
        select(models.Visit).where(models.Visit.merchant_id == ramesh.id).order_by(models.Visit.received_at.desc())
    ).first()
    assert last.audit.qr_visibility_score == 42
    assert last.audit.recommended_action == "clear_qr_obstruction"
    assert last.intervention is not None

    # Transactions: ~₹4,200/day before, ~₹4,950/day after the intervention
    cut = today - timedelta(days=20)
    rows = db.scalars(select(models.Transaction).where(models.Transaction.merchant_id == ramesh.id)).all()
    before = [r.amount_inr for r in rows if cut - timedelta(days=14) <= r.txn_date < cut]
    after = [r.amount_inr for r in rows if r.txn_date > cut]
    change = (sum(after) / len(after)) / (sum(before) / len(before)) - 1
    assert 0.12 < change < 0.24

    assert db.scalar(select(func.count()).select_from(models.Escalation).where(models.Escalation.status == "open")) >= 1


def test_seed_demo_location_moves_ramesh(db):
    seed(db, today=date(2026, 9, 25), demo_location=(12.9716, 77.5946))
    ramesh = db.scalar(select(models.Merchant).where(models.Merchant.name == "Ramesh General Store"))
    assert (ramesh.lat, ramesh.lng) == (12.9716, 77.5946)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_models_seed.py -v`
Expected: FAIL with `ImportError: cannot import name 'seed'`

- [ ] **Step 3: Implement `backend/app/models.py`**

```python
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
    visit_id: Mapped[int | None] = mapped_column(ForeignKey("visits.id"), index=True)
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
```

- [ ] **Step 4: Implement `backend/app/services/labels.py`**

```python
ACTION_LABELS = {
    "none": "No issue",
    "reposition_paytm_qr": "QR poorly positioned",
    "clear_qr_obstruction": "QR obstruction",
    "install_soundbox": "Soundbox missing",
    "replace_damaged_qr": "Damaged QR",
    "reduce_competitor_dominance": "Competitor QR dominance",
    "retake_photo": "Unusable photo",
}
```

- [ ] **Step 5: Implement `backend/app/seed.py`**

```python
"""Seed realistic Pune demo data.  Usage: python -m app.seed [--demo-location LAT,LNG]"""

import argparse
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
        if i == 0 and demo_location:
            lat, lng = demo_location
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
    parser.add_argument("--demo-location", help="LAT,LNG to place Ramesh General Store at the demo venue")
    args = parser.parse_args()
    loc = tuple(float(x) for x in args.demo_location.split(",")) if args.demo_location else None
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        print(seed(db, demo_location=loc))


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Create tables on app startup**

In `backend/app/main.py`, inside `create_app()` before `return app`:
```python
    from app import models  # noqa: F401
    from app.db import Base, engine

    Base.metadata.create_all(bind=engine)
```

- [ ] **Step 7: Write `backend/tests/factories.py`**

```python
import io
from types import SimpleNamespace

import numpy as np
from PIL import Image

from app import models


def _jpeg(arr: np.ndarray, exif=None) -> bytes:
    buf = io.BytesIO()
    kwargs = {"exif": exif} if exif is not None else {}
    Image.fromarray(arr).save(buf, "JPEG", quality=90, **kwargs)
    return buf.getvalue()


def sharp_jpeg(seed: int = 0, exif=None) -> bytes:
    rng = np.random.default_rng(seed)
    return _jpeg(rng.integers(0, 256, (480, 640, 3), dtype=np.uint8), exif)


def blurry_jpeg() -> bytes:
    return _jpeg(np.full((480, 640, 3), 128, dtype=np.uint8))


def dark_jpeg() -> bytes:
    rng = np.random.default_rng(7)
    return _jpeg(rng.integers(0, 30, (480, 640, 3), dtype=np.uint8))


def make_world(db):
    manager = models.User(name="Priya Kulkarni", role="manager")
    fse_user = models.User(name="Amit Patil", role="fse", phone="+919800000001")
    db.add_all([manager, fse_user])
    db.flush()
    fse = models.FseProfile(user_id=fse_user.id, territory="Kothrud", home_lat=18.5074, home_lng=73.8077, manager_id=manager.id)
    db.add(fse)
    db.flush()
    merchant = models.Merchant(
        name="Ramesh General Store", owner_name="Ramesh", phone="+919811111111", language="hi-IN",
        lat=18.5074, lng=73.8077, address="Kothrud, Pune", category="kirana", assigned_fse_id=fse.id,
    )
    db.add(merchant)
    db.commit()
    return SimpleNamespace(manager=manager, fse=fse, merchant=merchant)
```

- [ ] **Step 8: Run the tests**

Run: `pytest tests/ -v`
Expected: PASS (health + both seed tests)

- [ ] **Step 9: Commit**

```bash
git add backend
git commit -m "feat(backend): data model for 11 tables and Pune demo seed"
```

---

### Task 3: Fraud signals (GPS radius, timestamp, live capture) and authenticity scoring

**Files:**
- Create: `backend/app/services/fraud/__init__.py` (empty), `backend/app/services/fraud/signals.py`, `backend/app/services/fraud/scoring.py`
- Test: `backend/tests/test_fraud_signals.py`

**Interfaces:**
- Produces: `Signal(name, status, penalty, detail)` (a frozen dataclass), `haversine_m(lat1, lng1, lat2, lng2) -> float`, `check_gps(lat, lng, merchant_lat, merchant_lng, radius_m=100.0) -> Signal`, `check_timestamp(captured_at, received_at, max_skew_min=10) -> Signal`, `check_live_capture(capture_source: str) -> Signal`, `FraudResult(score: int, verdict: str, signals: list[Signal])`, `score_signals(signals) -> FraudResult`.

- [ ] **Step 1: Write the failing test `backend/tests/test_fraud_signals.py`**

```python
from datetime import datetime, timedelta

from app.services.fraud.scoring import score_signals
from app.services.fraud.signals import Signal, check_gps, check_live_capture, check_timestamp, haversine_m


def test_haversine_one_millidegree_latitude_is_about_111m():
    assert 110 < haversine_m(18.5, 73.8, 18.501, 73.8) < 112.5


def test_gps_bands():
    assert check_gps(18.5074, 73.8077, 18.5074, 73.8077).status == "pass"
    warn = check_gps(18.5074 + 0.0015, 73.8077, 18.5074, 73.8077)  # ~167 m
    assert (warn.status, warn.penalty) == ("warn", 20)
    fail = check_gps(18.52, 73.8077, 18.5074, 73.8077)  # ~1.4 km
    assert (fail.status, fail.penalty) == ("fail", 45)


def test_timestamp_bands():
    now = datetime(2026, 9, 25, 10, 0)
    assert check_timestamp(now - timedelta(minutes=2), now).status == "pass"
    assert check_timestamp(now - timedelta(minutes=30), now).penalty == 15
    assert check_timestamp(now - timedelta(hours=3), now).status == "fail"
    assert check_timestamp(None, now).penalty == 10


def test_live_capture():
    assert check_live_capture("camera").penalty == 0
    assert check_live_capture("gallery").penalty == 25
    assert check_live_capture("whatever").penalty == 10


def _s(name, status, penalty):
    return Signal(name, status, penalty, "")


def test_all_pass_is_verified():
    r = score_signals([_s("gps", "pass", 0), _s("timestamp", "pass", 0)])
    assert (r.score, r.verdict) == (100, "VERIFIED")


def test_mid_score_requires_review():
    r = score_signals([_s("gps", "fail", 45), _s("exif", "warn", 10), _s("live_capture", "warn", 10)])
    assert (r.score, r.verdict) == (35, "REVIEW_REQUIRED")


def test_very_low_score_is_blocked():
    r = score_signals([_s("gps", "fail", 45), _s("timestamp", "warn", 15), _s("live_capture", "warn", 25)])
    assert (r.score, r.verdict) == (15, "BLOCKED")


def test_duplicate_image_is_a_hard_block_even_with_high_score():
    r = score_signals([_s("duplicate_image", "fail", 60)])
    assert (r.score, r.verdict) == (40, "BLOCKED")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_fraud_signals.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.fraud'`

- [ ] **Step 3: Implement `backend/app/services/fraud/signals.py`**

```python
import math
from dataclasses import dataclass
from datetime import datetime

EARTH_RADIUS_M = 6_371_000


@dataclass(frozen=True)
class Signal:
    name: str
    status: str  # pass | warn | fail
    penalty: int
    detail: str


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def check_gps(lat: float, lng: float, merchant_lat: float, merchant_lng: float, radius_m: float = 100.0) -> Signal:
    d = haversine_m(lat, lng, merchant_lat, merchant_lng)
    if d <= radius_m:
        return Signal("gps", "pass", 0, f"{d:.0f} m from merchant (limit {radius_m:.0f} m)")
    if d <= 3 * radius_m:
        return Signal("gps", "warn", 20, f"{d:.0f} m from merchant, outside the {radius_m:.0f} m radius")
    return Signal("gps", "fail", 45, f"{d:.0f} m from merchant; rep was likely not at the shop")


def check_timestamp(captured_at: datetime | None, received_at: datetime, max_skew_min: int = 10) -> Signal:
    if captured_at is None:
        return Signal("timestamp", "warn", 10, "Device did not send a capture time")
    skew = abs((received_at - captured_at).total_seconds()) / 60
    if skew <= max_skew_min:
        return Signal("timestamp", "pass", 0, f"Uploaded {skew:.0f} min after capture")
    if skew <= 60:
        return Signal("timestamp", "warn", 15, f"Uploaded {skew:.0f} min after capture")
    return Signal("timestamp", "fail", 30, f"Capture time is {skew:.0f} min away from upload time")


def check_live_capture(capture_source: str) -> Signal:
    if capture_source == "camera":
        return Signal("live_capture", "pass", 0, "Captured with the in-app camera")
    if capture_source == "gallery":
        return Signal("live_capture", "warn", 25, "Picked from gallery, not captured live")
    return Signal("live_capture", "warn", 10, "Capture source unknown")
```

- [ ] **Step 4: Implement `backend/app/services/fraud/scoring.py`**

```python
from dataclasses import dataclass

from app.services.fraud.signals import Signal

VERIFIED_MIN = 70
REVIEW_MIN = 30
HARD_FAIL_SIGNALS = {"duplicate_image"}


@dataclass(frozen=True)
class FraudResult:
    score: int
    verdict: str  # VERIFIED | REVIEW_REQUIRED | BLOCKED
    signals: list[Signal]


def score_signals(signals: list[Signal]) -> FraudResult:
    """Combine independent evidence signals. No single weak signal (e.g. missing EXIF) decides alone."""
    score = max(0, 100 - sum(s.penalty for s in signals))
    hard_fail = any(s.status == "fail" and s.name in HARD_FAIL_SIGNALS for s in signals)
    if hard_fail or score < REVIEW_MIN:
        verdict = "BLOCKED"
    elif score >= VERIFIED_MIN:
        verdict = "VERIFIED"
    else:
        verdict = "REVIEW_REQUIRED"
    return FraudResult(score=score, verdict=verdict, signals=list(signals))
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pytest tests/test_fraud_signals.py -v`
Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/fraud backend/tests/test_fraud_signals.py
git commit -m "feat(fraud): GPS radius, timestamp, live-capture signals and authenticity scoring"
```

---

### Task 4: Perceptual hash, EXIF validation, photo storage, persisted fraud engine

**Files:**
- Create: `backend/app/services/fraud/image_hash.py`, `backend/app/services/fraud/exif.py`, `backend/app/services/photos.py`, `backend/app/services/steps.py`, `backend/app/services/fraud/engine.py`
- Modify: `backend/tests/factories.py` (add `make_visit`)
- Test: `backend/tests/test_fraud_engine.py`

**Interfaces:**
- Consumes: `Signal`, `haversine_m`, `check_gps`, `check_timestamp`, `check_live_capture`, `score_signals`, `FraudResult`, models, `settings`.
- Produces:
  - `dhash(img: PIL.Image.Image, size=8) -> str` (16 hex chars), `hamming(a: str, b: str) -> int`, `check_duplicate(phash: str | None, prior: list[tuple[int, str]], threshold=6) -> Signal`
  - `ExifInfo(has_exif, make, model, software, datetime_original, gps)`, `extract_exif(data: bytes) -> ExifInfo`, `dms_to_decimal(dms, ref) -> float`, `check_exif(info, lat, lng, captured_at) -> Signal`
  - `photos.ALLOWED_MEDIA_TYPES: dict[str, str]`, `photos.fingerprint(data: bytes) -> tuple[str, str]` (sha256, phash), `photos.store_photo(data, media_type) -> str` (filename), `photos.read_photo(visit) -> bytes`
  - `steps.append_step(visit, step: str, summary: str, data: dict | None = None) -> None`
  - `fraud.engine.run_fraud_checks(db, visit) -> FraudResult` (it replaces old signals and sets `visit.authenticity_score/verdict`, then commits)
  - `factories.make_visit(db, world, photo: bytes, *, lat=None, lng=None, captured_at=None, capture_source="camera") -> models.Visit`

- [ ] **Step 1: Write the failing test `backend/tests/test_fraud_engine.py`**

```python
from datetime import datetime

from PIL import Image

from app.services.fraud.engine import run_fraud_checks
from app.services.fraud.exif import ExifInfo, check_exif, dms_to_decimal, extract_exif
from app.services.fraud.image_hash import check_duplicate, dhash, hamming
from app.services.photos import fingerprint
from tests.factories import make_visit, make_world, sharp_jpeg


def test_dhash_identical_for_same_image_and_far_for_different():
    a, b = fingerprint(sharp_jpeg(1))[1], fingerprint(sharp_jpeg(2))[1]
    assert len(a) == 16
    assert hamming(a, fingerprint(sharp_jpeg(1))[1]) == 0
    assert hamming(a, b) > 10


def test_duplicate_check():
    h = fingerprint(sharp_jpeg(1))[1]
    assert check_duplicate(h, [(7, h)]).status == "fail"
    assert "visit #7" in check_duplicate(h, [(7, h)]).detail
    assert check_duplicate(h, [(8, fingerprint(sharp_jpeg(2))[1])]).status == "pass"


def test_extract_exif_reads_make_and_datetime():
    exif = Image.Exif()
    exif[0x010F] = "TestCam"
    exif[0x0132] = "2026:09:25 10:00:00"
    info = extract_exif(sharp_jpeg(3, exif=exif))
    assert info.has_exif and info.make == "TestCam"
    assert info.datetime_original == datetime(2026, 9, 25, 10, 0)


def test_missing_exif_is_only_a_weak_signal():
    s = check_exif(ExifInfo(has_exif=False), 18.5, 73.8, None)
    assert (s.status, s.penalty) == ("warn", 10)


def test_exif_editor_and_far_gps_fail():
    info = ExifInfo(has_exif=True, software="Adobe Photoshop 25", gps=(19.07, 72.87))
    s = check_exif(info, 18.5074, 73.8077, None)
    assert s.status == "fail" and s.penalty == 45


def test_dms_to_decimal():
    assert round(dms_to_decimal((18, 30, 36), "N"), 4) == 18.51
    assert dms_to_decimal((73, 0, 0), "W") == -73.0


def test_run_fraud_checks_verifies_genuine_visit_then_blocks_reused_photo(db):
    world = make_world(db)
    photo = sharp_jpeg(10)
    first = make_visit(db, world, photo)
    r1 = run_fraud_checks(db, first)
    assert (r1.score, r1.verdict) == (90, "VERIFIED")  # only "no EXIF" warn
    assert first.authenticity_verdict == "VERIFIED"
    assert len(first.fraud_signals) == 5

    second = make_visit(db, world, photo)
    r2 = run_fraud_checks(db, second)
    assert r2.verdict == "BLOCKED"
    assert any(s.name == "duplicate_image" and s.status == "fail" for s in r2.signals)


def test_run_fraud_checks_is_idempotent(db):
    world = make_world(db)
    v = make_visit(db, world, sharp_jpeg(11))
    run_fraud_checks(db, v)
    run_fraud_checks(db, v)
    db.expire(v)
    assert len(v.fraud_signals) == 5
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_fraud_engine.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.fraud.engine'`

- [ ] **Step 3: Implement `backend/app/services/fraud/image_hash.py`**

```python
import numpy as np
from PIL import Image

from app.services.fraud.signals import Signal


def dhash(img: Image.Image, size: int = 8) -> str:
    """64-bit difference hash: robust to re-compression, resizing and small edits."""
    gray = img.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    a = np.asarray(gray, dtype=np.int16)
    bits = 0
    for b in (a[:, 1:] > a[:, :-1]).flatten():
        bits = (bits << 1) | int(b)
    return f"{bits:0{size * size // 4}x}"


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def check_duplicate(phash: str | None, prior: list[tuple[int, str]], threshold: int = 6) -> Signal:
    if phash is None:
        return Signal("duplicate_image", "warn", 10, "Could not fingerprint the image")
    matches = [(vid, hamming(phash, h)) for vid, h in prior if h and hamming(phash, h) <= threshold]
    if matches:
        vid, dist = min(matches, key=lambda m: m[1])
        return Signal("duplicate_image", "fail", 60, f"Near-identical to the photo from visit #{vid} (distance {dist})")
    return Signal("duplicate_image", "pass", 0, f"Unique among {len(prior)} previous photos")
```

- [ ] **Step 4: Implement `backend/app/services/fraud/exif.py`**

```python
import io
from dataclasses import dataclass
from datetime import datetime

from PIL import Image

from app.services.fraud.signals import Signal, haversine_m

EDITORS = ("photoshop", "snapseed", "picsart", "lightroom", "gimp", "canva")
TAG_MAKE, TAG_MODEL, TAG_SOFTWARE, TAG_DATETIME = 0x010F, 0x0110, 0x0131, 0x0132
IFD_EXIF, IFD_GPS, TAG_DATETIME_ORIGINAL = 0x8769, 0x8825, 0x9003


@dataclass(frozen=True)
class ExifInfo:
    has_exif: bool
    make: str | None = None
    model: str | None = None
    software: str | None = None
    datetime_original: datetime | None = None
    gps: tuple[float, float] | None = None


def dms_to_decimal(dms, ref: str) -> float:
    d, m, s = (float(x) for x in dms)
    value = d + m / 60 + s / 3600
    return -value if ref in ("S", "W") else value


def _parse_dt(raw) -> datetime | None:
    try:
        return datetime.strptime(str(raw), "%Y:%m:%d %H:%M:%S")
    except (TypeError, ValueError):
        return None


def extract_exif(data: bytes) -> ExifInfo:
    try:
        exif = Image.open(io.BytesIO(data)).getexif()
    except Exception:
        return ExifInfo(has_exif=False)
    if not exif:
        return ExifInfo(has_exif=False)
    sub, gps_ifd = exif.get_ifd(IFD_EXIF), exif.get_ifd(IFD_GPS)
    gps = None
    if gps_ifd.get(2) and gps_ifd.get(4):
        try:
            gps = (dms_to_decimal(gps_ifd[2], gps_ifd.get(1, "N")), dms_to_decimal(gps_ifd[4], gps_ifd.get(3, "E")))
        except (TypeError, ValueError, ZeroDivisionError):
            gps = None
    return ExifInfo(
        has_exif=True,
        make=exif.get(TAG_MAKE),
        model=exif.get(TAG_MODEL),
        software=exif.get(TAG_SOFTWARE),
        datetime_original=_parse_dt(sub.get(TAG_DATETIME_ORIGINAL) or exif.get(TAG_DATETIME)),
        gps=gps,
    )


def check_exif(info: ExifInfo, lat: float, lng: float, captured_at: datetime | None) -> Signal:
    """EXIF is easy to strip or forge. It only adds or removes confidence alongside other signals."""
    if not info.has_exif:
        return Signal("exif", "warn", 10, "No EXIF metadata (common for browser captures); neither proves nor disproves authenticity")
    penalty, notes = 0, []
    if info.software and any(tool in info.software.lower() for tool in EDITORS):
        penalty += 20
        notes.append(f"Edited with {info.software}")
    if info.gps:
        d = haversine_m(lat, lng, *info.gps)
        if d > 500:
            penalty += 25
            notes.append(f"EXIF GPS is {d:.0f} m from the reported location")
    if info.datetime_original and captured_at:
        # EXIF time is device-local (IST, no timezone), so only large gaps are meaningful.
        if abs((captured_at - info.datetime_original).total_seconds()) > 24 * 3600:
            penalty += 15
            notes.append("EXIF capture date differs from the visit by more than a day")
    status = "pass" if penalty == 0 else ("fail" if penalty >= 25 else "warn")
    return Signal("exif", status, penalty, "; ".join(notes) or "EXIF consistent with the visit")
```

- [ ] **Step 5: Implement `backend/app/services/photos.py` and `backend/app/services/steps.py`**

```python
# photos.py
import hashlib
import io
import uuid
from pathlib import Path

from PIL import Image

from app.config import settings
from app.services.fraud.image_hash import dhash

ALLOWED_MEDIA_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def fingerprint(data: bytes) -> tuple[str, str]:
    """Returns (sha256 hex, 64-bit dHash hex). Raises PIL.UnidentifiedImageError if not an image."""
    with Image.open(io.BytesIO(data)) as img:
        return hashlib.sha256(data).hexdigest(), dhash(img)


def store_photo(data: bytes, media_type: str) -> str:
    name = f"visit_{uuid.uuid4().hex}{ALLOWED_MEDIA_TYPES[media_type]}"
    path = Path(settings.upload_dir)
    path.mkdir(parents=True, exist_ok=True)
    (path / name).write_bytes(data)
    return name


def read_photo(visit) -> bytes:
    return (Path(settings.upload_dir) / visit.photo_path).read_bytes()
```

```python
# steps.py
from app.timeutil import utcnow


def append_step(visit, step: str, summary: str, data: dict | None = None) -> None:
    """Append to visit.pipeline_log. Reassigns the list so SQLAlchemy detects the JSON change."""
    entry = {"step": step, "at": utcnow().isoformat(), "summary": summary}
    if data:
        entry["data"] = data
    visit.pipeline_log = [*(visit.pipeline_log or []), entry]
```

- [ ] **Step 6: Implement `backend/app/services/fraud/engine.py`**

```python
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
```

- [ ] **Step 7: Append `make_visit` to `backend/tests/factories.py`**

```python
from app.services.photos import fingerprint, store_photo
from app.timeutil import utcnow


def make_visit(db, world, photo: bytes, *, lat=None, lng=None, captured_at=None, capture_source="camera"):
    sha, phash = fingerprint(photo)
    now = utcnow()
    visit = models.Visit(
        merchant_id=world.merchant.id, fse_id=world.fse.id,
        photo_path=store_photo(photo, "image/jpeg"), photo_media_type="image/jpeg",
        photo_sha256=sha, photo_phash=phash,
        lat=world.merchant.lat if lat is None else lat, lng=world.merchant.lng if lng is None else lng,
        client_captured_at=captured_at or now, received_at=now, capture_source=capture_source,
    )
    db.add(visit)
    db.commit()
    return visit
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pytest tests/test_fraud_engine.py -v`
Expected: PASS (8 tests)

- [ ] **Step 9: Commit**

```bash
git add backend
git commit -m "feat(fraud): perceptual-hash duplicates, EXIF signal, photo storage, persisted fraud engine"
```

---

### Task 5: Vision schema, image-quality gate, fixture provider, persisted vision engine

**Files:**
- Create: `backend/app/services/vision/__init__.py` (empty), `backend/app/services/vision/schema.py`, `backend/app/services/vision/quality.py`, `backend/app/services/vision/fixture_provider.py`, `backend/app/services/vision/engine.py`, `backend/fixtures/vision_fixtures.json`, `backend/scripts/register_fixture.py`
- Test: `backend/tests/test_vision.py`

**Interfaces:**
- Consumes: `settings`, `photos.read_photo`, models.
- Produces:
  - `CounterAudit` (Pydantic model with the spec fields), `CounterAudit.unusable(notes: str, signals: list[str] | None = None) -> CounterAudit`, `CounterAudit.clamped() -> CounterAudit`, `VisionUnavailable(Exception)`
  - `QualityResult(verdict: "ok"|"blurry"|"dark", blur_score: float, brightness: float)`, `assess_quality(data: bytes) -> QualityResult`
  - `VisionProvider` protocol: `.name: str`, `.analyze(image_bytes: bytes, media_type: str) -> CounterAudit`
  - `PRESETS: dict[str, CounterAudit]` (keys: `compliant, non_compliant, low_confidence, suspicious`), `FixtureVisionProvider(by_sha256: dict[str, str] | None = None, default: str = "non_compliant")`, `FixtureVisionProvider.from_file(path) -> FixtureVisionProvider`
  - `engine.get_vision_provider() -> VisionProvider`, `engine.analyze_bytes(data, media_type, provider=None) -> tuple[QualityResult, CounterAudit, str]`, `engine.run_vision(db, visit, provider=None) -> models.VisitAudit`

- [ ] **Step 1: Write the failing test `backend/tests/test_vision.py`**

```python
import hashlib
import json

import pytest

from app.services.vision.engine import run_vision
from app.services.vision.fixture_provider import PRESETS, FixtureVisionProvider
from app.services.vision.quality import assess_quality
from app.services.vision.schema import CounterAudit, VisionUnavailable
from tests.factories import blurry_jpeg, dark_jpeg, make_visit, make_world, sharp_jpeg


def test_quality_gate():
    assert assess_quality(sharp_jpeg()).verdict == "ok"
    assert assess_quality(blurry_jpeg()).verdict == "blurry"
    assert assess_quality(dark_jpeg()).verdict == "dark"


def test_clamped_bounds_scores():
    a = PRESETS["compliant"].model_copy(update={"qr_visibility_score": 140, "confidence": 1.7})
    c = a.clamped()
    assert (c.qr_visibility_score, c.confidence) == (100, 1.0)


def test_fixture_provider_by_sha(tmp_path):
    photo = sharp_jpeg(4)
    path = tmp_path / "f.json"
    path.write_text(json.dumps({"default": "compliant", "photos": {hashlib.sha256(photo).hexdigest(): "non_compliant"}}))
    p = FixtureVisionProvider.from_file(path)
    assert p.analyze(photo, "image/jpeg").qr_visibility_score == 38
    assert p.analyze(sharp_jpeg(5), "image/jpeg").qr_visibility_score == 89


def test_fixture_provider_missing_file_uses_default(tmp_path):
    p = FixtureVisionProvider.from_file(tmp_path / "nope.json")
    assert p.analyze(sharp_jpeg(), "image/jpeg").recommended_action == "reposition_paytm_qr"


def test_run_vision_persists_audit(db):
    world = make_world(db)
    v = make_visit(db, world, sharp_jpeg(20))
    audit = run_vision(db, v, provider=FixtureVisionProvider(default="non_compliant"))
    assert audit.qr_visibility_score == 38 and audit.competitor == "PhonePe"
    assert audit.image_quality == "ok" and audit.provider == "fixture"
    # re-run replaces rather than duplicates
    run_vision(db, v, provider=FixtureVisionProvider(default="compliant"))
    db.expire(v)
    assert v.audit.qr_visibility_score == 89


class _Boom:
    name = "boom"

    def analyze(self, image_bytes, media_type):
        raise AssertionError("provider must not be called for unusable images")


def test_blurry_photo_skips_provider_and_asks_for_retake(db):
    world = make_world(db)
    v = make_visit(db, world, blurry_jpeg())
    audit = run_vision(db, v, provider=_Boom())
    assert audit.image_quality == "blurry"
    assert audit.recommended_action == "retake_photo" and audit.confidence == 0.0
    assert audit.provider == "quality_gate"


class _Down:
    name = "down"

    def analyze(self, image_bytes, media_type):
        raise VisionUnavailable("timeout")


def test_provider_failure_degrades_to_low_confidence(db):
    world = make_world(db)
    v = make_visit(db, world, sharp_jpeg(21))
    audit = run_vision(db, v, provider=_Down())
    assert audit.provider == "error" and "analysis_failed" in audit.suspicious_signals
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_vision.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.vision'`

- [ ] **Step 3: Implement `backend/app/services/vision/schema.py`**

```python
from typing import Literal

from pydantic import BaseModel

RecommendedAction = Literal[
    "none", "reposition_paytm_qr", "clear_qr_obstruction", "install_soundbox",
    "replace_damaged_qr", "reduce_competitor_dominance", "retake_photo",
]


class VisionUnavailable(Exception):
    pass


class CounterAudit(BaseModel):
    paytm_qr_visible: bool
    qr_visibility_score: int
    soundbox_visible: bool
    competitor: str | None
    competitor_dominance: Literal["none", "low", "medium", "high"]
    qr_obstructed: bool
    suspicious_image_signals: list[str]
    recommended_action: RecommendedAction
    confidence: float
    notes: str

    def clamped(self) -> "CounterAudit":
        return self.model_copy(update={
            "qr_visibility_score": max(0, min(100, self.qr_visibility_score)),
            "confidence": max(0.0, min(1.0, self.confidence)),
        })

    @classmethod
    def unusable(cls, notes: str, signals: list[str] | None = None) -> "CounterAudit":
        return cls(
            paytm_qr_visible=False, qr_visibility_score=0, soundbox_visible=False, competitor=None,
            competitor_dominance="none", qr_obstructed=False, suspicious_image_signals=signals or [],
            recommended_action="retake_photo", confidence=0.0, notes=notes,
        )
```

- [ ] **Step 4: Implement `backend/app/services/vision/quality.py`**

```python
import io
from dataclasses import dataclass

import numpy as np
from PIL import Image

from app.config import settings


@dataclass(frozen=True)
class QualityResult:
    verdict: str  # ok | blurry | dark
    blur_score: float  # variance of Laplacian; higher = sharper
    brightness: float  # mean gray level 0-255


def assess_quality(data: bytes) -> QualityResult:
    img = Image.open(io.BytesIO(data)).convert("L")
    img.thumbnail((512, 512))
    g = np.asarray(img, dtype=np.float32)
    lap = -4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:]
    blur, brightness = float(lap.var()), float(g.mean())
    if brightness < settings.dark_threshold:
        verdict = "dark"
    elif blur < settings.blur_threshold:
        verdict = "blurry"
    else:
        verdict = "ok"
    return QualityResult(verdict=verdict, blur_score=round(blur, 1), brightness=round(brightness, 1))
```

- [ ] **Step 5: Implement `backend/app/services/vision/fixture_provider.py`**

```python
import hashlib
import json
from pathlib import Path

from app.services.vision.schema import CounterAudit

PRESETS = {
    "compliant": CounterAudit(
        paytm_qr_visible=True, qr_visibility_score=89, soundbox_visible=True, competitor="PhonePe",
        competitor_dominance="low", qr_obstructed=False, suspicious_image_signals=[], recommended_action="none",
        confidence=0.93, notes="Paytm QR clearly visible beside the billing counter; Soundbox on.",
    ),
    "non_compliant": CounterAudit(
        paytm_qr_visible=True, qr_visibility_score=38, soundbox_visible=True, competitor="PhonePe",
        competitor_dominance="high", qr_obstructed=True, suspicious_image_signals=[],
        recommended_action="reposition_paytm_qr", confidence=0.93,
        notes="PhonePe standee dominates the counter; Paytm QR is partly behind the register.",
    ),
    "low_confidence": CounterAudit(
        paytm_qr_visible=True, qr_visibility_score=55, soundbox_visible=False, competitor=None,
        competitor_dominance="none", qr_obstructed=False, suspicious_image_signals=[],
        recommended_action="retake_photo", confidence=0.41, notes="Counter only partly in frame.",
    ),
    "suspicious": CounterAudit(
        paytm_qr_visible=True, qr_visibility_score=80, soundbox_visible=True, competitor=None,
        competitor_dominance="none", qr_obstructed=False, suspicious_image_signals=["photo_of_screen"],
        recommended_action="none", confidence=0.8, notes="Looks like a photo of a phone screen.",
    ),
}


class FixtureVisionProvider:
    """Deterministic offline provider: a rehearsed demo photo always yields the same audit."""

    name = "fixture"

    def __init__(self, by_sha256: dict[str, str] | None = None, default: str = "non_compliant"):
        self.by_sha256 = by_sha256 or {}
        self.default = default

    @classmethod
    def from_file(cls, path) -> "FixtureVisionProvider":
        p = Path(path)
        if not p.exists():
            return cls()
        data = json.loads(p.read_text())
        return cls(by_sha256=data.get("photos", {}), default=data.get("default", "non_compliant"))

    def analyze(self, image_bytes: bytes, media_type: str) -> CounterAudit:
        preset = self.by_sha256.get(hashlib.sha256(image_bytes).hexdigest(), self.default)
        return PRESETS[preset].model_copy(deep=True)
```

- [ ] **Step 6: Implement `backend/app/services/vision/engine.py`**

```python
from typing import Protocol

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.services.photos import read_photo
from app.services.vision.fixture_provider import FixtureVisionProvider
from app.services.vision.quality import QualityResult, assess_quality
from app.services.vision.schema import CounterAudit, VisionUnavailable


class VisionProvider(Protocol):
    name: str

    def analyze(self, image_bytes: bytes, media_type: str) -> CounterAudit: ...


def get_vision_provider() -> VisionProvider:
    if settings.vision_provider == "claude":
        from app.services.vision.claude_provider import ClaudeVisionProvider

        return ClaudeVisionProvider()
    return FixtureVisionProvider.from_file(settings.vision_fixtures_path)


def analyze_bytes(data: bytes, media_type: str, provider: VisionProvider | None = None) -> tuple[QualityResult, CounterAudit, str]:
    quality = assess_quality(data)
    if quality.verdict != "ok":
        return quality, CounterAudit.unusable(f"Image is {quality.verdict}; please retake the photo"), "quality_gate"
    provider = provider or get_vision_provider()
    try:
        return quality, provider.analyze(data, media_type).clamped(), provider.name
    except VisionUnavailable as exc:
        return quality, CounterAudit.unusable(f"Vision unavailable: {exc}", ["analysis_failed"]), "error"


def run_vision(db: Session, visit: models.Visit, provider: VisionProvider | None = None) -> models.VisitAudit:
    quality, result, provider_name = analyze_bytes(read_photo(visit), visit.photo_media_type or "image/jpeg", provider)
    db.execute(delete(models.VisitAudit).where(models.VisitAudit.visit_id == visit.id))
    audit = models.VisitAudit(
        visit_id=visit.id,
        paytm_qr_visible=result.paytm_qr_visible,
        qr_visibility_score=result.qr_visibility_score,
        soundbox_visible=result.soundbox_visible,
        competitor=result.competitor,
        competitor_dominance=result.competitor_dominance,
        qr_obstructed=result.qr_obstructed,
        image_quality=quality.verdict,
        blur_score=quality.blur_score,
        suspicious_signals=result.suspicious_image_signals,
        recommended_action=result.recommended_action,
        confidence=result.confidence,
        notes=result.notes,
        provider=provider_name,
        raw=result.model_dump(),
    )
    db.add(audit)
    db.commit()
    db.expire(visit, ["audit"])
    return audit
```

- [ ] **Step 7: Create `backend/fixtures/vision_fixtures.json` and `backend/scripts/register_fixture.py`**

```json
{"default": "non_compliant", "photos": {}}
```

```python
"""Pin a rehearsed demo photo to a preset for offline demos.
Usage: python scripts/register_fixture.py path/to/photo.jpg compliant|non_compliant|low_confidence|suspicious"""

import hashlib
import json
import sys
from pathlib import Path

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "vision_fixtures.json"

photo, preset = Path(sys.argv[1]), sys.argv[2]
data = json.loads(FIXTURES.read_text())
data["photos"][hashlib.sha256(photo.read_bytes()).hexdigest()] = preset
FIXTURES.write_text(json.dumps(data, indent=2))
print(f"{photo.name} -> {preset}")
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pytest tests/test_vision.py -v`
Expected: PASS (7 tests)

- [ ] **Step 9: Commit**

```bash
git add backend
git commit -m "feat(vision): counter audit schema, blur/dark gate, fixture provider, persisted vision engine"
```

---

### Task 6: Claude vision provider and stateless image-audit endpoint

**Files:**
- Create: `backend/app/services/vision/claude_provider.py`, `backend/app/api/audit.py`
- Modify: `backend/app/main.py` (include router)
- Test: `backend/tests/test_claude_provider.py`, `backend/tests/test_audit_api.py`

**Interfaces:**
- Consumes: `CounterAudit`, `VisionUnavailable`, `analyze_bytes`, `get_vision_provider`, `photos.ALLOWED_MEDIA_TYPES`, `get_db`, models.
- Produces: `ClaudeVisionProvider(client=None, model=None)` with `.name == "claude"` and `.analyze(...)`. Routes `POST /api/audit/analyze-image` (multipart `photo`) returning `{"quality": {...}, "audit": {...}, "provider": str}` and `GET /api/audit/{visit_id}` returning the stored audit.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_claude_provider.py`:
```python
from types import SimpleNamespace

import pytest

from app.services.vision.claude_provider import ClaudeVisionProvider
from app.services.vision.fixture_provider import PRESETS
from app.services.vision.schema import CounterAudit, VisionUnavailable


class FakeMessages:
    def __init__(self, response):
        self.response, self.calls = response, []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


def _client(response):
    return SimpleNamespace(messages=FakeMessages(response))


def test_sends_image_and_schema_and_returns_parsed_output():
    client = _client(SimpleNamespace(stop_reason="end_turn", parsed_output=PRESETS["non_compliant"]))
    out = ClaudeVisionProvider(client=client, model="claude-opus-5").analyze(b"\xff\xd8jpeg", "image/jpeg")
    assert out.qr_visibility_score == 38
    call = client.messages.calls[0]
    assert call["model"] == "claude-opus-5"
    assert call["output_format"] is CounterAudit
    image_block = call["messages"][0]["content"][0]
    assert image_block["type"] == "image" and image_block["source"]["media_type"] == "image/jpeg"


def test_refusal_raises_vision_unavailable():
    client = _client(SimpleNamespace(stop_reason="refusal", parsed_output=None))
    with pytest.raises(VisionUnavailable):
        ClaudeVisionProvider(client=client).analyze(b"x", "image/jpeg")
```

`backend/tests/test_audit_api.py`:
```python
from tests.factories import blurry_jpeg, sharp_jpeg


def test_analyze_image_endpoint_uses_configured_provider(client):
    res = client.post("/api/audit/analyze-image", files={"photo": ("c.jpg", sharp_jpeg(30), "image/jpeg")})
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "fixture"
    assert body["quality"]["verdict"] == "ok"
    assert body["audit"]["recommended_action"] == "reposition_paytm_qr"


def test_analyze_image_blurry(client):
    res = client.post("/api/audit/analyze-image", files={"photo": ("c.jpg", blurry_jpeg(), "image/jpeg")})
    assert res.json()["audit"]["recommended_action"] == "retake_photo"


def test_analyze_image_rejects_non_images(client):
    res = client.post("/api/audit/analyze-image", files={"photo": ("c.txt", b"hello", "text/plain")})
    assert res.status_code == 415
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_claude_provider.py tests/test_audit_api.py -v`
Expected: FAIL (`ModuleNotFoundError` / 404)

- [ ] **Step 3: Implement `backend/app/services/vision/claude_provider.py`**

```python
import base64

import anthropic
import pydantic

from app.config import settings
from app.services.vision.schema import CounterAudit, VisionUnavailable

PROMPT = """You are auditing a photo of a small Indian merchant's billing counter for Paytm. \
A field sales executive took the photo during a visit. Report only what is actually visible in the frame.

- paytm_qr_visible: a Paytm-branded QR standee or sticker is visible.
- qr_visibility_score: 0-100. How easily could a customer standing at the counter see and scan the Paytm QR? \
Consider placement, size, angle and lighting. Use 0 if it is not visible.
- soundbox_visible: a Paytm Soundbox device is visible.
- competitor: the most prominent non-Paytm payment QR brand (PhonePe, Google Pay, BharatPe, Amazon Pay, or Other), or null if none.
- competitor_dominance: how much more prominent competitor QRs are than Paytm's: none, low, medium or high.
- qr_obstructed: something partially blocks the Paytm QR.
- suspicious_image_signals: any of photo_of_screen, photo_of_printout, heavily_edited, stock_or_web_image, \
not_a_shop_counter. Use an empty list if none apply.
- recommended_action: the single most useful fix.
- confidence: 0-1, your overall confidence in this assessment. Use a low value if the image is unclear or the counter is out of frame.
- notes: one short sentence the field rep can act on."""


class ClaudeVisionProvider:
    name = "claude"

    def __init__(self, client=None, model: str | None = None):
        self._client = client or anthropic.Anthropic(timeout=60.0, max_retries=1)
        self._model = model or settings.anthropic_model

    def analyze(self, image_bytes: bytes, media_type: str) -> CounterAudit:
        image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
        try:
            response = self._client.messages.parse(
                model=self._model,
                max_tokens=16000,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
                        {"type": "text", "text": PROMPT},
                    ],
                }],
                output_format=CounterAudit,
            )
        except (anthropic.APIError, pydantic.ValidationError) as exc:
            raise VisionUnavailable(str(exc)) from exc
        if response.stop_reason == "refusal" or response.parsed_output is None:
            raise VisionUnavailable(f"no structured output (stop_reason={response.stop_reason})")
        return response.parsed_output
```

A refusal or API failure becomes a low-confidence audit, which routes to manager escalation (Task 7). That is this system's fallback path.

- [ ] **Step 4: Implement `backend/app/api/audit.py`**

```python
from dataclasses import asdict

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.schemas import AuditOut
from app.services.photos import ALLOWED_MEDIA_TYPES
from app.services.vision.engine import analyze_bytes

router = APIRouter(prefix="/audit", tags=["audit"])


@router.post("/analyze-image")
def analyze_image(photo: UploadFile = File(...)):
    if photo.content_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(415, f"Unsupported image type {photo.content_type}")
    quality, audit, provider = analyze_bytes(photo.file.read(), photo.content_type)
    return {"quality": asdict(quality), "audit": audit.model_dump(), "provider": provider}


@router.get("/{visit_id}", response_model=AuditOut)
def get_audit(visit_id: int, db: Session = Depends(get_db)):
    audit = db.query(models.VisitAudit).filter_by(visit_id=visit_id).one_or_none()
    if audit is None:
        raise HTTPException(404, "No audit for this visit yet")
    return audit
```

This imports `AuditOut` from `app/schemas.py`. Create that file now with just this model. Task 9 extends it.
```python
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
```

- [ ] **Step 5: Register the router in `backend/app/main.py`**

Inside `create_app()`, after the health route:
```python
    from app.api import audit

    app.include_router(audit.router, prefix="/api")
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pytest tests/test_claude_provider.py tests/test_audit_api.py -v`
Expected: PASS (5 tests)

- [ ] **Step 7: Manual live check with a real counter photo (needs `ANTHROPIC_API_KEY`)**

```bash
VISION_PROVIDER=claude uvicorn app.main:app --port 8000 &
curl -s -F "photo=@demo_photos/counter_bad.jpg;type=image/jpeg" localhost:8000/api/audit/analyze-image | python -m json.tool
```
Expected: a JSON audit that plausibly describes the photo. Photograph four demo counters now: `counter_good.jpg`, `counter_bad.jpg` (Paytm QR hidden behind a PhonePe standee), `counter_blurry.jpg` and `counter_screen.jpg` (a photo of a phone screen). Pin each one for offline mode:
```bash
python scripts/register_fixture.py demo_photos/counter_good.jpg compliant
python scripts/register_fixture.py demo_photos/counter_bad.jpg non_compliant
python scripts/register_fixture.py demo_photos/counter_screen.jpg suspicious
```
If `counter_blurry.jpg` is not flagged as blurry, tune `BLUR_THRESHOLD` so it is. The real sharp photos must stay above the threshold.

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "feat(vision): Claude structured-output vision provider and image audit endpoint"
```

---

### Task 7: Merchant memory (SQL) and the decision engine

**Files:**
- Create: `backend/app/services/memory/__init__.py`, `backend/app/services/memory/base.py`, `backend/app/services/memory/sql_memory.py`, `backend/app/services/decision.py`
- Test: `backend/tests/test_decision.py`, `backend/tests/test_memory.py`

**Interfaces:**
- Consumes: models, `ACTION_LABELS`, `seed.seed` (in tests).
- Produces:
  - `MerchantContext` dataclass: `merchant_id, merchant_name, rep_name, previous_scores: list[int]` (newest first), `previous_issues: list[str]`, `previous_interventions: list[str]`, `consecutive_non_compliant: int`, `last_visit_at: datetime | None`, `transaction_trend_pct: float | None = None`, `summary: str = ""`, `source: str = "sql"`, plus `.to_dict() -> dict`
  - `MemoryStore` protocol: `get_context(db, merchant_id: int, exclude_visit_id: int | None = None) -> MerchantContext` and `record_visit_outcome(db, visit) -> None`
  - `SqlMemory()` implements `MemoryStore`. `app.services.memory.get_memory() -> MemoryStore`
  - `AuditFacts` (frozen dataclass: `paytm_qr_visible, qr_visibility_score, soundbox_visible, qr_obstructed, image_quality, confidence, recommended_action, suspicious_signals: tuple[str, ...]`) with `AuditFacts.from_audit(audit)`
  - `Decision(outcome: str, reasons: list[str])`
  - `decide(verdict: str, audit: AuditFacts, ctx: MerchantContext | None = None, *, manager_override: bool = False) -> Decision`
  - Constants `COMPLIANT_MIN_SCORE = 70`, `MIN_CONFIDENCE = 0.6`

- [ ] **Step 1: Write the failing test `backend/tests/test_decision.py`**

```python
import pytest

from app.services.decision import AuditFacts, decide
from app.services.memory.base import MerchantContext

GOOD = AuditFacts(True, 89, True, False, "ok", 0.93, "none", ())


def _ctx(**kw):
    base = dict(merchant_id=1, merchant_name="Ramesh General Store", rep_name="Amit Patil", previous_scores=[],
                previous_issues=[], previous_interventions=[], consecutive_non_compliant=0, last_visit_at=None)
    return MerchantContext(**{**base, **kw})


@pytest.mark.parametrize(
    "verdict, audit, outcome",
    [
        ("BLOCKED", GOOD, "fraud"),
        ("REVIEW_REQUIRED", GOOD, "low_confidence"),
        ("VERIFIED", AuditFacts(False, 0, False, False, "blurry", 0.0, "retake_photo", ()), "low_confidence"),
        ("VERIFIED", AuditFacts(True, 60, True, False, "ok", 0.41, "retake_photo", ()), "low_confidence"),
        ("VERIFIED", AuditFacts(True, 80, True, False, "ok", 0.8, "none", ("photo_of_screen",)), "low_confidence"),
        ("VERIFIED", GOOD, "compliant"),
        ("VERIFIED", AuditFacts(True, 38, True, True, "ok", 0.93, "reposition_paytm_qr", ()), "non_compliant"),
        ("VERIFIED", AuditFacts(True, 85, False, False, "ok", 0.9, "install_soundbox", ()), "non_compliant"),
    ],
)
def test_decision_table(verdict, audit, outcome):
    assert decide(verdict, audit).outcome == outcome


def test_compliant_mentions_improvement_from_memory():
    d = decide("VERIFIED", GOOD, _ctx(previous_scores=[42]))
    assert any("previous score 42" in r for r in d.reasons)


def test_repeat_non_compliance_is_called_out():
    bad = AuditFacts(True, 38, True, True, "ok", 0.93, "reposition_paytm_qr", ())
    d = decide("VERIFIED", bad, _ctx(consecutive_non_compliant=2))
    assert any("3 non-compliant visits in a row" in r for r in d.reasons)


def test_manager_override_skips_low_confidence_rules_but_never_fraud():
    low = AuditFacts(True, 85, True, False, "ok", 0.41, "none", ())
    assert decide("REVIEW_REQUIRED", low, manager_override=True).outcome == "compliant"
    assert decide("BLOCKED", GOOD, manager_override=True).outcome == "fraud"
```

- [ ] **Step 2: Write the failing test `backend/tests/test_memory.py`**

```python
from datetime import date

from sqlalchemy import select

from app import models
from app.seed import seed
from app.services.memory import get_memory


def test_sql_memory_recalls_ramesh_history(db):
    seed(db, today=date(2026, 9, 25))
    ramesh = db.scalar(select(models.Merchant).where(models.Merchant.name == "Ramesh General Store"))
    ctx = get_memory().get_context(db, ramesh.id)
    assert ctx.previous_scores == [42, 38]
    assert ctx.previous_issues[0] == "QR obstruction"
    assert ctx.previous_interventions[0] == "clear_qr_obstruction"
    assert ctx.consecutive_non_compliant == 2
    assert ctx.rep_name == "Amit Patil"
    assert "42" in ctx.summary and "QR obstruction" in ctx.summary
    assert ctx.to_dict()["last_visit_at"].startswith("2026-09-05")
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pytest tests/test_decision.py tests/test_memory.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 4: Implement `backend/app/services/memory/base.py`**

```python
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Protocol


@dataclass
class MerchantContext:
    merchant_id: int
    merchant_name: str
    rep_name: str | None
    previous_scores: list[int]  # newest first
    previous_issues: list[str]  # human labels, newest first
    previous_interventions: list[str]  # action codes, newest first
    consecutive_non_compliant: int
    last_visit_at: datetime | None
    transaction_trend_pct: float | None = None
    summary: str = ""
    source: str = "sql"
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["last_visit_at"] = self.last_visit_at.isoformat() if self.last_visit_at else None
        return d


class MemoryStore(Protocol):
    def get_context(self, db, merchant_id: int, exclude_visit_id: int | None = None) -> MerchantContext: ...

    def record_visit_outcome(self, db, visit) -> None: ...
```

- [ ] **Step 5: Implement `backend/app/services/memory/sql_memory.py`**

```python
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.services.labels import ACTION_LABELS
from app.services.memory.base import MerchantContext

DONE_STATUSES = ("completed", "escalated", "blocked")


class SqlMemory:
    def get_context(self, db: Session, merchant_id: int, exclude_visit_id: int | None = None) -> MerchantContext:
        merchant = db.get(models.Merchant, merchant_id)
        q = (
            select(models.Visit)
            .where(models.Visit.merchant_id == merchant_id, models.Visit.status.in_(DONE_STATUSES))
            .order_by(models.Visit.received_at.desc())
            .limit(10)
        )
        if exclude_visit_id is not None:
            q = q.where(models.Visit.id != exclude_visit_id)
        visits = db.scalars(q).all()
        audited = [v for v in visits if v.audit is not None]

        streak = 0
        for v in visits:
            if v.decision != "non_compliant":
                break
            streak += 1

        interventions = db.scalars(
            select(models.Intervention)
            .where(models.Intervention.merchant_id == merchant_id)
            .order_by(models.Intervention.created_at.desc())
            .limit(5)
        ).all()

        ctx = MerchantContext(
            merchant_id=merchant_id,
            merchant_name=merchant.name,
            rep_name=merchant.fse.user.name if merchant.fse else None,
            previous_scores=[v.audit.qr_visibility_score for v in audited],
            previous_issues=[ACTION_LABELS.get(v.audit.recommended_action, v.audit.recommended_action)
                             for v in audited if v.decision == "non_compliant"],
            previous_interventions=[i.action for i in interventions],
            consecutive_non_compliant=streak,
            last_visit_at=visits[0].received_at if visits else None,
        )
        ctx.summary = summarize(ctx)
        return ctx

    def record_visit_outcome(self, db: Session, visit: models.Visit) -> None:
        return None  # history is already in SQL


def summarize(ctx: MerchantContext) -> str:
    if not ctx.previous_scores:
        return f"{ctx.merchant_name}: first audited visit."
    parts = [f"{ctx.merchant_name}: last score {ctx.previous_scores[0]}"]
    if ctx.last_visit_at:
        parts[0] += f" ({ctx.last_visit_at.date().isoformat()})"
    if ctx.previous_issues:
        parts.append(f"previous issue: {ctx.previous_issues[0]}")
    if ctx.previous_interventions:
        parts.append(f"previous intervention: {ctx.previous_interventions[0]}")
    if ctx.consecutive_non_compliant:
        parts.append(f"{ctx.consecutive_non_compliant} non-compliant visit(s) in a row")
    if ctx.transaction_trend_pct is not None:
        parts.append(f"observed transaction change {ctx.transaction_trend_pct:+.1f}%")
    return "; ".join(parts) + "."
```

`backend/app/services/memory/__init__.py`:
```python
from app.config import settings
from app.services.memory.base import MemoryStore, MerchantContext
from app.services.memory.sql_memory import SqlMemory

__all__ = ["MemoryStore", "MerchantContext", "get_memory"]


def get_memory() -> MemoryStore:
    return SqlMemory()
```

- [ ] **Step 6: Implement `backend/app/services/decision.py`**

```python
from dataclasses import dataclass, field

from app.services.memory.base import MerchantContext

COMPLIANT_MIN_SCORE = 70
MIN_CONFIDENCE = 0.6


@dataclass(frozen=True)
class AuditFacts:
    paytm_qr_visible: bool
    qr_visibility_score: int
    soundbox_visible: bool
    qr_obstructed: bool
    image_quality: str
    confidence: float
    recommended_action: str
    suspicious_signals: tuple[str, ...] = ()

    @classmethod
    def from_audit(cls, a) -> "AuditFacts":
        return cls(a.paytm_qr_visible, a.qr_visibility_score, a.soundbox_visible, a.qr_obstructed,
                   a.image_quality, a.confidence, a.recommended_action, tuple(a.suspicious_signals or ()))


@dataclass
class Decision:
    outcome: str  # compliant | non_compliant | low_confidence | fraud
    reasons: list[str] = field(default_factory=list)


def decide(verdict: str, audit: AuditFacts, ctx: MerchantContext | None = None, *, manager_override: bool = False) -> Decision:
    if verdict == "BLOCKED":
        return Decision("fraud", ["Visit failed authenticity checks"])
    if not manager_override:
        if verdict == "REVIEW_REQUIRED":
            return Decision("low_confidence", ["Visit authenticity needs manager review"])
        if audit.image_quality != "ok":
            return Decision("low_confidence", [f"Photo is {audit.image_quality}"])
        if audit.suspicious_signals:
            return Decision("low_confidence", [f"Suspicious image: {', '.join(audit.suspicious_signals)}"])
        if audit.confidence < MIN_CONFIDENCE:
            return Decision("low_confidence", [f"Vision confidence {audit.confidence:.2f} below {MIN_CONFIDENCE}"])

    issues = []
    if not audit.paytm_qr_visible:
        issues.append("Paytm QR not visible")
    elif audit.qr_visibility_score < COMPLIANT_MIN_SCORE:
        issues.append(f"QR visibility {audit.qr_visibility_score} below {COMPLIANT_MIN_SCORE}")
    if audit.qr_obstructed:
        issues.append("Paytm QR obstructed")
    if not audit.soundbox_visible:
        issues.append("Soundbox not visible")

    if not issues:
        reasons = ["Paytm QR clearly visible and Soundbox present"]
        if ctx and ctx.previous_scores and ctx.previous_scores[0] < COMPLIANT_MIN_SCORE:
            reasons.append(f"Improved from previous score {ctx.previous_scores[0]} to {audit.qr_visibility_score}")
        return Decision("compliant", reasons)

    if ctx and ctx.consecutive_non_compliant >= 1:
        issues.append(f"Repeat issue: {ctx.consecutive_non_compliant + 1} non-compliant visits in a row")
    return Decision("non_compliant", issues)
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pytest tests/test_decision.py tests/test_memory.py -v`
Expected: PASS (12 tests)

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "feat: SQL merchant memory context and rule-based decision engine"
```

---

### Task 8: Actions (incentive, localized guidance, WhatsApp dry-run, escalation, block) and the inline pipeline

**Files:**
- Create: `backend/app/services/guidance.py`, `backend/app/services/whatsapp.py`, `backend/app/services/actions.py`, `backend/app/services/pipeline.py`
- Test: `backend/tests/test_guidance.py`, `backend/tests/test_pipeline_inline.py`

**Interfaces:**
- Consumes: `run_fraud_checks`, `run_vision`, `get_memory`, `MerchantContext`, `AuditFacts`, `decide`, `append_step`, models, `settings`.
- Produces:
  - `guidance.Guidance(action, issue, text_en, text_local, language)`, `guidance.pick_action(audit) -> str`, `guidance.build_guidance(merchant, audit, ctx) -> Guidance`, `guidance.lang_key(language: str) -> str`
  - `whatsapp.SendResult(status, provider_ref=None, error=None)`, `whatsapp.send_whatsapp_message(to_phone, body, media_url=None) -> SendResult`
  - `actions.INCENTIVE_AMOUNT_INR = 50`, `actions.grant_incentive(db, visit) -> Incentive`, `actions.create_guidance(db, visit, ctx) -> Intervention`, `actions.send_whatsapp(db, visit) -> Notification`, `actions.escalate(db, visit, reason: str) -> Escalation`, `actions.block_visit(db, visit, reason: str) -> None`, `actions.complete_visit(db, visit) -> None`, `actions.STATUS_BY_OUTCOME`. Every action is idempotent per visit.
  - `pipeline.step_fraud(db, visit) -> FraudResult`, `pipeline.step_vision(db, visit) -> VisitAudit`, `pipeline.step_context(db, visit) -> MerchantContext`, `pipeline.step_decide(db, visit, ctx) -> Decision`, `pipeline.step_act(db, visit, ctx) -> None`, `pipeline.run_inline(db, visit_id: int) -> Visit`

- [ ] **Step 1: Write the failing test `backend/tests/test_guidance.py`**

```python
from types import SimpleNamespace

from app.services.guidance import build_guidance, pick_action
from app.services.memory.base import MerchantContext


def _audit(**kw):
    base = dict(recommended_action="reposition_paytm_qr", soundbox_visible=True, qr_obstructed=False)
    return SimpleNamespace(**{**base, **kw})


def _ctx(interventions=()):
    return MerchantContext(1, "Ramesh General Store", "Amit", [42], ["QR obstruction"], list(interventions), 1, None)


def test_hindi_guidance_for_ramesh():
    merchant = SimpleNamespace(owner_name="Ramesh Shinde", language="hi-IN")
    g = build_guidance(merchant, _audit(), _ctx())
    assert g.language == "hi-IN"
    assert g.text_local.startswith("नमस्ते Ramesh जी")
    assert "billing counter" in g.text_en
    assert g.issue == "QR poorly positioned"


def test_repeat_issue_adds_memory_line():
    merchant = SimpleNamespace(owner_name="Ramesh Shinde", language="hi-IN")
    g = build_guidance(merchant, _audit(), _ctx(["reposition_paytm_qr"]))
    assert "last visit" in g.text_en
    assert "पिछली विज़िट" in g.text_local


def test_marathi_and_english_fallback():
    assert build_guidance(SimpleNamespace(owner_name="Lata Pawar", language="mr-IN"), _audit(), _ctx()).text_local.startswith("नमस्कार")
    g = build_guidance(SimpleNamespace(owner_name="Arun Nair", language="ta-IN"), _audit(), _ctx())
    assert g.text_local == g.text_en


def test_pick_action_derives_fix_when_model_said_none():
    assert pick_action(_audit(recommended_action="none", soundbox_visible=False)) == "install_soundbox"
    assert pick_action(_audit(recommended_action="retake_photo", qr_obstructed=True)) == "clear_qr_obstruction"
```

- [ ] **Step 2: Write the failing test `backend/tests/test_pipeline_inline.py`**

```python
import hashlib
import json

from app.config import settings
from app.services.pipeline import run_inline
from tests.factories import blurry_jpeg, make_visit, make_world, sharp_jpeg


def _pin(photo: bytes, preset: str):
    with open(settings.vision_fixtures_path, "w") as f:
        json.dump({"default": "non_compliant", "photos": {hashlib.sha256(photo).hexdigest(): preset}}, f)


def test_compliant_visit_earns_incentive(db):
    world = make_world(db)
    photo = sharp_jpeg(40)
    _pin(photo, "compliant")
    v = run_inline(db, make_visit(db, world, photo).id)
    assert (v.status, v.decision) == ("completed", "compliant")
    assert v.incentive.amount_inr == 50
    assert [s["step"] for s in v.pipeline_log] == ["fraud_check", "vision_ai", "merchant_context", "decision", "incentive", "complete"]


def test_non_compliant_visit_sends_hindi_whatsapp_guidance(db):
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, sharp_jpeg(41)).id)
    assert v.decision == "non_compliant" and v.status == "completed"
    assert v.intervention.message_language == "hi-IN"
    assert v.notifications[0].status == "dry_run"
    assert v.notifications[0].to_phone == world.merchant.phone


def test_blurry_visit_is_escalated_to_manager(db):
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, blurry_jpeg()).id)
    assert (v.status, v.decision) == ("escalated", "low_confidence")
    assert v.escalation.status == "open"


def test_reused_photo_is_blocked(db):
    world = make_world(db)
    photo = sharp_jpeg(42)
    run_inline(db, make_visit(db, world, photo).id)
    v = run_inline(db, make_visit(db, world, photo).id)
    assert (v.status, v.decision) == ("blocked", "fraud")
    assert v.incentive is None and v.notifications == []


def test_far_away_visit_goes_to_review(db):
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, sharp_jpeg(43), lat=world.merchant.lat + 0.02, capture_source="unknown").id)
    assert v.authenticity_verdict == "REVIEW_REQUIRED"
    assert v.decision == "low_confidence"


def test_actions_are_idempotent(db):
    from app.services import actions

    world = make_world(db)
    v = run_inline(db, make_visit(db, world, sharp_jpeg(44)).id)
    actions.send_whatsapp(db, v)
    actions.create_guidance(db, v, None)
    db.expire(v)
    assert len(v.notifications) == 1
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pytest tests/test_guidance.py tests/test_pipeline_inline.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 4: Implement `backend/app/services/guidance.py`**

```python
from dataclasses import dataclass

from app.services.labels import ACTION_LABELS
from app.services.memory.base import MerchantContext

TEMPLATES = {
    "reposition_paytm_qr": {
        "en": "Namaste {name} ji, please place the Paytm QR next to the billing counter so customers can see it clearly.",
        "hi": "नमस्ते {name} जी, Paytm QR को बिलिंग काउंटर के पास रखिए ताकि ग्राहकों को साफ़ दिखे।",
        "mr": "नमस्कार {name} जी, Paytm QR बिलिंग काउंटरजवळ ठेवा म्हणजे ग्राहकांना स्पष्ट दिसेल.",
    },
    "clear_qr_obstruction": {
        "en": "Namaste {name} ji, please remove items blocking the Paytm QR so customers can scan it easily.",
        "hi": "नमस्ते {name} जी, Paytm QR के सामने रखा सामान हटा दीजिए ताकि ग्राहक आसानी से स्कैन कर सकें।",
        "mr": "नमस्कार {name} जी, Paytm QR समोरचे सामान काढा म्हणजे ग्राहकांना सहज स्कॅन करता येईल.",
    },
    "install_soundbox": {
        "en": "Namaste {name} ji, please keep the Paytm Soundbox switched on at the counter so every payment is confirmed aloud.",
        "hi": "नमस्ते {name} जी, Paytm साउंडबॉक्स को काउंटर पर चालू रखिए ताकि हर पेमेंट की आवाज़ सुनाई दे।",
        "mr": "नमस्कार {name} जी, Paytm साउंडबॉक्स काउंटरवर चालू ठेवा म्हणजे प्रत्येक पेमेंटची आवाजात खात्री होईल.",
    },
    "replace_damaged_qr": {
        "en": "Namaste {name} ji, your Paytm QR looks damaged; our representative will replace it.",
        "hi": "नमस्ते {name} जी, आपका Paytm QR खराब दिख रहा है, हमारे प्रतिनिधि इसे बदल देंगे।",
        "mr": "नमस्कार {name} जी, तुमचा Paytm QR खराब दिसतो आहे, आमचे प्रतिनिधी तो बदलून देतील.",
    },
    "reduce_competitor_dominance": {
        "en": "Namaste {name} ji, please display the Paytm QR at the front of the counter where customers pay.",
        "hi": "नमस्ते {name} जी, Paytm QR को काउंटर पर सबसे आगे लगाइए जहाँ ग्राहक पेमेंट करते हैं।",
        "mr": "नमस्कार {name} जी, Paytm QR काउंटरवर सर्वात पुढे लावा जिथे ग्राहक पेमेंट करतात.",
    },
}
REPEAT_LINE = {
    "en": " We noticed the same issue on our last visit.",
    "hi": " पिछली विज़िट में भी यही समस्या दिखी थी।",
    "mr": " मागील भेटीतही हीच समस्या दिसली होती.",
}


@dataclass(frozen=True)
class Guidance:
    action: str
    issue: str
    text_en: str
    text_local: str
    language: str


def lang_key(language: str) -> str:
    return language.split("-")[0] if language.split("-")[0] in ("hi", "mr") else "en"


def pick_action(audit) -> str:
    if audit.recommended_action in TEMPLATES:
        return audit.recommended_action
    if not audit.soundbox_visible:
        return "install_soundbox"
    if audit.qr_obstructed:
        return "clear_qr_obstruction"
    return "reposition_paytm_qr"


def build_guidance(merchant, audit, ctx: MerchantContext | None) -> Guidance:
    action = pick_action(audit)
    first_name = merchant.owner_name.split()[0]
    key = lang_key(merchant.language)
    text_en = TEMPLATES[action]["en"].format(name=first_name)
    text_local = TEMPLATES[action][key].format(name=first_name)
    if ctx and ctx.previous_interventions and ctx.previous_interventions[0] == action:
        text_en += REPEAT_LINE["en"]
        text_local += REPEAT_LINE[key]
    return Guidance(action, ACTION_LABELS[action], text_en, text_local, merchant.language)
```

- [ ] **Step 5: Implement `backend/app/services/whatsapp.py`**

```python
import logging
from dataclasses import dataclass

from app.config import settings

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class SendResult:
    status: str  # dry_run | sent | failed
    provider_ref: str | None = None
    error: str | None = None


def send_whatsapp_message(to_phone: str, body: str, media_url: str | None = None) -> SendResult:
    log.info("WhatsApp (%s) to %s: %s", settings.whatsapp_mode, to_phone, body)
    return SendResult(status="dry_run")
```

- [ ] **Step 6: Implement `backend/app/services/actions.py`**

```python
from sqlalchemy.orm import Session

from app import models
from app.services.guidance import build_guidance
from app.services.memory import get_memory
from app.services.memory.base import MerchantContext
from app.services.steps import append_step
from app.services.whatsapp import send_whatsapp_message
from app.timeutil import utcnow

INCENTIVE_AMOUNT_INR = 50
STATUS_BY_OUTCOME = {"compliant": "completed", "non_compliant": "completed", "low_confidence": "escalated", "fraud": "blocked"}


def grant_incentive(db: Session, visit: models.Visit) -> models.Incentive:
    existing = db.query(models.Incentive).filter_by(visit_id=visit.id).one_or_none()
    if existing:
        return existing
    inc = models.Incentive(
        fse_id=visit.fse_id, merchant_id=visit.merchant_id, visit_id=visit.id,
        amount_inr=INCENTIVE_AMOUNT_INR, status="approved", reason="Verified compliant visit",
    )
    db.add(inc)
    append_step(visit, "incentive", f"₹{INCENTIVE_AMOUNT_INR} incentive approved for {visit.fse.user.name}")
    db.commit()
    return inc


def create_guidance(db: Session, visit: models.Visit, ctx: MerchantContext | None) -> models.Intervention:
    existing = db.query(models.Intervention).filter_by(visit_id=visit.id).one_or_none()
    if existing:
        return existing
    g = build_guidance(visit.merchant, visit.audit, ctx)
    iv = models.Intervention(
        merchant_id=visit.merchant_id, visit_id=visit.id, action=g.action, issue=g.issue,
        message_text_en=g.text_en, message_text=g.text_local, message_language=g.language,
    )
    db.add(iv)
    append_step(visit, "guidance", f"Guidance in {g.language}: {g.issue}", {"text": g.text_local})
    db.commit()
    return iv


def send_whatsapp(db: Session, visit: models.Visit) -> models.Notification:
    existing = db.query(models.Notification).filter_by(visit_id=visit.id, channel="whatsapp").first()
    if existing:
        return existing
    iv = visit.intervention or create_guidance(db, visit, None)
    result = send_whatsapp_message(visit.merchant.phone, iv.message_text, iv.audio_url)
    n = models.Notification(
        merchant_id=visit.merchant_id, visit_id=visit.id, channel="whatsapp", to_phone=visit.merchant.phone,
        body=iv.message_text, audio_url=iv.audio_url, status=result.status,
        provider_ref=result.provider_ref, error=result.error,
    )
    db.add(n)
    append_step(visit, "whatsapp", f"WhatsApp {result.status} to {visit.merchant.owner_name}")
    db.commit()
    return n


def escalate(db: Session, visit: models.Visit, reason: str) -> models.Escalation:
    existing = db.query(models.Escalation).filter_by(visit_id=visit.id).one_or_none()
    if existing:
        return existing
    esc = models.Escalation(visit_id=visit.id, merchant_id=visit.merchant_id, reason=reason, status="open")
    db.add(esc)
    append_step(visit, "escalation", f"Escalated to manager: {reason}")
    db.commit()
    return esc


def block_visit(db: Session, visit: models.Visit, reason: str) -> None:
    visit.status = "blocked"
    append_step(visit, "block", f"Visit blocked: {reason}")
    db.commit()


def complete_visit(db: Session, visit: models.Visit) -> None:
    visit.status = STATUS_BY_OUTCOME[visit.decision]
    visit.completed_at = utcnow()
    append_step(visit, "complete", f"Visit {visit.status}")
    db.commit()
    get_memory().record_visit_outcome(db, visit)
```

- [ ] **Step 7: Implement `backend/app/services/pipeline.py`**

```python
import logging

from sqlalchemy.orm import Session

from app import models
from app.services import actions
from app.services.decision import AuditFacts, Decision, decide
from app.services.fraud.engine import run_fraud_checks
from app.services.fraud.scoring import FraudResult
from app.services.memory import get_memory
from app.services.memory.base import MerchantContext
from app.services.steps import append_step
from app.services.vision.engine import run_vision

log = logging.getLogger(__name__)


def step_fraud(db: Session, visit: models.Visit) -> FraudResult:
    result = run_fraud_checks(db, visit)
    append_step(visit, "fraud_check", f"Authenticity {result.score}/100 {result.verdict}")
    db.commit()
    return result


def step_vision(db: Session, visit: models.Visit) -> models.VisitAudit:
    audit = run_vision(db, visit)
    append_step(visit, "vision_ai", f"QR visibility {audit.qr_visibility_score}, confidence {audit.confidence:.2f} ({audit.provider})")
    db.commit()
    return audit


def step_context(db: Session, visit: models.Visit) -> MerchantContext:
    ctx = get_memory().get_context(db, visit.merchant_id, exclude_visit_id=visit.id)
    append_step(visit, "merchant_context", ctx.summary, {"source": ctx.source})
    db.commit()
    return ctx


def step_decide(db: Session, visit: models.Visit, ctx: MerchantContext) -> Decision:
    decision = decide(visit.authenticity_verdict, AuditFacts.from_audit(visit.audit), ctx)
    visit.decision, visit.decision_reasons = decision.outcome, decision.reasons
    append_step(visit, "decision", f"{decision.outcome}: {'; '.join(decision.reasons)}")
    db.commit()
    return decision


def step_act(db: Session, visit: models.Visit, ctx: MerchantContext) -> None:
    reason = "; ".join(visit.decision_reasons)
    if visit.decision == "compliant":
        actions.grant_incentive(db, visit)
    elif visit.decision == "non_compliant":
        actions.create_guidance(db, visit, ctx)
        actions.send_whatsapp(db, visit)
    elif visit.decision == "low_confidence":
        actions.escalate(db, visit, reason)
    elif visit.decision == "fraud":
        actions.block_visit(db, visit, reason)


def run_inline(db: Session, visit_id: int) -> models.Visit:
    visit = db.get(models.Visit, visit_id)
    visit.status = "analyzing"
    visit.pipeline_mode = visit.pipeline_mode or "inline"
    db.commit()
    try:
        step_fraud(db, visit)
        step_vision(db, visit)
        ctx = step_context(db, visit)
        step_decide(db, visit, ctx)
        step_act(db, visit, ctx)
        actions.complete_visit(db, visit)
    except Exception as exc:
        log.exception("pipeline failed for visit %s", visit_id)
        db.rollback()
        visit = db.get(models.Visit, visit_id)
        visit.status = "failed"
        append_step(visit, "error", str(exc))
        db.commit()
        raise
    db.expire(visit)
    return visit
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pytest tests/test_guidance.py tests/test_pipeline_inline.py -v`
Expected: PASS (10 tests)

- [ ] **Step 9: Commit**

```bash
git add backend
git commit -m "feat: action layer (incentive, localized guidance, WhatsApp, escalation, block) and inline pipeline"
```

---

### Task 9: Public visit API — create, analyze, fetch, list

**Files:**
- Modify: `backend/app/schemas.py` (add visit response models), `backend/app/main.py` (include router)
- Create: `backend/app/api/visits.py`
- Test: `backend/tests/test_visits_api.py`

**Interfaces:**
- Consumes: `photos.fingerprint/store_photo/ALLOWED_MEDIA_TYPES`, `pipeline.run_inline`, `to_utc_naive`, models, `AuditOut`.
- Produces:
  - Schemas: `FraudSignalOut`, `AuthenticityOut`, `IncentiveOut`, `InterventionOut`, `EscalationOut`, `NotificationOut`, `ActionsOut`, `VisitOut`, `VisitSummary`, `visit_to_out(db, visit) -> VisitOut`, `visit_summary(visit) -> VisitSummary`
  - `POST /api/visits` takes multipart fields `merchant_id, fse_id, lat, lng, captured_at?, capture_source?, analyze?` plus file `photo`. Returns 201 `VisitOut`. With `analyze=true` it also starts analysis.
  - `POST /api/visits/{id}/analyze` returns `VisitOut`. It is 409 unless status is `submitted` or `failed`.
  - `GET /api/visits/{id}` returns `VisitOut`. `GET /api/visits?fse_id=&merchant_id=&limit=` returns `list[VisitSummary]`.
  - Task 10 replaces the analysis entry point: `start_analysis(db, visit, background) -> str`. In this task the router calls a local `_analyze(db, visit, background)` that runs inline.

- [ ] **Step 1: Write the failing test `backend/tests/test_visits_api.py`**

```python
from datetime import datetime, timezone

from tests.factories import make_world, sharp_jpeg


def _form(world, **kw):
    data = {"merchant_id": world.merchant.id, "fse_id": world.fse.id, "lat": world.merchant.lat,
            "lng": world.merchant.lng, "captured_at": datetime.now(timezone.utc).isoformat(), "capture_source": "camera"}
    data.update(kw)
    return data


def test_create_then_analyze_then_get(client, db):
    world = make_world(db)
    res = client.post("/api/visits", data=_form(world), files={"photo": ("c.jpg", sharp_jpeg(50), "image/jpeg")})
    assert res.status_code == 201
    visit = res.json()
    assert visit["status"] == "submitted"
    assert visit["photo_url"].endswith(".jpg")
    assert visit["merchant_name"] == "Ramesh General Store"

    res = client.post(f"/api/visits/{visit['id']}/analyze")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "completed" and body["decision"] == "non_compliant"
    assert body["authenticity"]["verdict"] == "VERIFIED"
    assert len(body["authenticity"]["signals"]) == 5
    assert body["audit"]["qr_visibility_score"] == 38
    assert body["actions"]["intervention"]["message_language"] == "hi-IN"
    assert body["actions"]["notifications"][0]["status"] == "dry_run"
    assert body["pipeline_mode"] == "inline"

    assert client.get(f"/api/visits/{visit['id']}").json()["decision"] == "non_compliant"
    assert client.post(f"/api/visits/{visit['id']}/analyze").status_code == 409


def test_create_with_analyze_flag(client, db):
    world = make_world(db)
    res = client.post("/api/visits", data=_form(world, analyze="true"), files={"photo": ("c.jpg", sharp_jpeg(51), "image/jpeg")})
    assert res.json()["status"] == "completed"


def test_validation(client, db):
    world = make_world(db)
    photo = {"photo": ("c.jpg", sharp_jpeg(52), "image/jpeg")}
    assert client.post("/api/visits", data=_form(world, merchant_id=999), files=photo).status_code == 404
    assert client.post("/api/visits", data=_form(world), files={"photo": ("c.txt", b"x", "text/plain")}).status_code == 415
    assert client.post("/api/visits", data=_form(world), files={"photo": ("c.jpg", b"notanimage", "image/jpeg")}).status_code == 422
    assert client.get("/api/visits/12345").status_code == 404


def test_list_visits(client, db):
    world = make_world(db)
    client.post("/api/visits", data=_form(world, analyze="true"), files={"photo": ("c.jpg", sharp_jpeg(53), "image/jpeg")})
    rows = client.get(f"/api/visits?fse_id={world.fse.id}").json()
    assert len(rows) == 1 and rows[0]["qr_visibility_score"] == 38
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_visits_api.py -v`
Expected: FAIL (404 on `/api/visits`)

- [ ] **Step 3: Append the visit response models to `backend/app/schemas.py`**

```python
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
```

- [ ] **Step 4: Implement `backend/app/api/visits.py`**

```python
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from PIL import UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.schemas import VisitOut, VisitSummary, visit_summary, visit_to_out
from app.services.photos import ALLOWED_MEDIA_TYPES, fingerprint, store_photo
from app.services.pipeline import run_inline
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
    run_inline(db, visit.id)


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
```

`run_inline` re-raises on failure after marking the visit `failed`. For the API, catch it so the client gets the failed visit instead of a 500. Change `_analyze` to:
```python
def _analyze(db: Session, visit: models.Visit, background: BackgroundTasks) -> None:
    try:
        run_inline(db, visit.id)
    except Exception:
        pass  # visit.status == "failed" and pipeline_log has the error; the client sees it in the response
```

- [ ] **Step 5: Register the router in `main.py`**

```python
    from app.api import audit, visits

    app.include_router(audit.router, prefix="/api")
    app.include_router(visits.router, prefix="/api")
```

- [ ] **Step 6: Run the full suite**

Run: `pytest -v`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(api): visit create/analyze/get/list endpoints with full visit journey payload"
```

---

### Task 10: Internal step endpoints for n8n and n8n triggering with inline fallback

**Files:**
- Create: `backend/app/api/internal.py`
- Modify: `backend/app/services/pipeline.py` (add `start_analysis`, `_post_to_n8n`), `backend/app/api/visits.py` (use `start_analysis`), `backend/app/main.py`
- Test: `backend/tests/test_internal_api.py`, `backend/tests/test_n8n_trigger.py`

**Interfaces:**
- Consumes: `step_fraud`, `step_vision`, `step_context`, `step_decide`, `actions.*`, `get_memory`, schemas.
- Produces:
  - `pipeline.start_analysis(db, visit, background: BackgroundTasks) -> str` returns `"n8n"` or `"inline"`
  - `pipeline._post_to_n8n(visit_id: int, merchant_id: int) -> None`. On failure it falls back to `run_inline` using `pipeline.SessionLocal`
  - Internal routes (all `POST` unless noted, header `X-Internal-Token` required, 401 otherwise), prefix `/api/internal`:
    - `/visits/{id}/fraud` → `{"score", "verdict", "signals": [...]}`
    - `/visits/{id}/vision` → `AuditOut`
    - `GET /visits/{id}/context` → `MerchantContext.to_dict()`
    - `/visits/{id}/decide` → `{"visit_id", "outcome", "reasons"}`
    - `/visits/{id}/actions/incentive` → `IncentiveOut`
    - `/visits/{id}/actions/guidance` → `InterventionOut`
    - `/visits/{id}/actions/whatsapp` → `NotificationOut`
    - `/visits/{id}/actions/escalate` → `EscalationOut`
    - `/visits/{id}/actions/block` → `{"status": "blocked"}`
    - `/visits/{id}/complete` → `{"visit_id", "status", "decision"}`

- [ ] **Step 1: Write the failing test `backend/tests/test_internal_api.py`**

```python
from tests.factories import make_visit, make_world, sharp_jpeg

H = {"X-Internal-Token": "dev-internal-token"}


def test_requires_token(client, db):
    world = make_world(db)
    v = make_visit(db, world, sharp_jpeg(60))
    assert client.post(f"/api/internal/visits/{v.id}/fraud").status_code == 401
    assert client.post(f"/api/internal/visits/{v.id}/fraud", headers={"X-Internal-Token": "nope"}).status_code == 401


def test_n8n_style_step_sequence_non_compliant(client, db):
    world = make_world(db)
    v = make_visit(db, world, sharp_jpeg(61))
    base = f"/api/internal/visits/{v.id}"

    assert client.post(f"{base}/fraud", headers=H).json()["verdict"] == "VERIFIED"
    assert client.post(f"{base}/vision", headers=H).json()["qr_visibility_score"] == 38
    assert "merchant_name" in client.get(f"{base}/context", headers=H).json()
    decision = client.post(f"{base}/decide", headers=H).json()
    assert decision["outcome"] == "non_compliant"
    guidance = client.post(f"{base}/actions/guidance", headers=H).json()
    assert guidance["message_language"] == "hi-IN"
    assert client.post(f"{base}/actions/whatsapp", headers=H).json()["status"] == "dry_run"
    done = client.post(f"{base}/complete", headers=H).json()
    assert done == {"visit_id": v.id, "status": "completed", "decision": "non_compliant"}

    steps = [s["step"] for s in client.get(f"/api/visits/{v.id}").json()["pipeline_log"]]
    assert steps == ["fraud_check", "vision_ai", "merchant_context", "decision", "guidance", "whatsapp", "complete"]


def test_decide_before_vision_is_a_409(client, db):
    world = make_world(db)
    v = make_visit(db, world, sharp_jpeg(62))
    assert client.post(f"/api/internal/visits/{v.id}/decide", headers=H).status_code == 409
```

- [ ] **Step 2: Write the failing test `backend/tests/test_n8n_trigger.py`**

```python
import json

import httpx
import respx

from app.config import settings
from app.services import pipeline
from tests.factories import make_world, sharp_jpeg

HOOK = "http://n8n.test/webhook/sightpay-visit"


def _create(client, world):
    return client.post(
        "/api/visits",
        data={"merchant_id": world.merchant.id, "fse_id": world.fse.id, "lat": world.merchant.lat,
              "lng": world.merchant.lng, "capture_source": "camera"},
        files={"photo": ("c.jpg", sharp_jpeg(70), "image/jpeg")},
    ).json()


@respx.mock
def test_analyze_hands_off_to_n8n(client, db, monkeypatch):
    monkeypatch.setattr(settings, "n8n_webhook_url", HOOK)
    route = respx.post(HOOK).mock(return_value=httpx.Response(200, json={"ok": True}))
    world = make_world(db)
    v = _create(client, world)
    body = client.post(f"/api/visits/{v['id']}/analyze").json()
    assert body["status"] == "analyzing" and body["pipeline_mode"] == "n8n"
    assert route.called
    assert json.loads(route.calls[0].request.content) == {"visit_id": v["id"], "merchant_id": world.merchant.id}


@respx.mock
def test_n8n_down_falls_back_to_inline(client, db, monkeypatch):
    monkeypatch.setattr(settings, "n8n_webhook_url", HOOK)
    monkeypatch.setattr(pipeline, "SessionLocal", lambda: db)
    respx.post(HOOK).mock(return_value=httpx.Response(502))
    world = make_world(db)
    v = _create(client, world)
    client.post(f"/api/visits/{v['id']}/analyze")
    after = client.get(f"/api/visits/{v['id']}").json()
    assert after["status"] == "completed"
    assert after["pipeline_mode"] == "inline_fallback"
    assert "n8n_unreachable" in [s["step"] for s in after["pipeline_log"]]
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pytest tests/test_internal_api.py tests/test_n8n_trigger.py -v`
Expected: FAIL (404s / wrong status)

- [ ] **Step 4: Add `start_analysis` to `backend/app/services/pipeline.py`**

Add imports at the top:
```python
import httpx
from fastapi import BackgroundTasks

from app.config import settings
from app.db import SessionLocal
```
Append:
```python
def start_analysis(db: Session, visit: models.Visit, background: BackgroundTasks) -> str:
    if settings.n8n_webhook_url:
        visit.status = "analyzing"
        visit.pipeline_mode = "n8n"
        append_step(visit, "queued", "Sent to n8n workflow")
        db.commit()
        background.add_task(_post_to_n8n, visit.id, visit.merchant_id)
        return "n8n"
    run_inline(db, visit.id)
    return "inline"


def _post_to_n8n(visit_id: int, merchant_id: int) -> None:
    try:
        res = httpx.post(settings.n8n_webhook_url, json={"visit_id": visit_id, "merchant_id": merchant_id}, timeout=5.0)
        res.raise_for_status()
    except httpx.HTTPError as exc:
        log.warning("n8n unreachable (%s); running pipeline inline for visit %s", exc, visit_id)
        db = SessionLocal()
        try:
            visit = db.get(models.Visit, visit_id)
            visit.pipeline_mode = "inline_fallback"
            append_step(visit, "n8n_unreachable", str(exc))
            db.commit()
            run_inline(db, visit_id)
        except Exception:
            log.exception("inline fallback failed for visit %s", visit_id)
        finally:
            db.close()
```

Change `run_inline` so it keeps an existing mode: it already does `visit.pipeline_mode = visit.pipeline_mode or "inline"`.

The fallback test's monkeypatched `SessionLocal` returns the test session, and `db.close()` closes it. That is harmless: a closed SQLAlchemy Session can be used again, and it reloads objects on next access.

- [ ] **Step 5: Wire `start_analysis` into `backend/app/api/visits.py`**

Replace the `run_inline` import and `_analyze` with:
```python
from app.services.pipeline import start_analysis


def _analyze(db: Session, visit: models.Visit, background: BackgroundTasks) -> None:
    try:
        start_analysis(db, visit, background)
    except Exception:
        pass  # visit.status == "failed" and pipeline_log has the error
```

- [ ] **Step 6: Implement `backend/app/api/internal.py`**

```python
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.db import get_db
from app.schemas import AuditOut, EscalationOut, IncentiveOut, InterventionOut, NotificationOut
from app.services import actions
from app.services.memory import get_memory
from app.services.pipeline import step_context, step_decide, step_fraud, step_vision


def require_internal(x_internal_token: str | None = Header(default=None)) -> None:
    if x_internal_token != settings.internal_token:
        raise HTTPException(401, "Invalid internal token")


router = APIRouter(prefix="/internal", tags=["internal (n8n)"], dependencies=[Depends(require_internal)])


def _visit(db: Session, visit_id: int) -> models.Visit:
    visit = db.get(models.Visit, visit_id)
    if visit is None:
        raise HTTPException(404, "Visit not found")
    return visit


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise HTTPException(409, msg)


@router.post("/visits/{visit_id}/fraud")
def fraud(visit_id: int, db: Session = Depends(get_db)):
    r = step_fraud(db, _visit(db, visit_id))
    return {"score": r.score, "verdict": r.verdict, "signals": [s.__dict__ for s in r.signals]}


@router.post("/visits/{visit_id}/vision", response_model=AuditOut)
def vision(visit_id: int, db: Session = Depends(get_db)):
    return step_vision(db, _visit(db, visit_id))


@router.get("/visits/{visit_id}/context")
def context(visit_id: int, db: Session = Depends(get_db)):
    return step_context(db, _visit(db, visit_id)).to_dict()


@router.post("/visits/{visit_id}/decide")
def decide_visit(visit_id: int, db: Session = Depends(get_db)):
    visit = _visit(db, visit_id)
    _require(visit.authenticity_verdict is not None and visit.audit is not None, "Run fraud and vision first")
    ctx = get_memory().get_context(db, visit.merchant_id, exclude_visit_id=visit.id)
    d = step_decide(db, visit, ctx)
    return {"visit_id": visit.id, "outcome": d.outcome, "reasons": d.reasons}


@router.post("/visits/{visit_id}/actions/incentive", response_model=IncentiveOut)
def incentive(visit_id: int, db: Session = Depends(get_db)):
    visit = _visit(db, visit_id)
    _require(visit.decision == "compliant", "Visit is not compliant")
    return actions.grant_incentive(db, visit)


@router.post("/visits/{visit_id}/actions/guidance", response_model=InterventionOut)
def guidance(visit_id: int, db: Session = Depends(get_db)):
    visit = _visit(db, visit_id)
    _require(visit.decision == "non_compliant", "Visit is not non-compliant")
    ctx = get_memory().get_context(db, visit.merchant_id, exclude_visit_id=visit.id)
    return actions.create_guidance(db, visit, ctx)


@router.post("/visits/{visit_id}/actions/whatsapp", response_model=NotificationOut)
def whatsapp(visit_id: int, db: Session = Depends(get_db)):
    visit = _visit(db, visit_id)
    _require(visit.decision == "non_compliant", "Visit is not non-compliant")
    return actions.send_whatsapp(db, visit)


@router.post("/visits/{visit_id}/actions/escalate", response_model=EscalationOut)
def escalate(visit_id: int, db: Session = Depends(get_db)):
    visit = _visit(db, visit_id)
    _require(visit.decision == "low_confidence", "Visit is not low-confidence")
    return actions.escalate(db, visit, "; ".join(visit.decision_reasons))


@router.post("/visits/{visit_id}/actions/block")
def block(visit_id: int, db: Session = Depends(get_db)):
    visit = _visit(db, visit_id)
    _require(visit.decision == "fraud", "Visit is not flagged as fraud")
    actions.block_visit(db, visit, "; ".join(visit.decision_reasons))
    return {"status": "blocked"}


@router.post("/visits/{visit_id}/complete")
def complete(visit_id: int, db: Session = Depends(get_db)):
    visit = _visit(db, visit_id)
    _require(visit.decision is not None, "Visit has no decision yet")
    actions.complete_visit(db, visit)
    return {"visit_id": visit.id, "status": visit.status, "decision": visit.decision}
```

Note: `step_context` appends a `merchant_context` log step, and `/decide` calls `get_memory()` directly so that step is not logged twice.

- [ ] **Step 7: Register the router in `main.py`**

```python
    from app.api import audit, internal, visits

    app.include_router(internal.router, prefix="/api")
```

- [ ] **Step 8: Run the full suite**

Run: `pytest -v`
Expected: all PASS

- [ ] **Step 9: Commit**

```bash
git add backend
git commit -m "feat: internal pipeline step API for n8n and webhook trigger with inline fallback"
```

---

### Task 11: n8n workflow (Docker, importable workflow JSON, smoke run)

**Files:**
- Create: `n8n/docker-compose.yml`, `n8n/workflows/sightpay_visit_pipeline.json`, `n8n/README.md`
- Test: `backend/tests/test_n8n_workflow_file.py` (structural check)

**Interfaces:**
- Consumes: the internal step endpoints from Task 10. The webhook body is `{"visit_id": int, "merchant_id": int}`.
- Produces: an active n8n workflow at `POST http://localhost:5678/webhook/sightpay-visit`. Nodes: `Webhook → Visit Received → Fraud Check → Vision AI → Cognee Context → Decision Node → Route Decision (Switch: Compliant / Non-compliant / Low Confidence / Fraud)`. Branches: `Grant Incentive`; `Sarvam Guidance → Send WhatsApp`; `Manager Escalation`; `Block Visit`. All four converge on `Complete Visit`.

- [ ] **Step 1: Write the failing structural test `backend/tests/test_n8n_workflow_file.py`**

```python
import json
from pathlib import Path

WF = Path(__file__).resolve().parents[2] / "n8n" / "workflows" / "sightpay_visit_pipeline.json"


def test_workflow_has_spec_nodes_and_four_branches():
    wf = json.loads(WF.read_text())
    names = {n["name"] for n in wf["nodes"]}
    assert {"Webhook", "Visit Received", "Fraud Check", "Vision AI", "Cognee Context", "Decision Node",
            "Route Decision", "Grant Incentive", "Sarvam Guidance", "Send WhatsApp", "Manager Escalation",
            "Block Visit", "Complete Visit"} <= names
    branches = wf["connections"]["Route Decision"]["main"]
    assert [b[0]["node"] for b in branches] == ["Grant Incentive", "Sarvam Guidance", "Manager Escalation", "Block Visit"]
    for n in wf["nodes"]:
        if n["type"] == "n8n-nodes-base.httpRequest":
            assert "/api/internal/visits/" in n["parameters"]["url"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_n8n_workflow_file.py -v`
Expected: FAIL with `FileNotFoundError`

- [ ] **Step 3: Write `n8n/docker-compose.yml`**

```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    ports:
      - "5678:5678"
    environment:
      - SIGHTPAY_API=http://host.docker.internal:8000
      - SIGHTPAY_INTERNAL_TOKEN=dev-internal-token
      - N8N_BLOCK_ENV_ACCESS_IN_NODE=false
      - N8N_SECURE_COOKIE=false
      - GENERIC_TIMEZONE=Asia/Kolkata
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ./data:/home/node/.n8n
      - ./workflows:/workflows
```

- [ ] **Step 4: Write `n8n/workflows/sightpay_visit_pipeline.json`**

Every HTTP node has the same shape. Only `name`, `id`, `method`, `url` and `position` differ. Visit id expression: `{{ $('Visit Received').first().json.visit_id }}`.

```json
{
  "name": "SightPay Visit Pipeline",
  "nodes": [
    {"id": "n1", "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0, 300],
     "webhookId": "sightpay-visit",
     "parameters": {"httpMethod": "POST", "path": "sightpay-visit", "responseMode": "onReceived", "options": {}}},
    {"id": "n2", "name": "Visit Received", "type": "n8n-nodes-base.set", "typeVersion": 3.4, "position": [220, 300],
     "parameters": {"assignments": {"assignments": [
       {"id": "a1", "name": "visit_id", "value": "={{ $json.body.visit_id }}", "type": "number"},
       {"id": "a2", "name": "merchant_id", "value": "={{ $json.body.merchant_id }}", "type": "number"}]}, "options": {}}},
    {"id": "n3", "name": "Fraud Check", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [440, 300],
     "parameters": {"method": "POST", "url": "={{ $env.SIGHTPAY_API }}/api/internal/visits/{{ $('Visit Received').first().json.visit_id }}/fraud",
       "sendHeaders": true, "headerParameters": {"parameters": [{"name": "X-Internal-Token", "value": "={{ $env.SIGHTPAY_INTERNAL_TOKEN }}"}]}, "options": {}}},
    {"id": "n4", "name": "Vision AI", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [660, 300],
     "parameters": {"method": "POST", "url": "={{ $env.SIGHTPAY_API }}/api/internal/visits/{{ $('Visit Received').first().json.visit_id }}/vision",
       "sendHeaders": true, "headerParameters": {"parameters": [{"name": "X-Internal-Token", "value": "={{ $env.SIGHTPAY_INTERNAL_TOKEN }}"}]}, "options": {"timeout": 90000}}},
    {"id": "n5", "name": "Cognee Context", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [880, 300],
     "parameters": {"method": "GET", "url": "={{ $env.SIGHTPAY_API }}/api/internal/visits/{{ $('Visit Received').first().json.visit_id }}/context",
       "sendHeaders": true, "headerParameters": {"parameters": [{"name": "X-Internal-Token", "value": "={{ $env.SIGHTPAY_INTERNAL_TOKEN }}"}]}, "options": {}}},
    {"id": "n6", "name": "Decision Node", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [1100, 300],
     "parameters": {"method": "POST", "url": "={{ $env.SIGHTPAY_API }}/api/internal/visits/{{ $('Visit Received').first().json.visit_id }}/decide",
       "sendHeaders": true, "headerParameters": {"parameters": [{"name": "X-Internal-Token", "value": "={{ $env.SIGHTPAY_INTERNAL_TOKEN }}"}]}, "options": {}}},
    {"id": "n7", "name": "Route Decision", "type": "n8n-nodes-base.switch", "typeVersion": 3.2, "position": [1320, 300],
     "parameters": {"rules": {"values": [
       {"conditions": {"options": {"caseSensitive": true, "leftValue": "", "typeValidation": "strict"}, "combinator": "and",
         "conditions": [{"leftValue": "={{ $json.outcome }}", "rightValue": "compliant", "operator": {"type": "string", "operation": "equals"}}]},
        "renameOutput": true, "outputKey": "Compliant"},
       {"conditions": {"options": {"caseSensitive": true, "leftValue": "", "typeValidation": "strict"}, "combinator": "and",
         "conditions": [{"leftValue": "={{ $json.outcome }}", "rightValue": "non_compliant", "operator": {"type": "string", "operation": "equals"}}]},
        "renameOutput": true, "outputKey": "Non-compliant"},
       {"conditions": {"options": {"caseSensitive": true, "leftValue": "", "typeValidation": "strict"}, "combinator": "and",
         "conditions": [{"leftValue": "={{ $json.outcome }}", "rightValue": "low_confidence", "operator": {"type": "string", "operation": "equals"}}]},
        "renameOutput": true, "outputKey": "Low Confidence"},
       {"conditions": {"options": {"caseSensitive": true, "leftValue": "", "typeValidation": "strict"}, "combinator": "and",
         "conditions": [{"leftValue": "={{ $json.outcome }}", "rightValue": "fraud", "operator": {"type": "string", "operation": "equals"}}]},
        "renameOutput": true, "outputKey": "Fraud"}]}, "options": {}}},
    {"id": "n8", "name": "Grant Incentive", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [1560, 60],
     "parameters": {"method": "POST", "url": "={{ $env.SIGHTPAY_API }}/api/internal/visits/{{ $('Visit Received').first().json.visit_id }}/actions/incentive",
       "sendHeaders": true, "headerParameters": {"parameters": [{"name": "X-Internal-Token", "value": "={{ $env.SIGHTPAY_INTERNAL_TOKEN }}"}]}, "options": {}}},
    {"id": "n9", "name": "Sarvam Guidance", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [1560, 220],
     "parameters": {"method": "POST", "url": "={{ $env.SIGHTPAY_API }}/api/internal/visits/{{ $('Visit Received').first().json.visit_id }}/actions/guidance",
       "sendHeaders": true, "headerParameters": {"parameters": [{"name": "X-Internal-Token", "value": "={{ $env.SIGHTPAY_INTERNAL_TOKEN }}"}]}, "options": {"timeout": 60000}}},
    {"id": "n10", "name": "Send WhatsApp", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [1780, 220],
     "parameters": {"method": "POST", "url": "={{ $env.SIGHTPAY_API }}/api/internal/visits/{{ $('Visit Received').first().json.visit_id }}/actions/whatsapp",
       "sendHeaders": true, "headerParameters": {"parameters": [{"name": "X-Internal-Token", "value": "={{ $env.SIGHTPAY_INTERNAL_TOKEN }}"}]}, "options": {}}},
    {"id": "n11", "name": "Manager Escalation", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [1560, 380],
     "parameters": {"method": "POST", "url": "={{ $env.SIGHTPAY_API }}/api/internal/visits/{{ $('Visit Received').first().json.visit_id }}/actions/escalate",
       "sendHeaders": true, "headerParameters": {"parameters": [{"name": "X-Internal-Token", "value": "={{ $env.SIGHTPAY_INTERNAL_TOKEN }}"}]}, "options": {}}},
    {"id": "n12", "name": "Block Visit", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [1560, 540],
     "parameters": {"method": "POST", "url": "={{ $env.SIGHTPAY_API }}/api/internal/visits/{{ $('Visit Received').first().json.visit_id }}/actions/block",
       "sendHeaders": true, "headerParameters": {"parameters": [{"name": "X-Internal-Token", "value": "={{ $env.SIGHTPAY_INTERNAL_TOKEN }}"}]}, "options": {}}},
    {"id": "n13", "name": "Complete Visit", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [2000, 300],
     "parameters": {"method": "POST", "url": "={{ $env.SIGHTPAY_API }}/api/internal/visits/{{ $('Visit Received').first().json.visit_id }}/complete",
       "sendHeaders": true, "headerParameters": {"parameters": [{"name": "X-Internal-Token", "value": "={{ $env.SIGHTPAY_INTERNAL_TOKEN }}"}]}, "options": {}}}
  ],
  "connections": {
    "Webhook": {"main": [[{"node": "Visit Received", "type": "main", "index": 0}]]},
    "Visit Received": {"main": [[{"node": "Fraud Check", "type": "main", "index": 0}]]},
    "Fraud Check": {"main": [[{"node": "Vision AI", "type": "main", "index": 0}]]},
    "Vision AI": {"main": [[{"node": "Cognee Context", "type": "main", "index": 0}]]},
    "Cognee Context": {"main": [[{"node": "Decision Node", "type": "main", "index": 0}]]},
    "Decision Node": {"main": [[{"node": "Route Decision", "type": "main", "index": 0}]]},
    "Route Decision": {"main": [
      [{"node": "Grant Incentive", "type": "main", "index": 0}],
      [{"node": "Sarvam Guidance", "type": "main", "index": 0}],
      [{"node": "Manager Escalation", "type": "main", "index": 0}],
      [{"node": "Block Visit", "type": "main", "index": 0}]]},
    "Grant Incentive": {"main": [[{"node": "Complete Visit", "type": "main", "index": 0}]]},
    "Sarvam Guidance": {"main": [[{"node": "Send WhatsApp", "type": "main", "index": 0}]]},
    "Send WhatsApp": {"main": [[{"node": "Complete Visit", "type": "main", "index": 0}]]},
    "Manager Escalation": {"main": [[{"node": "Complete Visit", "type": "main", "index": 0}]]},
    "Block Visit": {"main": [[{"node": "Complete Visit", "type": "main", "index": 0}]]}
  },
  "settings": {"executionOrder": "v1"},
  "active": false
}
```

- [ ] **Step 5: Run the structural test**

Run: `pytest tests/test_n8n_workflow_file.py -v`
Expected: PASS

- [ ] **Step 6: Bring up n8n, import, activate**

```bash
cd n8n && docker compose up -d
docker compose exec n8n n8n import:workflow --input=/workflows/sightpay_visit_pipeline.json
```
Open http://localhost:5678, create the owner account, open "SightPay Visit Pipeline" and toggle **Active**. If import fails because of a node-version mismatch, rebuild the same 13 nodes by hand in the editor using the JSON above as the spec. Then export the result over this file with `docker compose exec n8n n8n export:workflow --all --output=/workflows/sightpay_visit_pipeline.json`.

- [ ] **Step 7: End-to-end smoke through n8n**

```bash
cd backend
python -m app.seed
N8N_WEBHOOK_URL=http://localhost:5678/webhook/sightpay-visit uvicorn app.main:app --host 0.0.0.0 --port 8000 &
curl -s -F merchant_id=1 -F fse_id=1 -F lat=<ramesh lat> -F lng=<ramesh lng> -F capture_source=camera \
     -F analyze=true -F "photo=@demo_photos/counter_bad.jpg;type=image/jpeg" localhost:8000/api/visits | python -m json.tool
sleep 5; curl -s localhost:8000/api/visits/<id> | python -m json.tool
```
Get Ramesh's lat/lng from `curl localhost:8000/api/merchants/1` (Task 12), or from the seed output. Expected: the first response shows `"status": "analyzing", "pipeline_mode": "n8n"`. A few seconds later the visit is `completed` with `pipeline_log` steps from n8n, and the n8n Executions tab shows the green path through the Non-compliant branch. The backend listens on `0.0.0.0` so the container can reach it through `host.docker.internal`.

- [ ] **Step 8: Write `n8n/README.md`**

```markdown
# n8n: SightPay autonomous action layer

1. `docker compose up -d` (UI: http://localhost:5678)
2. `docker compose exec n8n n8n import:workflow --input=/workflows/sightpay_visit_pipeline.json`
3. Open the workflow and toggle it **Active** (production URL: `/webhook/sightpay-visit`).
4. Run the backend with `N8N_WEBHOOK_URL=http://localhost:5678/webhook/sightpay-visit` and `--host 0.0.0.0`.

If n8n is down, the backend falls back to running the same steps inline (`pipeline_mode = inline_fallback`).
Each node calls one idempotent `/api/internal/...` step, so "Retry" on a failed execution is safe.
```

- [ ] **Step 9: Commit**

```bash
git add n8n backend/tests/test_n8n_workflow_file.py
git commit -m "feat(n8n): visit pipeline workflow with decision switch and four action branches"
```

---

### Task 12: Read APIs — merchants, escalations (approve/reject), dashboard, fraud, incentives, transactions

**Files:**
- Create: `backend/app/services/merchants.py`, `backend/app/services/escalations.py`, `backend/app/services/analytics.py`, `backend/app/api/merchants.py`, `backend/app/api/escalations.py`, `backend/app/api/analytics.py`, `backend/app/api/fraud.py`, `backend/app/api/incentives.py`, `backend/app/api/transactions.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_read_apis.py`, `backend/tests/test_escalations.py`

**Interfaces:**
- Consumes: models, schemas, `get_memory`, `decide`, `AuditFacts`, `actions.*`, `append_step`, `visit_summary`.
- Produces:
  - `merchants.list_merchants(db) -> list[dict]`, `merchants.merchant_detail(db, merchant_id) -> dict | None`
  - `escalations.resolve_escalation(db, esc, approve: bool, resolved_by: str, note: str | None) -> Escalation`. It raises `ValueError` if already resolved
  - `analytics.build_dashboard(db, now: datetime | None = None) -> dict`
  - Routes: `GET /api/merchants`, `GET /api/merchants/{id}`, `GET /api/escalations?status=open`, `POST /api/escalations/{id}/approve` and `/reject` (body `{"resolved_by": str, "note": str | null}`), `GET /api/dashboard` (alias `GET /api/analytics/dashboard`), `GET /api/fraud/flagged`, `GET /api/fraud/{visit_id}`, `GET /api/incentives?fse_id=`, `GET /api/transactions?merchant_id=&days=30`

- [ ] **Step 1: Write the failing test `backend/tests/test_read_apis.py`**

```python
from datetime import date, datetime

from app.seed import seed
from app.services.analytics import build_dashboard


def test_merchant_list_and_detail(client, db):
    seed(db, today=date(2026, 9, 25))
    rows = client.get("/api/merchants").json()
    assert len(rows) == 24
    ramesh = next(r for r in rows if r["name"] == "Ramesh General Store")
    assert ramesh["latest_score"] == 42 and ramesh["latest_decision"] == "non_compliant"

    detail = client.get(f"/api/merchants/{ramesh['id']}").json()
    assert detail["merchant"]["owner_name"] == "Ramesh Shinde"
    assert detail["context"]["previous_scores"][0] == 42
    assert len(detail["recent_visits"]) == 2
    assert detail["interventions"][0]["action"] == "clear_qr_obstruction"
    assert client.get("/api/merchants/999").status_code == 404


def test_dashboard(client, db):
    seed(db, today=date(2026, 9, 25))
    d = build_dashboard(db, now=datetime(2026, 9, 25, 12, 0))
    assert d["kpis"]["open_escalations"] == 1
    assert set(d["decision_breakdown_7d"]) <= {"compliant", "non_compliant", "low_confidence", "fraud"}
    assert len(d["recent_visits"]) == 10
    assert len(d["fse_leaderboard"]) == 3
    assert client.get("/api/dashboard").status_code == 200


def test_transactions_incentives_fraud(client, db):
    seed(db, today=date(2026, 9, 25))
    tx = client.get("/api/transactions?merchant_id=1&days=30").json()
    assert len(tx) == 30 and tx[0]["txn_date"] < tx[-1]["txn_date"]
    inc = client.get("/api/incentives").json()
    assert inc["total_inr"] == sum(i["amount_inr"] for i in inc["items"])
    assert client.get("/api/fraud/flagged").status_code == 200
```

`/api/transactions?days=30` is relative to the real today, and the seed used 2026-09-25. Implement `days` relative to the merchant's latest transaction date, not `date.today()`, so demo data never "ages out".

- [ ] **Step 2: Write the failing test `backend/tests/test_escalations.py`**

```python
from app.services.pipeline import run_inline
from tests.factories import blurry_jpeg, make_visit, make_world, sharp_jpeg


def test_list_and_reject(client, db):
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, blurry_jpeg()).id)
    rows = client.get("/api/escalations?status=open").json()
    assert rows[0]["visit_id"] == v.id and rows[0]["merchant_name"] == "Ramesh General Store"
    esc_id = rows[0]["id"]
    res = client.post(f"/api/escalations/{esc_id}/reject", json={"resolved_by": "Priya Kulkarni", "note": "Retake"})
    assert res.json()["status"] == "rejected"
    assert client.get(f"/api/visits/{v.id}").json()["status"] == "rejected"
    assert client.post(f"/api/escalations/{esc_id}/approve", json={"resolved_by": "Priya"}).status_code == 409


def test_approve_review_required_visit_applies_the_real_decision(client, db):
    world = make_world(db)
    # far from shop + unknown source -> REVIEW_REQUIRED -> low_confidence; photo itself is non-compliant
    v = run_inline(db, make_visit(db, world, sharp_jpeg(80), lat=world.merchant.lat + 0.02, capture_source="unknown").id)
    esc_id = client.get("/api/escalations").json()[0]["id"]
    client.post(f"/api/escalations/{esc_id}/approve", json={"resolved_by": "Priya Kulkarni"})
    after = client.get(f"/api/visits/{v.id}").json()
    assert after["status"] == "completed" and after["decision"] == "non_compliant"
    assert after["decision_reasons"][0].startswith("Manager approved")
    assert after["actions"]["notifications"][0]["status"] == "dry_run"


def test_approve_unusable_photo_takes_no_automated_action(client, db):
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, blurry_jpeg()).id)
    esc_id = client.get("/api/escalations").json()[0]["id"]
    client.post(f"/api/escalations/{esc_id}/approve", json={"resolved_by": "Priya"})
    after = client.get(f"/api/visits/{v.id}").json()
    assert after["status"] == "completed" and after["decision"] == "low_confidence"
    assert after["actions"]["notifications"] == [] and after["actions"]["incentive"] is None
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pytest tests/test_read_apis.py tests/test_escalations.py -v`
Expected: FAIL

- [ ] **Step 4: Implement `backend/app/services/merchants.py`**

```python
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.schemas import EscalationOut, InterventionOut, visit_summary
from app.services.memory import get_memory


def _latest_visit(db: Session, merchant_id: int) -> models.Visit | None:
    return db.scalars(
        select(models.Visit).where(models.Visit.merchant_id == merchant_id).order_by(models.Visit.received_at.desc()).limit(1)
    ).first()


def _merchant_row(db: Session, m: models.Merchant) -> dict:
    v = _latest_visit(db, m.id)
    return {
        "id": m.id, "name": m.name, "owner_name": m.owner_name, "phone": m.phone, "language": m.language,
        "lat": m.lat, "lng": m.lng, "address": m.address, "category": m.category,
        "assigned_fse_id": m.assigned_fse_id, "assigned_fse_name": m.fse.user.name if m.fse else None,
        "latest_score": v.audit.qr_visibility_score if v and v.audit else None,
        "latest_decision": v.decision if v else None,
        "last_visit_at": v.received_at if v else None,
    }


def list_merchants(db: Session) -> list[dict]:
    return [_merchant_row(db, m) for m in db.scalars(select(models.Merchant).order_by(models.Merchant.name)).all()]


def merchant_detail(db: Session, merchant_id: int) -> dict | None:
    m = db.get(models.Merchant, merchant_id)
    if m is None:
        return None
    visits = db.scalars(
        select(models.Visit).where(models.Visit.merchant_id == merchant_id).order_by(models.Visit.received_at.desc()).limit(10)
    ).all()
    interventions = db.scalars(
        select(models.Intervention).where(models.Intervention.merchant_id == merchant_id).order_by(models.Intervention.created_at.desc())
    ).all()
    escalations = db.scalars(
        select(models.Escalation).where(models.Escalation.merchant_id == merchant_id, models.Escalation.status == "open")
    ).all()
    return {
        "merchant": _merchant_row(db, m),
        "context": get_memory().get_context(db, merchant_id).to_dict(),
        "recent_visits": [visit_summary(v).model_dump() for v in visits],
        "interventions": [InterventionOut.model_validate(i).model_dump() for i in interventions],
        "open_escalations": [EscalationOut.model_validate(e).model_dump() for e in escalations],
    }
```

- [ ] **Step 5: Implement `backend/app/services/escalations.py`**

```python
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
```

- [ ] **Step 6: Implement `backend/app/services/analytics.py`**

```python
from collections import Counter
from datetime import datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models
from app.schemas import visit_summary
from app.timeutil import utcnow


def _avg(xs):
    return round(sum(xs) / len(xs), 1) if xs else None


def build_dashboard(db: Session, now: datetime | None = None) -> dict:
    now = now or utcnow()
    start_today = datetime.combine(now.date(), time.min)
    week_ago = now - timedelta(days=7)

    week = db.scalars(select(models.Visit).where(models.Visit.received_at >= week_ago)).all()
    breakdown = Counter(v.decision for v in week if v.decision)
    judged = breakdown["compliant"] + breakdown["non_compliant"]

    def count(model, *where):
        return db.scalar(select(func.count()).select_from(model).where(*where))

    kpis = {
        "visits_today": sum(1 for v in week if v.received_at >= start_today),
        "visits_7d": len(week),
        "compliance_rate_7d": round(100 * breakdown["compliant"] / judged, 1) if judged else None,
        "avg_qr_score_7d": _avg([v.audit.qr_visibility_score for v in week if v.audit]),
        "avg_authenticity_7d": _avg([v.authenticity_score for v in week if v.authenticity_score is not None]),
        "blocked_7d": breakdown["fraud"],
        "open_escalations": count(models.Escalation, models.Escalation.status == "open"),
        "incentives_inr_7d": db.scalar(
            select(func.coalesce(func.sum(models.Incentive.amount_inr), 0)).where(models.Incentive.created_at >= week_ago)
        ),
        "whatsapp_sent_7d": count(models.Notification, models.Notification.created_at >= week_ago),
    }

    recent = db.scalars(select(models.Visit).order_by(models.Visit.received_at.desc()).limit(10)).all()

    leaderboard = []
    for fse in db.scalars(select(models.FseProfile)).all():
        mine = [v for v in week if v.fse_id == fse.id]
        leaderboard.append({
            "fse_id": fse.id, "name": fse.user.name, "territory": fse.territory,
            "visits_7d": len(mine),
            "compliant_7d": sum(1 for v in mine if v.decision == "compliant"),
            "verified_pct_7d": round(100 * sum(1 for v in mine if v.authenticity_verdict == "VERIFIED") / len(mine), 1) if mine else None,
            "incentives_inr_7d": sum(v.incentive.amount_inr for v in mine if v.incentive),
        })
    leaderboard.sort(key=lambda r: r["visits_7d"], reverse=True)

    return {
        "generated_at": now.isoformat(),
        "kpis": kpis,
        "decision_breakdown_7d": dict(breakdown),
        "recent_visits": [visit_summary(v).model_dump() for v in recent],
        "fse_leaderboard": leaderboard,
    }
```

- [ ] **Step 7: Implement the routers**

`backend/app/api/merchants.py`:
```python
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
```

`backend/app/api/escalations.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.schemas import EscalationOut
from app.services.escalations import resolve_escalation

router = APIRouter(prefix="/escalations", tags=["escalations"])


class ResolveIn(BaseModel):
    resolved_by: str
    note: str | None = None


def _row(e: models.Escalation) -> dict:
    return {
        **EscalationOut.model_validate(e).model_dump(),
        "merchant_name": e.merchant.name,
        "fse_name": e.visit.fse.user.name,
        "photo_url": e.visit.photo_url,
        "authenticity_score": e.visit.authenticity_score,
        "qr_visibility_score": e.visit.audit.qr_visibility_score if e.visit.audit else None,
        "confidence": e.visit.audit.confidence if e.visit.audit else None,
    }


@router.get("")
def list_escalations(status: str | None = None, db: Session = Depends(get_db)):
    q = select(models.Escalation).order_by(models.Escalation.created_at.desc())
    if status:
        q = q.where(models.Escalation.status == status)
    return [_row(e) for e in db.scalars(q).all()]


def _resolve(db: Session, esc_id: int, approve: bool, body: ResolveIn) -> dict:
    esc = db.get(models.Escalation, esc_id)
    if esc is None:
        raise HTTPException(404, "Escalation not found")
    try:
        resolve_escalation(db, esc, approve, body.resolved_by, body.note)
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    return _row(esc)


@router.post("/{esc_id}/approve")
def approve(esc_id: int, body: ResolveIn, db: Session = Depends(get_db)):
    return _resolve(db, esc_id, True, body)


@router.post("/{esc_id}/reject")
def reject(esc_id: int, body: ResolveIn, db: Session = Depends(get_db)):
    return _resolve(db, esc_id, False, body)
```

`backend/app/api/analytics.py`:
```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.analytics import build_dashboard

router = APIRouter(tags=["analytics"])


@router.get("/dashboard")
@router.get("/analytics/dashboard")
def dashboard(db: Session = Depends(get_db)):
    return build_dashboard(db)
```

`backend/app/api/fraud.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.schemas import FraudSignalOut, visit_summary

router = APIRouter(prefix="/fraud", tags=["fraud"])


@router.get("/flagged")
def flagged(db: Session = Depends(get_db)):
    q = (select(models.Visit)
         .where(models.Visit.authenticity_verdict.in_(("REVIEW_REQUIRED", "BLOCKED")))
         .order_by(models.Visit.received_at.desc()).limit(100))
    return [{**visit_summary(v).model_dump(), "verdict": v.authenticity_verdict} for v in db.scalars(q).all()]


@router.get("/{visit_id}")
def fraud_for_visit(visit_id: int, db: Session = Depends(get_db)):
    v = db.get(models.Visit, visit_id)
    if v is None:
        raise HTTPException(404, "Visit not found")
    return {"visit_id": v.id, "score": v.authenticity_score, "verdict": v.authenticity_verdict,
            "signals": [FraudSignalOut.model_validate(s).model_dump() for s in v.fraud_signals]}
```

`backend/app/api/incentives.py`:
```python
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.schemas import IncentiveOut

router = APIRouter(prefix="/incentives", tags=["incentives"])


@router.get("")
def incentives(fse_id: int | None = None, db: Session = Depends(get_db)):
    q = select(models.Incentive).order_by(models.Incentive.created_at.desc())
    if fse_id is not None:
        q = q.where(models.Incentive.fse_id == fse_id)
    items = [IncentiveOut.model_validate(i).model_dump() for i in db.scalars(q).all()]
    return {"total_inr": sum(i["amount_inr"] for i in items), "items": items}
```

`backend/app/api/transactions.py`:
```python
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models
from app.db import get_db

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("")
def transactions(merchant_id: int, days: int = 30, db: Session = Depends(get_db)):
    last = db.scalar(select(func.max(models.Transaction.txn_date)).where(models.Transaction.merchant_id == merchant_id))
    if last is None:
        return []
    rows = db.scalars(
        select(models.Transaction)
        .where(models.Transaction.merchant_id == merchant_id, models.Transaction.txn_date > last - timedelta(days=days))
        .order_by(models.Transaction.txn_date)
    ).all()
    return [{"txn_date": r.txn_date.isoformat(), "amount_inr": r.amount_inr, "txn_count": r.txn_count} for r in rows]
```

- [ ] **Step 8: Register all routers in `main.py`**

```python
    from app.api import analytics, audit, escalations, fraud, incentives, internal, merchants, transactions, visits

    for r in (audit, visits, internal, merchants, escalations, analytics, fraud, incentives, transactions):
        app.include_router(r.router, prefix="/api")
```
This loop replaces the individual `include_router` calls added in earlier tasks.

- [ ] **Step 9: Run the full suite**

Run: `pytest -v`
Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add backend
git commit -m "feat(api): merchants, escalation approve/reject, dashboard, fraud, incentives, transactions"
```

---

### Task 13: API contract for Person A and the end-to-end demo script

**Files:**
- Create: `docs/api-contract.md`, `backend/scripts/demo_visit.sh`, `backend/README.md`
- Test: `backend/tests/test_contract_paths.py`

**Interfaces:**
- Consumes: every route above.
- Produces: the written contract Person A builds against, plus a one-command live demo.

- [ ] **Step 1: Write the failing test `backend/tests/test_contract_paths.py`**

```python
from app.main import app

REQUIRED = {
    ("POST", "/api/visits"), ("POST", "/api/visits/{visit_id}/analyze"), ("GET", "/api/visits/{visit_id}"),
    ("GET", "/api/merchants/{merchant_id}"), ("GET", "/api/dashboard"), ("GET", "/api/escalations"),
    ("POST", "/api/escalations/{esc_id}/approve"),
}


def test_contract_routes_exist():
    have = {(m, r.path) for r in app.routes for m in getattr(r, "methods", ())}
    assert REQUIRED <= have
```

(`GET /api/merchants/{id}/impact` is added and tested in P2.)

- [ ] **Step 2: Run it**

Run: `pytest tests/test_contract_paths.py -v`
Expected: PASS. If it fails, a required route is missing: fix it before writing the contract.

- [ ] **Step 3: Write `docs/api-contract.md`**

This is the document Person A codes against. Include these points, and paste one real example response per endpoint (captured with `curl` against the seeded DB):

```markdown
# SightPay API Contract (v1)

Base URL: `http://<backend-host>:8000/api` · JSON · snake_case · datetimes are naive UTC ISO-8601 · photos served from `photo_url`.
Interactive docs: `http://<backend-host>:8000/docs`.

## Core demo loop
1. `POST /visits` (multipart/form-data)
   fields: merchant_id (int), fse_id (int), lat, lng (float, device GPS), captured_at (ISO, device clock),
   capture_source ("camera" | "gallery"), analyze ("true" to start analysis immediately), photo (jpeg/png/webp ≤ 10 MB)
   → 201 VisitOut (status "submitted", or "analyzing"/"completed" if analyze=true)
   errors: 404 unknown merchant/fse · 413 too large · 415 wrong type · 422 unreadable image
2. `POST /visits/{id}/analyze` → VisitOut · 409 if already analyzed
3. `GET /visits/{id}` → VisitOut. **Poll every 1s while status == "analyzing"** (n8n mode).
   Animate `pipeline_log[]` entries (step, at, summary) as the live journey:
   queued → fraud_check → vision_ai → merchant_context → decision → incentive | guidance → whatsapp | escalation | block → complete

### VisitOut
id, merchant_id, merchant_name, fse_id, fse_name, status (submitted|analyzing|completed|escalated|blocked|rejected|failed),
decision (compliant|non_compliant|low_confidence|fraud|null), decision_reasons[], photo_url, lat, lng, captured_at,
received_at, capture_source, pipeline_mode (n8n|inline|inline_fallback), pipeline_log[], completed_at,
authenticity {score 0-100, verdict VERIFIED|REVIEW_REQUIRED|BLOCKED, signals[{signal, status pass|warn|fail, penalty, detail}]},
audit {paytm_qr_visible, qr_visibility_score, soundbox_visible, competitor, competitor_dominance, qr_obstructed,
       image_quality ok|blurry|dark, blur_score, suspicious_signals[], recommended_action, confidence, notes, provider},
actions {incentive, intervention {message_text, message_text_en, message_language, audio_url}, escalation, notifications[]}

UI copy rule: authenticity is "combined evidence signals", never "EXIF-verified".

## Merchants
- `GET /merchants` → [{id, name, owner_name, language, lat, lng, category, assigned_fse_name, latest_score, latest_decision, last_visit_at}]
- `GET /merchants/{id}` → {merchant, context (memory: previous_scores, previous_issues, previous_interventions, consecutive_non_compliant, summary), recent_visits[], interventions[], open_escalations[]}
- `GET /merchants/{id}/impact` (P2) → observed transaction change around the latest intervention

## Manager
- `GET /dashboard` → {kpis{visits_today, visits_7d, compliance_rate_7d, avg_qr_score_7d, avg_authenticity_7d, blocked_7d, open_escalations, incentives_inr_7d, whatsapp_sent_7d}, decision_breakdown_7d, recent_visits[], fse_leaderboard[]}
- `GET /escalations?status=open` → [{id, visit_id, merchant_name, fse_name, reason, status, photo_url, authenticity_score, qr_visibility_score, confidence, ...}]
- `POST /escalations/{id}/approve` · `POST /escalations/{id}/reject` body {resolved_by, note?} → escalation · 409 if already resolved

## Supporting
- `GET /visits?fse_id=&merchant_id=&limit=` · `GET /fraud/flagged` · `GET /fraud/{visit_id}` · `GET /audit/{visit_id}`
- `POST /audit/analyze-image` (multipart photo) → {quality, audit, provider} (stateless try-it)
- `GET /incentives?fse_id=` → {total_inr, items[]} · `GET /transactions?merchant_id=&days=30`
- `GET /health` → which providers are live (vision, n8n, memory, whatsapp)
```

- [ ] **Step 4: Write `backend/scripts/demo_visit.sh`**

```bash
#!/usr/bin/env bash
# Usage: scripts/demo_visit.sh demo_photos/counter_bad.jpg [merchant_id] [fse_id]
set -euo pipefail
API=${API:-http://localhost:8000/api}
PHOTO=$1; MID=${2:-1}; FID=${3:-1}
read LAT LNG < <(curl -s "$API/merchants/$MID" | python3 -c 'import sys,json; m=json.load(sys.stdin)["merchant"]; print(m["lat"], m["lng"])')
VISIT=$(curl -s -F merchant_id=$MID -F fse_id=$FID -F lat=$LAT -F lng=$LNG -F capture_source=camera \
  -F captured_at=$(date -u +%Y-%m-%dT%H:%M:%SZ) -F analyze=true -F "photo=@$PHOTO;type=image/jpeg" "$API/visits")
ID=$(echo "$VISIT" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
echo "visit $ID created"
for _ in $(seq 1 60); do
  STATUS=$(curl -s "$API/visits/$ID" | python3 -c 'import sys,json; print(json.load(sys.stdin)["status"])')
  [ "$STATUS" != "analyzing" ] && break; sleep 1
done
curl -s "$API/visits/$ID" | python3 -c '
import sys, json
v = json.load(sys.stdin)
for s in v["pipeline_log"]: print(f"  {s[\"step\"]:<18} {s[\"summary\"]}")
print("status:", v["status"], "| decision:", v["decision"], "| authenticity:", v["authenticity"]["score"], v["authenticity"]["verdict"])'
```

```bash
chmod +x backend/scripts/demo_visit.sh
```

- [ ] **Step 5: Write `backend/README.md` (runbook)**

```markdown
# SightPay backend

    cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
    cp .env.example .env          # set VISION_PROVIDER=claude + ANTHROPIC_API_KEY for live AI
    python -m app.seed            # --demo-location LAT,LNG puts Ramesh General Store at the venue
    uvicorn app.main:app --host 0.0.0.0 --port 8000
    pytest

Demo: `scripts/demo_visit.sh demo_photos/counter_bad.jpg` → non-compliant → Hindi WhatsApp guidance.
Offline safety net: VISION_PROVIDER=fixture + photos pinned via scripts/register_fixture.py; unset N8N_WEBHOOK_URL to run inline.
```

- [ ] **Step 6: Full dry run on a clean DB (inline, fixture vision)**

```bash
cd backend && rm -f sightpay.db && python -m app.seed && uvicorn app.main:app --port 8000 &
sleep 2
scripts/demo_visit.sh demo_photos/counter_good.jpg   # expect: compliant, incentive
scripts/demo_visit.sh demo_photos/counter_bad.jpg    # expect: non_compliant, guidance, whatsapp
scripts/demo_visit.sh demo_photos/counter_bad.jpg    # expect: fraud (duplicate photo) → blocked
curl -s localhost:8000/api/dashboard | python -m json.tool | head -30
```
Expected: the three outcomes above. The dashboard KPIs reflect the new visits.

- [ ] **Step 7: Commit and hand the contract to Person A**

```bash
git add docs/api-contract.md backend
git commit -m "docs: API contract for frontend and end-to-end demo script"
```
