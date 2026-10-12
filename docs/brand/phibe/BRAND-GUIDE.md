# Phibe: brand guide

Name: **Phibe**. Phi (φ, the golden ratio) + **be** (to be, *ser*): "be what you are becoming".
Chosen 2026-10-06. Replaces "Phi" (clashes with Microsoft's Phi models). Status: **name not yet cleared** (see Risks).

## Official logo (decided 2026-10-07): "C1 Refined brand"

Gradient tile (cyan to mint, navy **be**) + wordmark **phibe**: "phi" in navy on light or white on dark, **be** in a cyan to mint gradient, a mint square for the dot of the i and five squares (16, 11, 8, 5, 3) leaving the b. Slogan: **your personal ai assistant in constant become**.
Files: `svg/phibe-icon.svg` (app icon), `svg/phibe-favicon.svg` (b with its dot, 16 to 32 px), `svg/phibe-logo-light.svg`, `svg/phibe-logo-dark.svg`, web icons in `dist/web/`, `dist/app-icon-1024.png`. Regenerate with `build_official.py`.
Intro video keyframes and the Google Flow guide: `../intro/`. The earlier navy-tile files below are the first version of the kit.

---

## 1. Concept

- **One idea:** the dot that leaves the *b* and lands in the *e*. Things change shape and keep their identity (the app's "constant evolution": disintegrate into numbers, reintegrate).
- **Reads as:** "be". The b is open at the upper right (the bite); the e carries the mint dot like a pupil.
- **Proportions:** x-height 122, stroke 26 (about 0.21 of the x-height), bowl radius 48. Everything is a round-capped stroke or circle on that grid. The e crossbar is 18, the dot 11.
- **Why it works for the audience** (Brazilian marketers, solo entrepreneurs, traffic managers, copywriters, designers): short, friendly, easy to type, strong as a two-letter app icon, calm rather than "AI robot".
- **The Orb** (the mist face in the chat) stays the in-app mascot. The brand mark is the "be" monogram. They share navy and mint.

## 2. Files (`docs/brand/phibe/`)

| File | Use |
|---|---|
| `svg/phibe-symbol.svg` | Master symbol (navy + mint dot) on light backgrounds |
| `svg/phibe-symbol-reversed.svg` | White letters + mint dot on dark (the app UI) |
| `svg/phibe-symbol-small.svg` | Small-size cut (heavier, dot moved into the b opening). 16 to 32 px |
| `svg/phibe-wordmark.svg`, `-reversed.svg` | "phibe", with the *be* identical to the symbol |
| `svg/phibe-tile.svg` | App icon: white *be* on a navy rounded square |
| `svg/phibe-favicon.svg` | Favicon and tray: the *b* with its dot on the tile |
| `svg/phibe-lockup-horizontal.svg`, `-stacked.svg` | Tile + wordmark |
| `dist/mono/` | One-colour black, white and deep teal versions |
| `dist/web/` | `favicon.ico` (16/32/48), PNGs, apple-touch, 192 and 512 icons |
| `dist/app-icon-1024.png` | Source for the desktop icon set |
| `build_brand.py` | Regenerates every SVG from the grid |

The symbol is stroke-based (round caps) on purpose; keep it that way or expand strokes before sending to print.

## 3. Palette

| Role | Name | HEX | RGB | Use |
|---|---|---|---|---|
| Primary | Phibe Navy | `#14123f` | 20 18 63 | Logo, tile, dark UI base |
| Accent | Phibe Mint | `#20e7aa` | 32 231 170 | The dot, highlights, success |
| Secondary | Phibe Cyan | `#10c3d3` | 16 195 211 | Gradient start (cyan to mint), links on dark |
| Text on light | Deep Teal | `#0d7d73` | 13 125 115 | Brand-colour text and one-colour logo on white |
| Neutral | White | `#ffffff` | | Letters on navy |
| Warm accent | Peach | `#ffe3bd` | 255 227 189 | Sparingly (illustrations, empty states) |

Contrast (WCAG): navy on white 17.7, mint on navy 11.0, cyan on navy 8.2, deep teal on white 5.0 (passes AA for text), teal `#0f9488` on white only 3.7 (large text only), **mint on white 1.6 (never use mint for text or lines on white)**.

Gradient (the brand gradient): cyan `#10c3d3` to mint `#20e7aa`, 135 degrees. Only for backgrounds, borders and illustrations, never inside the logo.

## 4. Typography

The wordmark is drawn (no font). For product UI keep the existing UI font. Marketing pages: a geometric sans with round terminals (Sora, Outfit or Manrope; all free, check each licence before shipping).

## 5. Using the logo

- **Clear space:** half the x-height (61 units, about the height of the *e* counter) on every side.
- **Minimum sizes:** symbol 24 px high; wordmark 72 px wide; below 32 px use the **small cut**; 16 px uses the **favicon** (the b with its dot, never the full *be*).
- **Backgrounds:** navy symbol on white or light grey; **reversed** symbol on navy or any dark; one-colour black or white on photos and patterns. Never navy on dark or mint on white.
- **Wordmark and symbol together:** use the lockup (tile + wordmark). Do not stack the bare symbol over the wordmark (the *be* would appear twice).
- **Name in text:** "Phibe", capital P, lowercase rest. Never "PHIBE", "PhiBe", "Phi-be", "PhibeOS". Say it as **Fi-bi** (pt-BR) / **FAI-bee** (US), and write the pun as "Phi, be." only in English taglines.
- **Do not:** change the stroke weight, move the dot out of the e (except in the small cut), close the b opening, add shadows, outlines or gradients, rotate or mirror (mirrored it reads "ed"), recolour the dot, stretch.

## 6. Motion (when we animate)

The brand verb is **disintegrate and reintegrate**: the mint dot leaves the b, trails away as shrinking dots (sizes 13, 8, 5, 3, 2, the Fibonacci sequence) and lands in the e. Use it for loading, sync and the voice "sending" state. Keep it under 1.2 s and respect reduced motion (fade the dot instead).

## 7. Voice (pt-BR first)

Direct, calm, light humour, no hype, never "revolucionário". Candidates: "Seu assistente em constante evolução.", "Sem pressa. Com resultado.", "Menos aba aberta, mais ideia.", "Phi, be." (EN).

## 8. Risks and open items

1. **Trademark not searched.** Phibe was not cleared (INPI classes 9, 42, 35, 41; WIPO; USPTO; EUIPO), nor domains and handles. See `../NAME-AND-LOGO-PLAN.md` section 2 and have a trademark attorney read the results. Sound-alikes to check: Phoebe, Phibes, Fibi, Phibi.
2. **Pronunciation.** Brazilians read "Fi-bi". Americans may read "FAIB" (like tribe) or "FEE-bee" (like Phoebe). The pun only works on the written *be*. Run the 8-person reading test.
3. **Unsigned installers** trigger Windows Defender and SmartScreen warnings; a new app identifier restarts SmartScreen reputation.
4. The *be* monogram is dense below 24 px. Always use the small cut or the favicon there.
