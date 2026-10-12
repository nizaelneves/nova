"""Logo round 19: Fibonacci numbers, on the H2 (half-disc) and H3 (spiral) bases. Run: python build15.py"""
import math
from build import svg, save, lockup, word, INK, MINT
from build7 import digit
from build14 import half, eye, column_dots, circ, G, semis, path_of, along, xs_

wb, ww = word()

# H2 base
r1, x, y = half + eye(94, 120), 164, 150
for d, h in [("8", 70), ("5", 44), ("3", 28), ("2", 17), ("1", 11)]:        # countdown rising away, getting smaller
    r1 += digit(d, x, y, h, MINT if d == "1" else INK, max(2.2, h * 0.11))
    x += h * 0.4 + 14; y -= h * 0.12 + 7
r2 = half + digit("1", 94, 122, 52, MINT, 8) + column_dots([18, 11, 6.5])    # the eye is the number 1
r3, yy = half + eye(94, 120), 34
for d, h in [("1", 14), ("1", 14), ("2", 20), ("3", 30), ("5", 42), ("8", 56)]:  # a ruler of numbers on the cut edge
    r3 += digit(d, 168, yy + h / 2, h, MINT if d == "8" else INK, max(2.2, h * 0.11))
    yy += h + 9

# H3 base: one spiral line, numbers sit on its turns
spiral = f'<path d="{path_of(8, 24)}" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round" opacity=".5"/>'
nums = "".join(digit(d, *along(k, 24, 0.5 if k < 2 else (0.3 if k % 2 else 0.7), 8), h, MINT if d == "1" else INK, max(2.4, h * 0.12))
               for k, (d, h) in enumerate(zip("112358", [14, 14, 18, 24, 32, 42])))
r4 = G(spiral + circ(0, 0, 8, MINT) + nums, -6)

# tiling: squares 8,5,3,2,1,1 with their numbers and the spiral through them
U = 17
sqs = [(0, 0, 8, "8"), (8, 0, 5, "5"), (10, 5, 3, "3"), (8, 6, 2, "2"), (8, 5, 1, "1"), (9, 5, 1, "1")]
tiles = "".join(f'<rect x="{x0*U+2}" y="{y0*U+2}" width="{s*U-4}" height="{s*U-4}" rx="5" fill="none" stroke="{INK}" stroke-width="4"/>' for x0, y0, s, d in sqs)
nums5 = "".join(digit(d, (x0 + s / 2) * U, (y0 + s / 2) * U, s * U * 0.34, INK, max(1.8, s * U * 0.035)) for x0, y0, s, d in sqs)
arc = f'M0 {8*U}A{8*U} {8*U} 0 0 1 {8*U} 0A{5*U} {5*U} 0 0 1 {13*U} {5*U}A{3*U} {3*U} 0 0 1 {10*U} {8*U}A{2*U} {2*U} 0 0 1 {8*U} {6*U}A{U} {U} 0 0 1 {9*U} {5*U}'
r5 = f'<g transform="translate(17 60)">{tiles}<path d="{arc}" fill="none" stroke="{MINT}" stroke-width="7" stroke-linecap="round"/>{nums5}</g>'

# double spiral: two spirals back to back, the centers are the eyes
one = f'<path d="{path_of(6, 14)}" fill="none" stroke="{INK}" stroke-width="11" stroke-linecap="round"/>' + circ(0, 0, 9, MINT)
r6 = f'<g transform="translate(70 128)">{one}</g><g transform="translate(186 128) scale(-1 1)">{one}</g>'

for k, body in enumerate([r1, r2, r3, r4, r5, r6], 1):
    save(f"r{k}-symbol", svg(256, 256, body))
    save(f"r{k}-lockup", lockup(f'<g transform="translate(0,-28) scale(0.78)">{body}</g>', wb, ww))
print("ok")
