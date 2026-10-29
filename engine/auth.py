"""
Local profile password (security layer).

* The password itself is never stored. We store a PBKDF2-HMAC-SHA256 hash
  with a random 16-byte salt and 600,000 iterations (OWASP recommendation).
* Verification uses a constant-time comparison.
* Repeated wrong passwords lock the login: after 5 failures the user must
  wait 30 s, doubling for every further failure (max 5 min).
* The engine refuses every data command (history, settings, camera preview,
  export ...) while the profile is locked. Background posture tracking and
  alerts keep running, so the user stays protected while the app is locked.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time

ITERATIONS = 600_000
MIN_PASSWORD = 6
MAX_PASSWORD = 128
MAX_NAME = 40
FREE_ATTEMPTS = 5
BASE_LOCKOUT_S = 30
MAX_LOCKOUT_S = 300


class AuthError(Exception):
    """Raised with a message that can be shown to the user."""


def hash_password(password: str, salt: bytes | None = None,
                  iterations: int = ITERATIONS) -> tuple[str, str, int]:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return salt.hex(), digest.hex(), iterations


def verify_password(password: str, salt_hex: str, hash_hex: str, iterations: int) -> bool:
    _, digest, _ = hash_password(password, bytes.fromhex(salt_hex), iterations)
    return hmac.compare_digest(digest, hash_hex)


def check_new_password(password, name=None):
    if not isinstance(password, str) or not (MIN_PASSWORD <= len(password) <= MAX_PASSWORD):
        raise AuthError(f"The password must be {MIN_PASSWORD} to {MAX_PASSWORD} characters long.")
    if name is not None:
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > MAX_NAME:
            raise AuthError(f"Please enter your name (1 to {MAX_NAME} characters).")


class AuthManager:
    def __init__(self, db, iterations: int = ITERATIONS):
        self.db = db
        self.iterations = iterations
        self.unlocked = False
        self.failures = 0
        self.locked_until = 0.0

    # ---------------------------------------------------------------- state
    def status(self) -> dict:
        prof = self.db.get_auth()
        return {
            "has_password": bool(prof["password_hash"]),
            "unlocked": self.unlocked,
            "profile_name": prof["profile_name"],
            "locked_for": max(0, int(round(self.locked_until - time.time()))),
        }

    def require_unlocked(self):
        if not self.unlocked:
            raise PermissionError("locked")

    # -------------------------------------------------------------- actions
    def setup(self, name: str, password: str) -> dict:
        """Create the profile password (first run only)."""
        if self.db.get_auth()["password_hash"]:
            raise AuthError("A password is already set. Use 'Change password' instead.")
        check_new_password(password, name)
        salt, digest, iters = hash_password(password, iterations=self.iterations)
        self.db.set_auth(name.strip(), salt, digest, iters)
        self.unlocked = True
        self.failures = 0
        return self.status()

    def login(self, password: str) -> dict:
        wait = self.locked_until - time.time()
        if wait > 0:
            raise AuthError(f"Too many wrong attempts. Try again in {int(wait) + 1} seconds.")
        prof = self.db.get_auth()
        if not prof["password_hash"]:
            raise AuthError("No password has been set yet.")
        if isinstance(password, str) and verify_password(
                password, prof["password_salt"], prof["password_hash"], prof["password_iter"]):
            self.unlocked = True
            self.failures = 0
            self.locked_until = 0.0
            return self.status()
        self.failures += 1
        if self.failures >= FREE_ATTEMPTS:
            extra = self.failures - FREE_ATTEMPTS
            self.locked_until = time.time() + min(MAX_LOCKOUT_S, BASE_LOCKOUT_S * 2 ** extra)
            raise AuthError(f"Wrong password. Login is locked for "
                            f"{int(self.locked_until - time.time())} seconds.")
        left = FREE_ATTEMPTS - self.failures
        raise AuthError(f"Wrong password. {left} attempt{'s' if left != 1 else ''} left.")

    def lock(self) -> dict:
        self.unlocked = False
        return self.status()

    def change(self, old: str, new: str) -> dict:
        self.require_unlocked()
        prof = self.db.get_auth()
        if not (isinstance(old, str) and verify_password(
                old, prof["password_salt"], prof["password_hash"], prof["password_iter"])):
            raise AuthError("The current password is not correct.")
        check_new_password(new)
        salt, digest, iters = hash_password(new, iterations=self.iterations)
        self.db.set_auth(prof["profile_name"], salt, digest, iters)
        return self.status()

    def reset_everything(self) -> dict:
        """'Forgot password': erase the profile password AND all stored data."""
        self.db.clear_history()
        self.db.save_calibration(None)
        self.db.reset_settings()
        self.db.set_auth("Main User", None, None, None)
        self.unlocked = False
        self.failures = 0
        self.locked_until = 0.0
        return self.status()
