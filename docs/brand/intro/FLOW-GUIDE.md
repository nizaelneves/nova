# Phibe intro video: guide for Google Flow

Sequence: **phibe** (wordmark) dissolves into Fibonacci numbers, which gather into the **Orb** (the official emoji), which dissolves again into numbers that form the full **logo** (tile + phibe), then the slogan appears under it.

I could not open Flow from here, so menu names below are from what I know of it (it runs Google's Veo video model). Names move around between versions: if a setting is called something slightly different on your screen, pick the closest one.

## 1. What you have

| Folder | Use |
|---|---|
| `frames/` | 10 keyframes, **16:9, 1920x1080** (PNG and SVG) |
| `frames-9x16/` | the same 10 keyframes re-laid out for **9:16, 1080x1920** (logo stacked, slogan on two lines) |
| `contact-sheet.png`, `contact-sheet-9x16.png` | the whole sequence at a glance |

Frames: 01 phibe, 02 dissolving, 03 numbers in flight, 04 numbers gathering, 05 Orb, 06 Orb dissolving, 07 numbers in flight, 08 numbers forming the logo, 09 logo, 10 logo + slogan.

## 2. Aspect ratios: make two separate videos

- **16:9** is the master: website, YouTube, the app's welcome screen, presentations. Use `frames/`.
- **9:16** is for Reels, TikTok, Shorts and stories. Use `frames-9x16/`.
- Generate each ratio on its own, with its own frames. Never crop a 16:9 video to 9:16: the wordmark would be cut off. In Flow, set the aspect ratio **before** you add the frames, and use frames in the same ratio as the project (a frame in the wrong ratio gets cropped or padded).

## 3. Settings in Flow

| Setting | Value | Why |
|---|---|---|
| Mode | **Frames to Video** (first frame + last frame) | You control the start and the end, the model only fills the middle |
| Aspect ratio | 16:9 for the master, 9:16 for the vertical cut | see above |
| Model | The highest quality Veo option for the final; the "Fast" one for tests | Fast is cheaper per try. Check the credit cost before running (no paid generation without your OK) |
| Outputs per prompt | 2 to 4 while testing | A morph rarely comes out right on the first try |
| Clip length | The longest available (about 8 s), trim later | You cut it to 4 to 6 s in the editor |
| Resolution | Highest available (1080p) | Upscale only the final cut |
| Audio | Off for the morph clips, add sound afterwards | Veo may add random music or voices; see section 7 |
| Camera | Locked-off, no movement | A static camera keeps the logo centred |

## 4. Colours to keep (say them in the prompt and check them in the result)

| Role | HEX |
|---|---|
| Background | deep navy-black `#060511`, with a very soft lighter centre `#0d0b2a` |
| Letters "phi", digits | white `#ffffff` |
| Mint (accent, the dot, squares) | `#20e7aa` |
| Cyan | `#10c3d3` |
| Tile icon text | navy `#14123f` |
| Orb | dark teal body `#143f4a` to `#04101a`, mint ring, glowing eyes `#bff8f3` |

Gradient on the "be": cyan to mint, left to right. No other colours, no red, no purple, no gold.

## 5. Plan: four short clips (recommended) or two long ones

A text logo is the hardest thing for a video model to keep intact. Four clips with frames at every step keep the letters under control.

| Clip | First frame | Last frame | Idea |
|---|---|---|---|
| 1 | 01-phibe | 03-numbers-in-flight | the word breaks into numbers, from right to left |
| 2 | 03-numbers-in-flight | 05-orb | the numbers gather and settle into the Orb |
| 3 | 05-orb | 07-numbers-in-flight | the Orb breaks into numbers, drifting up and to the right |
| 4 | 07-numbers-in-flight | 09-logo | the numbers form the tile and the wordmark |

The slogan (frame 10) is added in the editor, see section 6.

Two-clip option (faster, less control): clip A = 01 to 05, clip B = 05 to 10.

## 6. Prompts (English works best with Veo)

Paste the **global part** at the start of every prompt, then the clip part.

**Global part**
> Minimal motion-graphics logo animation on a deep navy-black background (#060511) with a very soft lighter glow in the center. Locked-off camera, no camera movement, no zoom. Flat vector look, clean and precise. Palette only: white, cyan (#10c3d3), mint green (#20e7aa), dark navy. Particles are tiny thin white and mint digits (the numbers 1, 1, 2, 3, 5, 8) and tiny squares. No extra text, no watermark, no people, no objects, no glow flares, no lens effects.

**Clip 1 (01 to 03)**
> The lowercase word "phibe" stays sharp for a moment, then dissolves into thousands of tiny floating digits and small squares, starting from the letters on the right ("be") and sweeping to the left, drifting up and to the right like dust. By the end the word is a cloud of drifting numbers. Smooth, elegant, 5 seconds.

**Clip 2 (03 to 05)**
> The cloud of tiny digits slowly gathers toward the center and condenses into a small round glowing orb: a dark teal sphere with a soft mist halo and two small glowing eyes. The motion decelerates and the orb settles, calm, still. 4 seconds.

**Clip 3 (05 to 07)**
> The glowing orb with two eyes breaks apart into tiny digits and squares that drift up and to the right, spreading out into a loose cloud. Smooth, 3 seconds.

**Clip 4 (07 to 09)**
> The drifting digits and squares converge and assemble, left to right, into a rounded-square app icon with a cyan-to-mint gradient (the letters "be" in navy inside it) and, next to it, the white lowercase wordmark "phibe" with the last two letters in cyan-to-mint gradient and a few small mint squares rising from the letter b. The final image is perfectly sharp and still. 4 seconds.

**Vertical (9:16)**: use the same prompts, replace the last sentence of clip 4 with: "The icon sits above the wordmark, both centered."

**Negative prompt** (if Flow has the field; otherwise add "Avoid:" to the end)
> blurry letters, misspelled letters, extra letters, distorted logo, extra text, watermark, subtitles, camera shake, fast flashing, color shift, gold, red, purple, 3D render, lens flare, people.

## 7. Slogan, sound, and the final cut

1. **Slogan in the editor, not in Flow.** Video models bend small text. End clip 4 at frame 09 and add the slogan as a text layer in CapCut or DaVinci Resolve (free): `your personal ai assistant in constant become`
   - font Segoe UI Light or Inter Light, size about 4 % of the frame height, letter spacing about 0.12 em
   - colour `#b9bfe0`, the word **become** in `#20e7aa` (a little bolder)
   - fade in over 0.6 s, 0.4 s after the logo is still; position below the logo (16:9: about 14 % of the height under it; 9:16: two lines, "your personal ai assistant" / "in constant become")
   - If Flow gives you an exact result with frame 10 as the last frame, you can use that instead.
2. **Clean frames on top.** If the letters of the final logo come out slightly off, put the exact frame (`09-logo.png`) over the last second with a 0.3 s cross-fade. Same for `01-phibe.png` at the start and `05-orb.png` at the Orb.
3. **Joining the clips:** put the four clips on one timeline, no transition between them (each ends on the first frame of the next).
4. **Sound (optional):** a soft digital shimmer while the numbers move, a low glass chime when the logo lands. Generate it separately or use a free sound library; turn Flow's audio off so it doesn't add music.
5. **Length:** about 15 to 17 s in total; for Reels and Shorts, speed clips 1 and 3 up to keep it under 10 s.

## 8. If a clip goes wrong

| Problem | Fix |
|---|---|
| The word is misspelled mid-way | Fine if it recovers by the last frame; otherwise shorten the clip, or start the clip at a later frame (02) |
| The numbers look like random letters or symbols | Add "digits only, 1 2 3 5 8" and lower the number of particles: "sparse, fewer particles" |
| Colours drift (purple, gold) | Repeat the palette line and add the negative prompt |
| The logo is not centered | Say "centered in frame" and use the frames in the correct ratio |
| The Orb has a different face | Mention: "a round dark sphere with two oval glowing eyes, no mouth, no nose" |

## 9. Notes

- The slogan is used exactly as you wrote it. If you want it grammatically standard in English, "in constant becoming" is the usual form ("become" is a verb). Your call.
- The Orb in frame 05 is a static still of the real avatar (same filters as the app). It is small in the frame on purpose, so the numbers have room to gather and spread.
- Frames come from `build_intro.py` (`python build_intro.py` for 16:9, `PORTRAIT=1 python build_intro.py` for 9:16), so any change to the logo can be regenerated.
