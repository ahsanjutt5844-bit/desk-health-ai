"""
Posture mathematics for Desk-Health-AI.

Slouching model
---------------
    Slouching = Forward Head Posture
              + Thoracic Kyphosis (Rounded / Dropped Shoulders)
              + Posterior Pelvic Tilt (Tucked Tailbone)

A laptop / desktop webcam looks at the user from the FRONT, so we cannot
measure true side-view (sagittal) angles directly. Instead every component is
measured as a change against the user's own calibrated upright posture:

1. Thoracic Kyphosis / Rounded Shoulders  (PRIMARY signal, weight 0.50)
   When a person slouches the shoulders go DOWN and lean FORWARD.
     - shoulder drop     : shoulder line moves down in the image
     - shoulder forward  : shoulders come closer to the camera, so the
                           shoulder width in pixels grows
     - shoulder rounding : shoulders roll inward, so the shoulder width
                           shrinks although the user did not move back

2. Forward Head Posture  (secondary signal, weight 0.30)
   The head moves forward/down in front of the shoulders, so the vertical
   ear-to-shoulder distance (normalised by shoulder width) shrinks.
   neck_flexion = acos(current_gap / upright_gap)

3. Posterior Pelvic Tilt (proxy, weight 0.20)
   The pelvis is usually hidden by the desk, so it is inferred:
     - hips visible  : torso (shoulder-to-hip) length shrinks
     - hips hidden   : the whole trunk (head AND shoulders) sinks down,
                       which is what happens when the tailbone tucks and the
                       user slides down in the chair

    slouch_index = 0.50*Kyphosis + 0.30*FHP + 0.20*PelvicTilt     (0..1)

The user is SLOUCHING only when slouch_index >= threshold AND the shoulder
component itself is significant. Moving only the neck (e.g. looking down at a
phone) is therefore NOT reported as slouching - the shoulders are the focus.

This module is pure Python (no OpenCV / MediaPipe) so it can be unit tested.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, asdict, field
from typing import Optional

# Component weights of the slouching formula
W_KYPHOSIS = 0.50
W_FORWARD_HEAD = 0.30
W_PELVIC = 0.20

# The shoulder component must be at least this large before we call it slouching
SHOULDER_GATE = 0.30

# Average adult biacromial (shoulder) width and seated torso length in cm.
# Only used to convert ratios into human readable centimetres / degrees.
AVG_SHOULDER_WIDTH_CM = 38.0
AVG_TORSO_LENGTH_CM = 50.0


def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def severity(value: float, deadzone: float, full: float) -> float:
    """Map a raw deviation to 0..1. Below `deadzone` -> 0, at `full` -> 1."""
    if value <= deadzone:
        return 0.0
    return clamp((value - deadzone) / (full - deadzone))


@dataclass
class Observation:
    """Landmarks of one frame, already converted to PIXEL coordinates."""
    l_shoulder: tuple[float, float]
    r_shoulder: tuple[float, float]
    l_ear: tuple[float, float]
    r_ear: tuple[float, float]
    nose: tuple[float, float]
    face_width: Optional[float] = None      # px, from face mesh (cheek to cheek)
    l_hip: Optional[tuple[float, float]] = None
    r_hip: Optional[tuple[float, float]] = None
    distance_cm: Optional[float] = None     # face-to-screen distance


@dataclass
class Features:
    """Scale-aware measurements derived from an Observation."""
    shoulder_width: float
    shoulder_y: float
    nose_y: float
    neck_gap: float           # vertical ear-mid -> shoulder-mid distance (px)
    face_width: float
    torso: Optional[float]    # vertical shoulder-mid -> hip-mid (px), if hips visible
    distance_cm: Optional[float]

    @staticmethod
    def from_observation(o: Observation) -> "Features":
        sw = math.dist(o.l_shoulder, o.r_shoulder)
        sh_y = (o.l_shoulder[1] + o.r_shoulder[1]) / 2
        ear_y = (o.l_ear[1] + o.r_ear[1]) / 2
        face_w = o.face_width if o.face_width else math.dist(o.l_ear, o.r_ear)
        torso = None
        if o.l_hip and o.r_hip:
            torso = (o.l_hip[1] + o.r_hip[1]) / 2 - sh_y
        return Features(
            shoulder_width=sw,
            shoulder_y=sh_y,
            nose_y=o.nose[1],
            neck_gap=sh_y - ear_y,
            face_width=face_w,
            torso=torso,
            distance_cm=o.distance_cm,
        )


class FeatureSmoother:
    """Exponential moving average to remove landmark jitter between frames."""

    def __init__(self, alpha: float = 0.5):
        self.alpha = alpha
        self.state: Optional[Features] = None

    def reset(self):
        self.state = None

    def update(self, f: Features) -> Features:
        if self.state is None:
            self.state = f
            return f
        a = self.alpha
        s = self.state

        def mix(new, old):
            if new is None:
                return None
            if old is None:
                return new
            return a * new + (1 - a) * old

        self.state = Features(
            shoulder_width=mix(f.shoulder_width, s.shoulder_width),
            shoulder_y=mix(f.shoulder_y, s.shoulder_y),
            nose_y=mix(f.nose_y, s.nose_y),
            neck_gap=mix(f.neck_gap, s.neck_gap),
            face_width=mix(f.face_width, s.face_width),
            torso=mix(f.torso, s.torso),
            distance_cm=mix(f.distance_cm, s.distance_cm),
        )
        return self.state


@dataclass
class Baseline:
    """The user's upright posture, captured during calibration."""
    shoulder_width: float
    shoulder_y: float
    nose_y: float
    neck_gap: float
    face_width: float
    torso: Optional[float] = None
    distance_cm: Optional[float] = None

    @staticmethod
    def from_samples(samples: list[Features]) -> "Baseline":
        if not samples:
            raise ValueError("no calibration samples")

        def med(attr):
            vals = [getattr(s, attr) for s in samples if getattr(s, attr) is not None]
            return statistics.median(vals) if vals else None

        torso_vals = [s.torso for s in samples if s.torso is not None]
        # only trust hips if they were visible most of the time
        torso = statistics.median(torso_vals) if len(torso_vals) >= len(samples) * 0.7 else None
        return Baseline(
            shoulder_width=med("shoulder_width"),
            shoulder_y=med("shoulder_y"),
            nose_y=med("nose_y"),
            neck_gap=med("neck_gap"),
            face_width=med("face_width"),
            torso=torso,
            distance_cm=med("distance_cm"),
        )

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(d: dict) -> "Baseline":
        return Baseline(**d)


@dataclass
class PostureResult:
    state: str                    # 'Healthy' | 'Slouching' | 'Resting'
    slouch_index: float           # 0..1
    posture_score: int            # 0..100 (100 = perfect)
    kyphosis: float               # 0..1 shoulder component
    forward_head: float           # 0..1
    pelvic_tilt: float            # 0..1
    shoulder_drop_cm: float
    shoulder_forward_cm: float
    shoulder_angle: float         # estimated forward lean of the shoulders (deg)
    neck_angle: float             # estimated neck flexion (deg)
    details: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        for k, v in d.items():
            if isinstance(v, float):
                d[k] = round(v, 3)
        return d


class PostureAnalyzer:
    """Compares the current (smoothed) features against the calibrated baseline."""

    def __init__(self, baseline: Baseline, threshold: float = 0.35):
        self.baseline = baseline
        self.threshold = threshold
        self._slouching = False

    def reset(self):
        self._slouching = False

    def analyze(self, f: Features) -> PostureResult:
        b = self.baseline
        sw = f.shoulder_width

        # ---- 1. Thoracic kyphosis / rounded & dropped shoulders ----------
        # positive = shoulders went down (image y grows downward)
        drop_ratio = (f.shoulder_y - b.shoulder_y) / b.shoulder_width
        # positive = shoulders came closer to the camera (leaning forward)
        forward_ratio = sw / b.shoulder_width - 1.0
        # positive = shoulders look narrower although the body did not move
        # back from the screen -> shoulders rolled inward (protraction).
        # (Comparing against face width is NOT used: a forward head makes the
        # face look bigger and would be mistaken for rounded shoulders.)
        if b.distance_cm and f.distance_cm:
            moved_back = f.distance_cm - b.distance_cm > 4.0
        else:
            moved_back = f.face_width / b.face_width < 0.95
        round_ratio = 0.0 if moved_back else 1.0 - sw / b.shoulder_width

        s_drop = severity(drop_ratio, 0.04, 0.18)
        s_forward = severity(forward_ratio, 0.03, 0.18)
        s_round = severity(round_ratio, 0.04, 0.15)
        kyphosis = clamp(s_drop + 0.8 * s_forward + 0.6 * s_round)

        # ---- 2. Forward head posture --------------------------------------
        # neck gap normalised by shoulder width cancels out scale changes
        gap_ratio = (f.neck_gap / sw) / (b.neck_gap / b.shoulder_width)
        neck_angle = math.degrees(math.acos(clamp(gap_ratio)))
        forward_head = severity(neck_angle, 12.0, 40.0)

        # ---- 3. Posterior pelvic tilt (proxy) -----------------------------
        nose_drop_ratio = (f.nose_y - b.nose_y) / b.shoulder_width
        if b.torso and f.torso:
            torso_loss = 1.0 - (f.torso / sw) / (b.torso / b.shoulder_width)
            pelvic = severity(torso_loss, 0.05, 0.20)
            pelvic_source = "torso"
        else:
            # whole trunk sinking: head AND shoulders both moved down
            sink = min(drop_ratio, nose_drop_ratio)
            pelvic = severity(sink, 0.05, 0.22)
            pelvic_source = "trunk_sink"

        # ---- Combine with the slouching formula ---------------------------
        index = W_KYPHOSIS * kyphosis + W_FORWARD_HEAD * forward_head + W_PELVIC * pelvic
        index = clamp(index)

        # ---- Convert to centimetres / degrees for display & logging -------
        if b.distance_cm:
            # real shoulder width from calibration: W = px * distance / focal
            # forward displacement from the pinhole model: d0 * (1 - w0 / w)
            shoulder_forward_cm = b.distance_cm * (1.0 - b.shoulder_width / sw)
        else:
            shoulder_forward_cm = 60.0 * forward_ratio
        shoulder_drop_cm = drop_ratio * AVG_SHOULDER_WIDTH_CM
        shoulder_angle = math.degrees(
            math.atan2(shoulder_forward_cm, AVG_TORSO_LENGTH_CM - shoulder_drop_cm)
        )

        # ---- Resting: user leaned far back in the chair (US-07) ----------
        leaned_back = forward_ratio <= -0.10
        if leaned_back and b.distance_cm and f.distance_cm:
            leaned_back = f.distance_cm >= b.distance_cm * 1.10

        if leaned_back:
            state = "Resting"
            self._slouching = False
        else:
            enter = index >= self.threshold and kyphosis >= SHOULDER_GATE
            stay = index >= self.threshold - 0.07 and kyphosis >= SHOULDER_GATE - 0.05
            self._slouching = stay if self._slouching else enter
            state = "Slouching" if self._slouching else "Healthy"

        return PostureResult(
            state=state,
            slouch_index=index,
            posture_score=int(round(100 * (1.0 - index))),
            kyphosis=kyphosis,
            forward_head=forward_head,
            pelvic_tilt=pelvic,
            shoulder_drop_cm=shoulder_drop_cm,
            shoulder_forward_cm=shoulder_forward_cm,
            shoulder_angle=shoulder_angle,
            neck_angle=neck_angle,
            details={
                "drop_ratio": round(drop_ratio, 3),
                "forward_ratio": round(forward_ratio, 3),
                "round_ratio": round(round_ratio, 3),
                "s_drop": round(s_drop, 3),
                "s_forward": round(s_forward, 3),
                "s_round": round(s_round, 3),
                "pelvic_source": pelvic_source,
            },
        )
