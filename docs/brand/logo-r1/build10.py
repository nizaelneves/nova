"""Logo rounds 10 and 11: favicon-first marks, not necessarily the Orb face. Run: python build10.py"""
import math
from build import svg, save, lockup, word, INK, MINT

wb, ww = word()
PHI = 1.618
pol = lambda cx, cy, r, deg: (cx + r * math.cos(math.radians(deg)), cy + r * math.sin(math.radians(deg)))
eye = lambda cx, cy, rx, ry: f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{MINT}"/>'

# ---------- Round 10 ----------
# A1: "ii" (phibi has two i's); the heights are in the golden ratio, the dots are mint
a1 = ''.join(f'<rect x="{x-24}" y="{ys}" width="48" height="{230-ys}" rx="24" fill="{INK}"/><circle cx="{x}" cy="{cy}" r="22" fill="{MINT}"/>'
             for x, ys, cy in [(82, 140, 104), (174, 84, 40)])

# A2: bitten orb: a circle with a bite (radius 1/phi), the mint dot is the piece that came off
a2 = (f'<defs><mask id="m"><rect width="256" height="256" fill="#fff"/><circle cx="192" cy="68" r="{100/PHI:.1f}" fill="#000"/></mask></defs>'
      f'<circle cx="118" cy="138" r="100" fill="{INK}" mask="url(#m)"/><circle cx="198" cy="62" r="19" fill="{MINT}"/>')

# A3: golden pair: two tangent circles with radii in the golden ratio
a3 = f'<circle cx="82" cy="160" r="80" fill="{INK}"/><circle cx="{82+(80+80/PHI)*math.cos(math.radians(40)):.1f}" cy="{160-(80+80/PHI)*math.sin(math.radians(40)):.1f}" r="{80/PHI:.1f}" fill="{MINT}"/>'

# A4: split disk: cut at 38.2 / 61.8, the small cap slides off
a4 = (f'<defs><clipPath id="t"><rect x="0" y="0" width="256" height="{28+200*0.382-5:.1f}"/></clipPath>'
      f'<clipPath id="u"><rect x="0" y="{28+200*0.382+5:.1f}" width="256" height="256"/></clipPath></defs>'
      f'<g transform="rotate(-20 128 128)"><g clip-path="url(#t)"><circle cx="146" cy="128" r="100" fill="{MINT}"/></g>'
      f'<g clip-path="url(#u)"><circle cx="128" cy="128" r="100" fill="{INK}"/></g></g>')

# A5: a bubble with one square corner; the corner breaks off into squares
a5 = (f'<circle cx="118" cy="134" r="98" fill="{INK}"/><rect x="20" y="134" width="98" height="98" fill="{INK}"/>'
      + eye(98, 124, 11, 17) + eye(138, 124, 11, 17)
      + f'<rect x="196" y="42" width="20" height="20" fill="{MINT}"/><rect x="224" y="24" width="11" height="11" fill="{MINT}"/><rect x="240" y="12" width="6" height="6" fill="{MINT}"/>')

# A6: golden pentagon: its diagonals (mint) draw the star and the inner pentagon
P = [pol(128, 136, 112, -90 + 72 * k) for k in range(5)]
pent = "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in P) + "Z"
star = "M" + "L".join(f"{P[i][0]:.1f} {P[i][1]:.1f}" for i in (0, 2, 4, 1, 3, 0))
a6 = f'<path d="{pent}" fill="{INK}" stroke="{INK}" stroke-width="10" stroke-linejoin="round"/><path d="{star}" fill="none" stroke="{MINT}" stroke-width="9" stroke-linejoin="round"/>'

# ---------- Round 11 ----------
# B1: bold P whose counter is a mint dot (the pupil)
b1 = (f'<path d="M72 44H130A56 56 0 0 1 130 156H72" fill="none" stroke="{INK}" stroke-width="40" stroke-linejoin="round"/>'
      f'<rect x="52" y="24" width="40" height="208" rx="20" fill="{INK}"/><circle cx="136" cy="100" r="15" fill="{MINT}"/>')

# B2: b with a bitten bowl and the mint dot that came off
b2 = (f'<defs><mask id="n"><rect width="256" height="256" fill="#fff"/><circle cx="212" cy="116" r="38" fill="#000"/></mask></defs>'
      f'<rect x="52" y="14" width="40" height="218" rx="20" fill="{INK}"/>'
      f'<circle cx="150" cy="164" r="62" fill="none" stroke="{INK}" stroke-width="36" mask="url(#n)"/><circle cx="214" cy="112" r="14" fill="{MINT}"/>')

# B3: pinwheel: a disc cut in four quarters turning away from each other, one mint
q = lambda c: f'<path d="M140 116V36A80 80 0 0 1 220 116Z" fill="{c}" transform="rotate({{a}} 128 128)"/>'
b3 = "".join(q(c).replace("{a}", str(a)) for a, c in [(0, MINT), (90, INK), (180, INK), (270, INK)])

# B4: the "i" whose dot is the Orb
b4 = (f'<rect x="100" y="112" width="56" height="124" rx="28" fill="{INK}"/><circle cx="128" cy="56" r="46" fill="{INK}"/>'
      + eye(112, 54, 7, 12) + eye(144, 54, 7, 12))

# B5: open ring: the end of the stroke crumbles into 13, 8, 5 sized dots
r = 82
x0, y0 = pol(128, 136, r, -8); x1, y1 = pol(128, 136, r, -78 + 360)
b5 = (f'<path d="M{x0:.1f} {y0:.1f}A{r} {r} 0 1 1 {pol(128,136,r,-52)[0]:.1f} {pol(128,136,r,-52)[1]:.1f}" fill="none" stroke="{INK}" stroke-width="30" stroke-linecap="round"/>'
      + "".join(f'<circle cx="{pol(128,136,r,a)[0]:.1f}" cy="{pol(128,136,r,a)[1]:.1f}" r="{rr}" fill="{INK}"/>' for a, rr in [(-70, 11), (-84, 7), (-96, 4.5)])
      + f'<circle cx="128" cy="136" r="17" fill="{MINT}"/>')

# B6: the bitten orb as an app tile (favicon on a square)
b6 = (f'<defs><mask id="k"><rect width="256" height="256" fill="#fff"/><circle cx="222" cy="34" r="{150/PHI:.1f}" fill="#000"/></mask></defs>'
      f'<rect x="10" y="10" width="236" height="236" rx="58" fill="{INK}" mask="url(#k)"/><circle cx="196" cy="62" r="20" fill="{MINT}"/>')

for tag, items in (("a", [a1, a2, a3, a4, a5, a6]), ("b", [b1, b2, b3, b4, b5, b6])):
    for k, body in enumerate(items, 1):
        save(f"{tag}{k}-symbol", svg(256, 256, body))
        save(f"{tag}{k}-lockup", lockup(f'<g transform="translate(0,-28) scale(0.78)">{body}</g>', wb, ww))
print("ok")
