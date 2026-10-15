# Review of the SRS (Phase I) and SDS (Phase II) documents — Desk-Health-AI, S26CS034

Reviewed: *complete_phase_1.docx* (Software Requirements Specification) and *phase_2.0_fina_finall.docx*
(Agile Software Design Specification). Issues are ordered by importance. Section C has paste-ready text
for the next phase.

---

## A. Technical / content issues (fix these first)

### A1. Slouching is never defined, and the design focuses on the neck
* Neither document defines *slouching*. SRS PB-03 says "detect slouching and forward head", and SDS §2/§3.1
  say "slouching angles from shoulders/nose" and "angles for the neck, shoulders". The evaluators will ask
  **what exactly is measured**.
* Clinically, slouching = **Forward Head Posture + Thoracic Kyphosis (rounded shoulders) + Posterior Pelvic
  Tilt**. When a person slouches, the **shoulders drop and lean forward**. A neck-based detector gives false
  alerts every time the user just looks down at the keyboard or phone.
* **Fix:** add the formula and the weighted model (Section C1). Make the **shoulders the primary signal**, the
  neck secondary, and require a real shoulder change before reporting slouching. This is implemented in
  `engine/posture.py`.

### A2. A front-facing webcam cannot measure the angles the documents promise
* The Settings screen (Fig. 10/15) shows **"Posture Threshold 35°"**, and the class diagram has
  `calculateNeckAngles()`/`calculateShoulderAngles()` as if side-view angles were available. A laptop webcam
  looks at the user **from the front**, so neck flexion and trunk lean (sagittal angles) are not directly
  visible.
* **Fix:** state that posture is measured **relative to a calibrated upright baseline** (shoulder drop,
  shoulder width change, ear-to-shoulder gap), and that angles are *estimates* (e.g. neck flexion
  = acos(gap/upright_gap)). Change the setting to a **slouch threshold in %** of the slouch index.

### A3. Calibration is missing from all requirements and design
* Every person, chair and camera position is different. Without a "sit upright once" step, absolute
  thresholds produce false alerts. There is no user story, use case, table column or UI for calibration.
* **Fix:** add **US-09 / UC-08 "Calibrate posture"** (Section C3) and store the baseline in `USER_SETTINGS`.

### A4. Posterior pelvic tilt cannot be seen by the webcam
* At a desk the pelvis is below the desk edge. Write this down honestly as a **proxy**: torso shortening
  when hips are visible, otherwise the whole trunk sinking (head **and** shoulders drop together when the
  tailbone tucks and the user slides down). Evaluators respect a stated limitation more than a hidden one.

### A5. Screen-distance method and threshold are not specified
* The documents say "calculate facial depth" but never say how. **Fix:** describe the pinhole model with the
  iris diameter (≈11.7 mm, nearly constant in adults) and the inter-pupil distance (≈63 mm):
  `distance = focal_px × real_size / size_px`, with an optional one-time distance calibration.
* The Settings screen says "Alerts below **40 cm**". Common ergonomic guidance puts the monitor at roughly an
  **arm's length (about 50–70 cm)**, so 40 cm is already very close. The implementation defaults to **50 cm**
  and lets the user change it. Cite your source for whichever value you choose.
* The SRS only says the system "flags unsafe distance" (US-02). Add the behaviour: a notification asking the
  user to **move back**, shown after the user stays too close for N seconds (default 5 s), repeated at most
  once per minute.

### A6. Data flow: two processes using one SQLite file
* SDS Fig. 1 / §3.2 show Python **writing** and Electron **reading** the same SQLite file. Two processes on
  one file cause "database is locked" errors and need a native Node SQLite module rebuilt for Electron.
* **Fix (implemented):** the Python engine is the single owner of the database (WAL mode). Electron asks
  for data over IPC. Update arrow 7 in Fig. 1 to "Requests analytics via IPC → Python DatabaseManager".

### A7. API design (SDS §6)
* `ipc-get-posture-stats` returns "JSON array of POSTURE_LOGS" for weekly charts. That is thousands of rows
  and conflicts with NFR-08 (dashboard in 1.5 s). Return **aggregated DAILY_SUMMARY rows** plus hourly
  averages instead.
* `ipc-camera-hardware` returns browser `MediaDeviceInfo` objects, but OpenCV opens cameras by **index**.
  Document how a device name maps to an OpenCV index.
* Missing channels: calibrate, snooze, export CSV (TD-07), clear history, preview on/off.

### A8. Database schema (SDS §5.2)
| Table | Problem | Suggested change |
|---|---|---|
| DAILY_SUMMARY | `date` marked *Unique* alone | `UNIQUE(profile_id, date)` |
| DAILY_SUMMARY | TD-08 mentions a "0–100 health score" but no column exists | add `health_score`, `total_resting_seconds`, `total_close_seconds` |
| POSTURE_LOGS | `neck_angle`, `shoulder_angle` *Not Null*, but there are no values when the user is away / uncalibrated | make them nullable; add `posture_score`, `slouch_index`, `kyphosis`, `forward_head`, `pelvic_tilt`, `shoulder_drop_cm` |
| ALERT_HISTORY | Alerts screen (Fig. 14) shows a **Duration** column that is not stored | add `duration_seconds` |
| USER_SETTINGS | Settings screen shows *Launch on Boot* and *Posture Threshold*, not in the table; no calibration storage | add `launch_on_boot`, `posture_threshold`, `min_distance_cm`, `too_close_seconds`, `target_fps`, `auto_pause_calls`, `calibration_json`, `focal_scale` |

### A9. "Admin" actor appears from nowhere
* SDS Fig. 5 "Sequence Diagram (ADMIN)" and TD-07 "Admin user clicks Export Data from the Maintenance menu",
  but the SRS has only one actor (Desktop User) and the UI has no Maintenance menu. Either remove Admin, or
  add it to the SRS stakeholders/use cases. The implementation puts *Export CSV / Clear history* under
  Settings → Data & maintenance for the normal user.

### A10. Video-call auto-pause mechanism is vague
* "OS-level hardware interrupt listeners" (SRS story-point table, SDS §2) do not exist as a general API.
  Describe the real mechanism (implemented in `electron/call-detector.js`): on Windows, poll the camera
  privacy registry (`CapabilityAccessManager\ConsentStore\webcam`, `LastUsedTimeStop = 0` means another app
  is using the camera now), plus detection of Zoom's meeting process (`CptHost`). Polling every 1 s meets
  NFR-02 in most cases. Say "within ~1–2 s" to be honest.

---

## B. Consistency, scheduling and formatting issues

### B1. Numbers that contradict each other
| Topic | Statement 1 | Statement 2 |
|---|---|---|
| Sprint length | SRS §2: "3-week Sprints"; §5 "every 3-week sprint"; glossary "e.g., 3 weeks" | SRS §2.5 table: every sprint "4 Weeks" |
| CPU limit | SRS NFR-03: ≤ **15 %** CPU, ≤ **300 MB** RAM | SDS §3.1: "under **35 %**"; SDS §10: "below **20 %**", "under **500 MB**" |
| Sprint 3 dates | SRS: 30 Apr – 27 May | SDS: 26 Apr – 23 May |
| Sprint 4 dates | SRS: 28 May – 24 Jun | SDS: 24 May – 20 Jun ("completed June 20") |
| Gaps | SRS: Sprint 2 ends 25 Apr, Sprint 3 starts 30 Apr; Sprint 4 ends 24 Jun, Sprint 5 starts 1 Jul | SDS claims a "gap-free delivery model" |
| Story points | User stories total **39** points | Sprint table totals **60** points (doc sprints have points but no stories) |

### B2. Kanban board IDs don't match the Product Backlog (SRS §5.1)
Examples: Kanban "PB-14: Build main dashboard UI" (backlog PB-14 = camera selection), "PB-08: Optimize frame
rates" (backlog PB-08 = alert timer), "PB-09: Snooze & resting" (backlog PB-09 = SQLite), "PB-10: SQLite"
(backlog PB-10 = optimize), "PB-12: charts"/"PB-13: custom timer" are swapped, **PB-17 does not exist**,
PB-11 is missing. The Testing/Done columns are empty although SDS says Sprints 1–4 are complete.
Regenerate the board from the backlog.

### B3. Template leftovers and typos
* Captions still say "**Sample** Table of Epic", "Sample Product Backlog Table", "Sample User Story Board",
  "Sample Sprint Planning Table", "Sample Use Case Diagram Table", "Sample Kanban Board". Remove "Sample".
* SDS cover: "Version **<Version #>**". Fill it in.
* "Figure 16: **Ghant** Chart" → **Gantt**. "Use-ability" → **Usability**.
* SRS TOC: "1.1 1.1 Product Vision", "1.2 1.2 Stakeholders"; §2.4 Story Points is missing from the TOC.
* SDS glossary says "used throughout this **Software Requirements Specification**" → *Design Specification*.
* Supervisor title varies: "Mr. Sajid Saleem", "Mr. Engr. Sajid Saleem", "Engr. Sajid Saleem". Pick one.
* **Revision History** tables are empty in both documents, and the IV&V tables are empty. Fill in at least
  the versions you submitted.
* User stories list "Team Member 1/2/3" as focal person. Use names. US-06 (dashboard UI) is assigned to the
  backend member while the frontend member owns the UI.

### B4. Claims that need a citation or evidence
* SRS abstract: "over **60 %** of computer users report musculoskeletal issues" has no citation (SDS removed
  the number). Cite it or remove it.
* User research: "Over 80 % of the participants" with 15 survey respondents. Give the raw count (e.g. 13/15)
  and add the questionnaire as an appendix.
* References [7] and [10] have no authors, journal or year detail, only "PubMed". Complete them in IEEE
  style. Add a reference for the iris-diameter distance method and for the ergonomic viewing distance.

### B5. Requirements that are hard to test
* Acceptance criterion: "notification appears **exactly** after the 3-minute mark". Use "between 3:00 and
  3:02" to match NFR-05 (≤ 2 s).
* NFR-07: "install … in under 3 mouse clicks" conflicts with the OS camera-permission prompt. Rephrase as
  "one-click installer; tracking starts after granting camera permission and a 3-second calibration".

---

## C. Paste-ready text for the next phase

### C1. New section "Slouch Detection Algorithm" (SDS §3)

> **Definition.** Slouching is modelled as the combination of three postural faults:
> *Slouching = Forward Head Posture + Thoracic Kyphosis (Rounded Shoulders) + Posterior Pelvic Tilt (Tucked Tailbone).*
>
> **Measurement principle.** The webcam faces the user, so sagittal angles cannot be measured directly.
> The system first records the user's upright posture (calibration) and then measures the *change* in
> scale-normalised MediaPipe landmark geometry:
>
> 1. **Thoracic kyphosis / rounded shoulders, primary (w = 0.50).** When a person slouches the shoulders
>    drop and move forward. Measured as (a) shoulder-line drop ÷ calibrated shoulder width, (b) increase in
>    apparent shoulder width (the shoulders approach the camera), and (c) narrowing of the shoulder width while
>    the face distance is unchanged (protraction).
> 2. **Forward head posture (w = 0.30).** Vertical ear-to-shoulder gap normalised by shoulder width; the neck
>    flexion estimate is θ = arccos(gap / gap_upright).
> 3. **Posterior pelvic tilt (w = 0.20).** The pelvis is hidden by the desk, so a proxy is used: torso
>    shortening when the hips are visible, otherwise the downward sink of both the head and the shoulders.
>
> Each component is mapped to a 0–1 severity with a dead-zone (to ignore normal movement) and combined as
> **SI = 0.5·K + 0.3·F + 0.2·P**; the posture score is 100·(1 − SI). The user is classified as *Slouching*
> when SI ≥ threshold (default 0.35) **and** K ≥ 0.30, so moving only the neck (e.g. looking at a phone) is
> not counted. Hysteresis and an exponential moving average prevent flicker. Leaning back (shoulders ≥ 10 %
> smaller and face ≥ 10 % farther) is classified as *Resting* (US-07).

### C2. Replace the US-01 row in SDS §2
> **US-01 | Python AI Vision Engine (PostureAnalyzer)** | Compares live MediaPipe shoulder, ear, nose and hip
> landmarks with the calibrated upright baseline and computes the slouch index from shoulder drop/forward
> lean (primary), forward head and pelvic-tilt proxy.

### C3. New user story and use case
| ID | Story | Acceptance criteria |
|---|---|---|
| **US-09** (PB-17, High) | As a user, I want to calibrate my upright posture once so that slouch detection fits my body, chair and camera position. | First launch → calibration dialog opens. User sits upright 3 s → baseline saved to USER_SETTINGS. Moving the camera → user can recalibrate from Settings or the tray. |
| **US-10** (PB-04, High) | As a user, I want to be told to move back when I sit too close to the screen. | Face closer than the minimum distance (default 50 cm) for 5 s → native notification "move back" + red banner; repeated at most once per minute. |

**UC-08 Calibrate Posture**, Actor: Desktop User, mapped to US-09.

### C4. Updated module decomposition sentence (SDS §3.1)
> *AI Vision Module:* Frame Capture sub-module (OpenCV, 1–3 FPS) and Geometric Math sub-module, which turns
> MediaPipe Pose and FaceLandmarker coordinates into the shoulder (primary), forward-head and pelvic-proxy
> components of the slouch index and into an iris-based face-to-screen distance.

### C5. Test cases to add (SDS §9)
| ID | Scenario | Expected result |
|---|---|---|
| TD-10 | User bends only the neck to look at a phone for 5 min | Forward-head component rises, state stays *Healthy*, no alert |
| TD-11 | User drops and rounds the shoulders and leans forward | State *Slouching* within ~2 s; alert after the alert timer |
| TD-12 | User moves the face to 35 cm from the screen for 6 s | "Too close" banner + Eye_Strain notification and ALERT_HISTORY row |
| TD-13 | First launch | Calibration dialog opens; baseline stored; state becomes *Healthy* |

These are covered by the automated tests in `engine/tests/test_posture.py`.
