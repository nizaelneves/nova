"""Logo round 6: six new directions (L1..L6). Run: python build6.py"""
from build import svg, save, lockup, word, INK, MINT

wb, ww = word()
eye = lambda cx, cy, rx=12, ry=19: f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{MINT}"/>'

# L1: the eyes between two brackets, like a quoted look
l1 = (f'<path d="M78 28A120 120 0 0 0 78 228" fill="none" stroke="{INK}" stroke-width="20" stroke-linecap="round"/>'
      f'<path d="M178 28A120 120 0 0 1 178 228" fill="none" stroke="{INK}" stroke-width="20" stroke-linecap="round"/>'
      + eye(108, 128, 13, 22) + eye(148, 128, 13, 22))

# L2: the mist as a flat cloud built from Fibonacci-sized circles
l2 = (f'<g fill="{INK}"><circle cx="128" cy="132" r="56"/><circle cx="72" cy="152" r="34"/><circle cx="190" cy="152" r="34"/>'
      f'<circle cx="98" cy="90" r="34"/><circle cx="162" cy="86" r="26"/><circle cx="42" cy="172" r="21"/><circle cx="216" cy="170" r="21"/>'
      f'<rect x="42" y="150" width="174" height="43"/></g>' + eye(106, 140) + eye(150, 140))

# L3: orbit: the Orb with a ring around it (ring behind above, in front below)
l3 = (f'<g transform="rotate(-20 128 128)"><path d="M12 128A116 40 0 0 1 244 128" fill="none" stroke="{MINT}" stroke-width="11" stroke-linecap="round"/></g>'
      f'<circle cx="128" cy="128" r="66" fill="{INK}"/>' + eye(106, 120, 11, 17) + eye(150, 120, 11, 17)
      + f'<g transform="rotate(-20 128 128)"><path d="M12 128A116 40 0 0 0 244 128" fill="none" stroke="{MINT}" stroke-width="11" stroke-linecap="round"/></g>')

# L4: one continuous line that curls into a face
l4 = (f'<path d="M58 160C34 84 108 38 162 58C222 80 220 168 154 202C102 228 56 192 70 142C82 100 134 92 152 126C162 148 134 164 120 150" '
      f'fill="none" stroke="{INK}" stroke-width="13" stroke-linecap="round"/>' + eye(120, 112, 9, 14) + eye(162, 128, 9, 14))

# L5: sprout whose two leaves are the eyes (it keeps growing)
l5 = (f'<path d="M128 238V148" stroke="{INK}" stroke-width="14" stroke-linecap="round"/>'
      f'<path d="M122 150C52 160 18 100 28 44C94 40 128 84 122 150Z" fill="{INK}"/>'
      f'<path d="M134 150C204 160 238 100 228 44C162 40 128 84 134 150Z" fill="{INK}"/>' + eye(76, 98, 9, 15) + eye(180, 98, 9, 15))

# L6: bubbles growing 1-1-2-3-5, the biggest is the Orb
x, parts = 14, []
for i, f in enumerate([1, 1, 2, 3, 5]):
    r = f * 8
    parts.append(f'<circle cx="{x+r}" cy="136" r="{r}" fill="{INK if f == 5 else MINT}"/>')
    if f == 5:
        parts.append(eye(x + r - 14, 128, 6, 10) + eye(x + r + 14, 128, 6, 10))
    x += 2 * r + 8
l6 = "".join(parts).replace(f'fill="{MINT}"/><ellipse', f'fill="{MINT}"/><ellipse')

for k, body in enumerate([l1, l2, l3, l4, l5, l6], 1):
    save(f"l{k}-symbol", svg(256, 256, body))
    save(f"l{k}-lockup", lockup(f'<g transform="translate(0,-28) scale(0.78)">{body}</g>', wb, ww))
print("ok")
