"""Logo rounds 17 and 18: H2 Dissolve (P) and H3 Spiral ring (Q), each with Fibonacci, disintegration and spiral. Run: python build14.py"""
import math
from build import svg, save, lockup, word, INK, MINT
from build7 import digit

wb, ww = word()
PHI = 1.618
W = "#ffffff"
circ = lambda x, y, r, c: f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{c}"/>'
sq = lambda x, y, s, c: f'<rect x="{x-s/2:.1f}" y="{y-s/2:.1f}" width="{s:.1f}" height="{s:.1f}" fill="{c}"/>'
eye = lambda cx, cy, rx=13, ry=20: f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{MINT}"/>'
half = f'<path d="M128 24A104 104 0 0 0 128 232Z" fill="{INK}"/>'


def column_dots(radii, x0=146, gap=8, R=104, k=2.6, cmin=1, colour=INK, last=MINT):
    out, x = [], x0
    for i, r in enumerate(radii):
        x += r
        h = math.sqrt(max(R * R - (x - 128) ** 2, 1))
        n = max(cmin, int(2 * h / (k * r)))
        c = last if i == len(radii) - 1 else colour
        out += [circ(x, 128 - h + (2 * j + 1) * h / n, r, c) for j in range(n)]
        x += r + gap
    return "".join(out)


# ---------- Round 17 (P): H2 Dissolve ----------
p1 = half + eye(94, 120) + column_dots([18, 11, 6.5])                                                  # clean: three columns
p2 = half + eye(94, 120)
cx0, cy0 = 176, 128
for i in range(15):                                                                                      # dots on a spiral leaving the half-disc
    t = 0.2 + i * 0.42
    x, y = cx0 + (6 + 17 * t) * math.cos(t * 1.6 + 2.0), cy0 + (6 + 17 * t) * math.sin(t * 1.6 + 2.0)
    if x > 142 and 24 < y < 232:
        p2 += circ(x, y, max(2, 12 - i * 0.7), MINT if i == 14 else INK)
p3 = half + eye(94, 120) + column_dots([16, 10, 6.2, 3.8, 2.4], gap=7)                                   # halftone: fewer big, more small
heights = [(80, "8"), (50, "5"), (31, "3"), (19, "2"), (12, "1")]
p4, xx = half + eye(94, 120), 168                                                                        # countdown 8-5-3-2-1
for h, d in heights:
    p4 += digit(d, xx, 128, h, MINT if d == "1" else INK, max(2.2, h * 0.11))
    xx += h * 0.42 + 16
sbound = lambda y: (128 + math.sqrt(max(63.8 ** 2 - (y - 89.8) ** 2, 0)) if y < 153.6 else 128 - math.sqrt(max(38.2 ** 2 - (y - 191.8) ** 2, 0)))
sdots, xs = [], 0
for r, nx in [(14, 4), (9, 7), (5.5, 11), (3.4, 16)]:                                                    # golden S edge + dots on the other side
    for j in range(40):
        y = 36 + j * (192 / 39) * (1 if True else 1)
    xs += 0
p5 = f'<path d="M128 26A102 102 0 0 0 128 230A38.2 38.2 0 0 1 128 153.6A63.8 63.8 0 0 0 128 26Z" fill="{INK}"/>'
dots5 = []
for r, xoff in [(15, 28), (9.5, 62), (6, 86), (3.8, 104)]:
    n = int(190 / (r * 2.7))
    for j in range(n):
        y = 34 + (j + 0.5) * 190 / n
        x = max(sbound(y), 128) + r + 8 + (xoff - 28) * 0.55 + 0
        if math.hypot(x - 128, y - 128) < 100 - r:
            dots5.append(circ(x, y, r, MINT if r < 4 else INK))
p5 += "".join(dots5)
tile_clip = f'<defs><clipPath id="hc"><rect x="0" y="0" width="132" height="256"/></clipPath></defs>'
p6 = tile_clip + f'<g clip-path="url(#hc)"><rect x="8" y="8" width="240" height="240" rx="58" fill="{INK}"/></g>' + eye(86, 122, 13, 20)
xq = 150
for s in [34, 21, 13, 8]:
    n = int(230 / (s * 1.35))
    for j in range(n):
        p6 += sq(xq + s / 2, 18 + (j + 0.5) * 220 / n, s, MINT if s == 8 else INK)
    xq += s + 9

# ---------- Round 18 (Q): H3 Spiral ring ----------
def xs_(n, s):
    return [0] + [((k + 1) // 2 * s) * (1 if k % 2 else -1) for k in range(1, n + 1)]


def semis(n, s):
    X = xs_(n, s)
    return [(X[k], X[k + 1], abs(X[k + 1] - X[k]) / 2) for k in range(n)]


def path_of(n, s, a=0, b=None):
    ss = semis(n, s)[a:b]
    return f'M{ss[0][0]} 0' + "".join(f'A{r} {r} 0 0 1 {x1} 0' for x0, x1, r in ss)


def along(k, s, f, n=8):
    """Point at fraction f of semicircle k (clockwise)."""
    x0, x1, r = semis(n, s)[k]
    c = (x0 + x1) / 2
    ang = math.pi + f * math.pi if x1 > x0 else f * math.pi   # going right: top half; going left: bottom half
    return c + r * math.cos(ang), r * math.sin(ang)


G = lambda body, dy=0: f'<g transform="translate(128 {128+dy})">{body}</g>'
q1 = G(f'<path d="{path_of(8, 24)}" fill="none" stroke="{INK}" stroke-width="15" stroke-linecap="round"/>' + circ(0, 0, 14, MINT), -6)
q2 = G(f'<path d="{path_of(6, 24, 0, 6)}" fill="none" stroke="{INK}" stroke-width="15" stroke-linecap="round"/>' + circ(0, 0, 14, MINT)
       + "".join(circ(*along(k, 24, f), r, INK) for k, f, r in [(6, 0.1, 9), (6, 0.35, 7), (6, 0.6, 5.2), (6, 0.82, 3.6), (7, 0.1, 3), (7, 0.3, 2.4)]), -6)
q3 = G(circ(0, 0, 9, MINT) + "".join(circ(*along(k, 26, (i + 0.5) / n), 3.2 + k * 1.6, INK) for k, n in enumerate([1, 1, 2, 3, 5, 8]) for i in range(n)), 0)
q4 = G(f'<path d="{path_of(6, 26)}" fill="none" stroke="{INK}" stroke-width="5" stroke-linecap="round" opacity=".35"/>'
       + "".join(digit(d, *along(k, 26, 0.5, 8), h, MINT if d == "1" else INK, max(2.4, h * 0.11)) for k, (d, h) in enumerate(zip("112358", [16, 20, 26, 34, 44, 56]))), 0)
q5 = G("".join(f'<path d="M{x0} 0A{r} {r} 0 0 1 {x1} 0" fill="none" stroke="{INK}" stroke-width="{4 + k*2.8:.1f}" stroke-linecap="round"/>' for k, (x0, x1, r) in enumerate(semis(8, 22)))
       + circ(0, 0, 12, MINT), -4)
q6 = (f'<rect x="8" y="8" width="240" height="240" rx="58" fill="{INK}"/>'
      + G(f'<path d="{path_of(6, 20, 0, 6)}" fill="none" stroke="{W}" stroke-width="13" stroke-linecap="round"/>' + circ(0, 0, 12, MINT)
          + "".join(sq(*along(6, 20, f), s, MINT if s < 6 else W) for f, s in [(0.1, 16), (0.35, 10), (0.6, 6), (0.82, 3.6)]), -4))

for tag, items in {"p": [p1, p2, p3, p4, p5, p6], "q": [q1, q2, q3, q4, q5, q6]}.items():
    for k, body in enumerate(items, 1):
        save(f"{tag}{k}-symbol", svg(256, 256, body))
        save(f"{tag}{k}-lockup", lockup(f'<g transform="translate(0,-28) scale(0.78)">{body}</g>', wb, ww))
print("ok")
