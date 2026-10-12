"""Phibe brand master files. Everything is drawn here with round-capped strokes and circles (no masks, no text).
Run: python build_brand.py   ->  svg/*.svg
Geometry (units): x-height 122, stroke 26, bowl centre-line radius 48, ascender/descender 52 / 65 beyond the x-height.
"""
import math, os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "svg")
os.makedirs(OUT, exist_ok=True)

NAVY, MINT, CYAN, TEAL, WHITE = "#14123f", "#20e7aa", "#10c3d3", "#0f9488", "#ffffff"


class Pen:
    """Letter geometry. Defaults are the master drawing; `small` is the 16/32 px cut (heavier, bigger dot, wider opening)."""

    def __init__(self, small=False):
        self.small = small
        self.R = 44 if small else 48          # centre-line radius of the bowls
        self.w = 34 if small else 26          # stroke
        self.bar = 24 if small else 18        # e crossbar
        self.dot = 17 if small else 11        # mint dot
        self.H = 2 * (self.R + self.w / 2)    # x-height (outer): 122
        self.gap = (-100, 0) if small else (-85, -5)   # b opening, degrees, clockwise from +x
        self.cy = self.H / 2

    def pol(self, cx, cy, r, deg):
        a = math.radians(deg)
        return cx + r * math.cos(a), cy + r * math.sin(a)

    def line(self, x, y0, y1, c):
        return f'<path d="M{x:.1f} {y0:.1f}V{y1:.1f}" fill="none" stroke="{c}" stroke-width="{self.w}" stroke-linecap="round"/>'

    def arc(self, cx, cy, a0, a1, c, w=None, ccw=False):
        p0, p1 = self.pol(cx, cy, self.R, a0), self.pol(cx, cy, self.R, a1)
        span = (a0 - a1) % 360 if ccw else (a1 - a0) % 360
        return (f'<path d="M{p0[0]:.1f} {p0[1]:.1f}A{self.R} {self.R} 0 {1 if span > 180 else 0} {0 if ccw else 1} {p1[0]:.1f} {p1[1]:.1f}" '
                f'fill="none" stroke="{c}" stroke-width="{w or self.w}" stroke-linecap="round"/>')

    def circle(self, cx, cy, c):
        return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{self.R}" fill="none" stroke="{c}" stroke-width="{self.w}"/>'

    # --- letters: x0 is the outer-left edge, baseline at y = H, x-height top at y = 0
    def p(self, x0, c):
        s = x0 + self.w / 2
        return self.line(s, self.w / 2, self.H + 65 - self.w / 2, c) + self.circle(s + self.R, self.cy, c), x0 + self.H

    def h(self, x0, c):
        s, r = x0 + self.w / 2, x0 + self.w / 2 + 2 * self.R
        arch = (f'<path d="M{s:.1f} {self.cy:.1f}A{self.R} {self.R} 0 0 1 {s + self.R:.1f} {self.cy - self.R:.1f}'
                f'A{self.R} {self.R} 0 0 1 {r:.1f} {self.cy:.1f}V{self.H - self.w / 2:.1f}" fill="none" stroke="{c}" stroke-width="{self.w}" stroke-linecap="round" stroke-linejoin="round"/>')
        return self.line(s, -52 + self.w / 2, self.H - self.w / 2, c) + arch, x0 + self.H

    def i(self, x0, c, dot=None):
        s = x0 + self.w / 2
        d = f'<circle cx="{s:.1f}" cy="{-self.w * 0.55:.1f}" r="{self.w * 0.56:.1f}" fill="{dot or c}"/>'
        return self.line(s, self.w * 1.5, self.H - self.w / 2, c) + d, x0 + self.w

    def b(self, x0, c, dot=None):
        """b with the opening (the bite). `dot`: put the mint dot in the opening (small cut)."""
        s = x0 + self.w / 2
        cx = s + self.R
        out = self.line(s, -52 + self.w / 2, self.H - self.w / 2, c) + self.arc(cx, self.cy, self.gap[1], self.gap[0] + 360, c)
        if dot:
            mid = (self.gap[0] + self.gap[1]) / 2
            px, py = self.pol(cx, self.cy, self.R + 4, mid)
            out += f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{self.dot}" fill="{dot}"/>'
        return out, x0 + self.H

    def e(self, x0, c, dot=None):
        """e: open ring (315 degrees) with a crossbar a little below centre; mint dot in the upper counter."""
        cx = x0 + self.w / 2 + self.R
        bar_y = self.cy + (4 if not self.small else 3)
        out = (self.arc(cx, self.cy, 0, 45, c, ccw=True)
               + f'<path d="M{cx - self.R:.1f} {bar_y:.1f}H{cx + self.R:.1f}" stroke="{c}" stroke-width="{self.bar}" stroke-linecap="round"/>')
        if dot:
            inner_top, bar_top = self.cy - self.R + self.w / 2, bar_y - self.bar / 2
            out += f'<circle cx="{cx:.1f}" cy="{(inner_top + bar_top) / 2:.1f}" r="{self.dot}" fill="{dot}"/>'
        return out, x0 + self.H


def svg(vb, body, title):
    x, y, w, h = vb
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" width="{w}" height="{h}" role="img">'
            f'<title>{title}</title>{body}</svg>')


def save(name, s):
    with open(os.path.join(OUT, name + ".svg"), "w", encoding="utf-8") as f:
        f.write(s)


def be(pen, ink, mint, x=0, small=False):
    """The monogram: b and e. Large cut: dot lives in the e. Small cut: dot lives in the b opening."""
    b, x1 = pen.b(x, ink, dot=mint if small else None)
    e, x2 = pen.e(x1 + 14, ink, dot=None if small else mint)
    return b + e, x2


def wordmark(pen, ink, mint, dot_ink=None):
    x, parts = 0, []
    for fn in (pen.p, pen.h, pen.i):
        s, x = fn(x, ink)
        parts.append(s); x += 18
    s, x = be(pen, ink, mint, x)
    parts.append(s)
    return "".join(parts), x


# ---------- symbol: the "be" monogram (master) ----------
L, S = Pen(), Pen(small=True)
body, w = be(L, NAVY, MINT)
pad = 18
save("phibe-symbol", svg((-pad, -52 - pad, w + 2 * pad, 52 + L.H + 65 + 2 * pad - 65), body, "Phibe symbol"))
body_s, ws = be(S, NAVY, MINT, small=True)
save("phibe-symbol-small", svg((-pad, -52 - pad, ws + 2 * pad, 52 + S.H + 2 * pad), body_s, "Phibe symbol, small-size cut"))

# ---------- wordmark ----------
wm, ww = wordmark(L, NAVY, MINT)
save("phibe-wordmark", svg((-pad, -52 - pad, ww + 2 * pad, 52 + L.H + 65 + 2 * pad), wm, "Phibe wordmark"))
wm_w, _ = wordmark(L, WHITE, MINT)
save("phibe-wordmark-reversed", svg((-pad, -52 - pad, ww + 2 * pad, 52 + L.H + 65 + 2 * pad), f'<rect x="{-pad}" y="{-52-pad}" width="{ww + 2*pad}" height="{52 + L.H + 65 + 2*pad}" fill="{NAVY}"/>' + wm_w, "Phibe wordmark, reversed"))


# ---------- tiles (app icon, favicon) ----------
def tile(body, bw, bh, ox=0, oy=0, scale=0.6, bg=NAVY, size=256, r=58):
    tx = size / 2 - (ox + bw / 2) * scale
    ty = size / 2 - (oy + bh / 2) * scale
    return (f'<rect x="8" y="8" width="{size-16}" height="{size-16}" rx="{r}" fill="{bg}"/>'
            f'<g transform="translate({tx:.1f} {ty:.1f}) scale({scale})">{body}</g>')


# be tile: the optical centre of the monogram is the middle of the x-height block, shifted for the ascender
be_w, _ = be(L, WHITE, MINT)
save("phibe-tile", svg((0, 0, 256, 256), tile(be_w, w, 174, 0, -52 + 4, 0.58), "Phibe app icon"))
# b tile (favicon, tray): small cut, only the b with the dot in its opening
pb, bx = S.b(0, WHITE, dot=MINT)
save("phibe-favicon", svg((0, 0, 256, 256), tile(pb, bx, 174, 0, -52 + 4, 1.0), "Phibe favicon"))
save("phibe-favicon-be", svg((0, 0, 256, 256), tile(*[be(S, WHITE, MINT, small=True)[0]], ws, 174, 0, -52 + 4, 0.8), "Phibe favicon with be"))

# ---------- lockups ----------
tile_body = tile(be_w, w, 174, 0, -52 + 4, 0.58)
save("phibe-lockup-horizontal", svg((0, 0, 256 + 40 + ww, 256), f'<g>{tile_body}</g><g transform="translate({256 + 40} {128 - (52 + L.H + 65) / 2 + 52})">{wm}</g>', "Phibe lockup"))
save("phibe-lockup-stacked", svg((0, 0, max(256, ww) + 40, 256 + 40 + 170),
                                 f'<g transform="translate({(max(256, ww) + 40 - 256) / 2} 0)">{tile_body}</g>'
                                 f'<g transform="translate({(max(256, ww) + 40 - ww) / 2} {256 + 40 + 52})">{wm}</g>', "Phibe lockup, stacked"))
print("ok", ww, w)

# ---------- reversed (for the dark app UI): white letters, mint dot ----------
rv, _ = be(L, WHITE, MINT)
save("phibe-symbol-reversed", svg((-pad, -52 - pad, w + 2 * pad, 52 + L.H + 65 + 2 * pad - 65), rv, "Phibe symbol, reversed"))
print("reversed ok")
