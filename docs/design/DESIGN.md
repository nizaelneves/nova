# Phi design: motion and effects

Base for every visual effect in Phi. Read this before adding or changing an effect, so they all feel like the same product.

## Concept: constant evolution

Phi is always becoming something new. Nothing in the interface simply switches on or off:

- **Leaving** a state, it **disintegrates**: the old shape breaks into small numbers that drift away like dust in the wind.
- **Arriving** at a state, it **re-integrates**: numbers gather and merge into the new shape.

The numbers are the **Fibonacci sequence** (1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89), the brand's mark. Small values are the most common, as in nature.

References that set the mood: black dust trailing off a word, a figure dissolving into pixels, a body made of dots, ASCII art. Always monochrome-looking, light, quick. Never heavy, never noisy.

## Rules

1. **Particles are numbers.** Only Fibonacci numbers, 8 to 11 px, semi-bold monospace. Never dots or squares.
2. **Wind goes to the right and a little up** (`DEFAULT_WIND`, angle -0.45 rad). Dust leaves in that direction; gathering numbers arrive from it.
3. **Disintegration fades out** (alpha `(1 - t)^1.5`) with drag, so the dust slows as it goes.
4. **Re-integration fades in fast, then melts** into the surface (alpha ramps in 25 % of the life and drops to 0 at the end, when the real shape is already there).
5. **Short.** An effect lasts 0.3 to 0.7 s in total, 1.5 s at the very most (the last dust may still be fading after the shape settled). Particle life: 0.4 to 1.1 s.
6. **Few.** Never more than ~160 particles alive. Emit about 70 per second while something moves.
7. **The real shape is never hidden or delayed by the particles.** They decorate a change that already happened; the UI is usable at once.
8. **Colour:** the accent colour (`--color-accent`), nothing else. White only for the bright head of a moving streak.
9. **Respect reduced motion** (`prefers-reduced-motion`): no particles, no travel, the shape just appears.
10. **Cost nothing at rest.** A `requestAnimationFrame` loop runs only while the effect is alive; no timers or listeners left behind.
11. **No random in the maths.** Use the seeded `makeRng`; effects stay testable.
12. **Pure logic apart from drawing.** Maths in `lib/` with tests; the component only paints.

## Code base

| File | What it is |
|---|---|
| `frontend/src/lib/fx/particles.ts` | The toolkit: `FIBONACCI`, `makeRng`, `pickFibonacci`, `disintegrate()`, `reintegrate()`, `stepAll()`, `alphaOf()`, `drawParticles()`, `DEFAULT_WIND` |
| `frontend/src/lib/fx/particles.test.ts` | Tests that protect the rules above |
| `frontend/src/lib/railSurge.ts` | First effect built on it: the menu marker (see below) |

### Recipe for a new effect

```ts
import { makeRng, disintegrate, reintegrate, stepAll, drawParticles, type Particle } from './fx/particles';

const rand = makeRng(seed);
const list: Particle[] = [];

// something goes away at (x, y):
for (let i = 0; i < 12; i++) list.push(disintegrate(rand, x, y + rand() * height));

// something arrives at (tx, ty), numbers gather from 46 px away, staggered:
for (let i = 0; i < 14; i++) list.push(reintegrate(rand, tx, ty + rand() * height, 46, rand() * 0.18));

// every frame:
stepAll(list, dt);               // moves and removes the dead ones
drawParticles(ctx, list, color); // the caller clears the canvas first
```

Keep the canvas inside the element that owns the effect, `pointer-events: none`, scaled by `devicePixelRatio` (cap 2). Stop the loop when `list` is empty and the motion is over.

## Effects built so far

### Menu marker (`railSurge.ts`, `.rail-surge`, `.rail-fx`)

The bar beside the active menu icon travels to the new item like a comet:

- **Head** glides at constant speed (0.32 to 0.625 s, longer for longer trips); the **tail** stays, then runs at twice the speed to catch up, so the bar stretches in the middle and shrinks back (triangle lag, peak 0.26 s).
- The old bar **disintegrates** at the start (burst of 12 numbers) and the tail sheds numbers along the way (about 70 per second).
- At 55 % of the trip, 14 numbers **gather** at the new item and merge into the bar.
- Bar: 2 px wide, 20 px long, accent colour with glow. A stretched bar fades towards its tail, with a white head.

Origin: the movement model is inspired by the "Electric Nav" animation; the maths and the particle idea are Phi's own.

### Floating button (`PhiBubble.tsx`, `phiBubble.ts`, `phiPresence.ts`, `PhiAvatar.tsx`)

First version of Phi's presence, built inside the page (localhost) so it can be tested; the desktop app will give the same component its own small window.

- Snail avatar (style 1) on a 64 px round button. Drag it anywhere; on release it snaps to the nearest side edge and remembers its height (`phi-bubble-placement`).
- After 5 s of quiet it tucks 55 % out of sight; hover or focus brings it back. It never tucks while something is waiting or its bubble is open.
- Badge (one at a time, with a total count): `!` approval, `?` question, red dot error, check done, bell reminder. Approvals come from `/v1/approvals/pending` (polled every 15 s, never while the tab is hidden). Anything else: `notifyPhi(kind, text)`. In dev, `__phi.notify('done', 'text')` in the console previews it.
- Click opens the chat bubble: approve or deny right there, dismiss notes, "Open chat", "Approvals", "Hide". Hiding is also a switch in Settings -> General -> Floating Phi.
- Cost: the eyes blink with a CSS animation, the button moves with `transform`, no timers except the 5 s tuck and the light poll.

## Ideas for the next effects (same language)

- Page change: the old title dissolves into numbers, the new one forms.
- Orb: when thinking, the face sheds a few numbers; when the answer starts, numbers gather into it.
- Deleting something: the item disintegrates instead of vanishing. Creating: it gathers in place.
- Streaming text: the last characters condense from numbers.
- Loading: numbers orbiting a point and merging into the result.
