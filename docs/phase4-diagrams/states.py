"""UML state machine diagram: posture tracking states (fixed layout)."""
import sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Circle

fig, ax = plt.subplots(figsize=(13, 8.6))
ax.set_xlim(-0.2, 15.0); ax.set_ylim(0.4, 10.2); ax.axis("off")
H = 0.75
C = "#333333"
pos = {}

def state(key, text, x, y, w=2.1):
    ax.add_patch(FancyBboxPatch((x - w / 2, y - H / 2), w, H, boxstyle="round,pad=0,rounding_size=0.22",
                                fc="white", ec=C, lw=1.2, zorder=2))
    ax.text(x, y, text, ha="center", va="center", fontsize=11.5, zorder=3)
    pos[key] = (x, y, w)

def side(key, where):
    x, y, w = pos[key]
    return {"l": (x - w / 2, y), "r": (x + w / 2, y), "t": (x, y + H / 2), "b": (x, y - H / 2)}[where]

def arrow(p1, p2, rad=0.0):
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle="-|>,head_length=7,head_width=4", color=C, lw=1.1,
                                 mutation_scale=1, connectionstyle=f"arc3,rad={rad}", shrinkA=0, shrinkB=0, zorder=1))

def label(x, y, text, ha="center"):
    ax.text(x, y, text, ha=ha, va="center", fontsize=9.5, zorder=4)

# composite state "Tracking"
ax.add_patch(FancyBboxPatch((0.3, 1.0), 10.0, 5.9, boxstyle="round,pad=0,rounding_size=0.3",
                            fc="#FAFAFA", ec=C, lw=1.2, zorder=0))
ax.text(0.55, 6.55, "Tracking", fontsize=12.5, weight="bold", va="center")
ax.text(5.3, 6.15, "(starts in Healthy)", ha="center", fontsize=9, style="italic", color="#555555")

# top row
state("calib", "Calibrating", 2.6, 9.0)
state("uncal", "Uncalibrated", 7.0, 9.0)
state("starting", "Starting", 11.6, 9.0)
ax.add_patch(Circle((14.2, 9.0), 0.17, color="#222222"))
arrow((14.03, 9.0), side("starting", "r")); label(13.35, 9.42, "app opened")
arrow(side("starting", "l"), side("uncal", "r")); label(9.3, 9.42, "no calibration saved")
arrow(side("uncal", "l"), side("calib", "r")); label(4.8, 9.42, "user starts calibration")

# entering the composite state
arrow(side("calib", "b"), (2.6, 6.9)); label(2.75, 7.8, "15 upright samples\nsaved", ha="left")
arrow((10.9, 8.62), (8.6, 6.9)); label(9.55, 7.95, "camera ready and\ncalibration saved", ha="right")

# substates
state("slouch", "Slouching", 1.55, 3.9)
state("healthy", "Healthy", 5.3, 3.9)
state("rest", "Resting", 9.05, 3.9)
state("away", "Away", 5.3, 1.75)
arrow((side("healthy", "l")[0], 4.05), (side("slouch", "r")[0], 4.05))
arrow((side("slouch", "r")[0], 3.75), (side("healthy", "l")[0], 3.75))
label(3.425, 4.55, "shoulders down\nor forward"); label(3.425, 3.25, "posture\ncorrected")
arrow((side("healthy", "r")[0], 4.05), (side("rest", "l")[0], 4.05))
arrow((side("rest", "l")[0], 3.75), (side("healthy", "r")[0], 3.75))
label(7.175, 4.55, "leans back\n≥ 12 cm"); label(7.175, 3.25, "sits up\nagain")
arrow((5.1, side("healthy", "b")[1]), (5.1, side("away", "t")[1]))
arrow((5.5, side("away", "t")[1]), (5.5, side("healthy", "b")[1]))
label(4.95, 2.83, "no person\nfound", ha="right"); label(5.65, 2.83, "person\nback", ha="left")
arrow(side("slouch", "t"), side("rest", "t"), rad=-0.3)
label(5.3, 5.62, "leans back")

# leaving the composite state (from any tracking state)
state("paused", "Paused", 11.95, 5.3)
state("nocam", "Camera\nunavailable", 12.4, 2.4)
arrow((10.3, 5.3), side("paused", "l")); label(10.85, 5.95, "Pause or\nvideo call")
arrow((10.3, 2.4), side("nocam", "l")); label(10.9, 2.8, "camera\nlost")
arrow((12.0, 5.67), (11.75, 8.62)); label(11.65, 7.2, "Resume or\ncall ended", ha="right")
arrow((13.3, 2.78), (12.3, 8.62), rad=0.0) if False else None
ax.add_patch(FancyArrowPatch((13.45, 2.4), (12.4, 8.62), arrowstyle="-|>,head_length=7,head_width=4",
                             color=C, lw=1.1, mutation_scale=1, shrinkA=0, shrinkB=0,
                             connectionstyle="angle3,angleA=90,angleB=0", zorder=1) if False else
             FancyArrowPatch((13.45, 2.4), (12.5, 8.62), arrowstyle="-|>,head_length=7,head_width=4",
                             color=C, lw=1.1, mutation_scale=1, shrinkA=0, shrinkB=0,
                             connectionstyle="arc3,rad=0.18", zorder=1))
label(14.2, 5.3, "retry\nevery 2 s")

plt.savefig(sys.argv[1], dpi=200, bbox_inches="tight", facecolor="white")
