"""Logo rounds 12, 13 (new directions C, D) and 14 (refining the bitten b, E). Run: python build12.py"""
import math
from build import svg, save, lockup, word, INK, MINT

wb, ww = word()
PHI = 1.618
pol = lambda cx, cy, r, deg: (cx + r * math.cos(math.radians(deg)), cy + r * math.sin(math.radians(deg)))
tad = lambda cx, cy, c: (f'<circle cx="{cx}" cy="{cy}" r="44" fill="{c}"/>'
                         f'<path d="M{cx-40} {cy+18}L{cx+8} {cy+44}L{cx-46} {cy+100}Z" fill="{c}" stroke="{c}" stroke-width="12" stroke-linejoin="round"/>')

# ---------- Round 12 (C) ----------
c1 = tad(78, 96, INK) + tad(176, 96, MINT)                                                    # quote marks that are two eyes
c2 = (f'<path d="M128 100V228M92 100H164M92 228H164" stroke="{INK}" stroke-width="28" stroke-linecap="round" fill="none"/>'
      f'<circle cx="128" cy="44" r="26" fill="{MINT}"/>')                                      # text cursor that is an "i"
c3 = (f'<circle cx="128" cy="40" r="26" fill="{MINT}"/><circle cx="128" cy="120" r="38" fill="{INK}"/>'
      f'<circle cx="128" cy="190" r="24" fill="{INK}"/><circle cx="128" cy="236" r="15" fill="{INK}"/>')  # i that erodes downward
seeds = []
for n, s in enumerate([6, 8, 11, 14, 19, 25, 33, 42], 1):
    x, y = pol(128, 128, 30 * math.sqrt(n), n * 137.508)
    seeds.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{s*0.62:.1f}" fill="{MINT if n == 8 else INK}"/>')
c4 = "".join(seeds)                                                                            # eight seeds at the golden angle
c5 = "".join(f'<rect x="24" y="{232-s}" width="{s}" height="{s}" rx="{s*0.16:.0f}" fill="{c}"/>' for s, c in [(208, INK), (128.6, MINT), (79.5, INK), (49, MINT)])  # nested golden frames
c6 = "".join(f'<rect x="28" y="{40+i*54}" width="{w}" height="32" rx="16" fill="{c}"/>' for i, (w, c) in enumerate([(200, INK), (123.6, INK), (76.4, INK), (47.2, MINT)]))  # lines 1, 1/phi...

# ---------- Round 13 (D) ----------
d1 = (f'<circle cx="128" cy="128" r="56" fill="none" stroke="{INK}" stroke-width="34"/>'
      f'<path d="M72 128V232M184 128V24" stroke="{INK}" stroke-width="34" stroke-linecap="round"/><circle cx="128" cy="128" r="14" fill="{MINT}"/>')   # p and b sharing one bowl
d2 = (f'<path d="M60 24V232M60 140A62 62 0 0 1 184 140V232" fill="none" stroke="{INK}" stroke-width="36" stroke-linecap="round"/>'
      f'<circle cx="122" cy="200" r="20" fill="{MINT}"/>')                                    # h with a dot under the arch
d3 = f'<circle cx="128" cy="128" r="106" fill="{INK}"/><rect x="74" y="98" width="128" height="40" rx="20" fill="{MINT}"/>'  # one eye slit
t, b_ = 100 * 1.236, 0
d4 = (f'<circle cx="128" cy="128" r="102" fill="{MINT}"/>'
      f'<path d="M128 26A102 102 0 0 0 128 230A38.2 38.2 0 0 1 128 153.6A63.8 63.8 0 0 0 128 26Z" fill="{INK}"/>')                  # circle split by a golden S
d5 = (f'<path d="M40 96V44H92M164 44H216V96M216 160V212H164M92 212H40V160" fill="none" stroke="{INK}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>'
      f'<circle cx="128" cy="128" r="28" fill="{MINT}"/>')                                    # viewfinder
d6 = "".join(f'<path d="{p}" fill="none" stroke="{c}" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>'
             for p, c in [("M36 90L82 128L36 166", INK), ("M108 66L166 128L108 190", INK), ("M170 30L232 128L170 226", MINT)])  # chevrons 1, phi, phi^2

# ---------- Round 14 (E): the bitten b, refined ----------
def bitten_b(uid, ring=36, bites=((-35, 78 / PHI),), dots=((-35, 98, 16),), solid=False, hole=None):
    cx, cy, R = 114, 158, 78
    mask = "".join(f'<circle cx="{pol(cx, cy, 78, a)[0]:.1f}" cy="{pol(cx, cy, 78, a)[1]:.1f}" r="{r:.1f}" fill="#000"/>' for a, r in bites)
    stem = f'<rect x="36" y="16" width="36" height="220" rx="18" fill="{{c}}"/>'
    bowl = (f'<circle cx="{cx}" cy="{cy}" r="{R - ring/2}" fill="none" stroke="{{c}}" stroke-width="{ring}" mask="url(#{uid})"/>')
    d = "".join(f'<circle cx="{pol(cx, cy, rr, a)[0]:.1f}" cy="{pol(cx, cy, rr, a)[1]:.1f}" r="{r}" fill="{MINT}"/>' for a, rr, r in dots)
    return (f'<defs><mask id="{uid}"><rect width="256" height="256" fill="#fff"/>{mask}</mask></defs>' + stem + bowl + d)

e1 = bitten_b("e1").replace("{c}", INK)                                                          # clean: stem = ring thickness, bite radius = bowl / phi
e2 = bitten_b("e2", ring=52, dots=((-35, 100, 18),)).replace("{c}", INK)                          # heavy bowl for tiny sizes
e3 = bitten_b("e3", bites=((38, 78 / PHI),), dots=((38, 100, 16),)).replace("{c}", INK)           # bite at the bottom right
e4 = bitten_b("e4", bites=((-60, 78 / PHI), (-12, 78 / PHI ** 2)), dots=((-60, 100, 15), (-12, 94, 9))).replace("{c}", INK)  # two bites, two dots, shrinking
e5 = f'<rect x="8" y="8" width="240" height="240" rx="58" fill="{INK}"/><g transform="translate(36 28) scale(0.78)">' + bitten_b("e5").replace("{c}", "#ffffff") + '</g>'  # reversed tile
# E6: "bi": the dot that left the b is the dot of the i
e6 = (bitten_b("e6", dots=()).replace("{c}", INK).replace('height="220" rx="18"', 'height="220" rx="18"')
      + f'<rect x="216" y="86" width="36" height="150" rx="18" fill="{INK}"/><circle cx="234" cy="44" r="22" fill="{MINT}"/>')
e6 = f'<g transform="translate(-14 0)">{e6}</g>'

sets = {"c": [c1, c2, c3, c4, c5, c6], "d": [d1, d2, d3, d4, d5, d6], "e": [e1, e2, e3, e4, e5, e6]}
for tag, items in sets.items():
    for k, body in enumerate(items, 1):
        save(f"{tag}{k}-symbol", svg(256, 256, body))
        save(f"{tag}{k}-lockup", lockup(f'<g transform="translate(0,-28) scale(0.78)">{body}</g>', wb, ww))
print("ok")
