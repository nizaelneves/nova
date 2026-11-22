import { useEffect, useState } from 'react';
import { PhibeMist } from './PhibeMist';

/**
 * Phibe's Orb at button size (the floating button, the chat bubble, the voice window). It blinks now and
 * then with a timer. `asleep` lets the body dissolve and stops the timer (the button is tucked at the edge).
 */
export function AvatarMini({ size = 56, asleep = false, still = false }: { size?: number; asleep?: boolean; /** Never blink (effects off). */ still?: boolean }) {
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (asleep || still) return;
    let timer = 0;
    const loop = () => {
      timer = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 120);
        if (Math.random() < 0.22) { // sometimes two in a row
          window.setTimeout(() => setBlink(true), 240);
          window.setTimeout(() => setBlink(false), 360);
        }
        loop();
      }, 2500 + Math.random() * 3000);
    };
    loop();
    return () => window.clearTimeout(timer);
  }, [asleep, still]);
  // The Orb's drawing has a lot of room around the face for its cloud: draw it larger than the box
  // (the cloud may spill outside) so the face fills the button.
  const drawn = size * 1.75;
  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <div style={{ position: 'absolute', left: (size - drawn) / 2, top: (size - drawn) / 2 }}>
        <PhibeMist size={drawn} state={asleep ? 'asleep' : 'idle'} blink={blink} still={still} />
      </div>
    </div>
  );
}
