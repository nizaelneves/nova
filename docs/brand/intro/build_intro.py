"""Phibe intro: keyframes for a motion video (Google Flow). phibe wordmark -> (numbers) -> Orb -> (numbers) -> logo + slogan.
Run: python build_intro.py  ->  frames/*.svg and *.png (1920x1080), contact-sheet.png
"""
import math, os, random, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "logo-r3"))
sys.path.insert(0, os.path.join(HERE, "..", "phibe"))
sys.path.insert(0, os.path.join(HERE, "..", "logo-r1"))
from build_rounds import wm_parts, trail, tile, TRAIL, L, H, W_, NAVY, MINT, CYAN, WHITE  # noqa: E402
from build7 import digit  # noqa: E402

PORTRAIT = os.environ.get("PORTRAIT") == "1"          # 9:16 version
FR = os.path.join(HERE, "frames-9x16" if PORTRAIT else "frames")
os.makedirs(FR, exist_ok=True)
W, HT = (1080, 1920) if PORTRAIT else (1920, 1080)
BG = "#060511"
N = 1700
random.seed(11)
SLOGAN = "your personal ai assistant in constant become"


# ---------------------------------------------------------------- geometry (units) and sampling
def line_pts(x, y0, y1, w, step):
    out, y = [], y0
    while y <= y1:
        dx = -w / 2
        while dx <= w / 2:
            out.append((x + dx, y)); dx += step
        y += step
    return out


def arc_pts(cx, cy, R, a0, a1, w, step):
    out, n = [], max(8, int(math.radians(abs(a1 - a0)) * R / step))
    for k in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * k / n)
        r = R - w / 2
        while r <= R + w / 2:
            out.append((cx + r * math.cos(a), cy + r * math.sin(a))); r += step
    return out


def disc_pts(cx, cy, r, step):
    return [(cx + dx, cy + dy) for dx in frange(-r, r, step) for dy in frange(-r, r, step) if dx * dx + dy * dy <= r * r]


def frange(a, b, s):
    while a <= b:
        yield a
        a += s


def wordmark_samples(step=3.0):
    """Points of the official wordmark in wordmark units, tagged: 'phi', 'be' or 'sq'."""
    pts, R, cy = [], L.R, L.cy
    s = W_ / 2
    x_p, x_h, x_i = 0, H + 18, 2 * H + 36
    x_b = x_i + W_ + 18 if False else x_i + W_ + 18
    x_e = x_b + H + 14
    # p
    pts += [(x, y, "phi") for x, y in line_pts(x_p + s, s, H + 65 - s, W_, step)]
    pts += [(x, y, "phi") for x, y in arc_pts(x_p + s + R, cy, R, 0, 360, W_, step)]
    # h
    pts += [(x, y, "phi") for x, y in line_pts(x_h + s, -52 + s, H - s, W_, step)]
    pts += [(x, y, "phi") for x, y in arc_pts(x_h + s + R, cy, R, 180, 360, W_, step)]
    pts += [(x, y, "phi") for x, y in line_pts(x_h + s + 2 * R, cy, H - s, W_, step)]
    # i (stem; the square dot is a separate 'sq')
    pts += [(x, y, "phi") for x, y in line_pts(x_i + s, W_ * 1.5, H - s, W_, step)]
    pts += [(x_i + s + dx, -22 + dy, "sq") for dx in frange(-14, 14, step) for dy in frange(-14, 14, step)]
    # b
    pts += [(x, y, "be") for x, y in line_pts(x_b + s, -52 + s, H - s, W_, step)]
    pts += [(x, y, "be") for x, y in arc_pts(x_b + s + R, cy, R, -5, 275, W_, step)]
    # e
    ecx = x_e + s + R
    pts += [(x, y, "be") for x, y in arc_pts(ecx, cy, R, 45, 360, W_, step)]
    pts += [(x, y, "be") for x in frange(ecx - R, ecx + R, step) for y in frange(cy + 4 - L.bar / 2, cy + 4 + L.bar / 2, step)]
    # squares shed by the b
    bx = x_b + s
    for ox, oy, sz in TRAIL:
        pts += [(bx + ox + dx, -52 + oy + dy, "sq") for dx in frange(-sz / 2, sz / 2, max(1.2, step * sz / 16)) for dy in frange(-sz / 2, sz / 2, max(1.2, step * sz / 16))]
    return pts


def pick(pts, n):
    random.shuffle(pts)
    while len(pts) < n:
        pts = pts + pts
    return pts[:n]


# ---------------------------------------------------------------- the three shapes in pixels
WM_W = 582.0
WM = wordmark_samples()
S_WORD, C_WORD = (1.5 if PORTRAIT else 1.95), (291.0, 67.0)
word_px = [((x - C_WORD[0]) * S_WORD + W / 2, (y - C_WORD[1]) * S_WORD + HT / 2, tag) for x, y, tag in WM]

S_LOGO = 2.0
OFF_X, OFF_Y = W / 2 - 322 * S_LOGO, 470 - 75 * S_LOGO          # landscape lockup units -> pixels
SW = 0.78
wm_off = (190, 75 - 61 * SW)
TILE_S, TILE_O = 3.0, (W / 2 - 225, 560 - 225)                   # portrait: tile above the wordmark
WS, WO = 1.4, (W / 2 - 291 * 1.4, 1090 - 67 * 1.4)


def tile_px(x, y):
    return (x * TILE_S + TILE_O[0], y * TILE_S + TILE_O[1]) if PORTRAIT else (x * S_LOGO + OFF_X, y * S_LOGO + OFF_Y)


def word_in_logo(x, y):
    if PORTRAIT:
        return x * WS + WO[0], y * WS + WO[1]
    return (x * SW + wm_off[0]) * S_LOGO + OFF_X, (y * SW + wm_off[1]) * S_LOGO + OFF_Y


logo_px = [(*word_in_logo(x, y), tag) for x, y, tag in WM]
for x in frange(8, 142, 3.4):                                      # the tile (rounded square 150, radius 36)
    for y in frange(8, 142, 3.4):
        cx, cy_ = min(max(x, 36), 114), min(max(y, 36), 114)
        if (x - cx) ** 2 + (y - cy_) ** 2 <= 36 ** 2:
            logo_px.append((*tile_px(x, y), "tile"))

orb_px = []
for _ in range(N * 2):
    u = random.random()
    if u < 0.62:                                                   # the face
        r = 150 * math.sqrt(random.random()); a = random.uniform(0, 6.283)
        orb_px.append((W / 2 + r * math.cos(a), HT / 2 + r * math.sin(a), "face"))
    elif u < 0.90:                                                 # the mist ring
        r = 150 + 90 * random.random() ** 1.4; a = random.uniform(0, 6.283)
        orb_px.append((W / 2 + r * math.cos(a), HT / 2 + r * math.sin(a), "mist"))
    else:                                                          # the two eyes
        sgn = random.choice([-1, 1])
        a = random.uniform(0, 6.283); r = random.random() ** .5
        orb_px.append((W / 2 + sgn * 60 + 20 * r * math.cos(a), HT / 2 - 14 + 30 * r * math.sin(a), "eye"))


def color_of(tag, x):
    if tag == "phi": return WHITE
    if tag == "be": return CYAN if x < W / 2 + 120 else MINT
    if tag == "sq": return MINT
    if tag == "tile": return CYAN if x < W / 2 - 200 else MINT
    if tag == "face": return random.choice(["#143f4a", "#1f6a78", CYAN])
    if tag == "mist": return random.choice([CYAN, MINT, "#0b4f78"])
    return "#bff8f3"


def particles(src, dst):
    a, b = pick(list(src), N), pick(list(dst), N)
    a.sort(key=lambda p: -p[0] - 0.2 * p[1])                        # right to left, like the dust of S1
    b.sort(key=lambda p: -p[0] - 0.2 * p[1])
    out = []
    for i, (p, q) in enumerate(zip(a, b)):
        ang = math.radians(-38 + random.uniform(-45, 45))
        out.append(dict(r=i / N, sx=p[0], sy=p[1], dx=q[0], dy=q[1], sc=color_of(p[2], p[0]), dc=color_of(q[2], q[0]),
                        vx=math.cos(ang), vy=math.sin(ang), mag=random.random(), digit=random.choice("112358"), size=random.uniform(10, 17)))
    return out


ease = lambda u: u * u * (3 - 2 * u)


def draw(parts, t):
    out = []
    for p in parts:
        u = min(1.0, max(0.0, (t - 0.38 * p["r"]) / 0.62))
        e = ease(u)
        sc = math.sin(math.pi * u) ** 1.1
        x = p["sx"] + (p["dx"] - p["sx"]) * e + p["vx"] * p["mag"] * 300 * sc
        y = p["sy"] + (p["dy"] - p["sy"]) * e + p["vy"] * p["mag"] * 300 * sc
        if 0.04 < u < 0.96:
            col = random.choice([p["sc"], p["dc"], WHITE, MINT]) if sc > 0.5 else (p["sc"] if u < 0.5 else p["dc"])
            out.append(digit(p["digit"], x, y, p["size"], col, 1.7))
        else:
            col = p["sc"] if u <= 0.04 else p["dc"]
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2.7" fill="{col}"/>')
    return "".join(out)


# ---------------------------------------------------------------- clean art
def gradient(uid, w):
    return f'<linearGradient id="{uid}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="{w}" y2="0"><stop offset="0" stop-color="{CYAN}"/><stop offset="1" stop-color="{MINT}"/></linearGradient>'


def wordmark_art(uid):
    body, ww, xb = wm_parts(WHITE, f"url(#{uid})", WHITE, square_i=MINT)
    return f'<defs>{gradient(uid, ww)}</defs>{body}{trail(xb, [MINT, MINT, CYAN, CYAN, CYAN])}'


def word_clean():
    return f'<g transform="translate({W / 2 - C_WORD[0] * S_WORD:.1f} {HT / 2 - C_WORD[1] * S_WORD:.1f}) scale({S_WORD})">{wordmark_art("gw")}</g>'


def logo_clean(with_slogan):
    t = tile("lt", "", NAVY, WHITE, grad_pair=(CYAN, MINT))
    if PORTRAIT:
        body = (f'<g transform="translate({TILE_O[0]:.1f} {TILE_O[1]:.1f}) scale({TILE_S})">{t}</g>'
                f'<g transform="translate({WO[0]:.1f} {WO[1]:.1f}) scale({WS})">{wordmark_art("gl")}</g>')
        lines = [("your personal ai assistant", False), ("in constant ", True)]
        y0 = 1420
    else:
        body = (f'<g transform="translate({OFF_X:.1f} {OFF_Y:.1f}) scale({S_LOGO})">{t}'
                f'<g transform="translate({wm_off[0]} {wm_off[1]:.1f}) scale({SW})">{wordmark_art("gl")}</g></g>')
        y0 = OFF_Y + 150 * S_LOGO + 86
    if with_slogan:
        style = 'font-family="Segoe UI, Inter, system-ui, sans-serif" font-weight="300" letter-spacing="%d" fill="#b9bfe0" text-anchor="middle"' % (6 if PORTRAIT else 7)
        if PORTRAIT:
            body += (f'<text x="{W / 2}" y="{y0}" font-size="50" {style}>your personal ai assistant</text>'
                     f'<text x="{W / 2}" y="{y0 + 76}" font-size="50" {style}>in constant <tspan fill="{MINT}" font-weight="500">become</tspan></text>')
        else:
            body += (f'<text x="{W / 2}" y="{y0}" font-size="44" {style}>your personal ai assistant in constant <tspan fill="{MINT}" font-weight="500">become</tspan></text>')
    return body


def orb_clean():
    """The official mist Orb, static (same filters as PhibeMist.tsx, first frame)."""
    c1, c2, eye = CYAN, MINT, "#bff8f3"
    def noise(freq, octv, seed, i):
        return f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="{octv}" seed="{seed}" result="{i}"/>'
    defs = (f'<radialGradient id="oc" cx=".5" cy=".3" r=".9"><stop offset="0" stop-color="#143f4a"/><stop offset="1" stop-color="#04101a"/></radialGradient>'
            f'<radialGradient id="oe" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="{eye}"/><stop offset="1" stop-color="{c2}"/></radialGradient>'
            '<filter id="og" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2"/></filter>'
            f'<filter id="om" x="-40%" y="-35%" width="180%" height="200%" color-interpolation-filters="sRGB">{noise("0.022 0.01", 3, 7, "a")}{noise("0.032 0.014", 2, 21, "b")}'
            '<feComposite in="a" in2="b" operator="arithmetic" k1="0" k2=".55" k3=".45" k4="0" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="38" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="2.4"/></filter>'
            f'<filter id="os" x="-40%" y="-35%" width="180%" height="200%" color-interpolation-filters="sRGB">{noise("0.034 0.012", 3, 7, "a")}{noise("0.05 0.02", 2, 21, "b")}'
            '<feComposite in="a" in2="b" operator="arithmetic" k1="0" k2=".55" k3=".45" k4="0" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.5" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation=".8"/></filter>')

    def eye_(cx):
        return (f'<ellipse cx="{cx}" cy="98" rx="9" ry="12" fill="{c2}" fill-opacity=".5" filter="url(#og)"/><ellipse cx="{cx}" cy="98" rx="6.4" ry="9.4" fill="url(#oe)"/>'
                f'<ellipse cx="{cx - 1.6}" cy="95" rx="1.8" ry="2.6" fill="#fff" fill-opacity=".9"/>')
    art = (f'<g filter="url(#om)"><circle cx="100" cy="100" r="78" fill="{c1}" fill-opacity=".10"/><circle cx="100" cy="100" r="64" fill="{c1}" fill-opacity=".12"/>'
           f'<circle cx="100" cy="100" r="55" fill="none" stroke="{c2}" stroke-opacity=".12" stroke-width="12"/></g>'
           f'<g filter="url(#os)"><circle cx="100" cy="100" r="46" fill="url(#oc)"/><circle cx="100" cy="100" r="46" fill="none" stroke="{c2}" stroke-opacity=".45" stroke-width="2.4"/></g>'
           f'{eye_(82)}{eye_(118)}')
    k = 560 / 200
    return f'<defs>{defs}</defs><g transform="translate({W / 2 - 100 * k:.1f} {HT / 2 - 100 * k:.1f}) scale({k})">{art}</g>'


def frame(name, body):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {HT}" width="{W}" height="{HT}">'
           f'<defs><radialGradient id="bgv" cx=".5" cy=".5" r=".75"><stop offset="0" stop-color="#0d0b2a"/><stop offset="1" stop-color="{BG}"/></radialGradient></defs>'
           f'<rect width="{W}" height="{HT}" fill="url(#bgv)"/>{body}</svg>')
    path = os.path.join(FR, name + ".svg")
    open(path, "w", encoding="utf-8").write(svg)
    return path


P1 = particles(word_px, orb_px)       # wordmark -> Orb
P2 = particles(orb_px, logo_px)       # Orb -> logo
steps = [
    ("01-phibe", word_clean()),
    ("02-phibe-dissolving", draw(P1, 0.22)),
    ("03-numbers-in-flight", draw(P1, 0.50)),
    ("04-numbers-gathering-into-orb", draw(P1, 0.82)),
    ("05-orb", orb_clean()),
    ("06-orb-dissolving", draw(P2, 0.22)),
    ("07-numbers-in-flight", draw(P2, 0.52)),
    ("08-numbers-forming-logo", draw(P2, 0.84)),
    ("09-logo", logo_clean(False)),
    ("10-logo-and-slogan", logo_clean(True)),
]
paths = [frame(n, b) for n, b in steps]
print("frames", len(paths))
