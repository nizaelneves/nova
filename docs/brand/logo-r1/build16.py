"""Chosen route: E6 monogram with the i swapped for an e ("be"), plus a reversed tile. Run: python build16.py"""
import math
from build import svg, save, INK, MINT

PHI = 1.618
W = "#ffffff"
pol = lambda cx, cy, r, deg: (cx + r * math.cos(math.radians(deg)), cy + r * math.sin(math.radians(deg)))


def be(c, uid, dot):
    """b (stem + ring with a bite, bite radius = bowl / phi) next to an e. dot: 'e' = inside the e, 'top' = above it."""
    bx, by, e_x = 114, 158, 284
    bite = pol(bx, by, 78, -35)
    ex1 = pol(e_x, by, 60, 45)
    mask = f'<defs><mask id="{uid}"><rect width="400" height="256" fill="#fff"/><circle cx="{bite[0]:.1f}" cy="{bite[1]:.1f}" r="{78/PHI:.1f}" fill="#000"/></mask></defs>'
    b = (f'<rect x="36" y="16" width="36" height="220" rx="18" fill="{c}"/>'
         f'<circle cx="{bx}" cy="{by}" r="60" fill="none" stroke="{c}" stroke-width="36" mask="url(#{uid})"/>')
    e = (f'<path d="M{e_x+60} {by}A60 60 0 1 0 {ex1[0]:.1f} {ex1[1]:.1f}" fill="none" stroke="{c}" stroke-width="36" stroke-linecap="round"/>'
         f'<path d="M{e_x-60} {by}H{e_x+60}" stroke="{c}" stroke-width="24" stroke-linecap="round"/>')
    d = f'<circle cx="{e_x}" cy="{by-28}" r="12" fill="{MINT}"/>' if dot == "e" else f'<circle cx="{e_x}" cy="46" r="22" fill="{MINT}"/>'
    return mask + b + e + d


S = 0.74
mono = lambda dot, uid: f'<g transform="translate({128-199*S:.1f} {128-126*S:.1f}) scale({S})">{be(INK, uid, dot)}</g>'
T = 0.6
tile = (f'<rect x="8" y="8" width="240" height="240" rx="58" fill="{INK}"/>'
        f'<g transform="translate({128-199*T:.1f} {128-126*T:.1f}) scale({T})">{be(W, "tm", "e")}</g>')

save("be-monogram", svg(256, 256, mono("e", "m1")))
save("be-monogram-dot-above", svg(256, 256, mono("top", "m2")))
save("be-tile-reversed", svg(256, 256, tile))
print("ok")
