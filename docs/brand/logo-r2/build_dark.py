"""Brand round 2 (dark, inspired by the user's references): aura, ribbon, eyes in a blur, dust, pixel wordmark, nodes.
Run: python build_dark.py  ->  dark-1.html/png, dark-2.html/png, svg/*.svg
"""
import math, os, random, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "phibe"))
from build_brand import Pen, be, wordmark, NAVY, MINT, CYAN, WHITE  # noqa: E402  (also rewrites the brand svgs, harmless)

os.makedirs(os.path.join(HERE, "svg"), exist_ok=True)
L, S = Pen(), Pen(small=True)
pol = lambda cx, cy, r, d: (cx + r * math.cos(math.radians(d)), cy + r * math.sin(math.radians(d)))
BEVB = "-18 -70 294 210"            # viewBox of the be monogram
DOT = (197, 41)                      # where the mint dot sits in the e


def be_body(ink=WHITE, mint=MINT, pen=L, small=False):
    return be(pen, ink, mint, small=small)[0]


# ---- R1 aura: the mint dot is a light source, the letters glow faintly cyan
r1 = (f'<defs><radialGradient id="a1"><stop offset="0" stop-color="{MINT}" stop-opacity=".95"/><stop offset=".45" stop-color="{MINT}" stop-opacity=".35"/><stop offset="1" stop-color="{MINT}" stop-opacity="0"/></radialGradient>'
      f'<filter id="b1" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter></defs>'
      f'<g filter="url(#b1)" opacity=".55">{be_body(CYAN, CYAN)}</g>'
      f'<circle cx="{DOT[0]}" cy="{DOT[1]}" r="58" fill="url(#a1)"/>'
      f'{be_body(WHITE, MINT)}')
r1_flat = be_body(WHITE, MINT)

# ---- R2 ribbon: the same letters twice, a deep copy offset behind, the front one in a gradient
r2 = (f'<defs><linearGradient id="g2" gradientUnits="userSpaceOnUse" x1="0" y1="-52" x2="258" y2="122"><stop offset="0" stop-color="{CYAN}"/><stop offset="1" stop-color="{MINT}"/></linearGradient></defs>'
      f'<g transform="translate(7 8)" opacity=".9">{be_body("#0a5f86", "#0a5f86")}</g>'
      f'{be_body("url(#g2)", WHITE)}')
r2_flat = be_body(CYAN, MINT)

# ---- R3 eyes in a blur: two soft lobes (big and small, ratio 1:phi) merged like a droplet pair, two crisp eyes
r3 = (f'<defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{CYAN}"/><stop offset="1" stop-color="{MINT}"/></linearGradient>'
      f'<filter id="b3" x="-30%" y="-40%" width="160%" height="180%"><feGaussianBlur stdDeviation="11"/></filter></defs>'
      f'<g filter="url(#b3)"><circle cx="70" cy="64" r="56" fill="url(#g3)"/><circle cx="168" cy="64" r="35" fill="url(#g3)"/><rect x="70" y="40" width="98" height="48" fill="url(#g3)"/></g>'
      f'<ellipse cx="70" cy="56" rx="9" ry="16" fill="{WHITE}"/><ellipse cx="168" cy="56" rx="9" ry="16" fill="{WHITE}"/>')
r3_vb = "-20 -20 288 168"
r3_flat = (f'<circle cx="70" cy="64" r="52" fill="{MINT}"/><circle cx="168" cy="64" r="32" fill="{MINT}"/><rect x="70" y="42" width="98" height="44" fill="{MINT}"/>'
           f'<ellipse cx="70" cy="56" rx="9" ry="16" fill="{NAVY}"/><ellipse cx="168" cy="56" rx="9" ry="16" fill="{NAVY}"/>')

# ---- R4 dust: the be, and from the e a plume of squares and specks drifting up and to the right
random.seed(5)
x0, y0 = pol(197, 61, 61, -42)
plume = []
for i in range(70):
    t = (i + 1) / 70
    d = 8 + t ** 0.9 * 175
    spread = random.uniform(-1, 1) * (4 + t * 46)
    px = x0 + d * math.cos(math.radians(-38)) - spread * math.sin(math.radians(-38))
    py = y0 + d * math.sin(math.radians(-38)) + spread * math.cos(math.radians(-38))
    s = 8.5 * (1 - t) ** 1.5 + 1.2
    col = random.choices([WHITE, MINT, CYAN], [0.6, 0.25, 0.15])[0]
    if random.random() < 0.55:
        plume.append(f'<rect x="{px - s/2:.1f}" y="{py - s/2:.1f}" width="{s:.1f}" height="{s:.1f}" fill="{col}" transform="rotate({random.randint(0, 60)} {px:.1f} {py:.1f})"/>')
    else:
        plume.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{s/2:.1f}" fill="{col}"/>')
r4 = be_body(WHITE, MINT) + "".join(plume)
r4_vb = "-18 -150 420 290"
r4_flat = be_body(WHITE, MINT, S, small=True)

# ---- R5 pixel wordmark: the descender of the p breaks into squares (.pixel style); the e keeps the dot
def pixel_wordmark(ink):
    x, parts = 0, []
    s = L.w / 2
    parts.append(L.line(s, s, L.H - s, ink) + L.circle(s + L.R, L.cy, ink))
    yy = L.H + 12
    for k, side in enumerate([26, 19, 13, 9, 6]):
        parts.append(f'<rect x="{s - side/2:.1f}" y="{yy:.1f}" width="{side}" height="{side}" fill="{MINT if k >= 3 else ink}"/>')
        yy += side + 7
    x = L.H + 18
    for fn in (L.h, L.i):
        p_, x = fn(x, ink); parts.append(p_); x += 18
    p_, x = L.b(x, ink); parts.append(p_); x += 14
    p_, x = L.e(x, ink, dot=MINT); parts.append(p_)
    return "".join(parts), x

r5_body, r5_w = pixel_wordmark(WHITE)
r5 = r5_body
r5_vb = f"-18 -70 {r5_w + 36} 270"
r5_flat = be_body(WHITE, MINT, S, small=True)

# ---- R6 nodes: wordmark with mint nodes at the stroke ends (ORA style)
wm, ww = wordmark(L, WHITE, MINT)
nodes = ""
H = L.H
for nx, ny in [(L.w / 2, H + 65 - L.w / 2), (H + 18 + L.w / 2, -52 + L.w / 2), (2 * H + 36 + L.w + 18 + L.w / 2, -52 + L.w / 2)]:
    nodes += f'<circle cx="{nx:.1f}" cy="{ny:.1f}" r="{L.w * 0.62:.1f}" fill="{MINT}"/>'
r6 = wm + nodes
r6_vb = f"-18 -70 {ww + 36} 275"
r6_flat = be_body(WHITE, MINT, S, small=True)

CARDS_1 = [
    ("R1 Aura", "The dot is a light source, a soft cyan glow behind the letters (Laken, SAIO)", r1, BEVB, r1_flat, BEVB),
    ("R2 Ribbon", "Two copies, a deep one offset behind a cyan to mint front: depth like the folded N (Nexora)", r2, BEVB, r2_flat, BEVB),
    ("R3 Eyes in a blur", "Two soft lobes, 1 : phi, merged like a droplet pair, with two crisp eyes (Tencent AI, Laken)", r3, r3_vb, r3_flat, r3_vb),
]
CARDS_2 = [
    ("R4 Dust", "The e sheds squares and specks up and to the right, getting smaller (Invisible, .pixel)", r4, r4_vb, r4_flat, BEVB),
    ("R5 Pixel wordmark", "The descender of the p breaks into squares 26, 19, 13, 9, 6 (.pixel, rigear)", r5, r5_vb, r5_flat, BEVB),
    ("R6 Nodes", "Wordmark with mint nodes where the strokes end (ORA)", r6, r6_vb, r6_flat, BEVB),
]


def sheet(cards, title, out):
    html = ['<!doctype html><meta charset="utf-8"><title>%s</title><style>body{margin:0;background:#060511;color:#cfd3e6;font:14px/1.4 system-ui,Segoe UI,sans-serif;padding:28px}h1{font-size:18px;margin:0 0 18px;color:#fff}'
            '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.c{background:#0d0b24;border:1px solid #1d1a45;border-radius:18px;padding:18px}.big{height:300px;display:grid;place-items:center}.big svg{max-width:100%%;max-height:300px}'
            '.row{display:flex;gap:18px;align-items:end;margin:8px 0}.row small{display:block;color:#6e7194;font-size:11px;margin-top:4px}h2{margin:10px 0 2px;font-size:16px;color:#fff}p{margin:0;color:#9aa0c3;font-size:12px}</style>' % title]
    html.append(f"<h1>{title}</h1><div class='grid'>")
    for name, note, body, vb, flat, fvb in cards:
        w, h = [float(v) for v in vb.split()[2:]]
        html.append(f"<div class='c'><div class='big'><svg viewBox='{vb}' width='{w*1.0}' height='{h*1.0}'>{body}</svg></div>")
        html.append("<div class='row'>" + "".join(f"<div><svg viewBox='{fvb}' height='{px}' width='{px*float(fvb.split()[2])/float(fvb.split()[3]):.0f}'>{flat}</svg><small>{px}px</small></div>" for px in (64, 32, 16)) + "</div>")
        html.append(f"<h2>{name}</h2><p>{note}</p></div>")
    html.append("</div>")
    path = os.path.join(HERE, out + ".html")
    open(path, "w", encoding="utf-8").write("".join(html))
    for n, (name, _, body, vb, *_r) in enumerate(cards):
        pass
    return path


for cards, title, out in ((CARDS_1, "Phibe round 2.1: aura, ribbon, eyes in a blur", "dark-1"), (CARDS_2, "Phibe round 2.2: dust, pixel wordmark, nodes", "dark-2")):
    p = sheet(cards, title, out)
    for name, _, body, vb, *_r in cards:
        slug = name.split()[0].lower()
        open(os.path.join(HERE, "svg", f"{slug}.svg"), "w", encoding="utf-8").write(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><rect x="-1000" y="-1000" width="3000" height="3000" fill="#060511"/>{body}</svg>')
print("ok")
