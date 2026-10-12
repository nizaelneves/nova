"""Brand round 5: gradient icon tile, caps wordmark with a mint E bar, letters as eyes, facet split, eroded wordmark, light system.
Run: python build_dark4.py -> dark-7.html/png, dark-8.html/png, svg/*.svg
"""
import math, os, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "phibe"))
from build_brand import Pen, be, wordmark, NAVY, MINT, CYAN, WHITE  # noqa: E402

L, S = Pen(), Pen(small=True)
BG = "#060511"
H, W_ = L.H, L.w
BEVB = "-18 -70 294 210"
be_n, bw = be(L, NAVY, WHITE)
wm_w, ww = wordmark(L, WHITE, MINT)


def flat_be(ink):
    return be(S, ink, MINT, small=True)[0]


# U1: the app icon the other way round: a cyan to mint tile with a navy be
sc = 0.58
tx, ty = 128 - bw / 2 * sc, 128 - 35 * sc
u1 = (f'<defs><linearGradient id="ug" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{CYAN}"/><stop offset="1" stop-color="{MINT}"/></linearGradient></defs>'
      f'<rect x="8" y="8" width="240" height="240" rx="58" fill="url(#ug)"/>'
      f'<g transform="translate({tx:.1f} {ty:.1f}) scale({sc})">{be_n}</g>')
u1_flat = (f'<rect x="8" y="8" width="240" height="240" rx="58" fill="{MINT}"/><g transform="translate({128 - 129 * .62:.1f} {128 - 35 * .62:.1f}) scale(.62)">{flat_be(NAVY)}</g>')

# U2: capitals, clean and wide; the middle bar of the E is the mint one and runs on (the E of Nexora)
GL = {"P": ("M0 0V90M0 7H27A20 20 0 0 1 27 47H0", 48), "H": ("M0 0V90M46 0V90M0 45H46", 46), "I": ("M0 0V90", 0),
      "B": ("M0 0V90M0 7H27A19 19 0 0 1 27 45H0M0 45H31A19 19 0 0 1 31 83H0", 52), "E": ("M46 7H0M0 7V83H46", 46)}
x, parts = 0, []
for ch in "PHIBE":
    d, wd = GL[ch]
    parts.append(f'<path d="{d}" transform="translate({x} 0)" fill="none" stroke="{WHITE}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>')
    if ch == "E":
        parts.append(f'<path d="M{x} 45H{x + 62}" stroke="{MINT}" stroke-width="12" stroke-linecap="round"/>')
    x += wd + 38
u2 = "".join(parts)
u2_vb = f"-30 -50 {x + 40} 190"

# U3: the letters are the eyes: b and e inside two soft lobes (Tencent AI)
b_g = f'<g fill="none" stroke="{WHITE}" stroke-width="6" stroke-linecap="round"><path d="M-14 -30V26"/><circle cx="0" cy="12" r="14"/></g>'
e_g = f'<g fill="none" stroke="{WHITE}" stroke-width="6" stroke-linecap="round"><path d="M14 12A14 14 0 1 0 8 25"/><path d="M-14 12H14"/></g>'
u3 = (f'<defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{CYAN}"/><stop offset="1" stop-color="{MINT}"/></linearGradient>'
      f'<filter id="b3" x="-30%" y="-40%" width="160%" height="180%"><feGaussianBlur stdDeviation="11"/></filter></defs>'
      f'<g filter="url(#b3)"><circle cx="70" cy="64" r="56" fill="url(#g3)"/><circle cx="168" cy="64" r="38" fill="url(#g3)"/><rect x="70" y="40" width="98" height="48" fill="url(#g3)"/></g>'
      f'<g transform="translate(70 62) scale(1.7)">{b_g}</g><g transform="translate(168 58) scale(1.35)">{e_g}</g>')
u3_vb = "-20 -20 288 168"
u3_flat = (f'<circle cx="70" cy="64" r="52" fill="{MINT}"/><circle cx="168" cy="64" r="34" fill="{MINT}"/><rect x="70" y="42" width="98" height="44" fill="{MINT}"/>'
           f'<g transform="translate(70 62) scale(1.7)" ><g fill="none" stroke="{NAVY}" stroke-width="6" stroke-linecap="round"><path d="M-14 -30V26"/><circle cx="0" cy="12" r="14"/></g></g>'
           f'<g transform="translate(168 58) scale(1.35)"><g fill="none" stroke="{NAVY}" stroke-width="6" stroke-linecap="round"><path d="M14 12A14 14 0 1 0 8 25"/><path d="M-14 12H14"/></g></g>')

# U4: facet: the monogram split on a diagonal, cyan on one side, mint on the other, a hairline between (K, Z, S of the references)
be_c, _ = be(L, CYAN, WHITE)
be_m, _ = be(L, MINT, WHITE)
u4 = ('<defs><clipPath id="fa"><polygon points="-18,-70 176,-70 76,140 -18,140"/></clipPath><clipPath id="fb"><polygon points="184,-70 276,-70 276,140 84,140"/></clipPath></defs>'
      f'<g clip-path="url(#fa)">{be_c}</g><g clip-path="url(#fb)">{be_m}</g>')

# U5: the wordmark eroded by noise, from left (solid) to right (gone): a real dissolve filter
vbx, vby, vbw, vbh = -30, -90, ww + 60, 300
grad = ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">'
        '<stop offset="0.52" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="100%%" height="100%%" fill="url(#g)"/></svg>') % (vbw, vbh)
grad_uri = "data:image/svg+xml;utf8," + urllib.parse.quote(grad, safe="")
u5 = (f'<defs><filter id="er" filterUnits="userSpaceOnUse" x="{vbx}" y="{vby}" width="{vbw}" height="{vbh}" color-interpolation-filters="sRGB">'
      '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="n"/>'
      '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="na"/>'
      f'<feImage href="{grad_uri}" x="{vbx}" y="{vby}" width="{vbw}" height="{vbh}" result="gi"/>'
      '<feColorMatrix in="gi" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="ga"/>'
      '<feComposite in="na" in2="ga" operator="arithmetic" k1="0" k2="1" k3="-1" k4="0.22" result="d"/>'
      '<feComponentTransfer in="d" result="m"><feFuncA type="linear" slope="14" intercept="0"/></feComponentTransfer>'
      '<feComposite in="SourceGraphic" in2="m" operator="in"/></filter></defs>'
      f'<g filter="url(#er)">{wm_w}</g>')
u5_vb = f"{vbx} {vby} {vbw} {vbh}"

# U6: the system on a light background: gradient tile, navy wordmark with the pixel details
def notched(ink):
    x_b = 2 * H + 36 + W_ + 18
    x, parts = 0, []
    for fn in (L.p, L.h):
        s_, x = fn(x, ink); parts.append(s_); x += 18
    s_, x = L.i(x, ink, dot=ink)
    s_ = s_.replace(f'<circle cx="{x - W_ / 2:.1f}"', '<circle cx="-999"')
    parts.append(s_)
    ix = x - W_ / 2
    parts.append(f'<rect x="{ix - 14:.1f}" y="-34" width="28" height="28" fill="{MINT}"/>')
    x += 18
    s_, x = L.b(x, ink); parts.append(s_); x += 14
    bx0 = x_b + W_ / 2
    for k, (ox, oy, sz) in enumerate([(26, -4, 14), (46, -24, 9), (60, -42, 5)]):
        parts.append(f'<rect x="{bx0 + ox - sz / 2:.1f}" y="{-52 + oy - sz / 2:.1f}" width="{sz}" height="{sz}" fill="{MINT if k else NAVY}"/>')
    s_, x = L.e(x, ink, dot=MINT); parts.append(s_)
    return "".join(parts)


u6 = (f'<rect x="-1000" y="-1000" width="3000" height="3000" fill="#f4f6fa"/>'
      f'<g transform="translate(-30 -26) scale(0.62)">{u1.replace("ug", "ug6")}</g>'
      f'<g transform="translate(150 14) scale(0.9)">{notched(NAVY)}</g>')
u6_vb = f"-40 -60 {ww * 0.9 + 230} 250"

CARDS_7 = [
    ("U1 Gradient tile", "The app icon the other way round: cyan to mint tile, navy be", u1, "0 0 256 256", u1_flat, "0 0 256 256", False),
    ("U2 Capitals, mint E bar", "PHIBE wide and clean, the E's middle bar is mint and runs on (Nexora)", u2, u2_vb, flat_be(WHITE), BEVB, False),
    ("U3 Letters as eyes", "b and e are the two eyes, inside soft lobes (Tencent AI)", u3, u3_vb, u3_flat, u3_vb, False),
]
CARDS_8 = [
    ("U4 Facet", "The monogram split on a diagonal, cyan on one side and mint on the other (K, Z, S)", u4, BEVB, flat_be(CYAN), BEVB, False),
    ("U5 Eroded wordmark", "A noise filter eats the wordmark from left to right (Invisible)", u5, u5_vb, flat_be(WHITE), BEVB, False),
    ("U6 Light system", "On light: gradient tile and navy wordmark with the square details", u6, u6_vb, flat_be(NAVY), BEVB, True),
]


def sheet(cards, title, out):
    css = ('body{margin:0;background:#060511;color:#cfd3e6;font:14px/1.4 system-ui,Segoe UI,sans-serif;padding:28px}h1{font-size:18px;margin:0 0 18px;color:#fff}'
           '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.c{background:#0d0b24;border:1px solid #1d1a45;border-radius:18px;padding:18px}.c.light{background:#f4f6fa;border-color:#dfe3ee}'
           '.big{height:300px;display:grid;place-items:center;overflow:hidden}.big svg{max-width:100%;max-height:300px}.row{display:flex;gap:18px;align-items:end;margin:8px 0}'
           '.row small{display:block;color:#6e7194;font-size:11px;margin-top:4px}h2{margin:10px 0 2px;font-size:16px;color:#fff}p{margin:0;color:#9aa0c3;font-size:12px}.light h2{color:#14123f}.light p{color:#5b6178}')
    html = [f'<!doctype html><meta charset="utf-8"><title>{title}</title><style>{css}</style><h1>{title}</h1><div class="grid">']
    for name, note, body, vb, flat, fvb, light in cards:
        w, h = [float(v) for v in vb.split()[2:]]
        html.append(f'<div class="c{" light" if light else ""}"><div class="big"><svg viewBox="{vb}" width="{w}" height="{h}">{body}</svg></div>')
        html.append('<div class="row">' + "".join(f'<div><svg viewBox="{fvb}" height="{px}" width="{px * float(fvb.split()[2]) / float(fvb.split()[3]):.0f}">{flat}</svg><small>{px}px</small></div>' for px in (64, 32, 16)) + "</div>")
        html.append(f"<h2>{name}</h2><p>{note}</p></div>")
    html.append("</div>")
    open(os.path.join(HERE, out + ".html"), "w", encoding="utf-8").write("".join(html))
    for name, _, body, vb, *_r in cards:
        bg = "#f4f6fa" if name.startswith("U6") else BG
        open(os.path.join(HERE, "svg", f"{name.split()[0].lower()}.svg"), "w", encoding="utf-8").write(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><rect x="-1000" y="-1000" width="3000" height="3000" fill="{bg}"/>{body}</svg>')


sheet(CARDS_7, "Phibe round 5.1: gradient tile, capitals, letters as eyes", "dark-7")
sheet(CARDS_8, "Phibe round 5.2: facet, eroded wordmark, light system", "dark-8")
print("ok")
