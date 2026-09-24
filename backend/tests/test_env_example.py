from pathlib import Path

from dotenv import dotenv_values

ENV_EXAMPLE = Path(__file__).resolve().parents[1] / ".env.example"


def test_env_example_values_do_not_swallow_comments():
    values = dotenv_values(ENV_EXAMPLE)
    assert values["N8N_WEBHOOK_URL"] == ""  # an inline comment here would switch on n8n mode with a bogus URL
    assert values["ANTHROPIC_API_KEY"] == ""
    assert not any((v or "").startswith("#") for v in values.values())
