import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../components/Icon';

const KEY = 'phibe-horizon-flow';

/** Whether the cards that pass over the home screen are switched on, remembered between visits. */
export function useHorizonFlow(): [boolean, () => void] {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  });
  const toggle = () => setOn((v) => {
    try { localStorage.setItem(KEY, v ? '0' : '1'); } catch { /* not remembered */ }
    return !v;
  });
  return [on, toggle];
}

/**
 * One switch at the top right of the home screen, level with the menu button on the left: it turns the
 * animation of the cards that pass over the screen on and off. (The cards themselves come next.)
 */
export function Horizon() {
  const [on, toggle] = useHorizonFlow();
  return createPortal(
    <div className="hz-dock">
      <button type="button" role="switch" aria-checked={on} className="rail-item hz-flow w-11 justify-center cursor-pointer" data-active={on} aria-label="Card animation" onClick={toggle}>
        <Icon name="card-plus" size={20} className="rail-icon" />
      </button>
    </div>,
    document.body,
  );
}
