"""
DatabaseManager - local SQLite storage (zero cloud).

Tables follow the SDS Phase II schema:
  USER_PROFILE, USER_SETTINGS, DAILY_SUMMARY, APP_SESSIONS, POSTURE_LOGS,
  ALERT_HISTORY
Only numbers and timestamps are stored - never images (NFR-09 / NFR-10).
"""

from __future__ import annotations

import csv
import json
import os
import sqlite3
import threading
from datetime import date, datetime, timedelta
from typing import Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS user_profile (
    profile_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_name  VARCHAR NOT NULL DEFAULT 'Main User',
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    password_hash TEXT,          -- PBKDF2-HMAC-SHA256, never the password itself
    password_salt TEXT,
    password_iter INTEGER
);

CREATE TABLE IF NOT EXISTS user_settings (
    setting_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id             INTEGER UNIQUE REFERENCES user_profile(profile_id),
    eye_strain_tracking    BOOLEAN NOT NULL DEFAULT 1,
    camera_idx             INTEGER NOT NULL DEFAULT 0,
    alert_timer_mins       INTEGER NOT NULL DEFAULT 3,
    desktop_notifications  BOOLEAN NOT NULL DEFAULT 1,
    posture_threshold      INTEGER NOT NULL DEFAULT 35,   -- slouch index % that counts as slouching
    min_distance_cm        INTEGER NOT NULL DEFAULT 50,   -- closer than this = too close
    too_close_seconds      INTEGER NOT NULL DEFAULT 5,
    target_fps             INTEGER NOT NULL DEFAULT 2,
    auto_pause_calls       BOOLEAN NOT NULL DEFAULT 1,
    launch_on_boot         BOOLEAN NOT NULL DEFAULT 0,
    focal_scale            REAL,                          -- distance calibration
    calibration_json       TEXT                           -- upright posture baseline
);

CREATE TABLE IF NOT EXISTS daily_summary (
    summary_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id            INTEGER REFERENCES user_profile(profile_id),
    date                  DATE NOT NULL,
    total_active_seconds  INTEGER NOT NULL DEFAULT 0,
    total_slouch_seconds  INTEGER NOT NULL DEFAULT 0,
    total_resting_seconds INTEGER NOT NULL DEFAULT 0,
    total_close_seconds   INTEGER NOT NULL DEFAULT 0,
    alerts_triggered      INTEGER NOT NULL DEFAULT 0,
    score_sum             REAL    NOT NULL DEFAULT 0,
    score_samples         INTEGER NOT NULL DEFAULT 0,
    health_score          INTEGER,
    UNIQUE (profile_id, date)
);

CREATE TABLE IF NOT EXISTS app_sessions (
    session_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id  INTEGER REFERENCES user_profile(profile_id),
    start_time  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time    DATETIME
);

CREATE TABLE IF NOT EXISTS posture_logs (
    log_id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id       INTEGER REFERENCES app_sessions(session_id),
    timestamp        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    posture_state    VARCHAR(20) NOT NULL,
    posture_score    INTEGER,
    slouch_index     REAL,
    kyphosis         REAL,
    forward_head     REAL,
    pelvic_tilt      REAL,
    neck_angle       REAL,
    shoulder_angle   REAL,
    shoulder_drop_cm REAL,
    screen_distance  REAL
);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON posture_logs(timestamp);

CREATE TABLE IF NOT EXISTS alert_history (
    alert_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id        INTEGER REFERENCES app_sessions(session_id),
    timestamp         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    alert_type        VARCHAR(30) NOT NULL,
    duration_seconds  INTEGER,
    user_action       VARCHAR(20) DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_alert_ts ON alert_history(timestamp);
"""

DEFAULT_SETTINGS = {
    "eye_strain_tracking": True,
    "camera_idx": 0,
    "alert_timer_mins": 3,
    "desktop_notifications": True,
    "posture_threshold": 35,
    "min_distance_cm": 50,
    "too_close_seconds": 5,
    "target_fps": 2,
    "auto_pause_calls": True,
    "launch_on_boot": False,
}
BOOL_SETTINGS = {"eye_strain_tracking", "desktop_notifications", "auto_pause_calls", "launch_on_boot"}
EDITABLE_SETTINGS = set(DEFAULT_SETTINGS)
# allowed range of every numeric setting (values from the UI are clamped)
SETTING_RANGES = {
    "camera_idx": (0, 9), "alert_timer_mins": (1, 10), "posture_threshold": (20, 60),
    "min_distance_cm": (35, 75), "too_close_seconds": (2, 30), "target_fps": (1, 3),
}
# columns added after the first release; older databases are upgraded on start
MIGRATIONS = {
    "user_profile": [("password_hash", "TEXT"), ("password_salt", "TEXT"), ("password_iter", "INTEGER")],
}


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class DatabaseManager:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.connection: Optional[sqlite3.Connection] = None
        self.lock = threading.RLock()
        self.profile_id = 1

    # ------------------------------------------------------------------ setup
    def connect(self) -> bool:
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        self.connection = sqlite3.connect(self.db_path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        with self.lock:
            self.connection.execute("PRAGMA journal_mode=WAL")
            self.connection.executescript(SCHEMA)
            for table, cols in MIGRATIONS.items():
                have = {r["name"] for r in self.connection.execute(f"PRAGMA table_info({table})")}
                for col, typ in cols:
                    if col not in have:
                        self.connection.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
            cur = self.connection.execute("SELECT profile_id FROM user_profile LIMIT 1")
            row = cur.fetchone()
            if row is None:
                cur = self.connection.execute("INSERT INTO user_profile DEFAULT VALUES")
                self.profile_id = cur.lastrowid
            else:
                self.profile_id = row["profile_id"]
            self.connection.execute(
                "INSERT OR IGNORE INTO user_settings (profile_id) VALUES (?)", (self.profile_id,))
            self.connection.commit()
        return True

    def close_connection(self):
        with self.lock:
            if self.connection:
                self.connection.commit()
                self.connection.close()
                self.connection = None

    def _q(self, sql: str, args=()) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.connection.execute(sql, args).fetchall()]

    def _x(self, sql: str, args=()) -> int:
        with self.lock:
            cur = self.connection.execute(sql, args)
            self.connection.commit()
            return cur.lastrowid

    # --------------------------------------------------------------- settings
    def get_settings(self) -> dict:
        row = self._q("SELECT * FROM user_settings WHERE profile_id=?", (self.profile_id,))[0]
        out = {k: row[k] for k in DEFAULT_SETTINGS}
        for k in BOOL_SETTINGS:
            out[k] = bool(out[k])
        out["focal_scale"] = row["focal_scale"]
        out["calibrated"] = bool(row["calibration_json"])
        return out

    def update_settings(self, values: dict) -> bool:
        clean = {}
        for k, v in (values or {}).items():
            if k not in EDITABLE_SETTINGS:
                continue                      # unknown keys are ignored
            if k in BOOL_SETTINGS:
                clean[k] = bool(v)
            else:
                try:
                    num = int(v)
                except (TypeError, ValueError):
                    continue                  # invalid value: keep the old one
                lo, hi = SETTING_RANGES[k]
                clean[k] = max(lo, min(hi, num))
        if not clean:
            return False
        cols = ", ".join(f"{k}=?" for k in clean)
        args = [int(v) if isinstance(v, bool) else v for v in clean.values()]
        self._x(f"UPDATE user_settings SET {cols} WHERE profile_id=?", (*args, self.profile_id))
        return True

    def reset_settings(self):
        self.update_settings(DEFAULT_SETTINGS)

    def get_calibration(self) -> Optional[dict]:
        row = self._q("SELECT calibration_json FROM user_settings WHERE profile_id=?",
                      (self.profile_id,))[0]
        return json.loads(row["calibration_json"]) if row["calibration_json"] else None

    def save_calibration(self, baseline: Optional[dict], focal_scale: Optional[float] = None):
        self._x("UPDATE user_settings SET calibration_json=? WHERE profile_id=?",
                (json.dumps(baseline) if baseline else None, self.profile_id))
        if focal_scale:
            self._x("UPDATE user_settings SET focal_scale=? WHERE profile_id=?",
                    (focal_scale, self.profile_id))

    # ------------------------------------------------------------------ auth
    def get_auth(self) -> dict:
        return self._q("SELECT profile_name, password_hash, password_salt, password_iter "
                       "FROM user_profile WHERE profile_id=?", (self.profile_id,))[0]

    def set_auth(self, name, salt, digest, iterations):
        self._x("UPDATE user_profile SET profile_name=?, password_salt=?, password_hash=?, "
                "password_iter=? WHERE profile_id=?",
                (name, salt, digest, iterations, self.profile_id))

    # --------------------------------------------------------------- sessions
    def start_session(self) -> int:
        return self._x("INSERT INTO app_sessions (profile_id, start_time) VALUES (?, ?)",
                       (self.profile_id, _now()))

    def end_session(self, session_id: Optional[int]):
        if session_id:
            self._x("UPDATE app_sessions SET end_time=? WHERE session_id=?", (_now(), session_id))

    # ------------------------------------------------------------------- logs
    def save_log(self, session_id: Optional[int], log: dict) -> bool:
        self._x(
            """INSERT INTO posture_logs (session_id, timestamp, posture_state, posture_score,
               slouch_index, kyphosis, forward_head, pelvic_tilt, neck_angle, shoulder_angle,
               shoulder_drop_cm, screen_distance)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (session_id, _now(), log.get("posture_state"), log.get("posture_score"),
             log.get("slouch_index"), log.get("kyphosis"), log.get("forward_head"),
             log.get("pelvic_tilt"), log.get("neck_angle"), log.get("shoulder_angle"),
             log.get("shoulder_drop_cm"), log.get("screen_distance")))
        return True

    def add_time(self, day: str, active=0, slouch=0, resting=0, close=0,
                 score_sum=0.0, score_samples=0, alerts=0):
        """Accumulate seconds into DAILY_SUMMARY and refresh its health score."""
        with self.lock:
            self.connection.execute(
                "INSERT OR IGNORE INTO daily_summary (profile_id, date) VALUES (?, ?)",
                (self.profile_id, day))
            self.connection.execute(
                """UPDATE daily_summary SET
                     total_active_seconds = total_active_seconds + ?,
                     total_slouch_seconds = total_slouch_seconds + ?,
                     total_resting_seconds = total_resting_seconds + ?,
                     total_close_seconds = total_close_seconds + ?,
                     score_sum = score_sum + ?,
                     score_samples = score_samples + ?,
                     alerts_triggered = alerts_triggered + ?
                   WHERE profile_id=? AND date=?""",
                (int(active), int(slouch), int(resting), int(close), score_sum, score_samples,
                 alerts, self.profile_id, day))
            self.connection.execute(
                """UPDATE daily_summary SET health_score =
                     CASE WHEN score_samples > 0 THEN CAST(ROUND(score_sum / score_samples) AS INT)
                     END WHERE profile_id=? AND date=?""", (self.profile_id, day))
            self.connection.commit()

    def save_alert(self, session_id: Optional[int], alert_type: str, duration: int) -> int:
        alert_id = self._x(
            "INSERT INTO alert_history (session_id, timestamp, alert_type, duration_seconds) "
            "VALUES (?,?,?,?)", (session_id, _now(), alert_type, duration))
        self.add_time(date.today().isoformat(), alerts=1)
        return alert_id

    def set_alert_action(self, alert_id: int, action: str):
        self._x("UPDATE alert_history SET user_action=? WHERE alert_id=? AND user_action IS NULL",
                (action, alert_id))

    # -------------------------------------------------------------- analytics
    def fetch_summary(self, day: str) -> dict:
        rows = self._q("SELECT * FROM daily_summary WHERE profile_id=? AND date=?",
                       (self.profile_id, day))
        if rows:
            return rows[0]
        return {"date": day, "total_active_seconds": 0, "total_slouch_seconds": 0,
                "total_resting_seconds": 0, "total_close_seconds": 0, "alerts_triggered": 0,
                "health_score": None}

    def weekly(self, days: int = 7, end: Optional[date] = None) -> list[dict]:
        end = end or date.today()
        return [self.fetch_summary((end - timedelta(days=i)).isoformat())
                for i in range(days - 1, -1, -1)]

    def hourly(self, day: str) -> list[dict]:
        return self._q(
            """SELECT CAST(strftime('%H', timestamp) AS INT) AS hour,
                      ROUND(AVG(posture_score)) AS score,
                      ROUND(AVG(screen_distance), 1) AS distance,
                      COUNT(*) AS samples
               FROM posture_logs
               WHERE date(timestamp)=? AND posture_score IS NOT NULL
               GROUP BY hour ORDER BY hour""", (day,))

    def alerts(self, day: Optional[str] = None, limit: int = 200) -> list[dict]:
        if day:
            return self._q("SELECT * FROM alert_history WHERE date(timestamp)=? "
                           "ORDER BY alert_id DESC LIMIT ?", (day, limit))
        return self._q("SELECT * FROM alert_history ORDER BY alert_id DESC LIMIT ?", (limit,))

    def get_stats(self, date_range: str = "weekly") -> dict:
        today = date.today()
        days = 7 if date_range == "weekly" else 30
        this_week = self.weekly(days)
        last_week = self.weekly(days, today - timedelta(days=days))

        def avg_score(rows):
            s = [r["health_score"] for r in rows if r.get("health_score") is not None]
            return round(sum(s) / len(s), 1) if s else None

        scored = [r for r in this_week if r.get("health_score") is not None]
        best = max(scored, key=lambda r: r["health_score"]) if scored else None
        return {
            "today": self.fetch_summary(today.isoformat()),
            "week": this_week,
            "hourly": self.hourly(today.isoformat()),
            "avg_score": avg_score(this_week),
            "prev_avg_score": avg_score(last_week),
            "total_alerts": sum(r["alerts_triggered"] for r in this_week),
            "best_day": best,
            "alerts_today": self.alerts(today.isoformat()),
        }

    # ---------------------------------------------------------- maintenance
    def export_csv(self, path: str) -> int:
        rows = self._q("SELECT * FROM posture_logs ORDER BY log_id")
        with open(path, "w", newline="", encoding="utf-8") as fh:
            if not rows:
                fh.write("no data\n")
                return 0
            w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        return len(rows)

    def clear_history(self):
        with self.lock:
            for t in ("posture_logs", "alert_history", "daily_summary", "app_sessions"):
                self.connection.execute(f"DELETE FROM {t}")
            self.connection.commit()
