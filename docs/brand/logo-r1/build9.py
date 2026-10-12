"""Logo round 9: crumbling Orb (N5) plus the Fibonacci numbers (O1..O6). Run: python build9.py"""
import math
from build import svg, save, lockup, word, INK, MINT
from build7 import digit

wb, ww = word()
eye = lambda cx, cy, rx=11, ry=17: f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{MINT}"/>'
orbd = lambda cx, cy, r: f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{INK}"/>' + eye(cx - r*0.26, cy - r*0.04, r*0.14, r*0.22) + eye(cx + r*0.26, cy - r*0.04, r*0.14, r*0.22)
pol = lambda cx, cy, r, deg: (cx + r * math.cos(math.radians(deg)), cy + r * math.sin(math.radians(deg)))

# O1: the Orb sheds its numbers: 1 1 2 3 5 8 drift off the top right, smaller each time
CX, CY = 100, 150
o1 = orbd(CX, CY, 72)
for i, (d, h) in enumerate(zip("112358", [34, 28, 23, 18, 14, 11])):
    x, y = pol(CX, CY, 92 + i * 7, -112 + i * 22)
    o1 += digit(d, x, y, h, INK if i < 3 else MINT, max(2, h * 0.11))

# O2: layers of pieces: counts 1-1-2-3-5-8, sizes 13-8-5-3-2-1 (fewer big, more small)
o2 = orbd(CX, CY, 72)
for k, (n, s) in enumerate(zip([1, 1, 2, 3, 5, 8], [14, 11, 9, 7, 5, 3.5])):
    r = 88 + k * 9
    spread = 8 + k * 9
    for i in range(n):
        a = -45 + (spread * (i - (n - 1) / 2) / max(n - 1, 1) if n > 1 else 0)
        x, y = pol(CX, CY, r, a)
        o2 += f'<rect x="{x - s/2:.1f}" y="{y - s/2:.1f}" width="{s}" height="{s}" fill="{MINT if k > 3 else INK}"/>'

# O3: a ring of numbers around the Orb (Fibonacci mod 10) that shrinks away to the right
seq = "112358314594"
o3 = orbd(128, 128, 58)
for i, d in enumerate(seq):
    a = 180 + i * 30
    t = i / 11
    h = 36 - 24 * t
    x, y = pol(128, 128, 94 + 14 * t, a)
    o3 += digit(d, x, y, h, INK if i < 6 else MINT, max(2, h * 0.11))

# O4: the eyes are the first two numbers; the edge crumbles into squares
o4 = f'<circle cx="128" cy="128" r="76" fill="{INK}"/>' + digit("1", 100, 126, 40, MINT, 6) + digit("1", 156, 126, 40, MINT, 6)
for i in range(84):
    a = math.radians(i * 360 / 84)
    w = (1 + math.cos(a - math.radians(-40))) / 2
    if w > 0.55 and i % 3 == 0: continue
    r = 82 + 40 * w ** 1.6; s = 15 * (1 - 0.72 * w)
    o4 += f'<rect x="{128 + r*math.cos(a) - s/2:.1f}" y="{128 + r*math.sin(a) - s/2:.1f}" width="{s:.1f}" height="{s:.1f}" fill="{MINT if w > 0.8 else INK}"/>'

# O5: numbers leaving along a spiral, getting smaller as they go
o5 = orbd(128, 128, 50)
for i, (d, h) in enumerate(zip("112358", [30, 26, 22, 18, 14, 11])):
    x, y = pol(128, 128, 66 + i * 10, -160 + i * 56)
    o5 += digit(d, x, y, h, INK if i < 3 else MINT, max(2, h * 0.11))

# O6: pixel numbers: the squares of the crumbling edge are themselves the digits
PX = {"1": "010 110 010 010 111", "2": "111 001 111 100 111", "3": "111 001 111 001 111", "5": "111 100 111 001 111", "8": "111 101 111 101 111"}
def pixdigit(d, cx, cy, ps, col):
    out = []
    for r, row in enumerate(PX[d].split()):
        for c, ch in enumerate(row):
            if ch == "1":
                out.append(f'<rect x="{cx + (c-1.5)*ps:.1f}" y="{cy + (r-2.5)*ps:.1f}" width="{ps:.1f}" height="{ps:.1f}" fill="{col}"/>')
    return "".join(out)
o6 = orbd(CX - 4, CY + 2, 70)
for i, (d, ps) in enumerate(zip("112358", [9, 7.4, 6, 4.8, 3.6, 2.6])):
    x, y = pol(CX - 4, CY + 2, 96 + i * 6, -118 + i * 23)
    o6 += pixdigit(d, x, y, ps, INK if i < 3 else MINT)

for k, body in enumerate([o1, o2, o3, o4, o5, o6], 1):
    save(f"o{k}-symbol", svg(256, 256, body))
    save(f"o{k}-lockup", lockup(f'<g transform="translate(0,-28) scale(0.78)">{body}</g>', wb, ww))
print("ok")
