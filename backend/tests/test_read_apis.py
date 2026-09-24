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


def test_dashboard_reports_observed_change(db):
    seed(db, today=date(2026, 9, 25))
    d = build_dashboard(db, now=datetime(2026, 9, 25, 12, 0))
    assert d["kpis"]["avg_observed_change_pct"] is not None


def test_observed_change_kpi_is_null_when_nothing_is_measurable(db):
    d = build_dashboard(db, now=datetime(2026, 9, 25, 12, 0))
    assert d["kpis"]["avg_observed_change_pct"] is None
