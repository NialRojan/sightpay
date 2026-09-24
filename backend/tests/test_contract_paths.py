from app.main import app

REQUIRED = {
    ("POST", "/api/visits"), ("POST", "/api/visits/{visit_id}/analyze"), ("GET", "/api/visits/{visit_id}"),
    ("GET", "/api/merchants/{merchant_id}"), ("GET", "/api/dashboard"), ("GET", "/api/escalations"),
    ("POST", "/api/escalations/{esc_id}/approve"),
    ("GET", "/api/merchants/{merchant_id}/impact"),
}


def test_contract_routes_exist():
    # Note: this FastAPI version (0.141) resolves included routers lazily via
    # `_IncludedRouter` wrappers, so `app.routes` no longer flattens to plain
    # APIRoute objects with a usable `.path`/`.methods`. The OpenAPI schema is
    # the stable, version-independent way to enumerate the full route table.
    schema = app.openapi()
    have = {(method.upper(), path) for path, methods in schema["paths"].items() for method in methods}
    assert REQUIRED <= have
