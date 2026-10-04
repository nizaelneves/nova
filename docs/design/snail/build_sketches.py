"""Generates the Phi snail sketches (SVG + a preview page). Run: python build_sketches.py"""
import math
import pathlib

PHI = (1 + 5 ** 0.5) / 2
FIB = [1, 1, 2, 3, 5, 8, 13]
OUT = pathlib.Path(__file__).parent


def spiral(cx, cy, radius, r0=2.4, start=0.6, step=0.18):
    """Golden spiral: the radius grows by PHI every quarter turn, from the centre outwards."""
    s_max = (math.pi / 2) * math.log(radius / r0) / math.log(PHI)
    pts, s = [], 0.0
    while s <= s_max:
        r = r0 * PHI ** (s / (math.pi / 2))
        a = start + s
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        s += step
    return pts, s_max


def path_of(pts):
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)


def numbers(cx, cy, radius, size, fill="#ecfeff", r0=2.4, start=0.6):
    """Tiny Fibonacci numbers riding the spiral, growing like the shell does."""
    s_max = (math.pi / 2) * math.log(radius / r0) / math.log(PHI)
    out, k = [], 0
    for q in range(1, 7):
        s = q * (math.pi / 2) - 0.25
        if s > s_max - 0.6:
            break
        r = r0 * PHI ** (s / (math.pi / 2)) * 1.32
        a = start + s
        x, y = cx + r * math.cos(a), cy + r * math.sin(a)
        fs = size * (0.7 + 0.12 * k)
        out.append(
            f'<text x="{x:.1f}" y="{y:.1f}" font-size="{fs:.1f}" fill="{fill}" fill-opacity=".8" '
            f'text-anchor="middle" dominant-baseline="central" font-family="ui-monospace,Consolas,monospace" '
            f'font-weight="700">{FIB[k]}</text>'
        )
        k += 1
    return "".join(out)


def shell(cid, cx, cy, rx, ry, sp_cx, sp_cy, sp_r, nsize, outline="#0b3b38"):
    pts, _ = spiral(sp_cx, sp_cy, sp_r)
    lighter, _ = spiral(sp_cx, sp_cy, sp_r * 0.97, start=0.6 + 0.35)
    hx0, hy0 = cx - rx * 0.62, cy - ry * 0.55
    hx1, hy1 = cx - rx * 0.3, cy - ry * 0.93
    hx2, hy2 = cx + rx * 0.1, cy - ry * 0.9
    return f"""
  <clipPath id="{cid}"><ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}"/></clipPath>
  <ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#shellG)" stroke="{outline}" stroke-width="3.2"/>
  <g clip-path="url(#{cid})">
    <path d="{path_of(lighter)}" fill="none" stroke="#a7f3d0" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>
    <path d="{path_of(pts)}" fill="none" stroke="{outline}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <path d="M{hx0:.1f},{hy0:.1f} Q{hx1:.1f},{hy1:.1f} {hx2:.1f},{hy2:.1f}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="4" stroke-linecap="round"/>"""


DEFS = """
<linearGradient id="shellG" x1="0.15" y1="0" x2="0.85" y2="1">
  <stop offset="0" stop-color="#5eead4"/><stop offset=".55" stop-color="#2dd4bf"/><stop offset="1" stop-color="#0f9488"/>
</linearGradient>
<linearGradient id="bodyG" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#fff1d6"/><stop offset="1" stop-color="#f6d7a8"/>
</linearGradient>
<radialGradient id="holeG" cx=".5" cy=".4" r=".7">
  <stop offset="0" stop-color="#2a1b52"/><stop offset="1" stop-color="#150d2e"/>
</radialGradient>"""

EYE_DARK = "#241344"


def eye_open(x, y, r=6.5, white=True):
    """A big eye with a highlight; white=True gives the ring of the 'peeking' style."""
    base = f'<circle cx="{x}" cy="{y}" r="{r * 1.55:.1f}" fill="#fff"/>' if white else ""
    pr = r if white else r * 0.62
    return (
        base
        + f'<circle cx="{x + 0.6}" cy="{y + 0.8}" r="{pr:.1f}" fill="{EYE_DARK}"/>'
        + f'<circle cx="{x - pr * 0.28:.1f}" cy="{y - pr * 0.3:.1f}" r="{pr * 0.34:.1f}" fill="#fff"/>'
        + f'<circle cx="{x + pr * 0.35:.1f}" cy="{y + pr * 0.42:.1f}" r="{pr * 0.16:.1f}" fill="#fff" fill-opacity=".8"/>'
    )


BLINK_CSS = """<style>
.blink{transform-box:fill-box;transform-origin:center;animation:phiblink 4.4s infinite}
.blink.b2{animation-delay:.06s}
@keyframes phiblink{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.08)}}
@media (prefers-reduced-motion:reduce){.blink{animation:none}}
</style>"""


def peek_eye(x, y):
    """A big eye hiding in the dark: white ball, purple iris, two highlights. Blinks."""
    return (
        f'<g class="blink {"b2" if x > 90 else ""}">'
        f'<circle cx="{x}" cy="{y}" r="11" fill="#fff"/>'
        f'<circle cx="{x + 1}" cy="{y + 1.2}" r="7.4" fill="#3b1d7a"/>'
        f'<circle cx="{x + 1}" cy="{y + 1.4}" r="4.6" fill="#1b0f3d"/>'
        f'<circle cx="{x - 1.6}" cy="{y - 2}" r="2.6" fill="#fff"/>'
        f'<circle cx="{x + 3.2}" cy="{y + 3.4}" r="1.2" fill="#fff" fill-opacity=".85"/></g>'
    )


def peek():
    """Style 1: a shell hiding its owner. Only two eyes show in the dark. Floating button and tray icon."""
    # the shell's lower edge arches over the opening, so nothing sits below the eyes
    dome = ("M44,174 L40,174 C31,166 28,150 30,136 C24,96 40,42 98,26 C158,12 188,64 184,118 C182,148 166,168 140,171 L128,171 "
            "C124,148 108,126 82,124 C60,124 46,138 44,158 Z")
    arch = "M40,172 C34,146 54,118 82,120 C108,122 124,142 130,166"
    pts, _ = spiral(142, 96, 44, r0=2.2, start=2.4)
    inner, _ = spiral(142, 96, 42, r0=2.2, start=2.75)
    ribs = "".join(
        f'<path d="{d}" fill="none" stroke="#0b3b38" stroke-opacity=".55" stroke-width="2.6" stroke-linecap="round"/>'
        for d in ("M104,42 Q88,66 92,96", "M78,56 Q60,80 64,106", "M122,32 Q108,50 108,70")
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs>{DEFS}
<radialGradient id="coilG" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#b8fbec"/><stop offset=".6" stop-color="#5eead4"/><stop offset="1" stop-color="#14b8a6"/></radialGradient></defs>
  {BLINK_CSS}
  <ellipse cx="94" cy="178" rx="66" ry="7" fill="#7c3aed" fill-opacity=".28"/>
  <path d="M42,172 C32,148 50,114 84,114 C114,114 130,146 130,172 Q86,184 42,172 Z" fill="url(#holeG)"/>
  <path d="{dome}" fill="url(#shellG)" stroke="#0b3b38" stroke-width="3.4" stroke-linejoin="round"/>
  <path d="M52,70 Q74,40 108,38" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>
  {ribs}
  <path d="{arch}" fill="none" stroke="#7ff0dc" stroke-width="8" stroke-linecap="round"/>
  <circle cx="142" cy="96" r="46" fill="url(#coilG)" stroke="#0b3b38" stroke-width="3.4"/>
  <path d="{path_of(inner)}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/>
  <path d="{path_of(pts)}" fill="none" stroke="#0b3b38" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  {peek_eye(66, 150)}{peek_eye(100, 150)}
</svg>"""


def side(mood):
    """Style 2: kawaii side view, facing left. mood: calm | joy | bright."""
    brown = "#6b3f2a"
    ant = "#b9835a"
    extra = ""
    if mood == "joy":
        eyes = (
            f'<path d="M37,116 Q43,108 49,116" fill="none" stroke="{EYE_DARK}" stroke-width="3" stroke-linecap="round"/>'
            f'<path d="M59,116 Q65,108 71,116" fill="none" stroke="{EYE_DARK}" stroke-width="3" stroke-linecap="round"/>'
        )
        mouth = '<path d="M46,125 Q54,138 62,125 Z" fill="#9a3b2e" stroke="#6b3f2a" stroke-width="1.6" stroke-linejoin="round"/>'
        extra = (
            '<path d="M18,96 l3,-7 l3,7 l7,3 l-7,3 l-3,7 l-3,-7 l-7,-3z" fill="#fde68a"/>'
            '<path d="M92,64 l2,-5 l2,5 l5,2 l-5,2 l-2,5 l-2,-5 l-5,-2z" fill="#fde68a"/>'
        )
    elif mood == "bright":
        eyes = eye_open(44, 116, 6.2, white=True) + eye_open(65, 116, 6.2, white=True)
        mouth = f'<path d="M49,128 Q54,133 59,128" fill="none" stroke="{brown}" stroke-width="2.2" stroke-linecap="round"/>'
    else:
        eyes = eye_open(44, 117, 6.5, white=False) + eye_open(65, 117, 6.5, white=False)
        mouth = f'<path d="M49,127 Q54,133 59,127" fill="none" stroke="{brown}" stroke-width="2.2" stroke-linecap="round"/>'
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200"><defs>{DEFS}</defs>
  <ellipse cx="126" cy="174" rx="88" ry="8" fill="#000" fill-opacity=".28"/>
  <path d="M52,98 Q42,76 33,66" fill="none" stroke="{brown}" stroke-width="8" stroke-linecap="round"/>
  <path d="M52,98 Q42,76 33,66" fill="none" stroke="{ant}" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M68,96 Q72,72 82,60" fill="none" stroke="{brown}" stroke-width="8" stroke-linecap="round"/>
  <path d="M68,96 Q72,72 82,60" fill="none" stroke="{ant}" stroke-width="4.5" stroke-linecap="round"/>
  <circle cx="31" cy="63" r="6.5" fill="#8a5a3a" stroke="{brown}" stroke-width="2"/><circle cx="84" cy="57" r="6.5" fill="#8a5a3a" stroke="{brown}" stroke-width="2"/>
  <path d="M34,140 C22,108 42,90 66,94 C84,96 96,112 112,124 L196,142 C216,148 224,162 212,169 L58,169 C40,169 34,156 34,140 Z" fill="url(#bodyG)" stroke="{brown}" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="96" cy="150" r="3.4" fill="#e8c79a"/><circle cx="108" cy="157" r="2.4" fill="#e8c79a"/><circle cx="86" cy="158" r="2" fill="#e8c79a"/>
  {shell("clipB", 142, 104, 54, 54, 142, 104, 50, 7.5)}
  {eyes}
  <circle cx="35" cy="128" r="5.5" fill="#fb7185" fill-opacity=".7"/><circle cx="73" cy="128" r="5.5" fill="#fb7185" fill-opacity=".7"/>
  {mouth}{extra}
</svg>"""


def stalk_eye(cx, cy, r, look):
    """A big glossy eyeball: cream white, teal-blue iris, black pupil, two highlights."""
    ix, iy = cx + look[0], cy + look[1]
    return (
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#ballG)" stroke="#c9a98c" stroke-width="2"/>'
        f'<circle cx="{ix}" cy="{iy}" r="{r * 0.62:.1f}" fill="url(#irisG)"/>'
        f'<circle cx="{ix}" cy="{iy}" r="{r * 0.36:.1f}" fill="#0a0a14"/>'
        f'<ellipse cx="{ix - r * 0.2:.1f}" cy="{iy - r * 0.26:.1f}" rx="{r * 0.2:.1f}" ry="{r * 0.16:.1f}" fill="#fff" transform="rotate(-25 {ix - r * 0.2:.1f} {iy - r * 0.26:.1f})"/>'
        f'<circle cx="{ix + r * 0.22:.1f}" cy="{iy + r * 0.26:.1f}" r="{r * 0.07:.1f}" fill="#fff" fill-opacity=".85"/>'
    )


def friend_snail():
    """Style 2 test, after the user's reference 4: upright and cheerful, big open smile, two big eyes
    side by side on short stalks, shell on its back, a little heart bubble."""
    line = "#b86b3c"
    body = ("M22,172 C16,164 30,159 52,158 L112,156 C110,136 114,122 118,112 C106,96 116,68 139,66 "
            "C163,66 174,92 160,110 C166,126 166,146 166,160 L170,168 C172,176 166,178 160,178 L30,178 C26,178 23,176 22,172 Z")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs>{DEFS}
<radialGradient id="ballG" cx=".38" cy=".32" r=".9"><stop offset="0" stop-color="#fffdfa"/><stop offset=".7" stop-color="#f4ebe2"/><stop offset="1" stop-color="#d9c6b4"/></radialGradient>
<radialGradient id="irisG" cx=".4" cy=".35" r=".85"><stop offset="0" stop-color="#67e8f9"/><stop offset=".6" stop-color="#0e90a8"/><stop offset="1" stop-color="#0b5a73"/></radialGradient>
<linearGradient id="peachG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe6c4"/><stop offset="1" stop-color="#f6c997"/></linearGradient></defs>
  <ellipse cx="96" cy="182" rx="74" ry="6" fill="#000" fill-opacity=".28"/>
  <path d="M130,76 Q128,64 127,54" fill="none" stroke="{line}" stroke-width="12" stroke-linecap="round"/>
  <path d="M130,76 Q128,64 127,54" fill="none" stroke="#fbbf8a" stroke-width="7.5" stroke-linecap="round"/>
  <path d="M148,76 Q150,64 151,54" fill="none" stroke="{line}" stroke-width="12" stroke-linecap="round"/>
  <path d="M148,76 Q150,64 151,54" fill="none" stroke="#fbbf8a" stroke-width="7.5" stroke-linecap="round"/>
  {stalk_eye(126, 44, 16, (1, 2))}
  {stalk_eye(152, 44, 16, (-1, 2))}
  <path d="{body}" fill="url(#peachG)" stroke="{line}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M168,150 C170,160 168,168 166,172" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="3" stroke-linecap="round"/>
  {shell("clipF", 84, 128, 40, 40, 84, 128, 36, 6)}
  <circle cx="122" cy="100" r="5.5" fill="#fb7185" fill-opacity=".55"/><circle cx="158" cy="100" r="5.5" fill="#fb7185" fill-opacity=".55"/>
  <path d="M122,92 Q140,122 158,92 Z" fill="#a3302f" stroke="{line}" stroke-width="2.6" stroke-linejoin="round"/>
  <ellipse cx="140" cy="108" rx="9" ry="5.5" fill="#fb7185"/>
  <path d="M40,56 L58,74 L52,54 Z" fill="#0d1c24" stroke="#5eead4" stroke-width="2.4" stroke-linejoin="round"/>
  <ellipse cx="36" cy="44" rx="22" ry="17" fill="#0d1c24" stroke="#5eead4" stroke-width="2.4"/>
  <path d="M44,58 L54,66 L52,56 Z" fill="#0d1c24"/>
  <path d="M36,54 C26,46 24,36 31,33 C34,32 36,34 36,36 C36,34 38,32 41,33 C48,36 46,46 36,54 Z" fill="#fb7185"/>
</svg>"""


def badge(kind):
    if kind == "!":
        return ('<circle cx="0" cy="0" r="11" fill="#f59e0b" stroke="#0b0f14" stroke-width="2.5"/>'
                '<path d="M0,-6 V1.5" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'
                '<circle cx="0" cy="6" r="1.8" fill="#fff"/>')
    if kind == "ok":
        return ('<circle cx="0" cy="0" r="11" fill="#22c55e" stroke="#0b0f14" stroke-width="2.5"/>'
                '<path d="M-5,0.5 L-1.5,4.2 L5.5,-3.8" fill="none" stroke="#fff" stroke-width="3" '
                'stroke-linecap="round" stroke-linejoin="round"/>')
    if kind == "?":
        return ('<circle cx="0" cy="0" r="11" fill="#38bdf8" stroke="#0b0f14" stroke-width="2.5"/>'
                '<text x="0" y="1" font-size="13" font-weight="800" fill="#fff" text-anchor="middle" '
                'dominant-baseline="central" font-family="system-ui">?</text>')
    return ""


files = {"friend": friend_snail(), "peek": peek(), "side-calm": side("calm"), "side-joy": side("joy"), "side-bright": side("bright")}
for name, svg in files.items():
    (OUT / f"{name}.svg").write_text(svg, encoding="utf-8")


def inline(svg, size, w=None):
    return svg.replace('<svg xmlns="http://www.w3.org/2000/svg"', f'<svg width="{w or size}" height="{size}"', 1)


def button(size, badge_kind):
    s = inline(files["peek"], size - 8)
    b = (f'<svg class="bdg" width="26" height="26" viewBox="-13 -13 26 26">{badge(badge_kind)}</svg>'
         if badge_kind else "")
    return f'<div class="fab" style="width:{size}px;height:{size}px"><div class="fabin">{s}</div>{b}</div>'


STYLE = """
body{margin:0;background:#070b10;color:#d6e4e4;font:14px system-ui,sans-serif;padding:28px;max-width:1040px;margin:auto}
h1{font-size:20px;margin:0 0 4px}
h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#5eead4;margin:34px 0 10px}
p{color:#8aa3a3;margin:0 0 12px}
.row{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end}
.card{background:#0d141b;border:1px solid #1b2a33;border-radius:16px;padding:16px;text-align:center}
.card small{display:block;margin-top:6px;color:#7f9999;font-size:12px}
.fab{position:relative;border-radius:50%;background:radial-gradient(circle at 30% 25%,#13262b,#0a1216);border:1px solid #1f3b40;box-shadow:0 8px 26px rgba(20,184,166,.28);display:flex;align-items:center;justify-content:center}
.fabin{display:flex}
.bdg{position:absolute;right:-6px;top:-6px}
.chat{width:300px;background:#0d141b;border:1px solid #1b2a33;border-radius:18px;overflow:hidden;text-align:left}
.chat .hd{display:flex;gap:10px;align-items:center;padding:12px 14px;border-bottom:1px solid #1b2a33}
.chat .bd{padding:14px;color:#cfe3e3}
.tray{display:inline-flex;gap:14px;align-items:center;background:#1a232b;border-radius:10px;padding:8px 14px}
"""

page = f"""<!doctype html><html><head><meta charset="utf-8"><title>Phi snail sketches</title>
<style>{STYLE}</style></head><body>
<h1>Phi snail: sketches</h1>
<p>Golden-spiral shell (radius grows by 1.618 every quarter turn), Phi teal, no numbers on the shell. Style 1 = peeking, style 2 = kawaii side view with the happy traits.</p>

<h2>Style 1: hiding in the shell (floating button, tray). The eyes blink.</h2>
<div class="row"><div class="card">{inline(files["peek"], 240)}<small>240 px</small></div>
<div class="card">{inline(files["peek"], 120)}<small>120 px</small></div></div>

<h2>Style 2: kawaii side view (in the app)</h2>
<div class="row">
<div class="card">{inline(files["side-calm"], 200, 240)}<small>calm: dot eyes, blush, smile</small></div>
<div class="card">{inline(files["side-joy"], 200, 240)}<small>joy: closed-eye smile, sparkles</small></div>
<div class="card">{inline(files["side-bright"], 200, 240)}<small>bright: big shiny eyes</small></div></div>

<h2>Test: upright and cheerful (after reference 4)</h2>
<div class="row"><div class="card">{inline(files["friend"], 240, 240)}<small>big smile, eyes on short stalks, shell on its back, heart bubble</small></div>
<div class="card">{inline(files["friend"], 64, 64)}<small>64 px</small></div></div>

<h2>The floating button, with badges</h2>
<div class="row">
<div class="card">{button(76, "!")}<small style="margin-top:14px">approval</small></div>
<div class="card">{button(76, "ok")}<small style="margin-top:14px">task done</small></div>
<div class="card">{button(76, "?")}<small style="margin-top:14px">question</small></div>
<div class="card">{button(76, "")}<small style="margin-top:14px">idle (no badge)</small></div></div>

<h2>Small sizes (does the silhouette still read?)</h2>
<div class="row"><div class="card"><div class="tray">{inline(files["peek"], 16)}{inline(files["peek"], 24)}{inline(files["peek"], 32)}{inline(files["peek"], 48)}</div><small>16 / 24 / 32 / 48 px, tray and menu sizes</small></div></div>

<h2>In the chat bubble</h2>
<div class="chat"><div class="hd">{inline(files["side-calm"], 44, 53)}<div><b style="color:#eafffb">Phi</b><br><span style="color:#7f9999;font-size:12px">Ready to help</span></div></div>
<div class="bd">Good morning. 1 approval is waiting and 2 tasks are done.<br><br><span style="color:#7f9999">Haste is the enemy of perfection. Better 1% today than nothing.</span></div></div>
</body></html>"""
(OUT / "preview.html").write_text(page, encoding="utf-8")
print("ok", sorted(f.name for f in OUT.iterdir()))
