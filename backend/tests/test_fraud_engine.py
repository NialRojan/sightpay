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
