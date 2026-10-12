"""Logo round 8: disintegration (N1..N6). Run: python build8.py"""
import math, random
from build import svg, save, lockup, word, INK, MINT

wb, ww = word()
eye = lambda cx, cy, rx=12, ry=19: f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{MINT}"/>'
random.seed(11)

# N1: the Orb loses its top-right to drifting particles
parts = [f'<defs><clipPath id="c"><polygon points="0,256 0,0 150,0 40,256"/><polygon points="0,256 40,256 256,256 256,256"/></clipPath></defs>']
parts.append(f'<g clip-path="url(#c)"><circle cx="100" cy="150" r="88" fill="{INK}"/></g>')
parts.append(eye(78, 150, 11, 18) + eye(116, 150, 11, 18))
for i in range(40):
    t = (i + 1) / 40
    d = 40 + t * 150
    spread = random.uniform(-1, 1) * (14 + t * 46)
    x = 120 + d * 0.72 + spread * 0.7
    y = 150 - d * 0.78 + spread * 0.7
    r = 11 * (1 - t) ** 1.3 + 1.6
    if x + r < 252 and y - r > 4 and math.hypot(x - 100, y - 150) > 92:
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{MINT if i % 7 == 0 else INK}"/>')
n1 = "".join(parts)

# N2: slices: the Orb cut into strips that slide away from the top
strips, shifts = [], [58, 40, 26, 14, 6, 0, 0, 0, 0]
for k, sh in enumerate(shifts):
    yc = 38 + k * 22.5
    hw = math.sqrt(max(100 ** 2 - (yc - 128) ** 2, 1))
    strips.append(f'<rect x="{128 - hw + sh:.1f}" y="{yc-9.5:.1f}" width="{2*hw:.1f}" height="19" rx="5" fill="{INK}"/>')
n2 = "".join(strips) + eye(100, 128, 12, 19) + eye(156, 128, 12, 19)

# N3: phi that dissolves: left half solid, right half and the lower stem turn into dots
dots = []
for i in range(9):
    a = math.radians(-90 + i * 22.5)
    dots.append(f'<circle cx="{128 + 64*math.cos(a):.1f}" cy="{128 + 64*math.sin(a):.1f}" r="{11 - i*0.95:.1f}" fill="{INK}"/>')
for i in range(6):
    dots.append(f'<circle cx="128" cy="{150 + i*19}" r="{9 - i*1.3:.1f}" fill="{INK}"/>')
n3 = (f'<path d="M128 64A64 64 0 0 0 128 192" fill="none" stroke="{INK}" stroke-width="22" stroke-linecap="round"/>'
      f'<path d="M128 14V118" stroke="{INK}" stroke-width="22" stroke-linecap="round"/>' + "".join(dots)
      + eye(112, 126, 9, 15) + eye(146, 126, 9, 15))

# N4: shards: six wedges of the Orb drifting apart, the face stays whole
wedges = []
for k in range(6):
    a0, a1 = math.radians(k * 60 - 90), math.radians(k * 60 - 30)
    am = (a0 + a1) / 2
    off = 6 + k * 3.2
    dx, dy = off * math.cos(am), off * math.sin(am)
    p = lambda a, r: (128 + dx + r * math.cos(a), 128 + dy + r * math.sin(a))
    x0, y0 = p(a0, 98); x1, y1 = p(a1, 98)
    wedges.append(f'<path d="M{128+dx:.1f} {128+dy:.1f}L{x0:.1f} {y0:.1f}A98 98 0 0 1 {x1:.1f} {y1:.1f}Z" fill="{INK}"/>')
n4 = "".join(wedges) + eye(106, 120, 11, 18) + eye(150, 120, 11, 18)

# N5: the edge crumbles: a ring of squares that grow smaller and drift off to the top right
sq = []
for i in range(84):
    a = math.radians(i * 360 / 84)
    w = (1 + math.cos(a - math.radians(-40))) / 2
    if w > 0.55 and i % 3 == 0:
        continue
    r = 82 + 40 * w ** 1.6
    s = 15 * (1 - 0.72 * w)
    x, y = 128 + r * math.cos(a), 128 + r * math.sin(a)
    sq.append(f'<rect x="{x - s/2:.1f}" y="{y - s/2:.1f}" width="{s:.1f}" height="{s:.1f}" fill="{MINT if w > 0.8 else INK}"/>')
n5 = f'<circle cx="128" cy="128" r="76" fill="{INK}"/>' + "".join(sq) + eye(108, 124, 11, 17) + eye(148, 124, 11, 17)

# N6: the wordmark itself disintegrating: solid, dashed, dotted, tiny dots
def dash(w, d): return f'stroke-width="{w}" stroke-dasharray="{d}"' if d else f'stroke-width="{w}"'
def p_(d, st): return f'<path d="{d}" fill="none" stroke="{INK}" stroke-linecap="round" stroke-linejoin="round" {st}/>'
def c_(cx, cy, st): return f'<circle cx="{cx}" cy="{cy}" r="40" fill="none" stroke="{INK}" stroke-linecap="round" {st}/>'
solid, dsh, dot, tiny = dash(14, None), dash(14, "15 12"), dash(14, "0.1 22"), dash(9, "0.1 17")
w = [p_("M20 40V160", solid), c_(60, 80, solid), p_("M120 0V120M120 80A40 40 0 0 1 200 80V120", solid),
     p_("M250 50V120", dsh), f'<circle cx="250" cy="12" r="13" fill="{MINT}"/>',
     p_("M300 0V120", dot), c_(340, 80, dot),
     p_("M390 50V120", tiny), f'<circle cx="390" cy="12" r="9" fill="{MINT}"/>']
word6 = "".join(w)
n6 = f'<g transform="translate(0 76) scale(0.58)">{word6}</g>'

for k, body in enumerate([n1, n2, n3, n4, n5, n6], 1):
    save(f"n{k}-symbol", svg(256, 256, body))
    save(f"n{k}-lockup", lockup(f'<g transform="translate(0,-28) scale(0.78)">{body}</g>', wb, ww))
save("n6-lockup", svg(440, 256, f'<g transform="translate(10 40)">{word6}</g>'))
print("ok")
