"""
Face-to-screen distance estimation (eye strain module).

Uses the pinhole camera model:   distance = focal_px * real_size_cm / size_px

Two anatomical "rulers" from MediaPipe FaceLandmarker (478 points):
  * Iris diameter       ~ 1.17 cm  (almost identical for all adults)
  * Inter-pupil distance ~ 6.3 cm  (adult average)
Both estimates are averaged for stability.

The focal length of an unknown webcam is approximated from its field of view
(focal_px = frame_width * focal_scale). The user can make it exact by doing a
one-time distance calibration (sitting at a measured distance).
"""

from __future__ import annotations

import math
from typing import Optional

IRIS_DIAMETER_CM = 1.17
IPD_CM = 6.3
DEFAULT_FOCAL_SCALE = 0.85   # ~ 61 degree horizontal FOV, typical laptop webcam

# FaceLandmarker iris indices (only present in the 478-point model)
LEFT_IRIS = (474, 476)    # horizontal edges
RIGHT_IRIS = (469, 471)
LEFT_IRIS_CENTER = 473
RIGHT_IRIS_CENTER = 468
# cheek-to-cheek face width (used for shoulder rounding ratio)
FACE_LEFT = 234
FACE_RIGHT = 454


def _px(lm, w, h):
    return (lm.x * w, lm.y * h)


def face_measurements(face_landmarks, w: int, h: int) -> dict:
    """Return iris diameter, inter-pupil distance and face width in pixels."""
    lm = face_landmarks
    out = {"face_width": math.dist(_px(lm[FACE_LEFT], w, h), _px(lm[FACE_RIGHT], w, h))}
    if len(lm) >= 478:
        li = math.dist(_px(lm[LEFT_IRIS[0]], w, h), _px(lm[LEFT_IRIS[1]], w, h))
        ri = math.dist(_px(lm[RIGHT_IRIS[0]], w, h), _px(lm[RIGHT_IRIS[1]], w, h))
        out["iris_px"] = (li + ri) / 2
        out["ipd_px"] = math.dist(
            _px(lm[LEFT_IRIS_CENTER], w, h), _px(lm[RIGHT_IRIS_CENTER], w, h)
        )
    return out


def estimate_distance_cm(measure: dict, frame_width: int,
                         focal_scale: float = DEFAULT_FOCAL_SCALE) -> Optional[float]:
    focal = frame_width * focal_scale
    estimates = []
    if measure.get("iris_px", 0) > 2:
        estimates.append(focal * IRIS_DIAMETER_CM / measure["iris_px"])
    if measure.get("ipd_px", 0) > 5:
        estimates.append(focal * IPD_CM / measure["ipd_px"])
    if not estimates:
        return None
    return sum(estimates) / len(estimates)


def focal_scale_from_known_distance(measure: dict, frame_width: int,
                                    known_cm: float) -> Optional[float]:
    """Solve the focal scale when the user tells us their real distance."""
    d_default = estimate_distance_cm(measure, frame_width, 1.0)
    if not d_default:
        return None
    # distance is linear in focal_scale
    return known_cm / d_default
