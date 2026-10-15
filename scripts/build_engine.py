"""Bundle the Python AI engine into a standalone executable (no Python needed
on the user's PC). Output: engine-dist/deskhealth-engine/  (picked up by
electron-builder as an extraResource).

Usage:  python scripts/build_engine.py
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine")
SEP = ";" if os.name == "nt" else ":"

sys.path.insert(0, ENGINE)
from vision import ensure_models  # noqa: E402  (downloads the .task models once)

ensure_models()
cmd = [
    sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
    "--name", "deskhealth-engine",
    "--distpath", os.path.join(ROOT, "engine-dist"),
    "--workpath", os.path.join(ROOT, "build", "pyinstaller"),
    "--specpath", os.path.join(ROOT, "build"),
    "--paths", ENGINE,
    "--collect-all", "mediapipe",
    "--add-data", f"{os.path.join(ENGINE, 'models')}{SEP}models",
    "--console",          # stdin/stdout are the IPC channel; Electron hides the window
    os.path.join(ENGINE, "main.py"),
]
print(" ".join(cmd))
subprocess.check_call(cmd, cwd=ROOT)
print("engine built ->", os.path.join(ROOT, "engine-dist", "deskhealth-engine"))
