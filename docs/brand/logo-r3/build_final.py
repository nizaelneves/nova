"""C1 Refined brand with the wordmark's "be" in the C6 gradient. Run: python build_final.py"""
import os
from build_rounds import wm_parts, trail, tile, lockup_h, grad, NAVY, MINT, CYAN, WHITE, HERE

DEEP_CYAN, DEEP_MINT = "#0aa9bb", "#14d6a0"        # same pair as C6
_, ww0, _ = wm_parts(NAVY, NAVY, NAVY)
wm, ww, xb = wm_parts(NAVY, "url(#fbe)", NAVY, square_i=MINT)
tile_svg = tile("fti", "", NAVY, WHITE, grad_pair=(CYAN, MINT))                      # the C1 tile, unchanged
body, vb0 = lockup_h(tile_svg, grad("fbe", DEEP_CYAN, DEEP_MINT, ww0) + wm, ww, trail(xb, [MINT, MINT, CYAN, CYAN, CYAN]))
vb = "-20 -75 " + vb0.split()[2] + " 260"
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img"><title>Phibe</title>{body}</svg>'
out = os.path.join(HERE, "..", "phibe", "svg", "phibe-lockup-final.svg")
open(out, "w", encoding="utf-8").write(svg)
open(os.path.join(HERE, "final-preview.svg"), "w", encoding="utf-8").write(svg.replace("<title>", f'<rect x="-1000" y="-1000" width="3000" height="3000" fill="#f4f6fa"/><title>', 1))
print("ok", vb)
