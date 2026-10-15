"""Smoke test for the packaged AI engine: start it with a test photo as the
camera, run calibration and check that posture is classified.

Usage: python scripts/smoke_engine.py <path-to-engine-executable>
"""
import json
import os
import subprocess
import sys
import tempfile
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
exe = sys.argv[1]
env = dict(os.environ, DESKHEALTH_CAMERA_SOURCE=os.path.join(ROOT, "engine", "tests", "data", "person.png"))
db = os.path.join(tempfile.mkdtemp(), "smoke.db")
proc = subprocess.Popen([exe, "--db", db], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                        stderr=subprocess.DEVNULL, env=env, text=True, encoding="utf-8")
events = []
threading.Thread(target=lambda: [events.append(json.loads(l)) for l in proc.stdout if l.strip()],
                 daemon=True).start()


def wait_for(pred, timeout, what):
    end = time.time() + timeout
    while time.time() < end:
        if any(pred(e) for e in list(events)):
            return
        if proc.poll() is not None:
            break
        time.sleep(0.5)
    proc.kill()
    print("\n".join(json.dumps(e)[:200] for e in events[-20:]))
    sys.exit(f"FAILED: {what}")


wait_for(lambda e: e["type"] == "ready", 120, "engine did not start")
proc.stdin.write('{"id":1,"cmd":"calibrate","args":{}}\n'); proc.stdin.flush()
wait_for(lambda e: e["type"] == "calibration" and e.get("status") == "done", 180, "calibration did not finish")
wait_for(lambda e: e["type"] == "status" and e.get("state") == "Healthy", 60, "posture not classified")
proc.stdin.write('{"id":2,"cmd":"shutdown"}\n'); proc.stdin.flush()
proc.wait(timeout=30)
st = [e for e in events if e["type"] == "status" and e.get("state") == "Healthy"][-1]
print("OK: engine works -", st["state"], "score", st["posture"]["posture_score"], "distance", st["distance_cm"], "cm")
