import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

/** A number that rolls up (or down) when it changes. */
export function RollNumber({ value }: { value: number }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <span style={{ display: 'inline-flex', overflow: 'hidden', position: 'relative' }}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          initial={reduce ? { opacity: 1 } : { y: '70%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: '-70%', opacity: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          style={{ display: 'inline-block' }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
