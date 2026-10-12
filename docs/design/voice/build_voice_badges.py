"""Badges the avatar wears for the voice flow (listening, sending, done, errors, countdown).
Run: python build_voice_badges.py -> voice-badges.svg"""
import pathlib
import re

HERE = pathlib.Path(__file__).parent
peek = (HERE.parent / "snail" / "peek.svg").read_text(encoding="utf-8")
defs = re.search(r"<defs>.*?</defs>", peek, re.S).group(0)
body = peek[peek.index("</defs>") + 7: peek.rindex("</svg>")]
body = re.sub(r"<style>.*?</style>", "", body, flags=re.S)

BG, CARD, LINE, TEXT, MUTED, ACCENT = "#070b10", "#0d141b", "#1b2a33", "#d6e4e4", "#7f9999", "#2dd4bf"
S = 'fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"'


def icon(kind):
    if kind == "wave":
        hs = (4, 9, 14, 9, 4)
        return "".join(f'<line x1="{-8 + i * 4}" y1="{-h / 2}" x2="{-8 + i * 4}" y2="{h / 2}" {S}/>' for i, h in enumerate(hs))
    if kind == "send":
        return f'<path d="M-6,0 A6,6 0 1 1 0,6" {S}/>'
    if kind == "ok":
        return f'<path d="M-5.5,0.5 L-1.8,4.3 L5.8,-4" {S}/>'
    if kind == "micoff":
        return (f'<rect x="-2.6" y="-8" width="5.2" height="9" rx="2.6" {S}/><path d="M-6,-1 C-6,5 6,5 6,-1" {S}/>'
                f'<line x1="0" y1="5" x2="0" y2="8" {S}/><line x1="-8" y1="-8" x2="8" y2="8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>')
    if kind == "plug":
        return (f'<line x1="-3" y1="-8" x2="-3" y2="-3" {S}/><line x1="3" y1="-8" x2="3" y2="-3" {S}/>'
                f'<path d="M-6,-3 H6 V1 C6,4 3,6 0,6 C-3,6 -6,4 -6,1 Z" {S}/><line x1="0" y1="6" x2="0" y2="9" {S}/>')
    if kind == "download":
        return f'<line x1="0" y1="-8" x2="0" y2="3" {S}/><path d="M-4.5,-1.5 L0,3 L4.5,-1.5" {S}/><line x1="-6" y1="8" x2="6" y2="8" {S}/>'
    if kind == "bang":
        return f'<line x1="0" y1="-7" x2="0" y2="1.5" {S}/><circle cx="0" cy="6" r="1.7" fill="#fff"/>'
    return ""


def badge(kind, color, label=None):
    inner = (f'<text x="0" y="1" font-size="17" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="central" '
             f'font-family="ui-monospace,Consolas,monospace">{label}</text>') if label else icon(kind)
    return f'<g><circle r="15" fill="{color}" stroke="{BG}" stroke-width="3"/>{inner}</g>'


def button(cx, cy, ring=None, ring_color=ACCENT):
    r = 32
    out = [f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#fabG)" stroke="#1f3b40"/>']
    if ring == "listen":
        out += [f'<circle cx="{cx}" cy="{cy}" r="{r + 7}" fill="none" stroke="{ring_color}" stroke-opacity=".75" stroke-width="2.5"/>',
                f'<circle cx="{cx}" cy="{cy}" r="{r + 15}" fill="none" stroke="{ring_color}" stroke-opacity=".28" stroke-width="2"/>']
    if ring == "send":
        out += [f'<circle cx="{cx}" cy="{cy}" r="{r + 7}" fill="none" stroke="{ring_color}" stroke-opacity=".25" stroke-width="3"/>',
                f'<path d="M{cx},{cy - r - 7} A{r + 7},{r + 7} 0 0 1 {cx + r + 7},{cy}" fill="none" stroke="{ring_color}" stroke-width="3" stroke-linecap="round"/>']
    if ring == "count":
        out += [f'<circle cx="{cx}" cy="{cy}" r="{r + 7}" fill="none" stroke="#2a3d47" stroke-width="3"/>',
                f'<path d="M{cx},{cy - r - 7} A{r + 7},{r + 7} 0 1 1 {cx - (r + 7) * 0.87},{cy + (r + 7) * 0.5}" fill="none" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"/>']
    out.append(f'<use href="#snail" x="{cx - r + 4}" y="{cy - r + 4}" width="{2 * r - 8}" height="{2 * r - 8}"/>')
    return "".join(out)


def t(x, y, s, size=13, fill=TEXT, weight=500, anchor="start"):
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" font-family="system-ui,Segoe UI,sans-serif">{s}</text>'


def pill(x, y, label, primary=False):
    w = len(label) * 7 + 22
    fill, stroke, col = (ACCENT, ACCENT, "#04201c") if primary else ("#111c24", "#2a3d47", TEXT)
    return f'<rect x="{x}" y="{y}" width="{w}" height="26" rx="13" fill="{fill}" stroke="{stroke}"/>' + t(x + w / 2, y + 17.5, label, 12, col, 600, "middle")


CELLS = [
    # kind, colour, ring, ring colour, count label, title, message, action
    ("wave", "#14b8a6", "listen", ACCENT, None, "Listening", "Speak now. Same shortcut sends.", None),
    ("send", "#14b8a6", "send", ACCENT, None, "Sending", "Your message is going to the chat.", None),
    ("ok", "#22c55e", None, ACCENT, None, "Sent", "Open the chat when you want to see it.", "Open chat"),
    ("bang", "#64748b", "count", "#94a3b8", "3", "Closing in 3", "You haven't said anything.", "Keep listening"),
    ("micoff", "#ef4444", None, ACCENT, None, "No microphone", "Windows is blocking Phi's access.", "Open settings"),
    ("plug", "#ef4444", None, ACCENT, None, "Phi is not running", "Start it from the tray, then try again.", "Open Phi"),
    ("download", "#f59e0b", None, ACCENT, None, "Voice model needed", "One download, 486 MB, stays on this PC.", "Download"),
    ("bang", "#ef4444", None, ACCENT, None, "Could not understand", "Nothing was sent. Try again.", "Try again"),
]

W, H = 1240, 600
parts = [t(40, 50, "Voice flow: what the avatar's badge shows", 18, ACCENT, 700),
         t(40, 72, "No sound. The badge sits on the avatar like any notification; a tooltip says what it means and offers one action. Works with any mascot.", 12.5, MUTED)]
for i, (kind, color, ring, rcol, label, title, msg, action) in enumerate(CELLS):
    col, row = i % 4, i // 4
    x0, y0 = 40 + col * 295, 96 + row * 250
    parts.append(f'<rect x="{x0}" y="{y0}" width="275" height="230" rx="18" fill="{CARD}" stroke="{LINE}"/>')
    cx, cy = x0 + 137, y0 + 70
    parts.append(button(cx, cy, ring, rcol))
    parts.append(f'<g transform="translate({cx + 30},{cy - 28})">{badge(kind, color, label)}</g>')
    parts.append(t(x0 + 137, y0 + 140, title, 14, TEXT, 700, "middle"))
    parts.append(t(x0 + 137, y0 + 162, msg, 11.5, MUTED, 500, "middle"))
    if action:
        w = len(action) * 7 + 22
        parts.append(pill(x0 + 137 - w / 2, y0 + 184, action, primary=(kind in ("micoff", "plug", "download", "ok"))))

svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
<style>.blink{{transform-box:fill-box;transform-origin:center;animation:phiblink 4.4s infinite}}.blink.b2{{animation-delay:.06s}}@keyframes phiblink{{0%,90%,100%{{transform:scaleY(1)}}94%{{transform:scaleY(.08)}}}}</style>
{defs[:-7]}
<radialGradient id="fabG" cx=".3" cy=".25" r="1"><stop offset="0" stop-color="#13262b"/><stop offset="1" stop-color="#0a1216"/></radialGradient>
<symbol id="snail" viewBox="0 0 200 200">{body}</symbol>
</defs>
<rect width="{W}" height="{H}" rx="20" fill="{BG}"/>
{"".join(parts)}
</svg>"""
(HERE / "voice-badges.svg").write_text(svg, encoding="utf-8")
print("ok", len(svg))
