import logging
import sys
import time
import types
from datetime import date

from sqlalchemy import select

from app import models
from app.seed import seed
from app.services.memory.cognee_memory import CogneeAdapter, CogneeMemory, flatten_search_results, visit_memory_document


class FakeAdapter:
    def __init__(self, answer="Ramesh: QR was blocked by a PhonePe standee; repositioned on 5 Sep.", fail=False, delay=0.0):
        self.answer, self.fail, self.delay, self.added = answer, fail, delay, []

    def add(self, text, dataset):
        self.added.append((dataset, text))

    def search(self, query, dataset):
        time.sleep(self.delay)
        if self.fail:
            raise RuntimeError("cognee down")
        return self.answer


def _ramesh(db):
    seed(db, today=date(2026, 9, 25))
    return db.scalar(select(models.Merchant).where(models.Merchant.name == "Ramesh General Store"))


def test_context_combines_sql_facts_with_cognee_summary(db):
    m = _ramesh(db)
    ctx = CogneeMemory(adapter=FakeAdapter()).get_context(db, m.id)
    assert ctx.source == "cognee"
    assert "PhonePe standee" in ctx.summary
    assert ctx.previous_scores == [42, 38]
    assert "42" in ctx.extra["sql_summary"]


def test_cognee_failure_or_timeout_falls_back_to_sql(db, monkeypatch):
    m = _ramesh(db)
    assert CogneeMemory(adapter=FakeAdapter(fail=True)).get_context(db, m.id).source == "sql_fallback"
    assert CogneeMemory(adapter=FakeAdapter(answer="  ")).get_context(db, m.id).source == "sql_fallback"
    from app.config import settings
    monkeypatch.setattr(settings, "cognee_timeout_s", 0.05)
    ctx = CogneeMemory(adapter=FakeAdapter(delay=0.5)).get_context(db, m.id)
    assert ctx.source == "sql_fallback" and "42" in ctx.summary


def test_visit_document_captures_relationships(db):
    m = _ramesh(db)
    visit = db.scalars(select(models.Visit).where(models.Visit.merchant_id == m.id).order_by(models.Visit.received_at.desc())).first()
    doc = visit_memory_document(visit)
    for fragment in ("Merchant: Ramesh General Store", "Rep: Amit Patil", "QR visibility score: 42",
                     "Issue: QR obstruction", "Competitor: PhonePe (high)", "Intervention: clear_qr_obstruction", "Outcome: non_compliant"):
        assert fragment in doc


def test_visit_document_tolerates_missing_rep_audit_and_date(db):
    m = _ramesh(db)
    doc = visit_memory_document(models.Visit(merchant=m, lat=0.0, lng=0.0))
    assert "Merchant: Ramesh General Store" in doc
    assert "Rep: unknown" in doc
    assert "QR visibility score" not in doc


def test_record_visit_outcome_adds_document(db):
    m = _ramesh(db)
    fake = FakeAdapter()
    mem = CogneeMemory(adapter=fake)
    visit = db.scalars(select(models.Visit).where(models.Visit.merchant_id == m.id)).first()
    mem.record_visit_outcome(db, visit, background=False)
    assert fake.added[0][0] == f"merchant_{m.id}"


def test_search_results_flatten_to_readable_text():
    # cognee 1.6 returns list[str] without access control, list[dict] with it (the default for local DBs).
    assert flatten_search_results(["Ramesh had a QR obstruction."]) == "Ramesh had a QR obstruction."
    assert flatten_search_results([{"dataset_name": "merchant_1", "search_result": ["A.", "B."]}]) == "A.\nB."
    assert flatten_search_results([{"search_result": []}]) == ""
    assert flatten_search_results(None) == ""


def test_missing_cognee_falls_back_and_only_logs(db, monkeypatch, caplog):
    """MEMORY_BACKEND=cognee without the library installed: the visit still completes on SQL memory."""
    from app.config import settings
    from app.services.memory import cognee_memory, get_memory
    from app.services.pipeline import run_inline
    from tests.factories import make_visit, make_world, sharp_jpeg

    monkeypatch.setitem(sys.modules, "cognee", None)  # `import cognee` raises ImportError
    monkeypatch.setattr(settings, "memory_backend", "cognee")
    assert isinstance(get_memory(), CogneeMemory)

    class InlineThread:  # run the background add synchronously so its log is observable
        def __init__(self, target, daemon=False):
            self.target = target

        def start(self):
            self.target()

    # Patch only cognee_memory's reference: patching threading.Thread globally also hijacks the
    # ThreadPoolExecutor's worker threads, which made this test fail whenever the pool spawned one.
    monkeypatch.setattr(cognee_memory, "threading", types.SimpleNamespace(Thread=InlineThread))
    caplog.set_level(logging.WARNING, logger=cognee_memory.__name__)

    world = make_world(db)
    visit = run_inline(db, make_visit(db, world, sharp_jpeg(103)).id)
    assert visit.status == "completed"
    context_step = next(s for s in visit.pipeline_log if s["step"] == "merchant_context")
    assert context_step["data"]["source"] == "sql_fallback"
    assert any("Cognee add failed" in r.getMessage() and r.exc_info and issubclass(r.exc_info[0], ImportError)
               for r in caplog.records)
    assert isinstance(CogneeMemory().adapter, CogneeAdapter)


def test_pool_submit_failure_falls_back_to_sql(db, monkeypatch):
    from app.services.memory import cognee_memory

    class BrokenPool:
        def submit(self, *a, **k):
            raise RuntimeError("cannot schedule new futures after shutdown")

    monkeypatch.setattr(cognee_memory, "_pool", BrokenPool())
    m = _ramesh(db)
    assert CogneeMemory(adapter=FakeAdapter()).get_context(db, m.id).source == "sql_fallback"


def test_import_cognee_exports_dotenv_without_overriding_real_env(tmp_path, monkeypatch):
    """Cognee reads LLM_*/EMBEDDING_* from os.environ, so backend/.env must be exported before importing it."""
    import os

    from app.services.memory import cognee_memory

    (tmp_path / ".env").write_text("SIGHTPAY_TEST_EMBEDDING_PROVIDER=ollama\nSIGHTPAY_TEST_LLM_MODEL=from_dotenv\n")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("SIGHTPAY_TEST_LLM_MODEL", "from_shell")
    fake = types.ModuleType("cognee")
    monkeypatch.setitem(sys.modules, "cognee", fake)
    try:
        assert cognee_memory._import_cognee() is fake
        assert os.environ["SIGHTPAY_TEST_EMBEDDING_PROVIDER"] == "ollama"
        assert os.environ["SIGHTPAY_TEST_LLM_MODEL"] == "from_shell"
    finally:
        os.environ.pop("SIGHTPAY_TEST_EMBEDDING_PROVIDER", None)
