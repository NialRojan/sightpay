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


def test_compose_pins_the_verified_n8n_version():
    compose = (WF.parents[1] / "docker-compose.yml").read_text()
    assert "image: docker.n8n.io/n8nio/n8n:2.40.6" in compose
