import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/** Text whose strike-through draws itself from the left when `done` turns on (and retracts when it turns off). */
export function StrikeText({ done, children }: { done: boolean; children: ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <span style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
      {children}
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={{ scaleX: done ? 1 : 0, opacity: done ? 1 : 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.28, ease: [0.23, 1, 0.32, 1], delay: done ? 0.06 : 0 }}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: 1,
          background: 'currentColor',
          transformOrigin: 'left center',
        }}
      />
    </span>
  );
}
