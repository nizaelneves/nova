/**
 * "Nothing going on" Phi expressions — looping animations meant to play only
 * while Phi is fully idle (no chat, no voice mode, no Think). Each is free to
 * depart from the plain face's look (different eyes, hands, whatever reads
 * best) as long as it keeps the brand's cyan-to-green gradient.
 *
 * To add one: drop a new entry here with a `draw` function. The Orb cycles
 * through this list (plus idle and the speaking preview) when clicked, so
 * nothing else needs to change to try a new one out.
 */

export interface AmbientEmoji {
  id: string;
  label: string;
  draw: (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, clock: number) => void;
}

export const AMBIENT_EMOJIS: AmbientEmoji[] = [];
