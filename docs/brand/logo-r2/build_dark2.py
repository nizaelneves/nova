"""Brand round 3 (dark, from the user's references): dust wordmark, two-band b, halo wordmark, mist pill, spaced caps, pill b.
Run: python build_dark2.py -> dark-3.html/png, dark-4.html/png, svg/*.svg
"""
import math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "phibe"))
from build_brand import Pen, wordmark, NAVY, MINT, CYAN, WHITE  # noqa: E402

L, S = Pen(), Pen(small=True)
BG = "#060511"
pol = lambda cx, cy, r, d: (cx + r * math.cos(math.radians(d)), cy + r * math.sin(math.radians(d)))
H, W_ = L.H, L.w


# ---------- S1: the wordmark dissolves into dust (Invisible) ----------
random.seed(21)
STEP = 3.0


def line_pts(x, y0, y1, w):
    pts, y = [], y0
    while y <= y1:
        dx = -w / 2
        while dx <= w / 2:
            pts.append((x + dx + random.uniform(-.6, .6), y + random.uniform(-.6, .6))); dx += STEP
        y += STEP
    return pts


def arc_pts(cx, cy, R, a0, a1, w):
    pts, n = [], max(8, int(math.radians(abs(a1 - a0)) * R / STEP))
    for k in range(n + 1):
        a = a0 + (a1 - a0) * k / n
        r = R - w / 2
        while r <= R + w / 2:
            pts.append(pol(cx, cy, r, a)); r += STEP
    return pts


x_p, x_h, x_i = 0, H + 18, 2 * H + 36
x_b = x_i + W_ + 18
x_e = x_b + H + 14
cy = L.cy
pts = line_pts(x_b + W_ / 2, -52 + W_ / 2, H - W_ / 2, W_) + arc_pts(x_b + W_ / 2 + L.R, cy, L.R, -5, 275, W_)
ecx = x_e + W_ / 2 + L.R
pts += arc_pts(ecx, cy, L.R, 45, 360, W_)
bar = []
xx = ecx - L.R
while xx <= ecx + L.R:
    yy = cy + 4 - L.bar / 2
    while yy <= cy + 4 + L.bar / 2:
        bar.append((xx, yy)); yy += STEP
    xx += STEP
pts += bar
xs, xe = x_b + 6, x_e + H + 30
dust = []
for (px, py) in pts:
    a = min(1.0, max(0.0, (px - xs) / (xe - xs)))
    r = 2.1 * (1 - 0.55 * a)
    col = MINT if random.random() < 0.10 + 0.25 * a else WHITE
    if random.random() < a ** 0.65:
        d = (a ** 1.35) * (24 + random.random() * 170)
        ang = math.radians(-36 + random.uniform(-18, 18))
        px, py = px + d * math.cos(ang), py + d * math.sin(ang)
        r *= random.uniform(0.7, 1.6)
        if random.random() < 0.5:
            dust.append(f'<rect x="{px - r:.1f}" y="{py - r:.1f}" width="{2 * r:.1f}" height="{2 * r:.1f}" fill="{col}"/>')
            continue
    dust.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{r:.1f}" fill="{col}"/>')
solid = "".join(f(x0, WHITE)[0] for f, x0 in ((L.p, x_p), (L.h, x_h), (L.i, x_i)))
s1 = solid + "".join(dust)
s1_vb = f"-18 -190 {x_e + H + 330} 450"
s1_flat = Pen(small=True)

# ---------- S2: b from two overlapping bands (stem and bowl), the overlap darker (Nexora) ----------
s2 = ('<defs><linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10c3d3"/><stop offset="1" stop-color="#0b8fb0"/></linearGradient>'
      '<linearGradient id="gb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#20e7aa"/><stop offset="1" stop-color="#10c3d3"/></linearGradient></defs>'
      '<rect x="40" y="10" width="64" height="236" rx="32" fill="url(#gs)"/>'
      '<circle cx="152" cy="156" r="76" fill="none" stroke="url(#gb)" stroke-width="56" style="mix-blend-mode:screen" opacity=".92"/>'
      '<path d="M104 126a50 50 0 0 1 50-34" fill="none"/>'
      f'<circle cx="200" cy="98" r="14" fill="{WHITE}"/>')
s2_vb = "0 0 256 256"

# ---------- S3: wordmark with a soft ring of light behind the e (rigear) ----------
wm, ww = wordmark(L, WHITE, MINT)
ring_cx = x_e + W_ / 2 + L.R
s3 = (f'<defs><filter id="rb" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9"/></filter></defs>'
      f'<g filter="url(#rb)"><circle cx="{ring_cx - 10}" cy="{cy}" r="96" fill="none" stroke="#20e7aa" stroke-width="30" opacity=".85"/></g>'
      f'{wm}')
s3_vb = f"-30 -80 {ww + 60} 290"

# ---------- S4: a soft mist pill with the wordmark inside, on light (Laken) ----------
wm_w, _ = wordmark(L, WHITE, MINT)
s4 = (f'<defs><filter id="mp" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>'
      f'<linearGradient id="gm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#14123f"/><stop offset="1" stop-color="#0b4f78"/></linearGradient></defs>'
      f'<g filter="url(#mp)"><circle cx="-10" cy="62" r="118" fill="url(#gm)"/><circle cx="{ww + 14}" cy="62" r="92" fill="#0b4f78"/><rect x="-10" y="-30" width="{ww + 24}" height="180" fill="url(#gm)"/></g>'
      f'<g transform="translate(0 0)">{wm_w}</g>')
s4_vb = f"-150 -110 {ww + 300} 340"

# ---------- S5: spaced capitals with the I as a mint pill, a blue glow behind (SAIO) ----------
GL = {"P": ("M0 0V90M0 7H27A20 20 0 0 1 27 47H0", 48), "H": ("M0 0V90M46 0V90M0 45H46", 46), "I": ("", 0),
      "B": ("M0 0V90M0 7H27A19 19 0 0 1 27 45H0M0 45H31A19 19 0 0 1 31 83H0", 52), "E": ("M46 7H0M0 7V83H46M0 45H38", 46)}
x, parts = 0, []
for ch in "PHIBE":
    d, wd = GL[ch]
    if ch == "I":
        parts.append(f'<rect x="{x - 5}" y="0" width="10" height="90" rx="5" fill="{MINT}"/>'); x += 10 + 34
    else:
        parts.append(f'<path d="{d}" transform="translate({x} 0)" fill="none" stroke="{WHITE}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>'); x += wd + 34
s5 = (f'<defs><filter id="sg" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="22"/></filter></defs>'
      f'<g filter="url(#sg)"><ellipse cx="{x * 0.45:.0f}" cy="48" rx="{x * 0.4:.0f}" ry="40" fill="#0b5fe0" opacity=".85"/><ellipse cx="{x * 0.7:.0f}" cy="40" rx="{x * 0.22:.0f}" ry="26" fill="{CYAN}" opacity=".8"/></g>'
      + "".join(parts))
s5_vb = f"-40 -70 {x + 70} 230"

# ---------- S6: b from three pills: stem, and two bars with the dot between (the stacked-pill reference) ----------
s6 = ('<defs><linearGradient id="p1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#10c3d3"/><stop offset="1" stop-color="#20e7aa"/></linearGradient>'
      '<linearGradient id="p2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0b8fb0"/><stop offset="1" stop-color="#10c3d3"/></linearGradient></defs>'
      '<rect x="36" y="8" width="52" height="240" rx="26" fill="url(#p2)"/>'
      '<rect x="62" y="96" width="156" height="48" rx="24" fill="url(#p1)"/>'
      '<rect x="62" y="200" width="150" height="48" rx="24" fill="url(#p1)" opacity=".85"/>'
      f'<circle cx="168" cy="172" r="14" fill="{WHITE}"/>')
s6_vb = "0 0 256 256"

FLAT_BEVB = "-18 -70 294 210"


def flat_be(ink, pen=S):
    from build_brand import be
    return be(pen, ink, MINT, small=True)[0]


CARDS_3 = [
    ("S1 Dust wordmark", "phibe: p, h, i solid, the b and the e dissolve into squares and specks (Invisible)", s1, s1_vb, flat_be(WHITE), FLAT_BEVB, False),
    ("S2 Two-band b", "Stem and bowl as two overlapping bands, the overlap brighter, a white dot in the gap (Nexora)", s2, s2_vb, s2, s2_vb, False),
    ("S3 Halo wordmark", "A blurred ring of mint light behind the e (rigear)", s3, s3_vb, flat_be(WHITE), FLAT_BEVB, False),
]
CARDS_4 = [
    ("S4 Mist pill (light)", "The wordmark inside a soft dark mist, for light backgrounds (Laken)", s4, s4_vb, flat_be(NAVY), FLAT_BEVB, True),
    ("S5 Spaced capitals", "P H I B E, the I is a mint pill, blue glow behind (SAIO)", s5, s5_vb, flat_be(WHITE), FLAT_BEVB, False),
    ("S6 Pill b", "b built from three pills, a white dot between the bars", s6, s6_vb, s6, s6_vb, False),
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
        slug = name.split()[0].lower()
        bg = "#f4f6fa" if name.startswith("S4") else BG
        open(os.path.join(HERE, "svg", f"{slug}.svg"), "w", encoding="utf-8").write(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><rect x="-1000" y="-1000" width="3000" height="3000" fill="{bg}"/>{body}</svg>')


sheet(CARDS_3, "Phibe round 3.1: dust wordmark, two-band b, halo wordmark", "dark-3")
sheet(CARDS_4, "Phibe round 3.2: mist pill, spaced capitals, pill b", "dark-4")
print("ok", len(dust), "particles")
