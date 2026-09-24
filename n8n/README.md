# n8n: SightPay autonomous action layer

1. `docker compose up -d` (UI: http://localhost:5678)
2. `docker compose exec n8n n8n import:workflow --input=/workflows/sightpay_visit_pipeline.json`
3. Open the workflow and toggle it **Active** (production URL: `/webhook/sightpay-visit`).
4. Run the backend with `N8N_WEBHOOK_URL=http://localhost:5678/webhook/sightpay-visit` and `--host 0.0.0.0`.

If n8n is down, the backend falls back to running the same steps inline (`pipeline_mode = inline_fallback`).
Each node calls one idempotent `/api/internal/...` step, so "Retry" on a failed execution is safe.
