"""Logo round 3: six more routes (I1..I6). Run: python build3.py"""
import random
from build import svg, save, lockup, word, turtle_spiral, INK, MINT

wb, ww = word()
eyes = lambda cx, cy, dx, rx, ry: (f'<ellipse cx="{cx-dx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{MINT}"/>'
                                   f'<ellipse cx="{cx+dx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{MINT}"/>')

# I1: chat bubble that is the Orb
i1 = (f'<rect x="20" y="24" width="216" height="176" rx="80" fill="{INK}"/>'
      f'<path d="M62 188L50 240L112 198Z" fill="{INK}" stroke="{INK}" stroke-width="10" stroke-linejoin="round"/>'
      + eyes(128, 108, 36, 15, 24))

# I2: bee Orb (wings + two stripes), facing right
i2 = (f'<defs><clipPath id="b"><ellipse cx="128" cy="150" rx="106" ry="78"/></clipPath></defs>'
      f'<ellipse cx="96" cy="70" rx="30" ry="54" transform="rotate(-24 96 70)" fill="none" stroke="{INK}" stroke-width="12"/>'
      f'<ellipse cx="152" cy="64" rx="30" ry="54" transform="rotate(14 152 64)" fill="none" stroke="{INK}" stroke-width="12"/>'
      f'<ellipse cx="128" cy="150" rx="106" ry="78" fill="{INK}"/>'
      f'<g clip-path="url(#b)"><rect x="118" y="60" width="22" height="180" fill="{MINT}"/><rect x="164" y="60" width="22" height="180" fill="{MINT}"/></g>'
      f'<ellipse cx="70" cy="138" rx="12" ry="19" fill="{MINT}"/>')

# I3: pixel Orb, dissolving to the right
random.seed(7)
N, C, ox, oy = 12, 18, 20, 20
cells = []
for r in range(N):
    for c in range(N):
        d = ((c - 5.5) ** 2 + (r - 5.5) ** 2) ** 0.5
        if d <= 5.6:
            keep = c <= 7 or random.random() > (c - 7) * 0.22
            if keep:
                cells.append((c, r, INK))
eyecells = {(4, 5), (4, 6), (7, 5), (7, 6)}
cells = [(c, r, MINT if (c, r) in eyecells else col) for c, r, col in cells]
for c, r in [(11, 3), (11, 7), (10, 9)]:
    cells.append((c, r, MINT))
i3 = "".join(f'<rect x="{ox+c*C}" y="{oy+r*C}" width="{C-2}" height="{C-2}" fill="{col}"/>' for c, r, col in cells)

# I4: app-icon: rounded square with the two eyes in golden proportion
i4 = (f'<rect x="8" y="8" width="240" height="240" rx="56" fill="{INK}"/>'
      + eyes(128, 120, 44, 18, 29))

# I5: Fibonacci shell with an eye
i5 = (f'<path d="{turtle_spiral(5.6, 8, (222, 200))}" fill="none" stroke="{INK}" stroke-width="14" stroke-linecap="round" transform="translate(-34,-40)"/>'
      f'<circle cx="166" cy="116" r="14" fill="{MINT}"/>')

# I6: vesica piscis: two rings whose overlap is the eye
i6 = (f'<circle cx="94" cy="128" r="76" fill="none" stroke="{INK}" stroke-width="16"/>'
      f'<circle cx="162" cy="128" r="76" fill="none" stroke="{INK}" stroke-width="16"/>'
      f'<ellipse cx="128" cy="128" rx="20" ry="46" fill="{MINT}"/>')

for k, body in enumerate([i1, i2, i3, i4, i5, i6], 1):
    save(f"i{k}-symbol", svg(256, 256, body))
    save(f"i{k}-lockup", lockup(f'<g transform="translate(0,-28) scale(0.78)">{body}</g>', wb, ww))
print("ok")
