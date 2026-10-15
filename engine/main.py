"""
Desk-Health-AI - Python AI Processing Engine.

Spawned and controlled by the Electron main process. Communication is
newline-delimited JSON:
  stdin  <- commands  {"id": 7, "cmd": "get_stats", "args": {...}}
  stdout -> responses {"type": "response", "id": 7, "ok": true, "data": ...}
            events    {"type": "status" | "alert" | "frame" | "calibration" | "log" ...}

Run standalone for debugging:  python main.py --db ./dev.db
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import queue
import sys
import threading
import time
import traceback
from datetime import date

from database import DatabaseManager
from notifier import NotificationManager
from posture import Baseline, Features, FeatureSmoother, PostureAnalyzer

CALIBRATION_SAMPLES = 15
CALIBRATION_FPS = 5
LOG_INTERVAL_S = 5
FLUSH_INTERVAL_S = 15
DARK_BRIGHTNESS = 40

_out_lock = threading.Lock()


def emit(obj: dict):
    line = json.dumps(obj, default=str)
    with _out_lock:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def log(msg: str, level: str = "info"):
    emit({"type": "log", "level": level, "msg": msg})


class Engine:
    def __init__(self, db_path: str):
        self.db = DatabaseManager(db_path)
        self.db.connect()
        self.settings = self.db.get_settings()
        self.commands: queue.Queue = queue.Queue()
        self.running = True

        self.paused_reasons: set[str] = set()
        self.preview = False
        self.session_id = None
        self.vision = None
        self.last_camera_try = 0.0

        self.notifier = NotificationManager(self.settings["alert_timer_mins"],
                                            self.settings["too_close_seconds"])
        self.smoother = FeatureSmoother(alpha=0.5)
        self.analyzer = None
        self._load_calibration()

        self.calibrating = None          # dict while calibration runs
        self.last_tick = None
        self.pending: dict[str, dict] = {}
        self.last_flush = time.time()
        self.last_log = 0.0
        self.last_result = None
        self.last_distance = None
        self.camera_error = None
        self.reconnecting = False
        self.failed_opens = 0
        self.failed_reads = 0
        self.dark_notified = 0.0

    # ----------------------------------------------------------- helpers
    def _load_calibration(self):
        cal = self.db.get_calibration()
        if cal:
            self.analyzer = PostureAnalyzer(Baseline.from_dict(cal),
                                            self.settings["posture_threshold"] / 100)
        else:
            self.analyzer = None

    def _apply_settings(self):
        s = self.settings
        self.notifier.alert_threshold_mins = s["alert_timer_mins"]
        self.notifier.too_close_seconds = s["too_close_seconds"]
        if self.analyzer:
            self.analyzer.threshold = s["posture_threshold"] / 100
        if self.vision:
            self.vision.target_fps = s["target_fps"]
            if s.get("focal_scale"):
                self.vision.focal_scale = s["focal_scale"]
            if self.vision.camera_idx != s["camera_idx"]:
                self.vision.camera_idx = s["camera_idx"]
                self.vision.pause_stream()

    @property
    def paused(self) -> bool:
        return bool(self.paused_reasons)

    # ---------------------------------------------------------- commands
    def handle(self, msg: dict):
        cmd, args, mid = msg.get("cmd"), msg.get("args") or {}, msg.get("id")
        try:
            data = self.dispatch(cmd, args)
            if mid is not None:
                emit({"type": "response", "id": mid, "ok": True, "data": data})
        except Exception as e:  # never crash the engine on a bad command
            log(str(e) if isinstance(e, (ValueError, KeyError)) else traceback.format_exc(), "error")
            if mid is not None:
                emit({"type": "response", "id": mid, "ok": False, "error": str(e)})

    def dispatch(self, cmd: str, a: dict):
        if cmd == "get_stats":
            self._flush()
            return self.db.get_stats(a.get("date_range", "weekly"))
        if cmd == "get_settings":
            return self.db.get_settings()
        if cmd == "update_settings":
            self.db.update_settings(a)
            self.settings = self.db.get_settings()
            self._apply_settings()
            return self.settings
        if cmd == "reset_settings":
            self.db.reset_settings()
            self.settings = self.db.get_settings()
            self._apply_settings()
            return self.settings
        if cmd == "pause":
            self.paused_reasons.add(a.get("reason", "user"))
            if self.vision:
                self.vision.pause_stream()      # release hardware lock immediately
            self._end_session()
            self.notifier.reset_timer()
            self.emit_status()
            return True
        if cmd == "resume":
            reason = a.get("reason")
            if reason:
                self.paused_reasons.discard(reason)
            else:
                self.paused_reasons.clear()
            if not self.paused:
                # reopen right away; old errors are stale after a pause
                self.camera_error = None
                self.last_result = None
                self.last_camera_try = 0.0
                self.failed_opens = 0
                self.reconnecting = True
            self.emit_status()
            return True
        if cmd == "snooze":
            self.notifier.snooze(float(a.get("minutes", 15)))
            return {"snoozed_until": self.notifier.snoozed_until}
        if cmd == "unsnooze":
            self.notifier.unsnooze()
            return True
        if cmd == "calibrate":
            self.calibrating = {"samples": [], "face": [],
                                "known_distance_cm": a.get("known_distance_cm")}
            self.smoother.reset()
            return True
        if cmd == "clear_calibration":
            self.db.save_calibration(None)
            self.analyzer = None
            self.settings = self.db.get_settings()
            return True
        if cmd == "set_preview":
            self.preview = bool(a.get("enabled"))
            return True
        if cmd == "list_cameras":
            from vision import AIVisionEngine
            current = self.vision.camera_idx if self.vision and self.vision.is_tracking else None
            return AIVisionEngine.list_cameras(skip=current)
        if cmd == "alert_action":
            self.db.set_alert_action(int(a["alert_id"]), a.get("action", "Dismissed"))
            return True
        if cmd == "export_csv":
            return {"rows": self.db.export_csv(a["path"])}
        if cmd == "clear_history":
            self.db.clear_history()
            self.pending.clear()
            self.session_id = None
            return True
        if cmd == "get_status":
            return self.status_dict()
        if cmd == "shutdown":
            self.running = False
            return True
        raise ValueError(f"unknown command: {cmd}")

    # ------------------------------------------------------------ status
    def status_dict(self) -> dict:
        r = self.last_result
        if self.paused:
            state = "Paused"
        elif self.reconnecting and not self.camera_error:
            state = "Starting"
        elif self.camera_error:
            state = "NoCamera"
        elif self.calibrating is not None:
            state = "Calibrating"
        elif r is None:
            state = "Away" if self.vision and self.vision.is_tracking else "Starting"
        else:
            state = r["state"]
        too_close = bool(self.settings["eye_strain_tracking"] and self.last_distance
                         and self.last_distance < self.settings["min_distance_cm"])
        return {
            "type": "status",
            "state": state,
            "paused_reasons": sorted(self.paused_reasons),
            "calibrated": self.analyzer is not None,
            "camera_error": self.camera_error,
            "posture": r,
            "distance_cm": round(self.last_distance, 1) if self.last_distance else None,
            "too_close": too_close,
            "snoozed_until": self.notifier.snoozed_until if self.notifier.is_snoozed else None,
            "slouch_seconds": int(self.notifier.slouch_seconds()),
            "session_id": self.session_id,
        }

    def emit_status(self):
        emit(self.status_dict())

    # ----------------------------------------------------------- sessions
    def _start_session(self):
        if self.session_id is None:
            self.session_id = self.db.start_session()

    def _end_session(self):
        self._flush()
        if self.session_id:
            self.db.end_session(self.session_id)
        self.session_id = None
        self.last_tick = None

    def _flush(self):
        for day, acc in list(self.pending.items()):
            self.db.add_time(day, **acc)
        self.pending.clear()
        self.last_flush = time.time()

    def _accumulate(self, dt: float, state: str, too_close: bool, score):
        day = date.today().isoformat()
        acc = self.pending.setdefault(day, {"active": 0.0, "slouch": 0.0, "resting": 0.0,
                                            "close": 0.0, "score_sum": 0.0, "score_samples": 0})
        if state in ("Healthy", "Slouching", "Resting"):
            acc["active"] += dt
        if state == "Slouching":
            acc["slouch"] += dt
        if state == "Resting":
            acc["resting"] += dt
        if too_close:
            acc["close"] += dt
        if score is not None and state in ("Healthy", "Slouching"):
            acc["score_sum"] += score
            acc["score_samples"] += 1

    # --------------------------------------------------------- main loop
    def ensure_camera(self) -> bool:
        if self.vision is None:
            from vision import AIVisionEngine
            log("loading MediaPipe models...")
            self.vision = AIVisionEngine(self.settings["camera_idx"], self.settings["target_fps"])
            if self.settings.get("focal_scale"):
                self.vision.focal_scale = self.settings["focal_scale"]
        if self.vision.is_tracking:
            return True
        now = time.time()
        if now - self.last_camera_try < 2.0:     # retry every 2 s (NFR-01)
            return False
        self.last_camera_try = now
        if self.vision.start_stream():
            self.camera_error = None
            self.reconnecting = False
            self.failed_opens = 0
            self.failed_reads = 0
            self._start_session()
            log(f"camera {self.vision.camera_idx} opened")
            self.emit_status()
            return True
        self.failed_opens += 1
        log(f"camera open attempt {self.failed_opens} failed: {self.vision.last_error}", "warn")
        # first attempts after start/resume often fail while the driver frees the
        # device - keep showing "starting" and only report an error if it persists
        if self.failed_opens < 3:
            return False
        self.reconnecting = False
        if self.camera_error != "unavailable":
            self.camera_error = "unavailable"
            emit({"type": "camera_error", "msg": "Camera disconnected or in use"})
            self.emit_status()
        return False

    def process_once(self):
        frame = self.vision.read()
        if frame is None:
            # a single dropped frame is normal on Windows webcams; only treat
            # several in a row as a disconnect
            self.failed_reads += 1
            if self.failed_reads < 5:
                return
            self.failed_reads = 0
            self.vision.pause_stream()
            self.camera_error = "disconnected"
            self.last_result = None
            self._end_session()
            emit({"type": "camera_error", "msg": "Camera disconnected"})
            self.emit_status()
            return

        self.failed_reads = 0
        analysis = self.vision.process_frame(frame)
        now = time.time()
        dt = min(now - self.last_tick, 3.0) if self.last_tick else 0.0
        self.last_tick = now

        if analysis.brightness < DARK_BRIGHTNESS and now - self.dark_notified > 600:
            self.dark_notified = now
            emit({"type": "alert", "alert_type": "Low_Light", "title": "Room is too dark",
                  "message": "Please turn on a light so your posture can be tracked accurately.",
                  "notify": self.settings["desktop_notifications"]})

        obs = analysis.observation
        self.last_distance = analysis.distance_cm if self.settings["eye_strain_tracking"] else None
        too_close = bool(self.last_distance and self.last_distance < self.settings["min_distance_cm"])

        result = None
        state = "Away"
        if obs is not None:
            feats = self.smoother.update(Features.from_observation(obs))
            if self.calibrating is not None:
                self._calibration_step(Features.from_observation(obs), analysis)
                state = "Calibrating"
            elif self.analyzer is not None:
                result = self.analyzer.analyze(feats).to_dict()
                state = result["state"]
            else:
                state = "Uncalibrated"
        else:
            self.smoother.reset()
            if self.analyzer:
                self.analyzer.reset()
            if self.calibrating is not None:
                emit({"type": "calibration", "status": "waiting",
                      "msg": "Sit in front of the camera so your shoulders are visible."})

        self.last_result = result if result else ({"state": state} if obs is not None else None)

        if state != "Calibrating":
            posture_state = state if self.analyzer else "Unknown"
            alerts = self.notifier.evaluate_posture_state(posture_state, too_close, now)
            for a in alerts:
                a["alert_id"] = self.db.save_alert(self.session_id, a["alert_type"],
                                                   a["duration_seconds"])
                a["notify"] = self.settings["desktop_notifications"]
                emit({"type": "alert", **a})
            self._accumulate(dt, state, too_close, result["posture_score"] if result else None)

            if now - self.last_log >= LOG_INTERVAL_S and state in ("Healthy", "Slouching", "Resting"):
                self.last_log = now
                log_row = {"posture_state": state, "screen_distance": self.last_distance}
                if result:
                    log_row.update(result)
                self.db.save_log(self.session_id, log_row)

        if now - self.last_flush >= FLUSH_INTERVAL_S:
            self._flush()

        self.emit_status()
        if self.preview:
            jpg = self.vision.render_preview(frame, analysis, state)
            emit({"type": "frame", "jpeg": base64.b64encode(jpg).decode("ascii")})
        del frame   # frame is never written anywhere

    def _calibration_step(self, feats: Features, analysis):
        c = self.calibrating
        c["samples"].append(feats)
        if analysis.face_measure:
            c["face"].append(analysis.face_measure)
        n = len(c["samples"])
        emit({"type": "calibration", "status": "progress",
              "progress": round(n / CALIBRATION_SAMPLES, 2)})
        if n < CALIBRATION_SAMPLES:
            return

        from distance import focal_scale_from_known_distance, estimate_distance_cm
        focal = None
        known = c.get("known_distance_cm")
        if known and c["face"]:
            vals = [focal_scale_from_known_distance(m, analysis.width, float(known))
                    for m in c["face"]]
            vals = sorted(v for v in vals if v)
            if vals:
                focal = vals[len(vals) // 2]
                self.vision.focal_scale = focal
                # re-compute distances with the corrected focal length
                for s, m in zip(c["samples"], c["face"]):
                    s.distance_cm = estimate_distance_cm(m, analysis.width, focal)

        baseline = Baseline.from_samples(c["samples"])
        self.db.save_calibration(baseline.to_dict(), focal)
        self.settings = self.db.get_settings()
        self.analyzer = PostureAnalyzer(baseline, self.settings["posture_threshold"] / 100)
        self.smoother.reset()
        self.notifier.reset_timer()
        self.calibrating = None
        emit({"type": "calibration", "status": "done", "baseline": baseline.to_dict()})
        log("calibration saved")

    def run(self):
        emit({"type": "ready", "settings": self.settings})
        while self.running:
            try:
                while True:
                    self.handle(self.commands.get_nowait())
            except queue.Empty:
                pass

            if self.paused:
                time.sleep(0.2)
                continue
            try:
                if not self.ensure_camera():
                    time.sleep(0.2)
                    continue
                started = time.time()
                self.process_once()
                fps = CALIBRATION_FPS if self.calibrating is not None else self.settings["target_fps"]
                period = 1.0 / max(1, fps)
                # sleep in small steps so commands (pause!) are handled within ~0.1 s
                while self.running and time.time() - started < period:
                    try:
                        self.handle(self.commands.get(timeout=0.1))
                    except queue.Empty:
                        pass
            except Exception:
                log(traceback.format_exc(), "error")
                time.sleep(1)

        self._end_session()
        if self.vision:
            self.vision.close()
        self.db.close_connection()


def stdin_reader(engine: Engine):
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            engine.commands.put(json.loads(line))
        except json.JSONDecodeError:
            log(f"bad command: {line[:80]}", "warn")
    # parent process closed the pipe -> shut down; force-exit if the main loop
    # is busy (e.g. waiting for a camera) so no orphan process is left behind
    engine.commands.put({"cmd": "shutdown"})
    threading.Timer(4.0, os._exit, args=(0,)).start()


def main():
    ap = argparse.ArgumentParser()
    default_db = os.path.join(os.path.expanduser("~"), ".desk-health-ai", "deskhealth.db")
    ap.add_argument("--db", default=default_db)
    args = ap.parse_args()
    engine = Engine(args.db)
    threading.Thread(target=stdin_reader, args=(engine,), daemon=True).start()
    engine.run()


if __name__ == "__main__":
    main()
