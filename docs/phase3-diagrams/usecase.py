"""Use case diagram (UML 2.5) with a fixed layout: primary actor left, secondary actors right."""
import sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse, FancyBboxPatch, FancyArrowPatch

out = sys.argv[1]
fig, ax = plt.subplots(figsize=(14, 10.4))
ax.set_xlim(-0.4, 15.4)
ax.set_ylim(-1.0, 13.6)
ax.axis("off")
FONT = dict(fontsize=10.5, family="DejaVu Sans", ha="center", va="center")
EW, EH = 2.55, 0.78

# system boundary
ax.add_patch(FancyBboxPatch((2.3, -0.7), 10.9, 14.0, boxstyle="round,pad=0,rounding_size=0.08",
                            fc="#FAFAFA", ec="#333333", lw=1.2))
ax.text(7.75, 13.05, "DeskHealth AI", fontsize=12, weight="bold", ha="center", va="center")

UC = {}
def uc(key, text, x, y, w=EW):
    ax.add_patch(Ellipse((x, y), w, EH, fc="white", ec="#333333", lw=1.0))
    ax.text(x, y, text, **FONT)
    UC[key] = (x, y, w)

LX = 4.05
left = [("profile", "Create Profile\n(set password)"), ("unlock", "Unlock with\nPassword"),
        ("lock", "Lock Dashboard"), ("calib", "Calibrate Upright\nPosture"),
        ("monitor", "Monitor Workspace\n(background tracking)"), ("pause", "Pause / Resume\nMonitoring"),
        ("snooze", "Snooze Alerts"), ("dash", "View Health\nDashboard"), ("analytics", "View Analytics"),
        ("history", "View Alert\nHistory"), ("settings", "Configure Settings\n(incl. eye-strain on/off)"),
        ("export", "Export Posture\nData (CSV)"), ("quit", "Quit Application")]
for i, (k, t) in enumerate(left):
    uc(k, t, LX, 12.0 - i, w=2.95)

MX, RX = 8.1, 11.45
uc("reset", "Reset Profile\n(forgot password)", MX, 11.0)
uc("rest", "Detect Resting State\n(leaning back)", MX, 9.75, w=2.8)
uc("slouch", "Detect Slouching\n(shoulders down / forward)", MX, 8.5, w=3.05)
uc("dist", "Measure Screen\nDistance", MX, 7.1)
uc("camera", "Release Camera\nDuring Video Call", 6.95, 5.25, w=2.4)
uc("palert", "Send Posture\nAlert", RX, 8.5, w=2.2)
uc("calert", "Send Too-Close\nAlert", RX, 7.1, w=2.2)

def edge_pt(k, tx, ty):
    """point on the ellipse border of use case k toward (tx, ty)"""
    import math
    x, y, w = UC[k]
    a, b = w / 2, EH / 2
    dx, dy = tx - x, ty - y
    t = 1 / math.sqrt((dx / a) ** 2 + (dy / b) ** 2)
    return x + dx * t, y + dy * t

def actor(x, y, label, label_above=False):
    ax.add_patch(plt.Circle((x, y + 0.55), 0.17, fc="#F2F2F2", ec="#333333", lw=1.1))
    ax.plot([x, x], [y + 0.38, y - 0.12], color="#333333", lw=1.1)
    ax.plot([x - 0.3, x + 0.3], [y + 0.22, y + 0.22], color="#333333", lw=1.1)
    ax.plot([x, x - 0.24], [y - 0.12, y - 0.5], color="#333333", lw=1.1)
    ax.plot([x, x + 0.24], [y - 0.12, y - 0.5], color="#333333", lw=1.1)
    if label_above:
        ax.text(x, y + 0.85, label, fontsize=10.5, ha="center", va="bottom")
    else:
        ax.text(x, y - 0.68, label, fontsize=10.5, ha="center", va="top")
    return x, y

user = actor(0.65, 6.0, "Desktop User", label_above=True)
os_ = actor(14.3, 7.95, "«system»\nOS Native\nNotifications")
call = actor(14.3, 5.15, "«system»\nVideo Call App\n(Zoom / Teams)")

def assoc(p, k):
    px, py = p
    ex, ey = edge_pt(k, px, py)
    ax.plot([px, ex], [py + 0.1, ey], color="#333333", lw=0.9)

for k, _ in left:
    # join each use case at its leftmost point so no line crosses another use case
    x, y, w = UC[k]
    ax.plot([user[0] + 0.32, x - w / 2], [user[1] + 0.1, y], color="#333333", lw=0.9)
for k, a in (("palert", os_), ("calert", os_), ("camera", call)):
    ex, ey = edge_pt(k, a[0] - 0.35, a[1])
    ax.plot([a[0] - 0.35, ex], [a[1] + 0.1, ey], color="#333333", lw=0.9)

def dep(src, dst, label, lx=None, ly=None, dst_right=False):
    """dashed dependency arrow from use case src to dst with a stereotype label"""
    sx, sy, _ = UC[src]
    dx, dy, dw = UC[dst]
    if dst_right:                       # end at the rightmost point of dst
        p2 = (dx + dw / 2, dy)
        p1 = edge_pt(src, *p2)
    else:
        p1 = edge_pt(src, dx, dy)
        p2 = edge_pt(dst, sx, sy)
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle="->,head_length=7,head_width=4.5",
                                 linestyle=(0, (5, 3)), color="#333333", lw=0.95, mutation_scale=1))
    mx, my = (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2
    ax.text(mx + (lx or 0), my + (ly if ly is not None else 0.12), label,
            fontsize=9.5, ha="center", va="bottom",
            bbox=dict(fc="#FAFAFA", ec="none", pad=0.5))

# «include»: base -> included
dep("monitor", "slouch", "«include»", lx=-0.2, ly=0.1)
dep("monitor", "dist", "«include»", lx=0.25, ly=0.02)
# «extend»: extending -> base
dep("reset", "unlock", "«extend»", ly=0.08)
dep("rest", "monitor", "«extend»", lx=-0.15, ly=0.12)
dep("camera", "monitor", "«extend»", lx=0.5, ly=-0.25, dst_right=True)
dep("palert", "slouch", "«extend»", ly=0.06)
dep("calert", "dist", "«extend»", ly=0.06)

plt.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
