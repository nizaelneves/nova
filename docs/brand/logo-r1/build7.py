"""Logo round 7: concepts that contain the Fibonacci numbers (M1..M6). Run: python build7.py"""
import math
from build import svg, save, lockup, word, orb, INK, MINT

wb, ww = word()
eye = lambda cx, cy, rx=12, ry=19: f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{MINT}"/>'

# Monoline digits in a 40 x 60 box (constructed paths, no live text)
G = {
    "1": "M8 16L22 6V54",
    "2": "M6 18C6 4 36 4 36 20C36 32 10 42 6 54H38",
    "3": "M6 10C14 2 36 4 34 18C33 26 24 28 18 28C28 28 38 32 36 42C34 56 12 58 4 48",
    "4": "M30 54V6L4 38H38",
    "9": "M20 32C6 32 6 6 20 6C34 6 34 32 20 32C34 32 36 56 12 52",
    "5": "M34 6H10L7 28C16 22 36 24 36 40C36 56 14 58 4 48",
    "8": "M20 28C6 28 6 6 20 6C34 6 34 28 20 28C4 28 2 54 20 54C38 54 36 28 20 28Z",
}


def digit(d, cx, cy, h, color=INK, w=4):
    """Digit d centred on (cx, cy), h tall, stroke w (in output pixels)."""
    s = h / 60
    return (f'<g transform="translate({cx - 20*s:.1f} {cy - 30*s:.1f}) scale({s:.3f})"><path d="{G[d]}" fill="none" stroke="{color}" '
            f'stroke-width="{w/s:.1f}" stroke-linecap="round" stroke-linejoin="round"/></g>')


# M1: bubbles 1-1-2-3-5 carrying their number; the biggest is the Orb
x, parts = 8, []
for f, r in zip([1, 1, 2, 3, 5], [11, 11, 18, 27, 44]):
    if f == 5:
        parts.append(f'<circle cx="{x+r}" cy="128" r="{r}" fill="{INK}"/>' + eye(x + r - 14, 122, 6, 10) + eye(x + r + 14, 122, 6, 10))
    else:
        parts.append(f'<circle cx="{x+r}" cy="128" r="{r}" fill="{MINT}"/>' + digit(str(f), x + r, 128, r * 0.95, INK, max(2, r * 0.14)))
    x += 2 * r + 4
m1 = "".join(parts)

# M2: the Fibonacci tiling with its numbers; the biggest square is the face
U = 17
sq = [(0, 0, 8, "8"), (8, 0, 5, "5"), (10, 5, 3, "3"), (8, 6, 2, "2"), (8, 5, 1, "1"), (9, 5, 1, "1")]
tiles = []
for x0, y0, s, d in sq:
    fill = INK if d == "8" else "none"
    tiles.append(f'<rect x="{x0*U+2}" y="{y0*U+2}" width="{s*U-4}" height="{s*U-4}" rx="5" fill="{fill}" stroke="{INK}" stroke-width="4"/>')
    if d == "8":
        tiles.append(eye(2.9 * U, 3.6 * U, 9, 15) + eye(5.1 * U, 3.6 * U, 9, 15))
    else:
        tiles.append(digit(d, (x0 + s / 2) * U, (y0 + s / 2) * U, s * U * 0.5, MINT if d != "1" else INK, max(2, s * U * 0.06)))
arc = (f'M0 {8*U}A{8*U} {8*U} 0 0 1 {8*U} 0A{5*U} {5*U} 0 0 1 {13*U} {5*U}A{3*U} {3*U} 0 0 1 {10*U} {8*U}A{2*U} {2*U} 0 0 1 {8*U} {6*U}')
m2 = f'<g transform="translate(17 60)">{"".join(tiles)}<path d="{arc}" fill="none" stroke="{MINT}" stroke-width="5" stroke-linecap="round" opacity=".9"/></g>'

# M3: the number 8 as a character: a small head (5) on a bigger body (8)
m3 = (f'<circle cx="128" cy="76" r="44" fill="none" stroke="{INK}" stroke-width="18"/>'
      f'<circle cx="128" cy="174" r="64" fill="none" stroke="{INK}" stroke-width="18"/>' + eye(110, 78, 8, 13) + eye(146, 78, 8, 13))

# M4: growth bars 1-1-2-3-5-8 with the numbers under them
bars = []
for i, f in enumerate([1, 1, 2, 3, 5, 8]):
    bx = 13 + i * 40
    bars.append(f'<rect x="{bx}" y="{176-f*18}" width="30" height="{f*18}" rx="8" fill="{MINT if f == 8 else INK}"/>')
    bars.append(digit(str(f), bx + 15, 214, 30, INK, 4))
m4 = "".join(bars)

# M5: the Orb dissolving into smaller and smaller Fibonacci numbers
nums = [("1", 168, 150, 34), ("2", 192, 120, 28), ("3", 212, 142, 22), ("5", 228, 112, 17), ("8", 242, 134, 13)]
m5 = orb(84, 128, 72) + "".join(digit(d, x, y, h, MINT, max(2, h * 0.12)) for d, x, y, h in nums)

# M6: dial of dot rings with 3, 5, 8, 13 and 21 dots and one eye in the middle
rings = []
for n, r in [(3, 24), (5, 46), (8, 70), (13, 94), (21, 118)]:
    for k in range(n):
        t = -math.pi / 2 + 2 * math.pi * k / n
        rings.append(f'<circle cx="{128 + r*math.cos(t):.1f}" cy="{128 + r*math.sin(t):.1f}" r="6.5" fill="{INK if n != 3 else MINT}"/>')
m6 = "".join(rings) + f'<circle cx="128" cy="128" r="7" fill="{MINT}"/>'

for k, body in enumerate([m1, m2, m3, m4, m5, m6], 1):
    save(f"m{k}-symbol", svg(256, 256, body))
    save(f"m{k}-lockup", lockup(f'<g transform="translate(0,-28) scale(0.78)">{body}</g>', wb, ww))
print("ok")
