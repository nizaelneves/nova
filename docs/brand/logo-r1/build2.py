"""Logo round 2: six more routes (H1..H6). Run: python build2.py"""
import math
from build import svg, save, lockup, word, turtle_spiral, orb, INK, MINT, CYAN

wb, ww = word()

# H1: "b" whose bowl holds a golden spiral
h1 = (f'<path d="M84 20V222" stroke="{INK}" stroke-width="22" stroke-linecap="round" fill="none"/>'
      f'<circle cx="150" cy="158" r="68" fill="none" stroke="{INK}" stroke-width="22"/>'
      f'<path d="{turtle_spiral(4.4, 6, (150-4, 158+2))}" fill="none" stroke="{MINT}" stroke-width="8" stroke-linecap="round"/>')

# H2: circle half solid, half dissolving into Fibonacci-sized dots
R = 104
dots = []
radii = [13, 8.5, 5.5, 3.5, 2.2]
x = 128 + 6
for i, r in enumerate(radii):
    step = r * 2.7
    x += r + (0 if i == 0 else 4)
    h = math.sqrt(max(R * R - (x - 128) ** 2, 0))
    y = 128 - h + r
    while y <= 128 + h - r + 0.1:
        dots.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{MINT if i == len(radii)-1 else INK}"/>')
        y += step
    x += r + 6
h2 = (f'<path d="M128 {128-R}A{R} {R} 0 0 0 128 {128+R}Z" fill="{INK}"/>'
      f'<ellipse cx="96" cy="118" rx="13" ry="20" fill="{MINT}"/>' + "".join(dots))

# H3: ring with a golden spiral ending in one dot (the eye)
h3 = (f'<circle cx="128" cy="128" r="112" fill="none" stroke="{INK}" stroke-width="16"/>'
      f'<path d="{turtle_spiral(5.2, 7, (128+4, 128+8))}" fill="none" stroke="{INK}" stroke-width="10" stroke-linecap="round"/>'
      f'<circle cx="132" cy="136" r="12" fill="{MINT}"/>')

# H4: two overlapping wings that are also two eyes
h4 = (f'<ellipse cx="96" cy="128" rx="46" ry="96" transform="rotate(-28 96 128)" fill="none" stroke="{INK}" stroke-width="16"/>'
      f'<ellipse cx="160" cy="128" rx="46" ry="96" transform="rotate(28 160 128)" fill="none" stroke="{INK}" stroke-width="16"/>'
      f'<ellipse cx="112" cy="116" rx="11" ry="17" fill="{MINT}"/><ellipse cx="144" cy="116" rx="11" ry="17" fill="{MINT}"/>')

# H5: a cursor arrow with two eyes
h5 = (f'<path d="M64 24V206L108 166L140 236L174 222L142 154L204 148Z" fill="{INK}" stroke="{INK}" stroke-width="14" stroke-linejoin="round"/>'
      f'<ellipse cx="88" cy="108" rx="9" ry="14" fill="{MINT}"/><ellipse cx="116" cy="124" rx="9" ry="14" fill="{MINT}"/>')

# H6: rough scribble that resolves into one clean ring with eyes
h6 = (f'<path d="M40 150C30 60 130 20 200 70C250 110 220 200 140 226C70 244 20 190 56 100C84 40 190 36 226 96" fill="none" stroke="{INK}" stroke-width="7" stroke-linecap="round" opacity="0.45"/>'
      f'<path d="M30 120C40 50 150 14 208 80C244 130 200 222 120 224C50 224 14 170 40 110" fill="none" stroke="{INK}" stroke-width="7" stroke-linecap="round" opacity="0.7"/>'
      f'<circle cx="128" cy="128" r="76" fill="{INK}" stroke="{MINT}" stroke-width="12"/>'
      f'<ellipse cx="106" cy="124" rx="10" ry="16" fill="{MINT}"/><ellipse cx="150" cy="124" rx="10" ry="16" fill="{MINT}"/>')

for k, body in enumerate([h1, h2, h3, h4, h5, h6], 1):
    save(f"h{k}-symbol", svg(256, 256, body))
    save(f"h{k}-lockup", lockup(f'<g transform="translate(0,-28) scale(0.78)">{body}</g>', wb, ww))
print("ok")
