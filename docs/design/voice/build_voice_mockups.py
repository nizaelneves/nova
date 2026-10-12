"""Mockups for Phi's global voice indicator. Run: python build_voice_mockups.py
Reads the snail from ../snail/peek.svg and writes voice-indicator.svg (options A and B, three states each)."""
import math
import pathlib
import re

HERE = pathlib.Path(__file__).parent
peek = (HERE.parent / "snail" / "peek.svg").read_text(encoding="utf-8")
defs = re.search(r"<defs>.*?</defs>", peek, re.S).group(0)
body = peek[peek.index("</defs>") + 7: peek.rindex("</svg>")]
body = re.sub(r"<style>.*?</style>", "", body, flags=re.S)
body = body.replace('class="blink "', 'class="blink"').replace('class="blink b2"', 'class="blink b2"')

ACCENT = "#2dd4bf"
BG = "#070b10"
CARD = "#0d141b"
LINE = "#1b2a33"
TEXT = "#d6e4e4"
MUTED = "#7f9999"

W, H = 1240, 760


def bars(x, y, count, width, gap, max_h, seed, color="url(#barG)", calm=False):
    """A row of voice bars (centred on y), shaped like VoiceVisualizer: a swell with a little wobble."""
    out = []
    for i in range(count):
        t = i / (count - 1)
        env = math.sin(math.pi * t) ** 0.8
        wob = 0.55 + 0.45 * math.sin(i * 1.7 + seed) * math.sin(i * 0.63 + seed * 2)
        h = max(3, max_h * (0.12 if calm else 1) * env * abs(wob))
        out.append(f'<rect x="{x + i * (width + gap):.1f}" y="{y - h / 2:.1f}" width="{width}" height="{h:.1f}" rx="{width / 2}" fill="{color}"/>')
    return "".join(out)


def snail_button(cx, cy, size=64, ring=None, badge=None):
    """The floating button: dark disc with the snail; optional ring state."""
    r = size / 2
    parts = [f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#fabG)" stroke="#1f3b40"/>']
    if ring == "listen":
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r + 7}" fill="none" stroke="{ACCENT}" stroke-opacity=".75" stroke-width="2.5"/>')
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r + 15}" fill="none" stroke="{ACCENT}" stroke-opacity=".3" stroke-width="2"/>')
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r + 23}" fill="none" stroke="{ACCENT}" stroke-opacity=".12" stroke-width="2"/>')
    if ring == "think":
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r + 7}" fill="none" stroke="{ACCENT}" stroke-opacity=".25" stroke-width="3"/>')
        parts.append(f'<path d="M{cx},{cy - r - 7} A{r + 7},{r + 7} 0 0 1 {cx + r + 7},{cy}" fill="none" stroke="{ACCENT}" stroke-width="3" stroke-linecap="round"/>')
    if ring == "speak":
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r + 7}" fill="none" stroke="#a78bfa" stroke-opacity=".7" stroke-width="2.5"/>')
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r + 15}" fill="none" stroke="#a78bfa" stroke-opacity=".25" stroke-width="2"/>')
    parts.append(f'<use href="#snail" x="{cx - r + 4}" y="{cy - r + 4}" width="{size - 8}" height="{size - 8}"/>')
    if badge:
        parts.append(f'<g transform="translate({cx + r - 6},{cy - r + 6})"><circle r="11" fill="{badge}" stroke="{BG}" stroke-width="2.5"/>'
                     f'<circle r="4" fill="#fff"/></g>')
    return "".join(parts)


def radial_bars(cx, cy, r0, count, max_len, seed, color=ACCENT):
    """Bars standing on the button's edge, like a circular equalizer."""
    out = []
    for i in range(count):
        a = 2 * math.pi * i / count - math.pi / 2
        wob = 0.35 + 0.65 * abs(math.sin(i * 1.3 + seed) * math.cos(i * 0.4 + seed * 1.7))
        ln = 4 + max_len * wob
        x1, y1 = cx + math.cos(a) * r0, cy + math.sin(a) * r0
        x2, y2 = cx + math.cos(a) * (r0 + ln), cy + math.sin(a) * (r0 + ln)
        out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="3.2" stroke-linecap="round"/>')
    return "".join(out)


def card(x, y, w, h, fill=CARD):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="{fill}" stroke="{LINE}"/>'


def text(x, y, s, size=13, fill=TEXT, weight=500, anchor="start", mono=False):
    fam = "ui-monospace,Consolas,monospace" if mono else "system-ui,Segoe UI,sans-serif"
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" font-family="{fam}">{s}</text>'


def keycap(x, y, label, w=None):
    w = w or (len(label) * 8 + 16)
    return (f'<rect x="{x}" y="{y}" width="{w}" height="22" rx="6" fill="#111c24" stroke="#2a3d47"/>'
            + text(x + w / 2, y + 15, label, 11, TEXT, 600, "middle", True)), w


def hint(x, y):
    k1, w1 = keycap(x, y, "Ctrl")
    k2, w2 = keycap(x + w1 + 4, y, "Shift")
    k3, w3 = keycap(x + w1 + w2 + 8, y, "Space")
    base = x + w1 + w2 + w3 + 14
    return k1 + k2 + k3 + text(base, y + 15, "send", 12, MUTED) + text(base + 48, y + 15, "·", 12, MUTED) + text(base + 60, y + 15, "Esc cancel", 12, MUTED)


parts = []

# ------------------------------------------------------------ option A: card above the button
parts.append(text(40, 52, "A. A card opens above the button", 18, ACCENT, 700))
parts.append(text(40, 74, "The VoiceVisualizer bars live in a small card; the button keeps a ring. Same card shows the answer.", 12.5, MUTED))

states_a = [
    ("1  Listening", "listen"),
    ("2  Sending", "think"),
    ("3  Phi replies", "speak"),
]
for i, (label, ring) in enumerate(states_a):
    ox = 40 + i * 395
    oy = 100
    parts.append(text(ox, oy + 10, label, 13, MUTED, 600))
    cx, cy, cw, ch = ox, oy + 24, 340, 150
    parts.append(card(cx, cy, cw, ch))
    if ring == "listen":
        parts.append(f'<circle cx="{cx + 22}" cy="{cy + 26}" r="5" fill="#ef4444"/>')
        parts.append(text(cx + 36, cy + 31, "Listening", 14, TEXT, 600))
        parts.append(text(cx + cw - 20, cy + 31, "0:04", 13, MUTED, 500, "end", True))
        parts.append(bars(cx + 20, cy + 78, 40, 4.6, 3.2, 44, 1.3))
        parts.append(hint(cx + 20, cy + 112))
    elif ring == "think":
        parts.append(text(cx + 20, cy + 31, "Sending to Phi", 14, TEXT, 600))
        parts.append(text(cx + 20, cy + 62, "“Remind me to call the client at three”", 13, TEXT, 500))
        parts.append(text(cx + 20, cy + 84, "heard just now", 11.5, MUTED))
        for k, v in enumerate(("1", "1", "2", "3", "5")):
            parts.append(text(cx + 24 + k * 26, cy + 122, v, 15, ACCENT, 700, "middle", True).replace('fill="' + ACCENT + '"', f'fill="{ACCENT}" fill-opacity="{0.35 + k * 0.16:.2f}"'))
    else:
        parts.append(text(cx + 20, cy + 31, "Phi", 14, TEXT, 600))
        parts.append(text(cx + cw - 20, cy + 31, "SPEAKING", 10.5, "#a78bfa", 700, "end"))
        parts.append(text(cx + 20, cy + 60, "Done. I set a reminder for 3 PM", 13, TEXT, 500))
        parts.append(text(cx + 20, cy + 80, "and will ping you ten minutes before.", 13, TEXT, 500))
        parts.append(bars(cx + 20, cy + 115, 40, 4.6, 3.2, 26, 4.1, "#a78bfa"))
    bx, by = cx + cw - 44, cy + ch + 56
    parts.append(snail_button(bx, by, 64, ring))
    if ring == "listen":
        parts.append(f'<g transform="translate({bx + 22},{by - 22})"><circle r="9" fill="#ef4444" stroke="{BG}" stroke-width="2"/><circle r="3.2" fill="#fff"/></g>')

# ------------------------------------------------------------ option B: no card, the button itself reacts
parts.append(text(40, 430, "B. Only the button reacts (no card)", 18, ACCENT, 700))
parts.append(text(40, 452, "Smaller and quieter: bars stand around the snail, a short label sits beside it. The answer opens the normal chat bubble.", 12.5, MUTED))

states_b = [
    ("1  Listening", "listen"),
    ("2  Sending", "think"),
    ("3  Phi replies", "speak"),
]
for i, (label, ring) in enumerate(states_b):
    ox = 40 + i * 395
    oy = 480
    parts.append(text(ox, oy + 10, label, 13, MUTED, 600))
    parts.append(card(ox, oy + 24, 340, 190, "#0a1117"))
    bx, by = ox + 170, oy + 119
    if ring == "listen":
        parts.append(radial_bars(bx, by, 42, 36, 22, 2.1))
        parts.append(snail_button(bx, by, 64))
        parts.append(f'<rect x="{bx - 74}" y="{by + 62}" width="148" height="28" rx="14" fill="#111c24" stroke="#2a3d47"/>')
        parts.append(text(bx, by + 80, "Listening · 0:04", 12, TEXT, 600, "middle"))
    elif ring == "think":
        parts.append(snail_button(bx, by, 64, "think"))
        parts.append(f'<rect x="{bx - 74}" y="{by + 62}" width="148" height="28" rx="14" fill="#111c24" stroke="#2a3d47"/>')
        parts.append(text(bx, by + 80, "Sending to Phi…", 12, TEXT, 600, "middle"))
    else:
        parts.append(radial_bars(bx, by, 42, 36, 14, 5.3, "#a78bfa"))
        parts.append(snail_button(bx, by, 64))
        parts.append(f'<rect x="{bx - 74}" y="{by + 62}" width="148" height="28" rx="14" fill="#111c24" stroke="#2a3d47"/>')
        parts.append(text(bx, by + 80, "Phi is speaking", 12, TEXT, 600, "middle"))

svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
<style>.blink{{transform-box:fill-box;transform-origin:center;animation:phiblink 4.4s infinite}}.blink.b2{{animation-delay:.06s}}@keyframes phiblink{{0%,90%,100%{{transform:scaleY(1)}}94%{{transform:scaleY(.08)}}}}</style>
{defs[:-7]}
<linearGradient id="barG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#10c3d3"/><stop offset="1" stop-color="#20e7aa"/></linearGradient>
<radialGradient id="fabG" cx=".3" cy=".25" r="1"><stop offset="0" stop-color="#13262b"/><stop offset="1" stop-color="#0a1216"/></radialGradient>
<symbol id="snail" viewBox="0 0 200 200">{body}</symbol>
</defs>
<rect width="{W}" height="{H}" rx="20" fill="{BG}"/>
{"".join(parts)}
</svg>"""
(HERE / "voice-indicator.svg").write_text(svg, encoding="utf-8")
print("ok", len(svg))
