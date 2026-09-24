from datetime import datetime, timedelta

from app.services.fraud.scoring import score_signals
from app.services.fraud.signals import Signal, check_gps, check_live_capture, check_timestamp, haversine_m


def test_haversine_one_millidegree_latitude_is_about_111m():
    assert 110 < haversine_m(18.5, 73.8, 18.501, 73.8) < 112.5


def test_gps_bands():
    assert check_gps(18.5074, 73.8077, 18.5074, 73.8077).status == "pass"
    warn = check_gps(18.5074 + 0.0015, 73.8077, 18.5074, 73.8077)  # ~167 m
    assert (warn.status, warn.penalty) == ("warn", 20)
    fail = check_gps(18.52, 73.8077, 18.5074, 73.8077)  # ~1.4 km
    assert (fail.status, fail.penalty) == ("fail", 45)


def test_timestamp_bands():
    now = datetime(2026, 9, 25, 10, 0)
    assert check_timestamp(now - timedelta(minutes=2), now).status == "pass"
    assert check_timestamp(now - timedelta(minutes=30), now).penalty == 15
    assert check_timestamp(now - timedelta(hours=3), now).status == "fail"
    assert check_timestamp(None, now).penalty == 10


def test_live_capture():
    assert check_live_capture("camera").penalty == 0
    assert check_live_capture("gallery").penalty == 25
    assert check_live_capture("whatever").penalty == 10


def _s(name, status, penalty):
    return Signal(name, status, penalty, "")


def test_all_pass_is_verified():
    r = score_signals([_s("gps", "pass", 0), _s("timestamp", "pass", 0)])
    assert (r.score, r.verdict) == (100, "VERIFIED")


def test_mid_score_requires_review():
    r = score_signals([_s("gps", "fail", 45), _s("exif", "warn", 10), _s("live_capture", "warn", 10)])
    assert (r.score, r.verdict) == (35, "REVIEW_REQUIRED")


def test_very_low_score_is_blocked():
    r = score_signals([_s("gps", "fail", 45), _s("timestamp", "warn", 15), _s("live_capture", "warn", 25)])
    assert (r.score, r.verdict) == (15, "BLOCKED")


def test_duplicate_image_is_a_hard_block_even_with_high_score():
    r = score_signals([_s("duplicate_image", "fail", 60)])
    assert (r.score, r.verdict) == (40, "BLOCKED")
