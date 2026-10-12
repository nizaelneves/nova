"""Logo rounds 15 and 16: the reversed tile (E5) refined, with Fibonacci / disintegration, in b (F) and phi (G). Run: python build13.py"""
import math
from build import svg, save, lockup, word, turtle_spiral, INK, MINT
from build7 import digit

wb, ww = word()
W = "#ffffff"
pol = lambda cx, cy, r, deg: (cx + r * math.cos(math.radians(deg)), cy + r * math.sin(math.radians(deg)))
dot = lambda p, r, c=MINT: f'<circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{r}" fill="{c}"/>'
sqr = lambda p, s, c=MINT: f'<rect x="{p[0]-s/2:.1f}" y="{p[1]-s/2:.1f}" width="{s}" height="{s}" fill="{c}"/>'


def tile(body, mask=""):
    m = f'<defs><mask id="tm"><rect width="256" height="256" fill="#fff"/>{mask}</mask></defs>' if mask else ""
    return m + f'<rect x="8" y="8" width="240" height="240" rx="58" fill="{INK}"' + (' mask="url(#tm)"' if mask else "") + '/>' + body


def arc(cx, cy, r, a0, a1, w=30, c=W):
    """Round-capped arc, clockwise from a0 to a1 (degrees, y down)."""
    p0, p1 = pol(cx, cy, r, a0), pol(cx, cy, r, a1)
    large = 1 if (a1 - a0) % 360 > 180 else 0
    return f'<path d="M{p0[0]:.1f} {p0[1]:.1f}A{r} {r} 0 {large} 1 {p1[0]:.1f} {p1[1]:.1f}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round"/>'


# ---- the b: stem + open bowl, the gap points up and right, the mint dot sits in it
BX, BY, BR = 128, 155, 38
stem_b = f'<path d="M90 56V208" stroke="{W}" stroke-width="30" stroke-linecap="round"/>'
bowl_b = arc(BX, BY, BR, -5, 275)
gap = lambda d: pol(BX, BY, d, -45)
base_b = stem_b + bowl_b

f1 = tile(base_b + dot(gap(44), 12))                                                                     # clean
f2 = tile(base_b + "".join(dot(gap(d), r) for d, r in [(44, 12), (68, 7.5), (87, 4.6), (100, 2.8)]))      # dots shrinking 8-5-3-2 away
f3 = tile(base_b + "".join(sqr(gap(d), s) for d, s in [(46, 14), (72, 9), (92, 5.5), (106, 3.5)]))         # squares shrinking away
f4 = tile(base_b + "".join(digit(n, *gap(d), h, MINT, max(2, h * 0.12)) for n, d, h in zip("11235", [50, 74, 94, 110, 122], [30, 22, 17, 13, 10])))  # numbers shrinking away
f5 = tile(base_b + f'<path d="{turtle_spiral(2.5, 5, (BX + 3, BY + 1))}" fill="none" stroke="{MINT}" stroke-width="5" stroke-linecap="round"/>' + dot(gap(44), 12))  # golden spiral in the counter
f6 = tile(stem_b + f'<circle cx="{BX}" cy="{BY}" r="{BR}" fill="none" stroke="{W}" stroke-width="30"/>' + dot((206, 52), 12),
          mask='<circle cx="238" cy="18" r="56" fill="#000"/>')                                          # the tile itself is bitten

# ---- the phi
PX_, PY_, PR = 128, 128, 40
stem_p = f'<path d="M128 42V214" stroke="{W}" stroke-width="26" stroke-linecap="round"/>'
ring_p = f'<circle cx="{PX_}" cy="{PY_}" r="{PR}" fill="none" stroke="{W}" stroke-width="26"/>'
g1 = tile(stem_p + ring_p + dot((PX_, PY_), 12))                                                         # clean phi, mint pupil
pg = lambda d: pol(PX_, PY_, d, -45)
g2 = tile(stem_p + arc(PX_, PY_, PR, -5, 275, 26) + dot(pg(PR + 6), 12) + dot(pg(PR + 34), 6))             # open ring, the dot has left
g3 = tile(stem_p + arc(PX_, PY_, PR, 90, 270, 26)
          + "".join(dot(pol(PX_, PY_, PR, -90 + i * 22.5), 13 - i * 1.1, W if i < 7 else MINT) for i in range(9)) + dot((PX_ - 4, PY_), 10))  # right half dissolves
sp = turtle_spiral(3.1, 7, (PX_ - 2, PY_ + 4))
g4 = tile(stem_p + f'<path d="{sp}" fill="none" stroke="{MINT}" stroke-width="9" stroke-linecap="round" transform="translate(-38 -26)"/>' + ring_p)  # spiral inside the ring
g5 = tile(stem_p + "".join(dot(pol(PX_, PY_, PR, -90 + k * 360 / 13), 8.5, W) for k in range(13)) + dot((PX_, PY_), 12))  # ring of 13 dots
g6 = tile(f'<path d="M128 42V150" stroke="{W}" stroke-width="26" stroke-linecap="round"/>' + ring_p
          + "".join(sqr((128, y), s, W if s > 6 else MINT) for y, s in [(172, 17), (193, 11), (208, 7), (219, 4.5)]) + dot((PX_, PY_), 12))  # the stem erodes into squares

for tag, items in {"f": [f1, f2, f3, f4, f5, f6], "g": [g1, g2, g3, g4, g5, g6]}.items():
    for k, body in enumerate(items, 1):
        save(f"{tag}{k}-symbol", svg(256, 256, body))
        save(f"{tag}{k}-lockup", lockup(f'<g transform="translate(0,-28) scale(0.78)">{body}</g>', wb, ww))
print("ok")
