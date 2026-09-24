from datetime import datetime, timezone

from tests.factories import image_bytes, make_world, sharp_jpeg


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
    assert client.post("/api/visits", data=_form(world), files={"photo": ("c.txt", b"x", "text/plain")}).status_code == 422
    gif = {"photo": ("c.gif", image_bytes("GIF"), "image/jpeg")}  # header lies; the bytes decide
    assert client.post("/api/visits", data=_form(world), files=gif).status_code == 415
    big = {"photo": ("c.jpg", b"\xff" * (10 * 1024 * 1024 + 1), "image/jpeg")}
    assert client.post("/api/visits", data=_form(world), files=big).status_code == 413
    assert client.post("/api/visits", data=_form(world), files={"photo": ("c.jpg", b"notanimage", "image/jpeg")}).status_code == 422
    assert client.get("/api/visits/12345").status_code == 404


def test_list_visits(client, db):
    world = make_world(db)
    client.post("/api/visits", data=_form(world, analyze="true"), files={"photo": ("c.jpg", sharp_jpeg(53), "image/jpeg")})
    rows = client.get(f"/api/visits?fse_id={world.fse.id}").json()
    assert len(rows) == 1 and rows[0]["qr_visibility_score"] == 38


def test_media_type_comes_from_the_image_not_the_header(client, db):
    world = make_world(db)
    png = {"photo": ("c.jpg", image_bytes("PNG"), "application/octet-stream")}
    res = client.post("/api/visits", data=_form(world), files=png)
    assert res.status_code == 201
    assert res.json()["photo_url"].endswith(".png")
    from app import models
    assert db.get(models.Visit, res.json()["id"]).photo_media_type == "image/png"
