"""
Wayline bus tracker — OpenCV pipeline (PC side)
================================================
Phone camera elevated above the 2 m x 2 m arena:
  * 4 coloured corner markers define the real map dimensions
  * a red marker on top of the bus is the point to track
  * feed: IP Webcam app -> HTTP MJPEG stream -> cv2.VideoCapture(url)

Stages:
  1. grab + downscale frame
  2. find the 4 corner blobs (one HSV range per colour)
  3. perspective transform image <-> arena (calibrated once, saved to JSON)
  4. find the red blob (TWO hue ranges — red wraps the HSV wheel)
  5. transform red centroid -> (x, y) in arena metres
  6. speed = |dPos|/dt, EMA-smoothed, cm/s
  7. PATCH buses/<bus>/telemetry {location, speed} to Firebase as the
     bus's DEVICE account (same login the ESP32 uses)

Run:
    pip install -r requirements.txt
    python tracker.py --calibrate      # corners steady -> press c
    python tracker.py                  # live, publishing to Firebase
    python tracker.py --no-firebase    # debug, no DB writes
"""

import argparse
import json
import math
import time
from pathlib import Path

import cv2
import numpy as np
import requests

BASE = Path(__file__).resolve().parent

# --------------------------------------------------------------- config
CFG = json.loads((BASE / "config.json").read_text(encoding="utf-8"))

DB_URL   = CFG["db_url"].rstrip("/")
API_KEY  = CFG["api_key"]
FB_EMAIL = CFG["device_email"]
FB_PASS  = CFG["device_password"]
BUS_ID   = CFG["bus_id"]
FEED     = CFG["feed_url"]
ARENA    = float(CFG.get("arena_size_m", 2.0))
WANT_W   = int(CFG.get("process_width", 640))
CORNERS  = BASE / CFG.get("corners_file", "arena_corners.json")

# colour name -> (HSV lo, HSV hi, arena corner in metres)
# KEEP this colour-to-corner assignment consistent with the physical layout
# (or edit both the physical markers AND this table together).
COLORS = {
    "yellow":  (( 30,  40,  60), ( 50, 255, 255), (0.0, 0.0)),            # near-left
    "green":   (( 50,  60,  60), ( 85, 255, 255), (0.0, ARENA)),          # near-right
    "cyan":    (( 85,  60,  60), (105, 255, 255), (ARENA, ARENA)),        # far-right
    "magenta": ((140,  60,  60), (170, 255, 255), (ARENA, 0.0)),          # far-left
}
RED_LO1, RED_HI1 = (  0, 120,  80), ( 10, 255, 255)   # red, part 1
RED_LO2, RED_HI2 = (170, 120,  80), (180, 255, 255)   # red, part 2 (wrap)
RED_MIN_AREA = float(CFG.get("red_min_area", 30))
CORNER_MIN_AREA = float(CFG.get("corner_min_area", 60))
SPEED_GATE_S = 0.15          # min time between speed samples
SPEED_EMA = 0.3              # blend weight for new sample (lower = smoother)


# --------------------------------------------------------------- helpers
def find_blob(frame, lo, hi, min_area):
    """HSV range -> centroid (x, y) of the biggest blob, or None."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array(lo), np.array(hi))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,
                            cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    c = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(c) < min_area:
        return None
    m = cv2.moments(c)
    if m["m00"] == 0:
        return None
    return float(m["m10"] / m["m00"]), float(m["m01"] / m["m00"])


def grab_frame(cap, want_w):
    ok, frame = cap.read()
    if not ok or frame is None:
        return None
    scale = want_w / frame.shape[1]
    return cv2.resize(frame, (want_w, int(frame.shape[0] * scale)))


def to_pts(pairs):
    return np.float32(pairs)


# --------------------------------------------------------------- calibration
def calibrate(cap):
    """Show live corner detection; press 'c' when all 4 are stable."""
    print("Calibration: wait until all 4 corners are steady, then press 'c'.")
    while True:
        frame = grab_frame(cap, WANT_W)
        if frame is None:
            time.sleep(0.5)
            continue
        pts = {}
        for name, (lo, hi, _arena) in COLORS.items():
            b = find_blob(frame, lo, hi, CORNER_MIN_AREA)
            if b:
                pts[name] = b
                cv2.circle(frame, (int(b[0]), int(b[1])), 6, (0, 255, 0), -1)
        cv2.putText(frame, f"{len(pts)}/4 corners", (10, 28),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        cv2.imshow("calibrate — press 'c' to save", frame)
        if len(pts) == 4 and (cv2.waitKey(1) & 0xFF) == ord("c"):
            # store BOTH spaces per corner: [arena point, image point]
            save = {n: [list(COLORS[n][2]), list(pts[n])] for n in pts}
            CORNERS.write_text(json.dumps(save, indent=2), encoding="utf-8")
            print(f"Saved {CORNERS.name} -> {CORNERS}")
            break
        time.sleep(0.02)
    cv2.destroyAllWindows()


def load_transform():
    corners = json.loads(CORNERS.read_text(encoding="utf-8"))
    src = to_pts([c[1] for c in corners.values()])   # image points
    dst = to_pts([c[0] for c in corners.values()])   # arena points (metres)
    return cv2.getPerspectiveTransform(src, dst), corners


def apply_transform(M, pt):
    """Homography: (x, y) image -> (x, y) arena metres."""
    hom = to_pts([[pt[0], pt[1], 1.0]])[0]
    out = M @ hom
    return float(out[0] / out[2]), float(out[1] / out[2])


# --------------------------------------------------------------- firebase
class FirebaseRT:
    """Minimal RTDB REST client: device email/password login, token refresh,
    partial PATCH (replaces only the given children — never the whole node)."""

    def __init__(self):
        self.token = None
        self.exp = 0.0

    def login(self):
        r = requests.post(
            "https://identitytoolkit.googleapis.com/"
            f"v1/accounts:signInWithPassword?key={API_KEY}",
            json={"email": FB_EMAIL, "password": FB_PASS,
                  "returnSecureToken": True},
            timeout=10,
        ).json()
        if "idToken" not in r:
            raise SystemExit(f"device login failed: {r}")
        self.token = r["idToken"]
        self.exp = time.time() + 50 * 60   # tokens live ~1 h; refresh at 50 min
        print(f"Firebase login OK (as {FB_EMAIL})")

    def patch(self, path, payload):
        for attempt in (1, 2):
            if time.time() > self.exp:
                self.login()
            url = f"{DB_URL}/{path}.json?auth={self.token}"
            r = requests.request("PATCH", url, json=payload, timeout=5)
            if r.status_code == 401 and attempt == 1:
                self.login()
                continue
            break
        if r.status_code >= 300:
            print(f"  firebase error {r.status_code}: {r.text[:120]}")
        return r.ok


# --------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("--calibrate", action="store_true",
                    help="calibrate the 4 corner markers and exit")
    ap.add_argument("--no-firebase", action="store_true",
                    help="run without writing to the database (debug)")
    args = ap.parse_args()

    cap = cv2.VideoCapture(FEED)
    time.sleep(2.0)                      # let the MJPEG stream warm up
    if not cap.isOpened():
        raise SystemExit(f"cannot open feed {FEED} — is IP Webcam running?")

    if args.calibrate:
        calibrate(cap)
        return

    if not CORNERS.exists():
        raise SystemExit(f"{CORNERS.name} missing — run --calibrate first")
    M, corners = load_transform()

    fb = None if args.no_firebase else FirebaseRT()
    if fb:
        fb.login()
    print("tracking…  (q quits)")

    last = None
    speed = 0.0
    t_last = time.time()

    while True:
        frame = grab_frame(cap, WANT_W)
        if frame is None:
            time.sleep(0.5)
            continue

        red = None
        for lo, hi in ((RED_LO1, RED_HI1), (RED_LO2, RED_HI2)):
            red = find_blob(frame, lo, hi, RED_MIN_AREA)
            if red:
                break

        now = time.time()
        if red:
            x, y = apply_transform(M, red)
            if last is not None and (now - t_last) >= SPEED_GATE_S:
                inst = math.hypot(x - last[0], y - last[1]) / (now - t_last) * 100.0
                speed = (1 - SPEED_EMA) * speed + SPEED_EMA * inst   # cm/s
            last, t_last = (x, y), now

            cv2.circle(frame, (int(red[0]), int(red[1])), 8, (0, 0, 255), -1)
            cv2.putText(frame, f"x={x:.2f}  y={y:.2f}  v={speed:.0f} cm/s",
                        (10, frame.shape[0] - 14),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
            if fb:
                fb.patch(f"buses/{BUS_ID}/telemetry",
                         {"location": {"x": round(x, 3), "y": round(y, 3)},
                          "speed": round(speed, 1)})
        else:
            speed = 0.0
            last = None
            cv2.putText(frame, "bus marker lost", (10, 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

        for n, c in corners.items():
            cv2.circle(frame, (int(c[1][0]), int(c[1][1])), 6, (0, 255, 0), -1)

        cv2.imshow("wayline tracker", frame)
        if (cv2.waitKey(1) & 0xFF) == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
