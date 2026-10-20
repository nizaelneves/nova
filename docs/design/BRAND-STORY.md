# Phibe: brand story and avatar

Saved from the design discussion of 2026-10-03. Read together with [DESIGN.md](DESIGN.md) (motion and effects).

## The avatar: a snail with a golden-spiral shell

Chosen over the nautilus, butterfly and octopus. Reasons: friendly, cheap to draw and animate, reads at tray size (24 px), and its shell is the Fibonacci / golden-ratio symbol.

Style direction (from the user's references):
- **Style 1: "at home".** A round shell with only the eyes peeking out. This is the floating button and the tray icon (the compact, small-size silhouette).
- **Style 2: "out and about".** Kawaii side view with dot eyes, blush and little antennae. Used inside the app and in the chat bubble. Happy traits borrowed from the other two references: a smile, closed-eye joy, big eyes with a highlight, spots.
- Shell is the hero (about 60 % of the silhouette). Phibe's accent colour (teal) instead of garden brown. No numbers on the shell (decided 2026-10-03); the golden spiral alone carries the Fibonacci idea. Style 1 shows the shell hiding its owner, diagonal, with only two blinking eyes in the dark.
- Built in layers (shell, body, eyes, antennae, badge slot) as SVG, animated with transforms: cheap on CPU.
- The reference images are other people's art: use them as style direction only, never copy.

> **Update (2026-10-04):** Phibe will not have a single mascot. The snail is the first; other mascots/avatars will be designed after the voice work. Anything that shows the avatar (floating button, voice indicator, chat bubble) must take the avatar as a setting, not hard-code the snail.

## Storytelling (the snail's "metamorphosis")

1. **The shell grows, it is never replaced.** The snail adds one more turn to its spiral; it never throws the old home away. Evolving means adding, not erasing. The shell is Phibe's memory: each thing learned adds a turn, and turns grow in Fibonacci proportion. It can be literal: the user's shell grows with use ("constant evolution", visible).
2. **Carries its home on its back.** Your data lives with you: local first, privacy.
3. **Leaves a trail.** The trail is the history of what Phibe did; in our effects the trail is made of small Fibonacci numbers.
4. **Retreats into its shell.** The natural gesture for mute / private mode: only the eyes peek out, or it closes completely.
5. **Antennae are sensors.** They rise when Phibe is listening.

## The message (answer to "the snail is slow")

The snail's slowness becomes the point. People are tired and overwhelmed by how fast AI is moving and by the flood of information. Phibe's answer:

- **Haste is the enemy of perfection.**
- **Better 1 % today than nothing.** Just keep going.
- **Consume what matters, keep evolving.** Take only the essentials, and keep moving forward at your own pace.
- Fibonacci connection: small steps that build on the previous ones (each number is the sum of the last two), nothing starts from zero. A natural rule for information too: show 1 main thing first, then 2, then 3, then 5, never everything at once.

Tagline candidates (English UI): "Grows with you, one turn at a time." / "Better 1 % today than nothing." / "Just keep going."

Product idea to explore later: a **Fibonacci digest**, where the main item comes first and details open progressively (1, 2, 3, 5 ...), so Phibe never overwhelms.

## Badges over the avatar

A small badge at a corner, with priority: `!` approval pending (amber), `?` question, red dot error, `✓` task done, bell ping/reminder, pulsing ring listening. With several events, show the most important plus a count. Sounds come last and can be muted.

## Presence

Tray icon always; a draggable floating button (default visible, user can hide it to the tray) that opens a chat bubble with notifications and approvals; inside the app the avatar moves per page. The first version is an in-page floating button so it can be tested on localhost. Mobile is for much later; the focus is desktop.
