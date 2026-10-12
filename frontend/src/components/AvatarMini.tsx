import { useEffect, useRef, useState } from 'react';
import { PhibeMist } from './PhibeMist';
import { avatarById, DEFAULT_AVATAR, REST_AVATAR_POSE, type AvatarId } from '../lib/avatar/registry';


/**
 * The avatar at button size (the floating button, the chat bubble, the voice window). It is
 * drawn once and blinks now and then with a timer (no animation loop), so it costs nothing while
 * it rests. `asleep` keeps the eyes shut and stops the timer (the button is tucked at the edge).
 */
function MistMini({ size, asleep, still }: { size: number; asleep: boolean; still: boolean }) {
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (asleep || still) return;
    let timer = 0;
    const loop = () => {
      timer = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 130);
        loop();
      }, 2500 + Math.random() * 3000);
    };
    loop();
    return () => window.clearTimeout(timer);
  }, [asleep, still]);
  // The mist's drawing has a lot of room around the face for its cloud: draw it larger than the
  // box (the cloud may spill outside) so the face is as big as the snail and the owl.
  const drawn = size * 1.75;
  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <div style={{ position: 'absolute', left: (size - drawn) / 2, top: (size - drawn) / 2 }}>
        <PhibeMist size={drawn} state={asleep ? 'asleep' : 'idle'} blink={blink} still={still} />
      </div>
    </div>
  );
}

export function AvatarMini({
  size = 56,
  asleep = false,
  still = false,
  avatar = DEFAULT_AVATAR,
  mirror = false,
}: {
  size?: number;
  asleep?: boolean;
  /** Never blink (effects off). */
  still?: boolean;
  avatar?: AvatarId;
  /** The button is on the left edge: a side-view figure turns to face the middle of the screen. */
  mirror?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isSvg = avatarById(avatar).svg === true;

  useEffect(() => {
    if (isSvg) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const def = avatarById(avatar);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const paint = (blink: number) => {
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      if (mirror && def.facing === 'left') {
        ctx.translate(size, 0);
        ctx.scale(-1, 1);
      }
      ctx.translate(size / 2, size / 2);
      ctx.scale(def.fit, def.fit);
      ctx.translate(-(size * def.center[0]) / 200, -(size * def.center[1]) / 200);
      def.draw(ctx, size, { ...REST_AVATAR_POSE, blink });
      ctx.restore();
    };
    paint(asleep ? 1 : 0);
    if (asleep || still || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let timer = 0;
    let reopen = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!document.hidden) {
          paint(1);
          reopen = window.setTimeout(() => paint(0), 130);
        }
        schedule();
      }, 2500 + Math.random() * 3000);
    };
    schedule();
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(reopen);
    };
  }, [size, asleep, still, avatar, mirror, isSvg]);

  if (isSvg) return <MistMini size={size} asleep={asleep} still={still} />;
  return <canvas ref={canvasRef} style={{ width: size, height: size }} aria-hidden="true" />;
}
