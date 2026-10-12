import { drawOwl } from './owl';
import { drawSnail, REST_POSE, type SnailPose } from './snail';

/** Every avatar draws itself from the same pose numbers; the engine only animates those. */
export type AvatarPose = SnailPose;
export const REST_AVATAR_POSE: AvatarPose = REST_POSE;

export type AvatarId = 'mist' | 'snail' | 'owl';

export interface AvatarDef {
  id: AvatarId;
  label: string;
  /** The way the figure looks in the drawing: a side view is flipped so it faces the screen's middle. */
  facing: 'left' | 'front';
  /** How much of the round button the figure fills (1 is the whole box). */
  fit: number;
  /** Middle of the figure in the 200-unit box, so small buttons can centre it. */
  center: [number, number];
  /** Drawn in a canvas. The mist is an SVG component instead (see PhibeMist). */
  draw: (ctx: CanvasRenderingContext2D, size: number, pose: AvatarPose) => void;
  svg?: boolean;
}

/**
 * The avatars Phibe can wear. To add one: write a `draw` function like `drawSnail` and list it
 * here.
 */
export const AVATARS: AvatarDef[] = [
  { id: 'mist', label: 'Phibe (Default)', facing: 'front', fit: 1, center: [100, 100], draw: () => {}, svg: true },
  { id: 'snail', label: 'Snail', facing: 'left', fit: 0.9, center: [105, 108], draw: drawSnail },
  { id: 'owl', label: 'Owl', facing: 'front', fit: 0.9, center: [100, 98], draw: drawOwl },
];

export const DEFAULT_AVATAR: AvatarId = 'mist';

export function avatarById(id: string | undefined): AvatarDef {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}
