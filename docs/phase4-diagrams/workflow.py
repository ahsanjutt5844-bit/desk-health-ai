"""Swim-lane workflow of DeskHealth AI (fixed layout)."""
import sys, textwrap
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Polygon, Circle

LANES = ["User", "DeskHealth App\n(Electron + React)", "AI Engine\n(Python)", "SQLite Database"]
LW = 3.4                       # lane width
ROWS = 16
fig, ax = plt.subplots(figsize=(11.5, 16.3))
ax.set_xlim(0, LW * 4); ax.set_ylim(-0.6, ROWS + 1.4); ax.axis("off")
C = "#333333"
fills = ["#F7F9FA", "#FFFFFF", "#F7F9FA", "#FFFFFF"]
for i, name in enumerate(LANES):
    ax.add_patch(plt.Rectangle((i * LW, -0.6), LW, ROWS + 1.0, fc=fills[i], ec=C, lw=1.0))
    ax.add_patch(plt.Rectangle((i * LW, ROWS + 0.4), LW, 1.0, fc="#E3ECEA", ec=C, lw=1.0))
    ax.text(i * LW + LW / 2, ROWS + 0.9, name, ha="center", va="center", fontsize=11.5, weight="bold")

def xy(lane, row):
    return lane * LW + LW / 2, ROWS - row - 0.2

BW, BH = 2.7, 0.62
box = {}
def step(key, lane, row, text, kind="box"):
    x, y = xy(lane, row)
    t = "\n".join(textwrap.wrap(text, 26))
    if kind == "decision":
        w, h = 2.6, 1.1
        ax.add_patch(Polygon([(x, y + h / 2), (x + w / 2, y), (x, y - h / 2), (x - w / 2, y)], closed=True, fc="white", ec=C, lw=1.1))
        ax.text(x, y, "\n".join(textwrap.wrap(text, 16)), ha="center", va="center", fontsize=9)
        box[key] = (x, y, w, h)
        return
    ax.add_patch(FancyBboxPatch((x - BW / 2, y - BH / 2), BW, BH, boxstyle="round,pad=0,rounding_size=0.12",
                                fc="white", ec=C, lw=1.1))
    ax.text(x, y, t, ha="center", va="center", fontsize=9.5)
    box[key] = (x, y, BW, BH)

def pt(key, side):
    x, y, w, h = box[key]
    return {"l": (x - w / 2, y), "r": (x + w / 2, y), "t": (x, y + h / 2), "b": (x, y - h / 2)}[side]

def arrow(a, b, label="", lx=0.0, ly=0.1, rad=0.0, ls="-"):
    ax.add_patch(FancyArrowPatch(a, b, arrowstyle="-|>,head_length=6,head_width=3.5", color=C, lw=1.0,
                                 mutation_scale=1, shrinkA=0, shrinkB=0, linestyle=ls,
                                 connectionstyle=f"arc3,rad={rad}"))
    if label:
        ax.text((a[0] + b[0]) / 2 + lx, (a[1] + b[1]) / 2 + ly, label, ha="center", va="bottom", fontsize=8.5,
                bbox=dict(fc="white", ec="none", pad=0.3))

def elbow(a, b, via_x=None, via_y=None):
    """right-angle connector a -> (corner) -> b"""
    if via_y is not None:
        pts = [a, (a[0], via_y), (b[0], via_y), b]
    else:
        pts = [a, (via_x, a[1]), (via_x, b[1]), b]
    for p, q in zip(pts[:-2], pts[1:-1]):
        ax.plot([p[0], q[0]], [p[1], q[1]], color=C, lw=1.0)
    arrow(pts[-2], pts[-1])
# start
sx, sy = xy(0, -0.15)
ax.add_patch(Circle((sx, sy + 0.05), 0.16, color="#222222"))
step("open", 0, 0.5, "Open DeskHealth AI")
arrow((sx, sy - 0.11), pt("open", "t"))
step("auth", 1, 1.5, "Show Create Profile (first time) or Login screen")
step("pw", 0, 2.5, "Enter name and password")
step("check", 2, 3.5, "Check password (hash)")
step("savepw", 3, 3.5, "Save / read password hash")
step("calui", 1, 4.5, "Show calibration window")
step("sit", 0, 5.5, "Sit upright and start calibration")
step("base", 2, 6.5, "Record upright posture")
step("savecal", 3, 6.5, "Save calibration")
step("frame", 2, 7.6, "Read webcam frame (1 - 3 per second)")
step("detect", 2, 8.6, "Find shoulders, ears, nose and iris (MediaPipe)")
step("classify", 2, 9.6, "Decide posture state and screen distance")
step("savelog", 3, 9.6, "Save posture log and daily totals")
step("dec", 2, 10.95, "Alert time reached?", kind="decision")
step("alert", 2, 12.3, "Create alert")
step("savealert", 3, 12.3, "Save alert")
step("notify", 1, 12.3, "Show Windows notification and in-app alert")
step("fix", 0, 13.3, "Sit properly or move back")
step("dash", 0, 14.4, "Open dashboard, analytics or alerts")
step("req", 1, 14.4, "Request statistics")
step("read", 2, 14.4, "Read statistics")
step("stats", 3, 14.4, "Return saved data")
step("charts", 1, 15.4, "Show live posture, charts and alert history")

arrow(pt("open", "r"), pt("auth", "l"))
arrow(pt("auth", "b"), pt("pw", "r"))
arrow(pt("pw", "r"), pt("check", "t"), rad=-0.15)
arrow(pt("check", "r"), pt("savepw", "l"))
arrow(pt("check", "b"), pt("calui", "r"))
arrow(pt("calui", "b"), pt("sit", "r"))
arrow(pt("sit", "r"), pt("base", "t"), rad=-0.12)
arrow(pt("base", "r"), pt("savecal", "l"))
arrow(pt("base", "b"), pt("frame", "t"))
arrow(pt("frame", "b"), pt("detect", "t"))
arrow(pt("detect", "b"), pt("classify", "t"))
arrow(pt("classify", "r"), pt("savelog", "l"))
arrow(pt("classify", "b"), pt("dec", "t"))
arrow(pt("dec", "b"), pt("alert", "t"))
ax.text(pt("dec", "b")[0] + 0.1, pt("dec", "b")[1] - 0.2, "Yes", fontsize=8.5, ha="left", va="center")
arrow(pt("alert", "r"), pt("savealert", "l"))
arrow(pt("alert", "l"), pt("notify", "r"))
# "No": back to the next frame (left side of the engine lane)
dx, dy = pt("dec", "l")
fx, fy = pt("frame", "l")
lx = 6.98
ax.plot([dx, lx], [dy, dy], color=C, lw=1.0)
ax.plot([lx, lx], [dy, fy], color=C, lw=1.0)
arrow((lx, fy), (fx, fy))
ax.text(dx - 0.05, dy + 0.08, "No", fontsize=8.5, ha="right", va="bottom")
arrow(pt("notify", "b"), pt("fix", "r"))
ax.text(xy(0, 13.3)[0], xy(0, 13.3)[1] - 0.52, "(tracking continues in the background)", ha="center", fontsize=8, style="italic", color="#555555")
arrow(pt("dash", "r"), pt("req", "l"))
arrow(pt("req", "r"), pt("read", "l"))
arrow(pt("read", "r"), pt("stats", "l"))
arrow(pt("stats", "b"), pt("charts", "r"), rad=-0.1, ls="--")


plt.savefig(sys.argv[1], dpi=200, bbox_inches="tight", facecolor="white")
