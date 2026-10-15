"""
Camera pause/resume robustness. A fake webcam imitates Windows behaviour:
after (re)opening it returns empty frames for a while (warm-up) and it
occasionally drops a single frame while running.
"""

import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

vision = pytest.importorskip("vision")
import main as engine_main  # noqa: E402


class FakeCapture:
    opened = 0
    warmup_frames = 6          # empty reads after every open
    drop_every = 0             # drop one frame every N reads (0 = never)

    def __init__(self, idx, backend=None):
        FakeCapture.opened += 1
        self.left = FakeCapture.warmup_frames
        self.reads = 0
        self.released = False

    def isOpened(self):
        return True

    def set(self, *a):
        return True

    def grab(self):
        return True

    def read(self):
        self.reads += 1
        if self.left > 0:
            self.left -= 1
            return False, None
        if FakeCapture.drop_every and self.reads % FakeCapture.drop_every == 0:
            return False, None
        return True, np.zeros((480, 640, 3), np.uint8)

    def release(self):
        self.released = True


@pytest.fixture
def fake_cam(monkeypatch):
    monkeypatch.setattr(vision.cv2, "VideoCapture", FakeCapture)
    monkeypatch.setattr(vision, "RELEASE_COOLDOWN_S", 0.05)
    monkeypatch.delenv("DESKHEALTH_CAMERA_SOURCE", raising=False)
    FakeCapture.opened = 0
    FakeCapture.drop_every = 0
    eng = object.__new__(vision.AIVisionEngine)   # skip loading the AI models
    eng.camera_idx, eng.target_fps = 0, 2
    eng.cap, eng.is_tracking, eng._still = None, False, None
    eng._released_at, eng.last_error = 0.0, None
    return eng


def test_open_survives_warmup(fake_cam):
    assert fake_cam.start_stream() is True
    assert FakeCapture.opened == 1


def test_resume_after_pause_reopens(fake_cam):
    assert fake_cam.start_stream()
    fake_cam.pause_stream()
    assert fake_cam.cap is None and not fake_cam.is_tracking
    assert fake_cam.start_stream() is True          # used to fail here
    assert fake_cam.read() is not None


def test_engine_pause_resume_and_dropped_frames(fake_cam, tmp_path, monkeypatch):
    events = []
    monkeypatch.setattr(engine_main, "emit", events.append)
    eng = engine_main.Engine(str(tmp_path / "t.db"))
    eng.vision = fake_cam
    fake_cam.process_frame = lambda frame: vision.FrameAnalysis(None, None, None, 120.0, 640, 480)

    assert eng.ensure_camera()
    eng.dispatch("pause", {"reason": "user"})
    assert eng.status_dict()["state"] == "Paused"
    eng.dispatch("resume", {})
    assert eng.status_dict()["state"] == "Starting"
    assert eng.ensure_camera()
    assert eng.camera_error is None

    FakeCapture.drop_every = 3                       # occasional dropped frames
    for _ in range(12):
        eng.process_once()
    assert eng.camera_error is None
    assert eng.status_dict()["state"] == "Away"      # running, nobody in the fake frame
