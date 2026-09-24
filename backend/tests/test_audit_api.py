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
