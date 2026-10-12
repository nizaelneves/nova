"""Three colour rounds: A = mist pill (S4) incl. the "be", B = square details (T4), C = light system (U6).
Run: python build_rounds.py -> round-a.html/png, round-b.html/png, round-c.html/png, svg/
"""
import math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "phibe"))
from build_brand import Pen, be, NAVY, MINT, CYAN, WHITE  # noqa: E402

os.makedirs(os.path.join(HERE, "svg"), exist_ok=True)
L = Pen()
H, W_ = L.H, L.w
VIOLET, TEAL, PEACH, PEACH2, CORAL, INDIGO = "#6d4aff", "#0d7d73", "#ffe3bd", "#f6c38f", "#ff6b5e", "#1f1c6b"
TRAIL = [(24, -2, 16), (44, -20, 11), (60, -34, 8), (73, -46, 5), (83, -56, 3)]   # squares shed by the b, sizes ~ Fibonacci


def wm_parts(left, right, dot, idot=None, square_i=None):
    """phibe: p h i in `left`, b e in `right`. square_i: colour of a square i-dot (None = round dot)."""
    x, parts = 0, []
    for fn in (L.p, L.h):
        s, x = fn(x, left); parts.append(s); x += 18
    x_i = x
    s, x = L.i(x, left, dot=idot or left)
    if square_i:
        s = s.replace(f'<circle cx="{x_i + W_ / 2:.1f}"', '<circle cx="-999"')
        s += f'<rect x="{x_i + W_ / 2 - 14:.1f}" y="-36" width="28" height="28" fill="{square_i}"/>'
    parts.append(s); x += 18
    x_b = x
    s, x = L.b(x, right); parts.append(s); x += 14
    s, x = L.e(x, right, dot=dot); parts.append(s)
    return "".join(parts), x, x_b


def trail(x_b, colors):
    bx = x_b + W_ / 2
    return "".join(f'<rect x="{bx + ox - sz / 2:.1f}" y="{-52 + oy - sz / 2:.1f}" width="{sz}" height="{sz}" fill="{colors[k % len(colors)]}"/>' for k, (ox, oy, sz) in enumerate(TRAIL))


# ===================== ROUND A: mist pill =====================
def mist(uid, cA, cB, ww, blur=16):
    return (f'<defs><linearGradient id="{uid}g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{cA}"/><stop offset="1" stop-color="{cB}"/></linearGradient>'
            f'<filter id="{uid}f" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="{blur}"/></filter></defs>'
            f'<g filter="url(#{uid}f)"><circle cx="10" cy="64" r="124" fill="url(#{uid}g)"/><circle cx="{ww - 12}" cy="64" r="92" fill="{cB}"/><rect x="10" y="-30" width="{ww - 22}" height="188" fill="url(#{uid}g)"/></g>')


def mist_card(uid, cA, cB, ink, dot, idot=None):
    wm, ww, _ = wm_parts(ink, ink, dot, idot)
    return mist(uid, cA, cB, ww) + wm, f"-150 -90 {ww + 300} 320"


def mist_be(uid, cA, cB, ink, dot):
    b, x = be(L, ink, dot)
    body = (f'<defs><linearGradient id="{uid}g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{cA}"/><stop offset="1" stop-color="{cB}"/></linearGradient>'
            f'<filter id="{uid}f" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="14"/></filter></defs>'
            f'<g filter="url(#{uid}f)"><circle cx="10" cy="36" r="112" fill="url(#{uid}g)"/><circle cx="{x - 10}" cy="36" r="84" fill="{cB}"/><rect x="10" y="-40" width="{x - 20}" height="152" fill="url(#{uid}g)"/></g>{b}')
    return body, f"-150 -110 {x + 300} 290"


A = []
b_, vb_ = mist_card("a1", NAVY, "#0b4f78", WHITE, MINT)
A.append(("A1 Navy mist", "Refined: the lobes keep a 1 : 0.74 ratio, the word is centred on the x-height, mint dot", "#f4f6fa", b_, vb_, [(NAVY, "navy"), ("#0b4f78", "deep blue"), (MINT, "mint")]))
b_, vb_ = mist_card("a2", CYAN, MINT, NAVY, WHITE)
A.append(("A2 Cyan to mint mist", "Airy: the brand gradient as the mist, navy letters, white dot", "#f4f6fa", b_, vb_, [(CYAN, "cyan"), (MINT, "mint"), (NAVY, "navy")]))
b_, vb_ = mist_card("a3", VIOLET, CYAN, WHITE, MINT)
A.append(("A3 Violet to cyan mist", "A colder mist from the references: violet into cyan, white letters, mint dot", "#f4f6fa", b_, vb_, [(VIOLET, "violet"), (CYAN, "cyan"), (MINT, "mint")]))
b_, vb_ = mist_card("a4", PEACH, PEACH2, NAVY, TEAL)
A.append(("A4 Peach mist", "Warm: the peach accent as the mist, navy letters, deep teal dot", "#fffaf2", b_, vb_, [(PEACH, "peach"), (PEACH2, "peach dark"), (TEAL, "deep teal")]))
b_, vb_ = mist_be("a5", NAVY, CYAN, WHITE, MINT)
A.append(("A5 be in the mist", "The monogram alone, inside a navy to cyan mist", "#f4f6fa", b_, vb_, [(NAVY, "navy"), (CYAN, "cyan"), (MINT, "mint")]))
# A6: two colours: phi on navy mist, be on mint mist
wm_l, _, _ = wm_parts(WHITE, NAVY, WHITE)
wm_a, ww_a, xb_a = wm_parts(WHITE, NAVY, WHITE)
split = xb_a - 20
two = (f'<defs><filter id="a6f" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>'
       f'<clipPath id="a6l"><rect x="-400" y="-300" width="{split + 400}" height="800"/></clipPath><clipPath id="a6r"><rect x="{split}" y="-300" width="1400" height="800"/></clipPath></defs>'
       f'<g filter="url(#a6f)"><g clip-path="url(#a6l)"><circle cx="10" cy="64" r="124" fill="{NAVY}"/><rect x="10" y="-60" width="{split}" height="248" fill="{NAVY}"/></g>'
       f'<g clip-path="url(#a6r)"><circle cx="{ww_a - 12}" cy="64" r="92" fill="{MINT}"/><rect x="{split}" y="-30" width="{ww_a - split - 12}" height="188" fill="{MINT}"/></g></g>')
two += wm_a
A.append(("A6 Two-colour mist", "phi on a navy mist, be on a mint mist: the be gets its own colour", "#f4f6fa", two, f"-150 -90 {ww_a + 300} 320", [(NAVY, "navy"), (MINT, "mint"), (WHITE, "white")]))

# ===================== ROUND B: square details =====================
def grad(uid, a, b, w):
    return f'<defs><linearGradient id="{uid}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="{w}" y2="0"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs>'


B = []
VB = lambda ww: f"-30 -120 {ww + 60} 340"
wm, ww, xb = wm_parts(WHITE, WHITE, MINT, square_i=MINT)
B.append(("B1 Brand", "Refined: five squares 16, 11, 8, 5, 3 fading in mint, a square dot on the i", "#060511", wm + trail(xb, [MINT]), VB(ww), [(WHITE, "white"), (MINT, "mint")]))
wm, ww, xb = wm_parts(WHITE, MINT, WHITE, square_i=CYAN)
B.append(("B2 be in mint", "phi white, be mint, the squares from cyan into mint, the i square cyan", "#060511", wm + trail(xb, [CYAN, CYAN, MINT, MINT, MINT]), VB(ww), [(WHITE, "white"), (MINT, "mint"), (CYAN, "cyan")]))
wm, ww, xb = wm_parts(NAVY, NAVY, TEAL, square_i=TEAL)
B.append(("B3 Light, teal and peach", "On light: navy letters, deep teal squares turning peach", "#f4f6fa", wm + trail(xb, [TEAL, TEAL, PEACH2, PEACH2, PEACH]), VB(ww), [(NAVY, "navy"), (TEAL, "deep teal"), (PEACH2, "peach")]))
wm, ww, xb = wm_parts(WHITE, WHITE, MINT, square_i=VIOLET)
B.append(("B4 Spectrum", "White letters, squares from violet through cyan to mint (the references' gradients)", "#060511", wm + trail(xb, [VIOLET, "#3f7bff", CYAN, "#14d6c0", MINT]), VB(ww), [(VIOLET, "violet"), (CYAN, "cyan"), (MINT, "mint")]))
wm, ww, xb = wm_parts(WHITE, WHITE, MINT, square_i=CORAL)
B.append(("B5 Coral spark", "A warm accent: coral squares fading to peach, the e dot stays mint", "#0d0b24", wm + trail(xb, [CORAL, CORAL, "#ff9a85", PEACH2, PEACH]), VB(ww), [(CORAL, "coral"), (PEACH2, "peach"), (MINT, "mint")]))
_, ww0, _ = wm_parts(WHITE, WHITE, WHITE)
wm, ww, xb = wm_parts("url(#b6)", "url(#b6)", WHITE, square_i=WHITE)
B.append(("B6 Gradient letters", "The letters carry the cyan to mint gradient, the squares and dots are white", "#060511", grad("b6", CYAN, MINT, ww0) + wm + trail(xb, [WHITE]), VB(ww), [(CYAN, "cyan"), (MINT, "mint"), (WHITE, "white")]))

# ===================== ROUND C: light system =====================
def tile(uid, fill, ink, dot, size=150, grad_pair=None):
    sc = size / 240 * 0.58
    b, bw = be(L, ink, dot)
    tx, ty = size / 2 - bw / 2 * sc, size / 2 - 35 * sc
    defs = ""
    if grad_pair:
        defs = f'<defs><linearGradient id="{uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{grad_pair[0]}"/><stop offset="1" stop-color="{grad_pair[1]}"/></linearGradient></defs>'
        fill = f"url(#{uid})"
    return f'{defs}<rect width="{size}" height="{size}" rx="{size * 0.24:.0f}" fill="{fill}"/><g transform="translate({tx:.1f} {ty:.1f}) scale({sc:.3f})">{b}</g>'


def lockup_h(tile_svg, wm_body, ww, extra=""):
    s = 0.78
    return (f'{tile_svg}<g transform="translate(190 {75 - 61 * s:.1f}) scale({s})">{wm_body}{extra}</g>', f"-20 -20 {190 + ww * s + 60} 190")


C = []
wm, ww, xb = wm_parts(NAVY, NAVY, MINT, square_i=MINT)
body, vb = lockup_h(tile("c1", "", NAVY, WHITE, grad_pair=(CYAN, MINT)), wm, ww, trail(xb, [MINT, MINT, CYAN, CYAN, CYAN]))
C.append(("C1 Refined brand", "Tile centred on the x-height line of the word; gradient tile, navy wordmark, mint and cyan squares", "#f4f6fa", body, vb, [(CYAN, "cyan"), (MINT, "mint"), (NAVY, "navy")]))
body, vb = lockup_h(tile("c2", NAVY, WHITE, MINT), wm, ww, trail(xb, [MINT]))
C.append(("C2 Navy tile", "The reverse: navy tile with a white be, the same navy wordmark", "#f4f6fa", body, vb, [(NAVY, "navy"), (MINT, "mint"), (WHITE, "white")]))
# C3 stacked
t3 = tile("c3", "", NAVY, WHITE, size=170, grad_pair=(CYAN, MINT))
s3 = 0.62
C.append(("C3 Stacked", "Tile over the wordmark, for square spaces and posters", "#f4f6fa",
          f'<g transform="translate({(ww * s3 - 170) / 2:.1f} 0)">{t3}</g><g transform="translate(0 {170 + 46 + 52 * s3:.1f}) scale({s3})">{wm}{trail(xb, [MINT, MINT, CYAN, CYAN, CYAN])}</g>',
          f"-30 -20 {ww * s3 + 60} {170 + 46 + 190 * s3 + 40}", [(CYAN, "cyan"), (MINT, "mint"), (NAVY, "navy")]))
wm, ww, xb = wm_parts(TEAL, TEAL, PEACH2, square_i=PEACH2)
body, vb = lockup_h(tile("c4", TEAL, WHITE, PEACH), wm, ww, trail(xb, [PEACH2, PEACH2, "#f2a96b", "#f2a96b", "#f2a96b"]))
C.append(("C4 Warm paper", "A warm light version: deep teal and peach on paper, no navy at all", "#fff6ea", body, vb, [(TEAL, "deep teal"), (PEACH, "peach"), (PEACH2, "peach dark")]))
wm, ww, xb = wm_parts(INDIGO, INDIGO, MINT, square_i=VIOLET)
body, vb = lockup_h(tile("c5", "", WHITE, MINT, grad_pair=(INDIGO, VIOLET)), wm, ww, trail(xb, [VIOLET, VIOLET, "#3f7bff", CYAN, MINT]))
C.append(("C5 Indigo and violet", "A cooler system: indigo tile and wordmark, violet squares into mint", "#ffffff", body, vb, [(INDIGO, "indigo"), (VIOLET, "violet"), (MINT, "mint")]))
wm, ww, xb = wm_parts(NAVY, "url(#c6)", NAVY, square_i=NAVY)
body, vb = lockup_h(tile("c6t", NAVY, WHITE, MINT, size=150), grad("c6", "#0aa9bb", "#14d6a0", ww) + wm, ww, trail(xb, ["#0aa9bb", "#0aa9bb", "#14d6a0", "#14d6a0", "#14d6a0"]))
C.append(("C6 phi navy, be gradient", "phi in navy and be in a deeper cyan to mint gradient: the be gets its own colour", "#f4f6fa", body, vb, [(NAVY, "navy"), ("#0aa9bb", "deep cyan"), ("#14d6a0", "deep mint")]))


def sheet(cards, title, out):
    css = ('body{margin:0;background:#101226;color:#cfd3e6;font:14px/1.4 system-ui,Segoe UI,sans-serif;padding:26px}h1{font-size:18px;margin:0 0 16px;color:#fff}'
           '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.c{border-radius:16px;padding:16px;border:1px solid #232649}'
           '.big{height:200px;display:grid;place-items:center;overflow:hidden}.big svg{max-width:100%;max-height:200px}'
           'h2{margin:8px 0 2px;font-size:15px}p{margin:0 0 8px;font-size:12px;opacity:.75}.chips{display:flex;gap:10px;flex-wrap:wrap}'
           '.chip{display:flex;align-items:center;gap:6px;font-size:11px;opacity:.9}.chip i{width:14px;height:14px;border-radius:4px;border:1px solid rgba(128,128,128,.35);display:inline-block}')
    html = [f'<!doctype html><meta charset="utf-8"><title>{title}</title><style>{css}</style><h1>{title}</h1><div class="grid">']
    for name, note, bg, body, vb, chips in cards:
        light = bg.lower() in ("#f4f6fa", "#fffaf2", "#fff6ea", "#ffffff")
        fg = "#14123f" if light else "#ffffff"
        w, h = [float(v) for v in vb.split()[2:]]
        html.append(f'<div class="c" style="background:{bg};color:{fg}"><div class="big"><svg viewBox="{vb}" width="{w}" height="{h}">{body}</svg></div><h2>{name}</h2><p>{note}</p>'
                    + '<div class="chips">' + "".join(f'<span class="chip"><i style="background:{c}"></i>{c} {n}</span>' for c, n in chips) + "</div></div>")
    html.append("</div>")
    open(os.path.join(HERE, out + ".html"), "w", encoding="utf-8").write("".join(html))
    for name, _, bg, body, vb, _c in cards:
        open(os.path.join(HERE, "svg", f"{name.split()[0].lower()}.svg"), "w", encoding="utf-8").write(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><rect x="-1000" y="-1000" width="3000" height="3000" fill="{bg}"/>{body}</svg>')


sheet(A, "Phibe, round A: mist pill, colour variations (and the be)", "round-a")
sheet(B, "Phibe, round B: square details, colour variations", "round-b")
sheet(C, "Phibe, round C: light system, colour variations", "round-c")
print("ok")
