"""Logo round 4: refine I3 (pixel Orb) and explore its family (J1..J6). Run: python build4.py"""
import math, re
from build import svg, save, lockup, word, INK, MINT

wb, ww = word()
# the i-dots become square pixels too, so the wordmark belongs to the family
wb = re.sub(r'<circle cx="([\d.]+)" cy="12" r="13" fill="([^"]+)"/>', r'<rect x="\1" y="-1" width="26" height="26" fill="\2" transform="translate(-13 0)"/>', wb)


def grid(cells, u, ox, oy, gap=2, scale=None):
    out = []
    for c, r, col in cells:
        s = (scale or {}).get(c, 1.0)
        size = (u - gap) * s
        out.append(f'<rect x="{ox + c*u + (u-gap-size)/2:.1f}" y="{oy + r*u + (u-gap-size)/2:.1f}" width="{size:.1f}" height="{size:.1f}" fill="{col}"/>')
    return "".join(out)


def disc(n, cx, cy, rad):
    return [(c, r) for r in range(n) for c in range(n) if math.hypot(c - cx, r - cy) <= rad]


def paint(cells, eyes):
    return [(c, r, MINT if (c, r) in eyes else INK) for c, r in cells]


# J1 refined: clean 9-column Orb, right edge dissolving in steps, loose mint pixels
base = disc(9, 4, 5, 4.6)
eyes = {(2, 4), (2, 5), (5, 4), (5, 5)}
j1c = []
for c, r in base:
    if c == 6 and (r + c) % 4 == 0: continue
    if c == 7 and r % 2 == 0: continue
    if c == 8 and r not in (4, 6): continue
    j1c.append((c, r))
j1 = grid(paint(j1c, eyes) + [(9, 5, MINT), (10, 4, MINT)], 22, 7, 7)

# J2 small-size cut: solid Orb, no dissolve (for 16 and 32 px)
j2 = grid(paint(disc(9, 4, 4, 4.4), {(2, 3), (2, 4), (6, 3), (6, 4)}), 28, 2, 2, gap=2)

# J3 pixels shrink toward the right (the Orb fades into smaller and smaller pixels)
sc = {5: .8, 6: .62, 7: .46, 8: .34, 9: .24, 10: .16}
j3c = [(c, r) for c, r in disc(11, 4, 5, 5.2)] + [(c, r) for c in (8, 9, 10) for r in range(3, 8) if math.hypot(c - 4, r - 5) <= 6.2 and (c, r) not in disc(11, 4, 5, 5.2)]
j3 = grid(paint(j3c, {(2, 4), (2, 5), (6, 4), (6, 5)}), 22, 7, 7, scale=sc)

# J4 pixel "b" monogram with a mint pupil in the bowl
bowl = {(c, r) for c in range(1, 7) for r in range(3, 10)} - {(c, r) for c in (3, 4) for r in (5, 6, 7)} - {(6, 3), (6, 9)}
stem = {(c, r) for c in (0, 1) for r in range(0, 10)}
j4c = [(c, r, INK) for c, r in sorted(stem | bowl)] + [(c, r, MINT) for c in (3, 4) for r in (5, 6, 7)]
j4 = grid(j4c, 24, 44, 8)

# J5 ring Orb: the outline is a mint pixel ring, the body navy
ring = disc(9, 4, 4, 4.6)
inner = set(disc(9, 4, 4, 3.6))
j5c = [(c, r, INK if (c, r) in inner else MINT) for c, r in ring]
e5 = {(2, 3), (2, 4), (6, 3), (6, 4)}
j5 = grid([(c, r, MINT if (c, r) in e5 else col) for c, r, col in j5c], 28, 2, 2)

# J6 Fibonacci lens: column heights 1 2 3 5 8 5 3 2 1, a pixel eye with a mint pupil
hs = [1, 2, 3, 5, 8, 5, 3, 2, 1]
j6c = []
for c, h in enumerate(hs):
    top = (8 - h) // 2
    j6c += [(c, top + k, INK) for k in range(h)]
pupil = {(4, 3), (4, 4), (5, 3), (5, 4)}
j6c = [(c, r, MINT if (c, r) in pupil else col) for c, r, col in j6c]
j6 = grid(j6c, 26, 11, 24)

for k, body in enumerate([j1, j2, j3, j4, j5, j6], 1):
    save(f"j{k}-symbol", svg(256, 256, body))
    save(f"j{k}-lockup", lockup(f'<g transform="translate(0,-28) scale(0.78)">{body}</g>', wb, ww))
print("ok")
