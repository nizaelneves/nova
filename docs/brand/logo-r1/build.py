"""Logo round 1: five routes (G1..G5) as flat SVG sketches. Run: python build.py"""
import math, os

OUT = os.path.dirname(os.path.abspath(__file__))
INK, MINT, CYAN = "#14123f", "#20e7aa", "#10c3d3"
SW = 14  # monoline stroke


def svg(w, h, body, vb=None):
    vb = vb or f"0 0 {w} {h}"
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}">{body}</svg>'


def save(name, s):
    open(os.path.join(OUT, name + ".svg"), "w", encoding="utf-8").write(s)


def stroke(d, c=INK, w=SW):
    return f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>'


def word(ink=INK, dots=MINT, phi=False):
    """'phibi' monoline, x-height 40..120. Dots of the i's are the eyes. phi=True swaps 'ph' for a phi."""
    g = []
    x = 20
    if phi:
        g.append(f'<circle cx="{x+40}" cy="80" r="40" fill="none" stroke="{ink}" stroke-width="{SW}"/>')
        g.append(stroke(f"M{x+40} 8V168", ink))
        x += 100
    else:
        g.append(stroke(f"M{x} 40V160", ink))
        g.append(f'<circle cx="{x+40}" cy="80" r="40" fill="none" stroke="{ink}" stroke-width="{SW}"/>')
        x += 100
        g.append(stroke(f"M{x} 0V120M{x} 80A40 40 0 0 1 {x+80} 80V120", ink))
        x += 112
    # i
    g.append(stroke(f"M{x} 50V120", ink)); g.append(f'<circle cx="{x}" cy="12" r="13" fill="{dots}"/>')
    x += 50
    g.append(stroke(f"M{x} 0V120", ink)); g.append(f'<circle cx="{x+40}" cy="80" r="40" fill="none" stroke="{ink}" stroke-width="{SW}"/>')
    x += 100
    g.append(stroke(f"M{x} 50V120", ink)); g.append(f'<circle cx="{x}" cy="12" r="13" fill="{dots}"/>')
    return "".join(g), x + 20


def orb(cx, cy, r, ink=INK, ring=MINT, eye=MINT):
    sw = r * 0.09
    ex, ey = r * 0.3, r * 0.04
    return (f'<circle cx="{cx}" cy="{cy}" r="{r-sw/2}" fill="{ink}" stroke="{ring}" stroke-width="{sw}"/>'
            f'<ellipse cx="{cx-ex}" cy="{cy-ey}" rx="{r*0.13}" ry="{r*0.2}" fill="{eye}"/>'
            f'<ellipse cx="{cx+ex}" cy="{cy-ey}" rx="{r*0.13}" ry="{r*0.2}" fill="{eye}"/>')


def lockup(sym_body, word_body, ww):
    # symbol 200 high at left, wordmark scaled to ~110 high, vertically centred
    s = 0.8
    body = f'<g transform="translate(0,28)">{sym_body}</g><g transform="translate(240,{128-80*s+0}) scale({s})">{word_body}</g>'
    return svg(int(240 + ww * s + 8), 256, body)


def turtle_spiral(unit, n=8, start=(0, 0)):
    """Golden spiral as quarter arcs with radii unit*fib."""
    fib = [1, 1]
    while len(fib) < n: fib.append(fib[-1] + fib[-2])
    x, y = start; h = 0.0
    d = f"M{x:.2f} {y:.2f}"
    for f in fib:
        r = f * unit
        cx, cy = x + r * math.cos(h + math.pi / 2), y + r * math.sin(h + math.pi / 2)
        a0 = h - math.pi / 2
        a1 = a0 + math.pi / 2
        nx, ny = cx + r * math.cos(a1), cy + r * math.sin(a1)
        d += f"A{r:.2f} {r:.2f} 0 0 1 {nx:.2f} {ny:.2f}"
        x, y, h = nx, ny, h + math.pi / 2
    return d


# ---- G1: orb mark + wordmark with eye dots
wb, ww = word()
save("g1-symbol", svg(256, 256, orb(128, 128, 120)))
save("g1-wordmark", svg(int(ww), 180, wb))
save("g1-lockup", lockup(orb(100, 100, 100), wb, ww))

# ---- G2: phi face (circle with two eyes, stem through it) + phi wordmark
sw = 22
phi_sym = (f'<circle cx="128" cy="128" r="70" fill="none" stroke="{INK}" stroke-width="{sw}"/>'
           f'<path d="M128 14V242" stroke="{INK}" stroke-width="{sw}" stroke-linecap="round"/>'
           f'<ellipse cx="102" cy="124" rx="11" ry="17" fill="{MINT}"/><ellipse cx="154" cy="124" rx="11" ry="17" fill="{MINT}"/>')
# eyes sit on a navy knock-out so the stem does not cross them
phi_sym = (f'<circle cx="128" cy="128" r="70" fill="none" stroke="{INK}" stroke-width="{sw}"/>'
           f'<path d="M128 14V58M128 198V242" stroke="{INK}" stroke-width="{sw}" stroke-linecap="round"/>'
           f'<path d="M128 58V70M128 186V198" stroke="{INK}" stroke-width="{sw}"/>'
           f'<ellipse cx="104" cy="126" rx="12" ry="19" fill="{MINT}"/><ellipse cx="152" cy="126" rx="12" ry="19" fill="{MINT}"/>')
wp, wpw = word(phi=True)
save("g2-symbol", svg(256, 256, phi_sym))
save("g2-lockup", lockup(f'<g transform="translate(-28,-28)">{phi_sym}</g>', wp, wpw))

# ---- G3: honeycomb growing 1-1-2-3-5
def hexpath(cx, cy, r):
    pts = [(cx + r * math.cos(math.radians(60 * i + 30)), cy + r * math.sin(math.radians(60 * i + 30))) for i in range(6)]
    return "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z"
R = 36
cells = [(0, 0), (1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1), (1, -1), (2, -1), (2, 0), (1, 1), (0, 2), (-1, 2)]
groups = [1, 1, 2, 3, 5]
hexes, i = [], 0
for gi, n in enumerate(groups):
    for _ in range(n):
        q, r_ = cells[i]
        cx = 128 + R * math.sqrt(3) * (q + r_ / 2) - 20
        cy = 128 + R * 1.5 * r_ - 20
        last = i == len(cells) - 1 - 0 and False
        fill = INK if gi < 4 else INK
        hexes.append((cx, cy, gi))
        i += 1
body = "".join(f'<path d="{hexpath(cx, cy, R-3)}" fill="{INK if gi < 4 else MINT}"/>' for cx, cy, gi in hexes)
save("g3-symbol", svg(256, 256, f'<g transform="translate(18,24) scale(0.9)">{body}</g>'))
save("g3-lockup", lockup(f'<g transform="translate(-6,-4) scale(0.75)">{body}</g>', wb, ww))

# ---- G4: eye with golden-spiral iris
eye = (f'<path d="M12 128Q128 20 244 128Q128 236 12 128Z" fill="none" stroke="{INK}" stroke-width="14" stroke-linejoin="round"/>'
       f'<circle cx="128" cy="128" r="50" fill="{INK}"/>'
       f'<path d="{turtle_spiral(4.0, 7, (128-12, 128+4))}" fill="none" stroke="{MINT}" stroke-width="7" stroke-linecap="round"/>')
save("g4-symbol", svg(256, 256, eye))
save("g4-lockup", lockup(f'<g transform="translate(0,-28) scale(0.78)">{eye}</g>', wb, ww))

# ---- G5: Fibonacci bubble (8x5 rectangle of squares 5,3,2,1,1) + tail
U = 24
sq = [(0, 0, 5), (5, 0, 3), (6, 3, 2), (5, 3, 1), (5, 4, 1)]
lines = "".join(f'<rect x="{x*U}" y="{y*U}" width="{s*U}" height="{s*U}" fill="none" stroke="{INK}" stroke-width="6"/>' for x, y, s in sq)
bub = (f'<g transform="translate(32,40)">'
       f'<rect x="0" y="0" width="{8*U}" height="{5*U}" rx="10" fill="none" stroke="{INK}" stroke-width="12" stroke-linejoin="round"/>'
       f'<path d="M{1.2*U} {5*U}L{1.2*U} {6.6*U}L{2.8*U} {5*U}" fill="{INK}" stroke="{INK}" stroke-width="12" stroke-linejoin="round"/>'
       f'{lines}'
       f'<path d="M0 {5*U}A{5*U} {5*U} 0 0 1 {5*U} 0A{3*U} {3*U} 0 0 1 {8*U} {3*U}A{2*U} {2*U} 0 0 1 {6*U} {5*U}A{U} {U} 0 0 1 {5*U} {4*U}A{U} {U} 0 0 1 {6*U} {3*U}" fill="none" stroke="{MINT}" stroke-width="8" stroke-linecap="round"/></g>')
save("g5-symbol", svg(256, 256, bub))
save("g5-lockup", lockup(f'<g transform="translate(0,-20) scale(0.78)">{bub}</g>', wb, ww))
print("ok")
