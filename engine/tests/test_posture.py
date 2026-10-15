"""
Tests for the slouch formula using a simulated 3-D seated body that is
projected through a pinhole camera (the same geometry as a real webcam).

Run:  python -m pytest engine/tests -q     (or python engine/tests/test_posture.py)
"""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from posture import (Baseline, Features, Observation, PostureAnalyzer)  # noqa: E402
from notifier import NotificationManager  # noqa: E402

F = 544.0            # focal length in px (640 px wide webcam)
CX, CY = 320.0, 240.0
DIST = 60.0          # cm, upright face-to-camera distance
CAM_DROP = 15.0      # body y-offset so the eyes sit ~8 cm above the webcam


def project(p):
    x, y, z = p
    y += CAM_DROP
    return (CX + F * x / z, CY + F * y / z)


def rot_x(p, pivot, deg):
    """Rotate point around a horizontal (x) axis through pivot.
    Positive deg = top of the body moves TOWARD the camera (forward lean)."""
    a = math.radians(deg)
    y, z = p[1] - pivot[1], p[2] - pivot[2]
    # y up is negative; leaning forward moves upper points to smaller z
    ny = y * math.cos(a) - z * math.sin(a)
    nz = y * math.sin(a) + z * math.cos(a)
    return (p[0], pivot[1] + ny, pivot[2] + nz)


def body(trunk_lean=0.0, shoulder_drop=0.0, protraction=0.0, neck_flex=0.0,
         slide_down=0.0, move_z=0.0, hips_visible=False):
    """Return an Observation for a seated person.
    Units are cm; camera at origin looking +z; y grows downward."""
    z0 = DIST + move_z
    hip = (0.0, 45.0 + slide_down, z0 + 5)
    sh_y = -5.0 + slide_down + shoulder_drop
    half_sw = 19.0 - protraction
    sh_z = z0 + 5 - protraction * 0.8        # protracted shoulders roll forward
    l_sh, r_sh = (half_sw, sh_y, sh_z), (-half_sw, sh_y, sh_z)
    neck_base = (0.0, sh_y, z0 + 5)
    head = {"l_ear": (7.5, -22.0 + slide_down + shoulder_drop, z0 + 4),
            "r_ear": (-7.5, -22.0 + slide_down + shoulder_drop, z0 + 4),
            "nose": (0.0, -20.0 + slide_down + shoulder_drop, z0 - 5),
            "l_cheek": (7.0, -20.0 + slide_down + shoulder_drop, z0),
            "r_cheek": (-7.0, -20.0 + slide_down + shoulder_drop, z0),
            "l_eye": (3.15, -23.0 + slide_down + shoulder_drop, z0 - 2),
            "r_eye": (-3.15, -23.0 + slide_down + shoulder_drop, z0 - 2)}
    # forward head: rotate the head around the base of the neck
    head = {k: rot_x(v, neck_base, neck_flex) for k, v in head.items()}
    pts = {"l_sh": l_sh, "r_sh": r_sh, **head}
    # trunk lean: everything above the hips rotates around the hips
    pts = {k: rot_x(v, hip, trunk_lean) for k, v in pts.items()}
    p2 = {k: project(v) for k, v in pts.items()}
    face_w = math.dist(p2["l_cheek"], p2["r_cheek"])
    eye_z = (pts["l_eye"][2] + pts["r_eye"][2]) / 2
    return Observation(
        l_shoulder=p2["l_sh"], r_shoulder=p2["r_sh"],
        l_ear=p2["l_ear"], r_ear=p2["r_ear"], nose=p2["nose"],
        face_width=face_w,
        l_hip=project((12, hip[1], hip[2])) if hips_visible else None,
        r_hip=project((-12, hip[1], hip[2])) if hips_visible else None,
        distance_cm=eye_z,
        img_cy=CY,
    )


def analyzer(hips=False):
    base = Baseline.from_samples([Features.from_observation(body(hips_visible=hips))] * 5)
    return PostureAnalyzer(base, threshold=0.35)


def analyze(**kw):
    hips = kw.get("hips_visible", False)
    return analyzer(hips).analyze(Features.from_observation(body(**kw)))


def test_upright_is_healthy():
    r = analyze()
    assert r.state == "Healthy"
    assert r.posture_score >= 95


def test_small_fidget_is_healthy():
    r = analyze(trunk_lean=4, neck_flex=5)
    assert r.state == "Healthy", r


def test_classic_slouch_detected():
    # shoulders go down and lean forward, rounded, head forward, tailbone tucked
    r = analyze(trunk_lean=15, shoulder_drop=4, protraction=2.5, neck_flex=20, slide_down=3)
    assert r.state == "Slouching", r
    assert r.kyphosis >= 0.5
    assert r.shoulder_drop_cm > 2 and r.shoulder_forward_cm > 5


def test_shoulders_down_and_forward_alone_is_slouch():
    # main focus: shoulders. Neck stays neutral.
    r = analyze(trunk_lean=18, shoulder_drop=5)
    assert r.state == "Slouching", r


def test_shoulders_down_only_is_slouching():
    # user report: shoulders go down from the calibrated position -> slouching
    r = analyze(shoulder_drop=3)
    assert r.state == "Slouching", r


def test_shoulders_forward_only_is_slouching():
    r = analyze(trunk_lean=8)
    assert r.state == "Slouching", r


def test_tiny_shoulder_movement_is_healthy():
    r = analyze(shoulder_drop=0.8)
    assert r.state == "Healthy", r


def test_slumping_back_is_slouching_not_resting():
    # user report: slouching while moving AWAY from the screen was shown as
    # Resting. Sliding down / slumping back = shoulders drop + body moves back.
    r = analyze(trunk_lean=-14, shoulder_drop=3, slide_down=3)
    assert r.state == "Slouching", r


def test_moving_back_hides_no_drop():
    # body moved back 15 cm with shoulders dropped 5 cm: the drop must still count
    r = analyze(move_z=15, shoulder_drop=5)
    assert r.state == "Slouching", r


def test_sitting_upright_further_away_is_healthy():
    r = analyze(move_z=15)
    assert r.state in ("Healthy", "Resting"), r
    assert r.kyphosis < 0.2, r


def test_neck_only_is_not_slouching():
    # looking down at the phone / keyboard: neck bends, shoulders stay
    r = analyze(neck_flex=35)
    assert r.forward_head > 0.5
    assert r.state == "Healthy", r


def test_lean_back_is_resting():
    r = analyze(trunk_lean=-18, move_z=0)
    assert r.state == "Resting", r


def test_sliding_down_in_chair_raises_pelvic_component():
    r = analyze(slide_down=6, shoulder_drop=2)
    assert r.pelvic_tilt > 0.3, r


def test_pelvic_with_visible_hips():
    r = analyze(slide_down=0, shoulder_drop=5, trunk_lean=10, hips_visible=True)
    assert r.details["pelvic_source"] == "torso"
    assert r.pelvic_tilt > 0, r


def test_score_drops_with_severity():
    mild = analyze(trunk_lean=8, shoulder_drop=1)
    bad = analyze(trunk_lean=20, shoulder_drop=5, protraction=2, neck_flex=25)
    assert bad.posture_score < mild.posture_score


def test_notifier_alerts_only_after_threshold():
    n = NotificationManager(alert_threshold_mins=3, too_close_seconds=5)
    t = 1000.0
    alerts = []
    for i in range(0, 179):           # 2:59 of slouching -> no alert
        alerts += n.evaluate_posture_state("Slouching", False, t + i)
    assert alerts == []
    alerts = n.evaluate_posture_state("Slouching", False, t + 181)
    assert alerts and alerts[0]["alert_type"] == "Posture_Violation"


def test_notifier_short_correction_keeps_timer_good_posture_resets():
    n = NotificationManager(alert_threshold_mins=1)
    n.evaluate_posture_state("Slouching", False, 0)
    n.evaluate_posture_state("Healthy", False, 3)        # 3 s blip
    n.evaluate_posture_state("Slouching", False, 5)
    assert n.slouch_start == 0
    n.evaluate_posture_state("Healthy", False, 20)       # sat straight > grace
    assert n.slouch_start is None


def test_too_close_alert_and_cooldown():
    n = NotificationManager(too_close_seconds=5)
    a = []
    for i in range(7):
        a += n.evaluate_posture_state("Healthy", True, 100 + i)
    assert len(a) == 1 and a[0]["alert_type"] == "Eye_Strain"
    a = [x for i in range(7, 40) for x in n.evaluate_posture_state("Healthy", True, 100 + i)]
    assert a == []                                       # cooldown


def test_snooze_blocks_alerts():
    n = NotificationManager(alert_threshold_mins=0, too_close_seconds=0)
    n.snooze(10)
    import time
    now = time.time()
    assert n.evaluate_posture_state("Slouching", True, now) == []


if __name__ == "__main__":
    import inspect
    for name, fn in list(globals().items()):
        if name.startswith("test_") and inspect.isfunction(fn):
            fn()
            print("ok ", name)
    for label, kw in [("upright", {}), ("slouch", dict(trunk_lean=15, shoulder_drop=4,
                      protraction=2.5, neck_flex=20, slide_down=3)),
                      ("neck only", dict(neck_flex=35)), ("lean back", dict(trunk_lean=-18))]:
        r = analyze(**kw)
        print(f"{label:10s} -> {r.state:9s} score={r.posture_score:3d} "
              f"K={r.kyphosis:.2f} FHP={r.forward_head:.2f} PPT={r.pelvic_tilt:.2f} "
              f"drop={r.shoulder_drop_cm:.1f}cm fwd={r.shoulder_forward_cm:.1f}cm "
              f"neck={r.neck_angle:.0f}deg {r.details}")
