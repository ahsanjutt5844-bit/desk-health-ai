"""
AIVisionEngine - webcam capture (OpenCV) + skeletal tracking (MediaPipe Tasks).

Frames live only in RAM and are discarded right after processing (NFR-09).
"""

from __future__ import annotations

import os
import sys
import time
from dataclasses import dataclass
from typing import Optional

import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision as mpv

from distance import face_measurements, estimate_distance_cm, DEFAULT_FOCAL_SCALE
from posture import Observation

# MediaPipe Pose landmark indices
NOSE, L_EAR, R_EAR = 0, 7, 8
L_SHOULDER, R_SHOULDER = 11, 12
L_HIP, R_HIP = 23, 24

MODEL_URLS = {
    "pose_landmarker_lite.task":
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
        "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
    "face_landmarker.task":
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
        "face_landmarker/float16/latest/face_landmarker.task",
}


def models_dir() -> str:
    if os.environ.get("DESKHEALTH_MODELS"):
        return os.environ["DESKHEALTH_MODELS"]
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "models")


def ensure_models() -> dict:
    """Return model paths. Downloads them once if they are missing."""
    d = models_dir()
    paths = {}
    for name, url in MODEL_URLS.items():
        p = os.path.join(d, name)
        if not os.path.exists(p):
            import urllib.request
            os.makedirs(d, exist_ok=True)
            urllib.request.urlretrieve(url, p)
        paths[name] = p
    return paths


@dataclass
class FrameAnalysis:
    observation: Optional[Observation]
    distance_cm: Optional[float]
    face_measure: Optional[dict]
    brightness: float
    width: int
    height: int
    pose_points: Optional[list] = None   # pixel points for the preview overlay


def _backends():
    """Capture backends to try, best first. Windows webcams sometimes refuse
    one backend right after being released, so fall back to the others."""
    if sys.platform.startswith("win"):
        return [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]
    if sys.platform == "darwin":
        return [cv2.CAP_AVFOUNDATION, cv2.CAP_ANY]
    return [cv2.CAP_ANY]


def _backend():
    return _backends()[0]


WARMUP_SECONDS = 3.0      # webcams can return empty frames for a while after opening
RELEASE_COOLDOWN_S = 1.0  # give the driver time to free the device after release()


class AIVisionEngine:
    def __init__(self, camera_idx: int = 0, target_fps: int = 2):
        self.camera_idx = camera_idx
        self.target_fps = target_fps
        self.is_tracking = False
        self.cap: Optional[cv2.VideoCapture] = None
        self._released_at = 0.0
        self._still = None
        self.last_error: Optional[str] = None
        self.focal_scale = DEFAULT_FOCAL_SCALE

        paths = ensure_models()
        self.pose = mpv.PoseLandmarker.create_from_options(mpv.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=paths["pose_landmarker_lite.task"]),
            running_mode=mpv.RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=0.5,
        ))
        self.face = mpv.FaceLandmarker.create_from_options(mpv.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=paths["face_landmarker.task"]),
            running_mode=mpv.RunningMode.IMAGE,
            num_faces=1,
        ))

    # ----------------------------------------------------------- camera
    def start_stream(self) -> bool:
        self.pause_stream()
        # Demo / testing without a webcam: DESKHEALTH_CAMERA_SOURCE=path/to/video.mp4 (or .jpg)
        source = os.environ.get("DESKHEALTH_CAMERA_SOURCE")
        if source:
            self._still = cv2.imread(source) if source.lower().endswith((".jpg", ".jpeg", ".png")) else None
            if self._still is not None:
                self.is_tracking = True
                return True
            cap = cv2.VideoCapture(source)
            if not cap.isOpened():
                return False
            self.cap = cap
            self.is_tracking = True
            return True
        # wait until the device has been fully freed by a previous release()
        wait = RELEASE_COOLDOWN_S - (time.time() - self._released_at)
        if wait > 0:
            time.sleep(wait)
        self.last_error = None
        for backend in _backends():
            cap = cv2.VideoCapture(self.camera_idx, backend)
            if not cap.isOpened():
                cap.release()
                self.last_error = f"backend {backend}: could not open camera {self.camera_idx}"
                continue
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            # warm-up: keep reading until the camera delivers a real frame
            deadline = time.time() + WARMUP_SECONDS
            while time.time() < deadline:
                ok, frame = cap.read()
                if ok and frame is not None and frame.size:
                    self.cap = cap
                    self.is_tracking = True
                    return True
                time.sleep(0.1)
            cap.release()
            self._released_at = time.time()
            self.last_error = f"backend {backend}: camera opened but sent no frames"
        return False

    def pause_stream(self):
        """Release the webcam lock so other apps (Zoom/Teams) can use it."""
        if self.cap is not None:
            self.cap.release()
            self._released_at = time.time()
        self.cap = None
        self._still = None
        self.is_tracking = False

    def read(self):
        if getattr(self, "_still", None) is not None and self.is_tracking:
            return self._still.copy()
        if self.cap is None:
            return None
        if os.environ.get("DESKHEALTH_CAMERA_SOURCE"):
            ok, frame = self.cap.read()
            if not ok:  # loop the demo video
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ok, frame = self.cap.read()
            return frame if ok else None
        # drop one buffered (stale) frame because we read slowly (1-3 FPS)
        self.cap.grab()
        ok, frame = self.cap.read()
        return frame if ok else None

    @staticmethod
    def list_cameras(max_index: int = 5, skip: Optional[int] = None) -> list[dict]:
        found = []
        for i in range(max_index):
            if i == skip:
                found.append({"index": i, "in_use": True})
                continue
            cap = cv2.VideoCapture(i, _backend())
            if cap.isOpened():
                ok, frame = cap.read()
                if ok:
                    h, w = frame.shape[:2]
                    found.append({"index": i, "width": w, "height": h})
            cap.release()
        return found

    # ------------------------------------------------------- processing
    def process_frame(self, frame) -> FrameAnalysis:
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        brightness = float(gray.mean())
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        face_measure = None
        distance = None
        face_res = self.face.detect(image)
        if face_res.face_landmarks:
            face_measure = face_measurements(face_res.face_landmarks[0], w, h)
            distance = estimate_distance_cm(face_measure, w, self.focal_scale)

        obs = None
        points = None
        pose_res = self.pose.detect(image)
        if pose_res.pose_landmarks:
            lm = pose_res.pose_landmarks[0]

            def p(i):
                return (lm[i].x * w, lm[i].y * h)

            def vis(i):
                v = getattr(lm[i], "visibility", None)
                return 1.0 if v is None else v

            shoulders_ok = vis(L_SHOULDER) > 0.5 and vis(R_SHOULDER) > 0.5
            if shoulders_ok:
                hips = vis(L_HIP) > 0.6 and vis(R_HIP) > 0.6 \
                    and lm[L_HIP].y < 0.98 and lm[R_HIP].y < 0.98
                obs = Observation(
                    l_shoulder=p(L_SHOULDER), r_shoulder=p(R_SHOULDER),
                    l_ear=p(L_EAR), r_ear=p(R_EAR), nose=p(NOSE),
                    face_width=face_measure["face_width"] if face_measure else None,
                    l_hip=p(L_HIP) if hips else None,
                    r_hip=p(R_HIP) if hips else None,
                    distance_cm=distance,
                )
                points = {k: p(i) for k, i in (("nose", NOSE), ("l_ear", L_EAR),
                                                ("r_ear", R_EAR), ("l_sh", L_SHOULDER),
                                                ("r_sh", R_SHOULDER))}
                if hips:
                    points.update({"l_hip": p(L_HIP), "r_hip": p(R_HIP)})

        return FrameAnalysis(obs, distance, face_measure, brightness, w, h, points)

    @staticmethod
    def render_preview(frame, analysis: FrameAnalysis, state: str) -> bytes:
        """Small JPEG with the skeleton overlay - kept in memory only."""
        img = cv2.flip(frame, 1)  # mirror so it feels natural
        w = analysis.width
        color = {"Slouching": (80, 60, 255), "Resting": (40, 170, 255)}.get(state, (150, 230, 0))
        pts = analysis.pose_points or {}

        def m(pt):
            return (int(w - pt[0]), int(pt[1]))

        if "l_sh" in pts:
            cv2.line(img, m(pts["l_sh"]), m(pts["r_sh"]), color, 3)
            mid_sh = ((pts["l_sh"][0] + pts["r_sh"][0]) / 2, (pts["l_sh"][1] + pts["r_sh"][1]) / 2)
            mid_ear = ((pts["l_ear"][0] + pts["r_ear"][0]) / 2, (pts["l_ear"][1] + pts["r_ear"][1]) / 2)
            cv2.line(img, m(mid_sh), m(mid_ear), (200, 200, 200), 2)
            for k in ("l_sh", "r_sh"):
                cv2.circle(img, m(pts[k]), 7, color, -1)
            for k in ("l_ear", "r_ear", "nose"):
                cv2.circle(img, m(pts[k]), 4, (220, 220, 220), -1)
            if "l_hip" in pts:
                cv2.line(img, m(pts["l_hip"]), m(pts["r_hip"]), (200, 200, 200), 2)
        img = cv2.resize(img, (400, int(400 * img.shape[0] / img.shape[1])))
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 60])
        return buf.tobytes() if ok else b""

    def close(self):
        self.pause_stream()
        self.pose.close()
        self.face.close()
