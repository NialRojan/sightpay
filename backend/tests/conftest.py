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
