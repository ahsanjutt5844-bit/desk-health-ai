# DeskHealth AI — Desk-Posture & Eye Strain Monitor

BSCS Final Year Project · Group **S26CS034** · University of Central Punjab
Product Owner: Engr. Sajid Saleem · Team: M. Umair Khushnood (Frontend, Scrum Master) · M. Ahsan Rasool (AI) · Saim Rafaqat (Backend)

A privacy-first desktop app that uses an ordinary webcam to:

* detect **slouching**, with the **shoulders** (dropping and leaning forward) as the main signal,
* detect when the user is **too close to the screen** and tell them to move back,
* send smart, non-annoying OS notifications, run silently in the system tray, pause itself during video calls,
* store only numbers in a local SQLite database and show daily and weekly analytics.

Video frames are processed in RAM only. They are never saved and never uploaded.

---

## 1. Slouch detection model

```
Slouching = Forward Head Posture + Thoracic Kyphosis (Rounded Shoulders) + Posterior Pelvic Tilt (Tucked Tailbone)

slouch_index = 0.50 × Kyphosis  +  0.30 × ForwardHead  +  0.20 × PelvicTilt        (each 0..1)
posture_score = 100 × (1 − slouch_index)
```

A webcam sees the user **from the front**, so each component is measured as a change from the
user's own **calibrated upright posture**:

| Component (weight) | What the camera sees | Measurement |
|---|---|---|
| **Thoracic kyphosis / rounded shoulders (50%)**, the main signal | Shoulders **go down** and **lean forward**, and roll inward | shoulder-line drop ÷ shoulder width · shoulder width growth (body closer to camera) · shoulder narrowing while the body did not move back |
| Forward head posture (30%) | Head moves in front of / below the shoulders | ear-to-shoulder vertical gap ÷ shoulder width → neck flexion `θ = acos(gap / upright_gap)` |
| Posterior pelvic tilt (20%) | The pelvis is usually hidden by the desk, so a **proxy** is used | torso (shoulder-to-hip) shortening if the hips are visible, otherwise the whole trunk sinking (head **and** shoulders drop together) |

**Classification:** the user is **Slouching** as soon as the **shoulders go down or move forward**
(the shoulder component alone reaches the threshold, default 35% ≈ 2 cm of movement), or when the full
slouch index reaches the threshold with a smaller shoulder change. Bending only the neck (for example
looking down at a phone) is not slouching.
Shoulder drop is measured **independent of distance**: moving toward or away from the camera scales the
image about its centre, so the drop is compared with where the shoulders *should* appear at the new
distance, and the small drop caused by reclining around the hips is removed.
**Resting:** leaning back in the chair to rest pauses alerts (US-07). It counts as Resting when the
shoulders move **at least 12 cm back** from the calibrated position and drop no more than that recline
explains (plus some hip slide, as people slide forward on the seat when they lean back). Slumping into
the chair (sinking down without really leaning back) is **Slouching**.

**Alerts use continuous slouching:** with the alert timer at 3 min, a posture notification appears only
after 3 minutes of slouching *in a row*. Sitting properly resets the timer; corrections shorter than 8 s
are ignored so that camera flicker cannot reset it. Separate slouches are never added up for the alert.
The dashboard shows both the current continuous slouch and the total slouch time of the day.
Slumping back (shoulders drop while moving away from the screen) is **Slouching**.

**Screen distance:** pinhole camera model, `distance = focal_px × real_size / size_px`, averaged over the
iris diameter (≈1.17 cm) and the inter-pupil distance (≈6.3 cm) from MediaPipe FaceLandmarker.
The focal length is estimated from a typical webcam field of view. The user can make it exact by entering
their measured distance during calibration. Closer than **50 cm** (configurable) for **5 s** shows a
"move back" notification and an in-app banner.

Code: `engine/posture.py`, `engine/distance.py`. Tests: `engine/tests/test_posture.py`.

---

## 2. Security layer

* **Local profile with a password.** On first start the user creates a profile (name + password).
  The dashboard, history, settings, CSV export and camera preview open only after the password is
  entered; posture tracking and alerts keep running while the app is locked.
* The password is never stored: the database keeps a **PBKDF2-HMAC-SHA256 hash** (600,000 iterations,
  random 16-byte salt) and checks it with a constant-time comparison (`engine/auth.py`).
* **Lock-out:** after 5 wrong passwords the login waits 30 s, doubling up to 5 min.
* **Auto-lock** when the window has been hidden for 5 min (configurable), plus **Lock** buttons.
* The Python engine refuses every data command while locked, so the lock cannot be bypassed from the UI.
* Electron hardening: context isolation + sandbox, IPC only from the app's own page, navigation blocked,
  only the camera permission allowed, developer tools disabled in the installed app, every setting
  range-checked before it is saved.
* **Forgot password:** the password cannot be recovered (it is not stored); the user can erase this
  computer's DeskHealth data by typing RESET and create a new profile.

**Where is the data saved without an online login?** In a SQLite file on the user's own computer
(`%APPDATA%\DeskHealth AI\deskhealth.db`). Windows already separates users: each Windows account has
its own AppData folder, so each person who logs in to Windows gets their own DeskHealth database. Inside
it, the data belongs to the local profile (`USER_PROFILE` row) created on first start.

## 3. Architecture (matches SDS Phase II Figure 1)

```
React.js UI (src/)  ──IPC──►  Electron main (electron/)  ──stdin/stdout JSON──►  Python AI engine (engine/)
   Dashboard, Analytics,        tray, native notifications,                       OpenCV capture (1–3 FPS)
   Alerts, Settings             video-call auto-pause,                            MediaPipe Pose + FaceLandmarker
                                window lifecycle                                  PostureAnalyzer, NotificationManager
                                                                                  DatabaseManager ──► SQLite (AppData)
```

| Class diagram | File |
|---|---|
| ElectronWrapper | `electron/main.js` |
| ReactDashboard | `src/App.jsx`, `src/pages/*` |
| AIVisionEngine | `engine/vision.py` |
| *(new)* PostureAnalyzer | `engine/posture.py` |
| NotificationManager | `engine/notifier.py` |
| DatabaseManager | `engine/database.py` |
| Hardware monitor (auto-pause) | `electron/call-detector.js` |

The Python engine is the **only** process that opens the SQLite file. Electron asks it for data over IPC,
so there are never two writers on the database.

IPC channels (SDS §6): `ipc-get-posture-stats`, `ipc-update-settings`, `ipc-trigger-alert`,
`ipc-camera-hardware`, `ipc-camera-pause`, `ipc-camera-resume`, plus `ipc-calibrate`, `ipc-snooze`,
`ipc-export-csv`, `ipc-clear-history`, `ipc-set-preview`, `ipc-get-settings`, `ipc-reset-settings`.

---

## 4. Running it (Windows)

Requirements: **Node.js 20+**, **Python 3.10–3.12** (64-bit), and a webcam.

```powershell
git clone <your repo> desk-health-ai
cd desk-health-ai

# Python engine (virtual env inside engine/.venv is found automatically)
python -m venv engine\.venv
engine\.venv\Scripts\pip install -r engine\requirements.txt

# UI + Electron
npm install

# Development (hot reload UI)
npm run dev
# or: production UI build + Electron
npm start
```

On first launch the **calibration** dialog opens. Sit upright with your shoulders back and both shoulders
visible, then click *start*. It takes about 3 seconds. Recalibrate after moving the laptop, camera or chair.

If Windows blocks the camera: *Settings → Privacy & security → Camera →* allow **Camera access** and
**Let desktop apps access your camera**.

### Testing without a webcam (demo / viva)
```powershell
$env:DESKHEALTH_CAMERA_SOURCE="C:\path\to\demo.mp4"   # or a .jpg
npm start
```

### Unit tests
```powershell
engine\.venv\Scripts\python -m pytest engine\tests -q
```
13 tests simulate a 3-D seated body projected through a pinhole camera. They cover: upright → Healthy,
shoulders down + forward → Slouching, neck-only → still Healthy, leaning back → Resting, sliding down →
pelvic component, plus the alert timers, too-close cooldown and snooze.

### UI-only preview in a browser
`npx vite` → open http://localhost:5173. Without Electron, a mock bridge streams demo data.

---

## 5. Building the installer (.exe)

```powershell
npm run dist
```
1. `vite build` builds the UI into `dist/`
2. `scripts/build_engine.py` uses PyInstaller to bundle Python, OpenCV, MediaPipe and the models into `engine-dist/` (the user does not need Python)
3. `electron-builder` creates a one-click NSIS installer in `release/`

The MediaPipe models (`engine/models/*.task`) ship with the app, so it works fully offline.

---

## 6. Requirement coverage

| Requirement | Where |
|---|---|
| US-01 slouch detection | `posture.py` (formula above), Dashboard → Live posture |
| US-02 screen distance / too close | `distance.py`, distance panel + banner + notification |
| US-03 system tray | `electron/main.js` (close/minimise hides to tray; tray menu) |
| US-04 alert only after N min | `notifier.py` (8 s grace for short corrections) |
| US-05 release camera for Zoom/Teams | `call-detector.js`: Windows camera-usage registry + Zoom meeting process; resumes after the call |
| US-06 charts | Dashboard + Analytics (Recharts) |
| US-07 resting state | `posture.py` (lean-back detection) |
| US-08 custom alert timer | Settings → Thresholds |
| NFR-01 camera unplugged | engine retries every 2 s, shows "Camera unavailable" |
| NFR-04 1–3 FPS | Settings → Analysis rate (default 2 FPS) |
| NFR-09/10 privacy | frames only in RAM; DB stores numbers only |
| Risk 2 low light | brightness check → "turn on a light" notification |
| TD-07 export CSV | Settings → Data & maintenance |
| TD-08 daily score | `daily_summary.health_score` updated continuously |

## 7. Project structure
```
electron/   main.js (tray, notifications, IPC) · preload.js · engine-bridge.js · call-detector.js
engine/     main.py (engine loop/IPC) · vision.py · posture.py · distance.py · notifier.py · database.py
            models/ (MediaPipe .task files) · tests/
src/        React UI: pages/ (Dashboard, Analytics, Alerts, Settings) · components/ · lib/
scripts/    build_engine.py (PyInstaller)
docs/       DOCUMENT_REVIEW.md: review of the SRS / SDS documents with suggested changes
```
