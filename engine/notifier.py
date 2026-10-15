"""
NotificationManager - timer & threshold logic that prevents "alert fatigue".

* Posture alert : only after the user has slouched CONTINUOUSLY for
                  `alert_threshold_mins` (default 3). Short corrections of a few
                  seconds do not reset the timer, sitting properly does.
* Distance alert: when the face stays closer than the minimum distance for
                  `too_close_seconds`, the user is asked to move back.
                  Repeats at most every `distance_cooldown_s` seconds.
* Resting / Away: timers are paused and reset.
* Snooze        : all alerts suppressed until the snooze ends.
"""

from __future__ import annotations

import time
from typing import Optional


class NotificationManager:
    POSTURE_GRACE_S = 8.0          # good posture shorter than this keeps the timer
    DISTANCE_COOLDOWN_S = 60.0

    def __init__(self, alert_threshold_mins: float = 3, too_close_seconds: float = 5):
        self.alert_threshold_mins = alert_threshold_mins
        self.too_close_seconds = too_close_seconds
        self.slouch_start: Optional[float] = None
        self.last_slouch_seen: Optional[float] = None
        self.close_start: Optional[float] = None
        self.last_distance_alert = 0.0
        self.snoozed_until = 0.0
        self.alert_count = 0

    # ------------------------------------------------------------------
    @property
    def is_snoozed(self) -> bool:
        return time.time() < self.snoozed_until

    def snooze(self, minutes: float):
        self.snoozed_until = time.time() + minutes * 60
        self.reset_timer()

    def unsnooze(self):
        self.snoozed_until = 0.0

    def reset_timer(self):
        self.slouch_start = None
        self.last_slouch_seen = None
        self.close_start = None

    def slouch_seconds(self, now: Optional[float] = None) -> float:
        if self.slouch_start is None:
            return 0.0
        return (time.time() if now is None else now) - self.slouch_start

    # ------------------------------------------------------------------
    def evaluate_posture_state(self, state: str, too_close: bool,
                               now: Optional[float] = None) -> list[dict]:
        """Feed the latest classification. Returns alerts to be fired."""
        now = time.time() if now is None else now
        alerts: list[dict] = []

        # ---- posture ----
        if state == "Slouching":
            if self.slouch_start is None:
                self.slouch_start = now
            self.last_slouch_seen = now
        elif state == "Healthy":
            if self.last_slouch_seen and now - self.last_slouch_seen > self.POSTURE_GRACE_S:
                self.slouch_start = None
                self.last_slouch_seen = None
        else:  # Resting / Away
            self.slouch_start = None
            self.last_slouch_seen = None

        if self.slouch_start is not None:
            duration = now - self.slouch_start
            if duration >= self.alert_threshold_mins * 60:
                if not self.is_snoozed:
                    alerts.append({
                        "alert_type": "Posture_Violation",
                        "title": "Posture Warning",
                        "message": (f"You have been slouching for {int(duration // 60)} min. "
                                    "Lift your chest, pull your shoulders back and up, "
                                    "and sit back in your chair."),
                        "duration_seconds": int(duration),
                    })
                # restart the timer so the next alert needs another full period
                self.slouch_start = now

        # ---- distance (eye strain) ----
        if too_close and state != "Away":
            if self.close_start is None:
                self.close_start = now
            held = now - self.close_start
            if (held >= self.too_close_seconds
                    and now - self.last_distance_alert >= self.DISTANCE_COOLDOWN_S
                    and not self.is_snoozed):
                alerts.append({
                    "alert_type": "Eye_Strain",
                    "title": "Too close to the screen",
                    "message": "Your face is too close to the screen. "
                               "Please move back to about an arm's length (50-70 cm).",
                    "duration_seconds": int(held),
                })
                self.last_distance_alert = now
        else:
            self.close_start = None

        self.alert_count += len(alerts)
        return alerts
