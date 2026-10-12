"""Brand round 4 (dark, from the user's references): sun behind the word, assembling bars, constellation, notched wordmark,
iridescent Orb, app icon with glow. Run: python build_dark3.py -> dark-5.html/png, dark-6.html/png, svg/*.svg
"""
import math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "phibe"))
from build_brand import Pen, be, wordmark, NAVY, MINT, CYAN, WHITE  # noqa: E402

L, S = Pen(), Pen(small=True)
BG = "#060511"
H, W_ = L.H, L.w
cy = L.cy
pol = lambda cx, cy_, r, d: (cx + r * math.cos(math.radians(d)), cy_ + r * math.sin(math.radians(d)))
wm, ww = wordmark(L, WHITE, MINT)
x_b = 2 * H + 36 + W_ + 18
x_e = x_b + H + 14
ecx = x_e + W_ / 2 + L.R
BEVB = "-18 -70 294 210"


def flat_be(ink):
    return be(S, ink, MINT, small=True)[0]


# T1: a sun of light behind the e, the word overlaps it (Fended)
t1 = (f'<defs><radialGradient id="sun"><stop offset="0" stop-color="{MINT}"/><stop offset=".55" stop-color="{CYAN}" stop-opacity=".75"/><stop offset="1" stop-color="{CYAN}" stop-opacity="0"/></radialGradient>'
      f'<filter id="sb" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter></defs>'
      f'<g filter="url(#sb)"><circle cx="{ecx + 26}" cy="{cy - 22}" r="104" fill="url(#sun)"/></g>{wm}')
t1_vb = f"-30 -110 {ww + 90} 320"

# T2: the b assembling out of bars (the scattering bars of the pixel animation)
random.seed(8)
bx = 40
pieces = []
for y0, y1 in [(-38, 24), (36, 82), (94, 148)]:                       # stem in three bars
    pieces.append(f'<path d="M{bx} {y0}V{y1}" stroke="{WHITE}" stroke-width="{W_}" stroke-linecap="butt" fill="none"/>')
bcx = bx + L.R
for a0, a1 in [(-5, 52), (60, 117), (125, 182), (190, 247)]:           # bowl in four arcs, the gap kept for the dot
    p0, p1 = pol(bcx, cy + 28, L.R, a0), pol(bcx, cy + 28, L.R, a1)
    pieces.append(f'<path d="M{p0[0]:.1f} {p0[1]:.1f}A{L.R} {L.R} 0 0 1 {p1[0]:.1f} {p1[1]:.1f}" stroke="{WHITE}" stroke-width="{W_}" fill="none"/>')
dx, dy = pol(bcx, cy + 28, L.R + 6, -52)
pieces.append(f'<circle cx="{dx:.1f}" cy="{dy:.1f}" r="12" fill="{MINT}"/>')
bars = []
for i in range(34):
    ang, dist = random.uniform(0, 2 * math.pi), random.uniform(115, 260)
    x, y = bcx - 20 + dist * math.cos(ang), 40 + dist * 0.62 * math.sin(ang)
    horiz = random.random() < 0.5
    ln, th = random.uniform(10, 70) * (1.2 - dist / 400), 6
    col = random.choice([MINT, CYAN, WHITE, "#3d5af1"])
    bars.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{ln if horiz else th:.1f}" height="{th if horiz else ln:.1f}" fill="{col}"/>')
t2 = "".join(pieces) + "".join(bars)
t2_vb = "-200 -150 520 400"

# T3: constellation: a thin spiral with planets of Fibonacci sizes and a mint eye at the centre
def semis(n, s):
    X = [0] + [((k + 1) // 2 * s) * (1 if k % 2 else -1) for k in range(1, n + 1)]
    return [(X[k], X[k + 1], abs(X[k + 1] - X[k]) / 2) for k in range(n)]


def along(k, s, f, n=8):
    x0, x1, r = semis(n, s)[k]
    c = (x0 + x1) / 2
    ang = math.pi + f * math.pi if x1 > x0 else f * math.pi
    return c + r * math.cos(ang), r * math.sin(ang)


ss = semis(8, 17)
path = f"M{ss[0][0]} 0" + "".join(f"A{r} {r} 0 0 1 {x1} 0" for _, x1, r in ss)
planets = ""
for (k, f, r, col) in [(2, .5, 3, WHITE), (3, .3, 5, MINT), (4, .7, 8, WHITE), (5, .25, 13, CYAN), (6, .6, 5, WHITE), (7, .8, 3, MINT)]:
    px, py = along(k, 17, f)
    planets += f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{r}" fill="{col}"/>'
t3 = (f'<defs><radialGradient id="cg"><stop offset="0" stop-color="{MINT}" stop-opacity=".9"/><stop offset="1" stop-color="{MINT}" stop-opacity="0"/></radialGradient></defs>'
      f'<g transform="translate(128 132)"><circle r="40" fill="url(#cg)"/><path d="{path}" fill="none" stroke="{WHITE}" stroke-width="2.4" opacity=".9"/>{planets}<circle r="9" fill="{MINT}"/></g>')
t3_vb = "0 0 256 256"

# T4: wordmark with square details (rigear): the i dot is a pixel, the b sheds three squares
def notched():
    x, parts = 0, []
    for fn in (L.p, L.h):
        s_, x = fn(x, WHITE); parts.append(s_); x += 18
    s_, x = L.i(x, WHITE, dot=WHITE)
    s_ = s_.replace(f'<circle cx="{x - W_ / 2:.1f}"', '<circle cx="-999"')   # drop the round dot
    parts.append(s_)
    ix = x - W_ / 2
    parts.append(f'<rect x="{ix - 14:.1f}" y="-34" width="28" height="28" fill="{MINT}"/>')
    x += 18
    s_, x = L.b(x, WHITE); parts.append(s_); x += 14
    bx0 = x_b + W_ / 2
    for k, (ox, oy, sz) in enumerate([(26, -4, 14), (46, -24, 9), (60, -42, 5)]):
        parts.append(f'<rect x="{bx0 + ox - sz / 2:.1f}" y="{-52 + oy - sz / 2:.1f}" width="{sz}" height="{sz}" fill="{MINT if k else WHITE}"/>')
    s_, x = L.e(x, WHITE, dot=MINT); parts.append(s_)
    return "".join(parts)


t4 = notched()
t4_vb = f"-30 -110 {ww + 60} 330"

# T5: the Orb as an iridescent sphere with two crisp eyes (SAIO, K, Tencent)
t5 = (f'<defs><clipPath id="oc"><circle cx="128" cy="128" r="100"/></clipPath><filter id="ob" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="20"/></filter></defs>'
      f'<g clip-path="url(#oc)"><rect width="256" height="256" fill="#0b2a5e"/><g filter="url(#ob)">'
      f'<circle cx="86" cy="96" r="78" fill="{CYAN}"/><circle cx="176" cy="156" r="70" fill="{MINT}"/><circle cx="120" cy="208" r="64" fill="#0b6bb0"/><circle cx="92" cy="74" r="34" fill="#ffffff" opacity=".55"/></g></g>'
      f'<ellipse cx="102" cy="124" rx="9" ry="18" fill="{WHITE}"/><ellipse cx="154" cy="124" rx="9" ry="18" fill="{WHITE}"/>')
t5_vb = "0 0 256 256"
t5_flat = f'<circle cx="128" cy="128" r="110" fill="{NAVY}" stroke="{MINT}" stroke-width="12"/><ellipse cx="100" cy="122" rx="12" ry="22" fill="{MINT}"/><ellipse cx="156" cy="122" rx="12" ry="22" fill="{MINT}"/>'

# T6: app icon: navy tile, white be, mint dot glowing, a cyan to mint light under the tile
be_w, bw = be(L, WHITE, MINT)
sc = 0.58
tx, ty = 128 - (0 + bw / 2) * sc, 128 - (-52 + 4 + 87) * sc
t6 = (f'<defs><linearGradient id="ug" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{CYAN}"/><stop offset="1" stop-color="{MINT}"/></linearGradient>'
      f'<filter id="ub" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="14"/></filter><filter id="db" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5"/></filter></defs>'
      f'<g filter="url(#ub)" opacity=".85"><rect x="22" y="34" width="212" height="212" rx="52" fill="url(#ug)"/></g>'
      f'<rect x="8" y="8" width="240" height="240" rx="58" fill="{NAVY}"/>'
      f'<g transform="translate({tx:.1f} {ty:.1f}) scale({sc})"><circle cx="197" cy="41" r="26" fill="{MINT}" filter="url(#db)"/>{be_w}</g>')
t6_vb = "-10 -10 276 290"
t6_flat = (f'<rect x="8" y="8" width="240" height="240" rx="58" fill="{NAVY}"/>' + f'<g transform="translate({128 - 129 * .62:.1f} {128 - 35 * .62:.1f}) scale(.62)">{flat_be(WHITE)}</g>')

CARDS_5 = [
    ("T1 Sun behind", "A mint to cyan sun behind the e, the word overlaps it (Fended)", t1, t1_vb, flat_be(WHITE), BEVB),
    ("T2 Assembling", "The b built from bars and arcs with gaps, loose bars scattered around (the pixel animation)", t2, t2_vb, flat_be(WHITE), BEVB),
    ("T3 Constellation", "A thin spiral with planets 3, 5, 8, 13 and a mint eye in the middle (the galaxy mark)", t3, t3_vb, flat_be(WHITE), BEVB),
]
CARDS_6 = [
    ("T4 Square details", "The i dot is a pixel, the b sheds three squares 14, 9, 5 (rigear, .pixel)", t4, t4_vb, flat_be(WHITE), BEVB),
    ("T5 Iridescent Orb", "The Orb as a soft gradient sphere with two crisp eyes (SAIO, K, Tencent AI)", t5, t5_vb, t5_flat, t5_vb),
    ("T6 App icon with glow", "Navy tile, white be, a glowing dot and a cyan to mint light underneath", t6, t6_vb, t6_flat, "0 0 256 256"),
]


def sheet(cards, title, out):
    css = ('body{margin:0;background:#060511;color:#cfd3e6;font:14px/1.4 system-ui,Segoe UI,sans-serif;padding:28px}h1{font-size:18px;margin:0 0 18px;color:#fff}'
           '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.c{background:#0d0b24;border:1px solid #1d1a45;border-radius:18px;padding:18px}'
           '.big{height:300px;display:grid;place-items:center;overflow:hidden}.big svg{max-width:100%;max-height:300px}.row{display:flex;gap:18px;align-items:end;margin:8px 0}'
           '.row small{display:block;color:#6e7194;font-size:11px;margin-top:4px}h2{margin:10px 0 2px;font-size:16px;color:#fff}p{margin:0;color:#9aa0c3;font-size:12px}')
    html = [f'<!doctype html><meta charset="utf-8"><title>{title}</title><style>{css}</style><h1>{title}</h1><div class="grid">']
    for name, note, body, vb, flat, fvb in cards:
        w, h = [float(v) for v in vb.split()[2:]]
        html.append(f'<div class="c"><div class="big"><svg viewBox="{vb}" width="{w}" height="{h}">{body}</svg></div>')
        html.append('<div class="row">' + "".join(f'<div><svg viewBox="{fvb}" height="{px}" width="{px * float(fvb.split()[2]) / float(fvb.split()[3]):.0f}">{flat}</svg><small>{px}px</small></div>' for px in (64, 32, 16)) + "</div>")
        html.append(f"<h2>{name}</h2><p>{note}</p></div>")
    html.append("</div>")
    open(os.path.join(HERE, out + ".html"), "w", encoding="utf-8").write("".join(html))
    for name, _, body, vb, *_r in cards:
        open(os.path.join(HERE, "svg", f"{name.split()[0].lower()}.svg"), "w", encoding="utf-8").write(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><rect x="-1000" y="-1000" width="3000" height="3000" fill="{BG}"/>{body}</svg>')


sheet(CARDS_5, "Phibe round 4.1: sun behind, assembling bars, constellation", "dark-5")
sheet(CARDS_6, "Phibe round 4.2: square details, iridescent Orb, app icon with glow", "dark-6")
print("ok")
