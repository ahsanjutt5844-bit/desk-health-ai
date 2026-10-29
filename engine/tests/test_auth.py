"""Security layer: profile password, lock-out and protected engine commands."""

import os
import sqlite3
import sys
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_mod  # noqa: E402
from auth import AuthError, AuthManager, hash_password, verify_password  # noqa: E402
from database import DatabaseManager  # noqa: E402


@pytest.fixture
def db(tmp_path):
    d = DatabaseManager(str(tmp_path / "t.db"))
    d.connect()
    return d


def test_password_is_hashed_not_stored(db):
    a = AuthManager(db, iterations=1000)
    a.setup("Ahsan", "secret123")
    row = db.get_auth()
    assert row["password_hash"] and "secret123" not in str(row)
    assert len(row["password_salt"]) == 32            # 16 random bytes
    raw = open(db.db_path, "rb").read()
    assert b"secret123" not in raw


def test_hash_verify_and_salt():
    s1, h1, it = hash_password("pw123456", iterations=1000)
    s2, h2, _ = hash_password("pw123456", iterations=1000)
    assert h1 != h2                                    # different salts
    assert verify_password("pw123456", s1, h1, it)
    assert not verify_password("pw123457", s1, h1, it)


def test_default_iterations_are_strong():
    assert auth_mod.ITERATIONS >= 600_000


def test_login_wrong_then_right(db):
    a = AuthManager(db, iterations=1000)
    a.setup("Ahsan", "secret123")
    a.lock()
    with pytest.raises(AuthError):
        a.login("nope")
    assert not a.status()["unlocked"]
    assert a.login("secret123")["unlocked"]


def test_lockout_after_five_failures(db):
    a = AuthManager(db, iterations=1000)
    a.setup("Ahsan", "secret123")
    a.lock()
    for _ in range(5):
        with pytest.raises(AuthError):
            a.login("wrong")
    st = a.status()
    assert st["locked_for"] >= 25
    with pytest.raises(AuthError, match="Too many"):
        a.login("secret123")                           # even the right one waits
    a.locked_until = time.time() - 1
    assert a.login("secret123")["unlocked"]


def test_password_rules(db):
    a = AuthManager(db, iterations=1000)
    with pytest.raises(AuthError):
        a.setup("Ahsan", "123")                        # too short
    with pytest.raises(AuthError):
        a.setup("", "secret123")                       # no name
    a.setup("Ahsan", "secret123")
    with pytest.raises(AuthError):
        a.setup("Someone", "another123")               # cannot overwrite silently


def test_change_password_needs_old(db):
    a = AuthManager(db, iterations=1000)
    a.setup("Ahsan", "secret123")
    with pytest.raises(AuthError):
        a.change("bad", "newpass123")
    a.change("secret123", "newpass123")
    a.lock()
    assert a.login("newpass123")["unlocked"]


def test_engine_refuses_data_commands_when_locked(tmp_path, monkeypatch):
    import main as engine_main
    monkeypatch.setattr(engine_main, "emit", lambda o: None)
    eng = engine_main.Engine(str(tmp_path / "e.db"))
    eng.auth.iterations = 1000
    for cmd in ("get_stats", "get_settings", "update_settings", "export_csv",
                "clear_history", "calibrate", "set_preview"):
        with pytest.raises(PermissionError):
            eng.dispatch(cmd, {})
    # tracking controls still work while locked
    assert eng.dispatch("pause", {"reason": "user"}) is True
    eng.dispatch("auth_setup", {"name": "Ahsan", "password": "secret123"})
    assert eng.dispatch("get_settings", {})["alert_timer_mins"] == 3
    eng.dispatch("auth_lock", {})
    with pytest.raises(PermissionError):
        eng.dispatch("get_stats", {})


def test_settings_are_validated(db):
    db.update_settings({"alert_timer_mins": 999, "target_fps": -5, "posture_threshold": "abc",
                        "eye_strain_tracking": 0, "evil_key": "x"})
    s = db.get_settings()
    assert s["alert_timer_mins"] == 10 and s["target_fps"] == 1
    assert s["posture_threshold"] == 35                # invalid value ignored
    assert s["eye_strain_tracking"] is False
    assert "evil_key" not in s


def test_reset_everything_clears_password_and_data(db):
    a = AuthManager(db, iterations=1000)
    a.setup("Ahsan", "secret123")
    db.add_time("2026-10-29", active=100, slouch=10)
    a.lock()
    a.reset_everything()
    assert not a.status()["has_password"]
    assert db.fetch_summary("2026-10-29")["total_active_seconds"] == 0


def test_old_database_is_upgraded(tmp_path):
    path = tmp_path / "old.db"
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE user_profile (profile_id INTEGER PRIMARY KEY AUTOINCREMENT, "
                "profile_name VARCHAR NOT NULL DEFAULT 'Main User', "
                "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    con.execute("INSERT INTO user_profile DEFAULT VALUES")
    con.commit()
    con.close()
    d = DatabaseManager(str(path))
    d.connect()
    assert d.get_auth()["password_hash"] is None       # new columns exist
