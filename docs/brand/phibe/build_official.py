"""Official Phibe assets (C1 Refined brand): gradient tile icon, favicon, light and dark logos, web icons.
Run: python build_official.py
"""
import os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "logo-r3"))
from build_rounds import wm_parts, trail, tile, grad, Pen, NAVY, MINT, CYAN, WHITE  # noqa: E402

SVG = os.path.join(HERE, "svg")
DEEP_CYAN, DEEP_MINT = "#0aa9bb", "#14d6a0"
S = Pen(small=True)


def save(name, s):
    open(os.path.join(SVG, name + ".svg"), "w", encoding="utf-8").write(s)


def svg(vb, body, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img"><title>{title}</title>{body}</svg>'


# icon: gradient tile, navy be (the official logo mark)
save("phibe-icon", svg("0 0 256 256", tile("oi", "", NAVY, WHITE, size=256, grad_pair=(CYAN, MINT)), "Phibe icon"))
# favicon: the same tile with only the b (small-size cut) and its dot
b, bx = S.b(0, NAVY, dot=WHITE)
fav = (f'<defs><linearGradient id="of" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{CYAN}"/><stop offset="1" stop-color="{MINT}"/></linearGradient></defs>'
       f'<rect width="256" height="256" rx="61" fill="url(#of)"/><g transform="translate({128 - bx / 2:.1f} 89)">{b}</g>')
save("phibe-favicon", svg("0 0 256 256", fav, "Phibe favicon"))


# logos: tile + wordmark, light (navy phi) and dark (white phi); the be is the cyan to mint gradient in both
def logo(phi, dot, uid, title, grad_colors):
    _, ww0, _ = wm_parts(NAVY, NAVY, NAVY)
    wm, ww, xb = wm_parts(phi, f"url(#{uid})", dot, square_i=MINT)
    t = tile(uid + "t", "", NAVY, WHITE, grad_pair=(CYAN, MINT))
    s = 0.78
    body = (f'{t}<g transform="translate(190 {75 - 61 * s:.1f}) scale({s})">{grad(uid, grad_colors[0], grad_colors[1], ww0)}{wm}{trail(xb, [MINT, MINT, CYAN, CYAN, CYAN])}</g>')
    return svg(f"-20 -75 {190 + ww * s + 60:.0f} 260", body, title)


save("phibe-logo-light", logo(NAVY, NAVY, "gl", "Phibe logo", (DEEP_CYAN, DEEP_MINT)))
save("phibe-logo-dark", logo(WHITE, WHITE, "gd", "Phibe logo, for dark backgrounds", (CYAN, MINT)))
if os.path.exists(os.path.join(SVG, "phibe-lockup-final.svg")):
    os.remove(os.path.join(SVG, "phibe-lockup-final.svg"))
print("svg ok")
