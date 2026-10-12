"""Phi's owl (floating-button avatar), sketch for approval.
Run: python build_owl.py -> owl.svg  (a sheet: the owl, a blink, and the button as it would look)

Style direction from the user's references (a red owl with big glossy eyes and a spotted belly, a
violet-blue owl with golden glasses). The drawing is our own, in Phi's palette: violet-blue body, cream face,
orange-ringed eyes, tiny golden glasses, ink outline like the snail."""
import pathlib

HERE = pathlib.Path(__file__).parent
INK = "#14123f"

DEFS = f"""
<linearGradient id="bodyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8bf2de"/><stop offset=".5" stop-color="#2dd4bf"/><stop offset="1" stop-color="#0f9488"/></linearGradient>
<linearGradient id="wingG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#20c4b0"/><stop offset="1" stop-color="#0b6f66"/></linearGradient>
<linearGradient id="faceG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e3fbf5"/></linearGradient>
<linearGradient id="bellyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9cc"/><stop offset="1" stop-color="#f6c38f"/></linearGradient>
<radialGradient id="eyeG" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#2c2a78"/><stop offset="1" stop-color="#0d0b2e"/></radialGradient>
<radialGradient id="fabG" cx=".3" cy=".25" r="1"><stop offset="0" stop-color="#13262b"/><stop offset="1" stop-color="#0a1216"/></radialGradient>
"""


def eye(cx, cy, closed=False):
    if closed:
        return (f'<path d="M{cx-17},{cy+2} Q{cx},{cy+16} {cx+17},{cy+2}" fill="none" stroke="{INK}" stroke-width="4.5" stroke-linecap="round"/>')
    return (f'<circle cx="{cx}" cy="{cy}" r="21" fill="#20e7aa" stroke="{INK}" stroke-width="3"/>'
            f'<circle cx="{cx}" cy="{cy}" r="16.5" fill="url(#eyeG)"/>'
            f'<circle cx="{cx-5.5}" cy="{cy-6.5}" r="5.6" fill="#fff"/>'
            f'<circle cx="{cx+6.5}" cy="{cy+6}" r="2.4" fill="#fff" fill-opacity=".9"/>'
            f'<circle cx="{cx+2}" cy="{cy+9}" r="5" fill="#6078eb" fill-opacity=".55"/>')


def owl(closed=False):
    spots = "".join(f'<ellipse cx="{x}" cy="{y}" rx="3.1" ry="4.6" transform="rotate({r} {x} {y})" fill="#be7846" fill-opacity=".5"/>'
                    for x, y, r in ((86, 146, -20), (106, 152, 18), (97, 131, 6), (118, 139, 24), (78, 128, -26)))
    return f"""
<ellipse cx="100" cy="184" rx="52" ry="6" fill="#20e7aa" fill-opacity=".22"/>
<!-- feet -->
<g fill="#f6bd8a" stroke="{INK}" stroke-width="3" stroke-linejoin="round">
  <path d="M64,178 Q64,170 76,170 Q92,170 92,178 Q92,184 64,184 Z"/><path d="M108,178 Q108,170 124,170 Q136,170 136,178 Q136,184 108,184 Z"/>
</g>
<g stroke="{INK}" stroke-width="2.6" stroke-linecap="round"><path d="M70,184 v3 M78,184 v3 M86,184 v3 M114,184 v3 M122,184 v3 M130,184 v3"/></g>
<!-- wings, behind the body -->
<path d="M46,96 C26,112 24,148 40,166 C46,172 54,170 56,160 C60,140 58,118 56,100 Z" fill="url(#wingG)" stroke="{INK}" stroke-width="3.2" stroke-linejoin="round"/>
<path d="M154,96 C174,112 176,148 160,166 C154,172 146,170 144,160 C140,140 142,118 144,100 Z" fill="url(#wingG)" stroke="{INK}" stroke-width="3.2" stroke-linejoin="round"/>
<g fill="none" stroke="#0b3b38" stroke-opacity=".55" stroke-width="2.2" stroke-linecap="round"><path d="M36,132 Q44,138 50,152 M33,118 Q42,124 48,136"/><path d="M164,132 Q156,138 150,152 M167,118 Q158,124 152,136"/></g>
<!-- body and head in one -->
<path d="M100,20 C150,20 172,58 170,100 C168,150 142,178 100,178 C58,178 32,150 30,100 C28,58 50,20 100,20 Z" fill="url(#bodyG)" stroke="{INK}" stroke-width="3.6" stroke-linejoin="round"/>
<!-- ear tufts -->
<path d="M52,34 L44,12 L72,26 Z" fill="#2dd4bf" stroke="{INK}" stroke-width="3.2" stroke-linejoin="round"/>
<path d="M148,34 L156,12 L128,26 Z" fill="#2dd4bf" stroke="{INK}" stroke-width="3.2" stroke-linejoin="round"/>
<!-- belly with feather scallops -->
<path d="M62,116 Q72,106 84,112 Q100,102 116,112 Q128,106 138,116 C146,134 138,164 100,170 C62,164 54,134 62,116 Z" fill="url(#bellyG)"/>
<g fill="none" stroke="#e8a064" stroke-width="2.2" stroke-linecap="round"><path d="M72,124 Q80,132 88,124"/><path d="M92,128 Q100,136 108,128"/><path d="M112,124 Q120,132 128,124"/></g>
{spots}
<!-- face mask: two discs joined -->
<g fill="url(#faceG)"><circle cx="72" cy="78" r="33"/><circle cx="128" cy="78" r="33"/><ellipse cx="100" cy="84" rx="38" ry="28"/></g>
<!-- eyes -->
{eye(72, 78, closed)}{eye(128, 78, closed)}
<!-- golden glasses -->
<g fill="none" stroke="#0b6f66" stroke-width="2.6"><circle cx="72" cy="78" r="26"/><circle cx="128" cy="78" r="26"/><path d="M96,74 Q100,70 104,74" stroke-linecap="round"/></g>
<g fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"><path d="M56,64 Q62,57 70,54"/><path d="M112,64 Q118,57 126,54"/></g>
<!-- beak -->
<path d="M92,92 Q100,87 108,92 Q104,104 100,108 Q96,104 92,92 Z" fill="#7a5230" stroke="{INK}" stroke-width="2.8" stroke-linejoin="round"/>
<path d="M95,95 Q100,93 105,95" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="2" stroke-linecap="round"/>
"""


def text(x, y, s, size=13, fill="#d6e4e4", weight=500, anchor="start"):
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" font-family="system-ui,Segoe UI,sans-serif">{s}</text>'


W, H = 1100, 560
parts = [
    text(40, 50, "Phi owl: floating-button avatar (sketch for approval)", 18, "#2dd4bf", 700),
    text(40, 72, "Phi brand colours: teal body, white face, peach belly and feet, mint-ringed eyes, tiny teal glasses. Same ink outline as the snail. Nothing is wired into the app yet.", 12.5, "#7f9999"),
    # big owl
    f'<g transform="translate(40,96) scale(2.1)">{owl()}</g>',
    text(230, 530, "Idle", 13, "#7f9999", 600, "middle"),
    # blink
    f'<g transform="translate(470,176) scale(1)">{owl(True)}</g>',
    text(570, 400, "Blink / asleep (tucked at the edge)", 13, "#7f9999", 600, "middle"),
    # buttons
    f'<g transform="translate(760,110)"><circle cx="64" cy="64" r="64" fill="url(#fabG)" stroke="#1f3b40"/>'
    f'<g transform="translate(10,12) scale(.54)">{owl()}</g></g>',
    text(824, 270, "Floating button, large", 13, "#7f9999", 600, "middle"),
    f'<g transform="translate(790,310)"><circle cx="32" cy="32" r="32" fill="url(#fabG)" stroke="#1f3b40"/>'
    f'<g transform="translate(5,6) scale(.27)">{owl()}</g></g>',
    f'<circle cx="1000" cy="342" r="32" fill="url(#fabG)" stroke="#1f3b40"/>'
    f'<g transform="translate(973,314) scale(.27)">{owl(True)}</g>',
    text(822, 400, "At real size (64 px)", 13, "#7f9999", 600, "middle"),
    text(1002, 400, "Tucked", 13, "#7f9999", 600, "middle"),
]
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
       f'<defs>{DEFS}</defs><rect width="{W}" height="{H}" rx="20" fill="#070b10"/>{"".join(parts)}</svg>')
(HERE / "owl.svg").write_text(svg, encoding="utf-8")
print("owl.svg written")
