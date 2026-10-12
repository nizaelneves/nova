"""Phi, the mist: direction C, now with a flame aura like the user's Pinterest reference (take seven).
Run: python build_mist.py -> mist.svg  (a sheet: idle, blink, and the button as it would look)

The first sketch looked like a drawn figure with stickers on it. Here the body is real smoke: a hooded
shape whose edges are torn by turbulence, wisps streaming away in the wind, translucent layers, mint light
inside the swirls and a pool of mist at the bottom. 2D, in the brand cyan-to-green, friendly rather than
spooky. Nothing is wired into the app yet."""
import pathlib

HERE = pathlib.Path(__file__).parent

DEFS = """
<radialGradient id="body" cx=".5" cy=".22" r=".95"><stop offset="0" stop-color="#2aa6b0"/><stop offset=".45" stop-color="#0f6470"/><stop offset="1" stop-color="#062a33"/></radialGradient>
<radialGradient id="bodyIn" cx=".5" cy=".2" r=".8"><stop offset="0" stop-color="#5fd6df" stop-opacity=".55"/><stop offset="1" stop-color="#0f6470" stop-opacity="0"/></radialGradient>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".62" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<mask id="fadeMask"><rect x="0" y="0" width="200" height="200" fill="url(#fade)"/></mask>
<linearGradient id="flameBack" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#0a4f66" stop-opacity=".95"/><stop offset=".5" stop-color="#10a8a8" stop-opacity=".7"/><stop offset="1" stop-color="#20e7aa" stop-opacity="0"/></linearGradient>
<linearGradient id="flameFront" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#0f8f9c" stop-opacity=".95"/><stop offset=".45" stop-color="#19cf9d" stop-opacity=".85"/><stop offset=".8" stop-color="#9ff5e6" stop-opacity=".55"/><stop offset="1" stop-color="#d9fffb" stop-opacity="0"/></linearGradient>
<radialGradient id="core" cx=".5" cy=".3" r=".9"><stop offset="0" stop-color="#143f4a"/><stop offset="1" stop-color="#04101a"/></radialGradient>
<radialGradient id="eyeG" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#bff8f3"/><stop offset="1" stop-color="#20e7aa"/></radialGradient>
<radialGradient id="fabG" cx=".3" cy=".25" r="1"><stop offset="0" stop-color="#13262b"/><stop offset="1" stop-color="#0a1216"/></radialGradient>
<filter id="smoke" x="-40%" y="-35%" width="180%" height="200%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.034 0.012" numOctaves="3" seed="7" result="t1"/>
  <feOffset in="t1" dx="0" dy="0" result="n1"><animate attributeName="dy" dur="2.2s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.4;1" keySplines=".2 .6 .4 1;.4 0 .6 1" values="0;-46;0"/></feOffset>
  <feTurbulence type="fractalNoise" baseFrequency="0.05 0.02" numOctaves="2" seed="21" result="t2"/>
  <feOffset in="t2" dx="0" dy="0" result="n2"><animate attributeName="dy" dur="1.5s" begin="-0.6s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.4;1" keySplines=".2 .6 .4 1;.4 0 .6 1" values="0;-32;0"/></feOffset>
  <feComposite in="n1" in2="n2" operator="arithmetic" k1="0" k2=".55" k3=".45" k4="0" result="noise"/>
  <feDisplacementMap in="SourceGraphic" in2="noise" scale="46" xChannelSelector="R" yChannelSelector="G"><animate attributeName="scale" dur="1.3s" repeatCount="indefinite" values="34;54;38;50;34"/></feDisplacementMap>
  <feGaussianBlur stdDeviation="0.8"/>
</filter>
<filter id="mist" x="-40%" y="-35%" width="180%" height="200%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.022 0.01" numOctaves="3" seed="7" result="t1"/>
  <feOffset in="t1" dx="0" dy="0" result="n1"><animate attributeName="dy" dur="4.6s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.4;1" keySplines=".2 .6 .4 1;.4 0 .6 1" values="0;-46;0"/></feOffset>
  <feTurbulence type="fractalNoise" baseFrequency="0.032 0.014" numOctaves="2" seed="21" result="t2"/>
  <feOffset in="t2" dx="0" dy="0" result="n2"><animate attributeName="dy" dur="3.3s" begin="-1.4s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.4;1" keySplines=".2 .6 .4 1;.4 0 .6 1" values="0;-32;0"/></feOffset>
  <feComposite in="n1" in2="n2" operator="arithmetic" k1="0" k2=".55" k3=".45" k4="0" result="noise"/>
  <feDisplacementMap in="SourceGraphic" in2="noise" scale="46" xChannelSelector="R" yChannelSelector="G"><animate attributeName="scale" dur="3.6s" repeatCount="indefinite" values="30;44;34;42;30"/></feDisplacementMap>
  <feGaussianBlur stdDeviation="2.4"/>
</filter>
<filter id="smokeSoft" x="-40%" y="-35%" width="180%" height="200%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.034 0.012" numOctaves="3" seed="7" result="t1"/>
  <feOffset in="t1" dx="0" dy="0" result="n1"><animate attributeName="dy" dur="2.2s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.4;1" keySplines=".2 .6 .4 1;.4 0 .6 1" values="0;-46;0"/></feOffset>
  <feTurbulence type="fractalNoise" baseFrequency="0.05 0.02" numOctaves="2" seed="21" result="t2"/>
  <feOffset in="t2" dx="0" dy="0" result="n2"><animate attributeName="dy" dur="1.5s" begin="-0.6s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.4;1" keySplines=".2 .6 .4 1;.4 0 .6 1" values="0;-32;0"/></feOffset>
  <feComposite in="n1" in2="n2" operator="arithmetic" k1="0" k2=".55" k3=".45" k4="0" result="noise"/>
  <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G"><animate attributeName="scale" dur="1.3s" repeatCount="indefinite" values="1;3.5;1.5;3;1"/></feDisplacementMap>
  <feGaussianBlur stdDeviation="0.8"/>
</filter>
<filter id="puff" x="-40%" y="-60%" width="180%" height="220%">
  <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="11" result="n"><animate attributeName="baseFrequency" dur="7s" repeatCount="indefinite" values="0.04;0.05;0.035;0.04"/></feTurbulence>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="18" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="5"/>
</filter>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2"/></filter>
"""

def eye(cx, cy, closed):
    if closed:
        return f'<path d="M{cx - 6},{cy} Q{cx},{cy + 6} {cx + 6},{cy}" fill="none" stroke="#bff8f3" stroke-width="3.4" stroke-linecap="round"/>'
    return (f'<ellipse cx="{cx}" cy="{cy}" rx="9" ry="12" fill="#20e7aa" fill-opacity=".5" filter="url(#glow)"/>'
            f'<ellipse cx="{cx}" cy="{cy}" rx="6.4" ry="9.4" fill="url(#eyeG)"/>'
            f'<ellipse cx="{cx - 1.6}" cy="{cy - 3}" rx="1.8" ry="2.6" fill="#fff" fill-opacity=".9"/>')


def tongue(bx, by, tx, ty, w, sway):
    h = by - ty
    return (f"M{bx - w},{by} C{bx - w - 18 + sway},{by - h * 0.35} {tx - 16 + sway * 1.5},{ty + h * 0.40} {tx + sway * 2},{ty} "
            f"C{tx + 12 + sway},{ty + h * 0.42} {bx + w + 14 - sway},{by - h * 0.30} {bx + w},{by} Z")


# base x, base y, tip x, tip y, half width, layer (back/front), seconds
TONGUES = ((100, 138, 98, 14, 12, "flameFront", 2.6), (86, 138, 62, 34, 11, "flameBack", 2.2), (114, 138, 140, 30, 11, "flameBack", 2.9),
           (76, 140, 42, 80, 10, "flameBack", 3.1), (124, 140, 160, 76, 10, "flameBack", 2.4), (92, 138, 74, 56, 9, "flameFront", 1.9),
           (108, 138, 128, 52, 9, "flameFront", 2.1))


def flames():
    out = []
    for i, (bx, by, tx, ty, w, grad, dur) in enumerate(TONGUES):
        d1, d2 = tongue(bx, by, tx, ty, w, 7), tongue(bx, by, tx, ty, w, -7)
        out.append(f'<path d="{d1}" fill="url(#{grad})"><animate attributeName="d" dur="{dur}s" begin="-{i * 0.4:.1f}s" repeatCount="indefinite" '
                   f'calcMode="spline" keyTimes="0;.5;1" keySplines=".4 0 .6 1;.4 0 .6 1" values="{d1};{d2};{d1}"/>'
                   f'<animate attributeName="opacity" dur="{dur * 0.7:.1f}s" repeatCount="indefinite" values="1;.72;1"/></path>')
    return "".join(out)


def mist(closed=False):
    return f"""<g transform="translate(100,100) scale(1.02) translate(-100,-100)">
<!-- only the face: a dark round head whose contour is torn by the moving mist -->
<g filter="url(#mist)">
  <circle cx="100" cy="100" r="78" fill="#10c3d3" fill-opacity=".10"/>
  <circle cx="100" cy="100" r="64" fill="#10c3d3" fill-opacity=".12"/>
  <circle cx="100" cy="100" r="55" fill="none" stroke="#20e7aa" stroke-opacity=".12" stroke-width="12"/>
</g>
<!-- the face itself: its contour moves, but much less than the mist around it -->
<g filter="url(#smokeSoft)">
  <circle cx="100" cy="100" r="46" fill="url(#core)"/>
  <circle cx="100" cy="100" r="46" fill="none" stroke="#20e7aa" stroke-opacity=".45" stroke-width="2.4"/>
</g>
{eye(82, 98, closed)}{eye(118, 98, closed)}
</g>"""


def text(x, y, s, size=13, fill="#d6e4e4", weight=500, anchor="start"):
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" font-family="system-ui,Segoe UI,sans-serif">{s}</text>'


W, H = 1100, 560
parts = [
    text(40, 50, "Phi, the mist (C), take fourteen: softer mist (sketch for approval)", 18, "#2dd4bf", 700),
    text(40, 72, "Strong mist around, a very calm face contour, softer slower mist. Not wired into the app yet.", 12.5, "#7f9999"),
    f'<g transform="translate(65,121) scale(1.85)">{mist()}</g>',
    text(230, 530, "Idle", 13, "#7f9999", 600, "middle"),
    f'<g transform="translate(476,188) scale(.88)">{mist(True)}</g>',
    text(570, 400, "Blink / asleep (tucked at the edge)", 13, "#7f9999", 600, "middle"),
    f'<g transform="translate(760,110)"><circle cx="64" cy="64" r="64" fill="url(#fabG)" stroke="#1f3b40"/><g transform="translate(12,14) scale(.52)">{mist()}</g></g>',
    text(824, 270, "Floating button, large", 13, "#7f9999", 600, "middle"),
    f'<g transform="translate(790,310)"><circle cx="32" cy="32" r="32" fill="url(#fabG)" stroke="#1f3b40"/><g transform="translate(6,7) scale(.26)">{mist()}</g></g>',
    f'<circle cx="1000" cy="342" r="32" fill="url(#fabG)" stroke="#1f3b40"/><g transform="translate(974,319) scale(.26)">{mist(True)}</g>',
    text(822, 400, "At real size (64 px)", 13, "#7f9999", 600, "middle"),
    text(1002, 400, "Tucked", 13, "#7f9999", 600, "middle"),
]
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
       f'<defs>{DEFS}</defs><rect width="{W}" height="{H}" rx="20" fill="#070b10"/>{"".join(parts)}</svg>')
(HERE / "mist.svg").write_text(svg, encoding="utf-8")
print("mist.svg written")
