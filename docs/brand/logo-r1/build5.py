"""Logo round 5: seven routes away from the Orb circle (K1..K7). Run: python build5.py"""
import math
from build import svg, save, lockup, word, INK, MINT

wb, ww = word()
eye = lambda cx, cy, rx=12, ry=19: f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{MINT}"/>'

# K1: sunflower of dots at the golden angle; Fibonacci-numbered seeds are mint
fib, a, b = set(), 1, 2
while a < 200:
    fib.add(a); a, b = b, a + b
dots = []
for n in range(1, 151):
    r, t = 9.6 * math.sqrt(n), n * math.radians(137.508)
    dots.append(f'<circle cx="{128 + r*math.cos(t):.1f}" cy="{128 + r*math.sin(t):.1f}" r="{2.2 + n*0.026:.1f}" fill="{MINT if n in fib else INK}"/>')
k1 = "".join(dots)

# K2: p and b as two eyes: stems are the ears, bowls the eyes, mint pupils
k2 = (f'<path d="M44 74V232" stroke="{INK}" stroke-width="18" stroke-linecap="round" fill="none"/>'
      f'<circle cx="82" cy="116" r="38" fill="none" stroke="{INK}" stroke-width="18"/><circle cx="82" cy="116" r="10" fill="{MINT}"/>'
      f'<path d="M212 24V182" stroke="{INK}" stroke-width="18" stroke-linecap="round" fill="none"/>'
      f'<circle cx="174" cy="140" r="38" fill="none" stroke="{INK}" stroke-width="18"/><circle cx="174" cy="140" r="10" fill="{MINT}"/>')

# K3: voice waveform, bar heights 1-2-3-5-8-5-3-2-1, the middle one mint
hs = [1, 2, 3, 5, 8, 5, 3, 2, 1]
k3 = "".join(f'<rect x="{16 + i*26}" y="{128 - h*12}" width="18" height="{h*24}" rx="9" fill="{MINT if h == 8 else INK}"/>' for i, h in enumerate(hs))

# K4: the Orb peeking over a horizon (sunrise: it starts your day)
rays = "".join(f'<path d="M{128+112*math.cos(math.radians(a)):.1f} {172+112*math.sin(math.radians(a)):.1f}L{128+134*math.cos(math.radians(a)):.1f} {172+134*math.sin(math.radians(a)):.1f}" stroke="{MINT}" stroke-width="10" stroke-linecap="round"/>' for a in (-150, -120, -90, -60, -30))
k4 = (rays + f'<path d="M30 172A98 98 0 0 1 226 172Z" fill="{INK}"/>' + eye(96, 134, 12, 19) + eye(160, 134, 12, 19)
      + f'<path d="M12 196H244" stroke="{INK}" stroke-width="10" stroke-linecap="round"/>')

# K5: seal: mint phi on a navy disc
k5 = (f'<circle cx="128" cy="128" r="116" fill="{INK}"/>'
      f'<circle cx="128" cy="128" r="46" fill="none" stroke="{MINT}" stroke-width="16"/>'
      f'<path d="M128 44V212" stroke="{MINT}" stroke-width="16" stroke-linecap="round"/>')

# K6: growing blocks (5,3,2,1,1); the big one is the face
U, G = 24, 6
sq = [(0, 0, 5, INK), (5, 0, 3, INK), (6, 3, 2, INK), (5, 3, 1, MINT), (5, 4, 1, INK)]
k6 = (f'<g transform="translate(26,52)">' + "".join(f'<rect x="{x*U+G/2}" y="{y*U+G/2}" width="{s*U-G}" height="{s*U-G}" rx="{4+s*2}" fill="{c}"/>' for x, y, s, c in sq)
      + eye(2.2*U, 2.3*U, 10, 16) + eye(3.8*U, 2.3*U, 10, 16) + '</g>')

# K7: ink drop with eyes (for people who write, design and sell)
k7 = (f'<path d="M128 14C112 50 38 116 38 166A90 90 0 0 0 218 166C218 116 144 50 128 14Z" fill="{INK}"/>' + eye(98, 170) + eye(158, 170))

items = [k1, k2, k3, k4, k5, k6, k7]
for k, body in enumerate(items, 1):
    save(f"k{k}-symbol", svg(256, 256, body))
    save(f"k{k}-lockup", lockup(f'<g transform="translate(0,-28) scale(0.78)">{body}</g>', wb, ww))
print("ok")
