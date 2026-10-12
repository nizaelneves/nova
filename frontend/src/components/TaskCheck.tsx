import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// Fibonacci-sized crumbs: the brand verb (disintegrate) shown once when a task is completed.
const CRUMBS = [
  { r: 2.6, d: 13 },
  { r: 1.6, d: 18 },
  { r: 1, d: 22 },
];

/**
 * The completion check. The ring fills mint, the tick draws itself, and three small crumbs
 * (sizes 2.6, 1.6, 1) drift off to the upper right and fade. Nothing plays on first render.
 */
export function TaskCheck({
  done,
  label,
  onClick,
  size = 20,
}: {
  done: boolean;
  label: string;
  /** Leave out for a purely visual check (no button). */
  onClick?: () => void;
  size?: number;
}) {
  const reduce = useReducedMotion() ?? false;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);

  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      {...(onClick
        ? { type: 'button' as const, 'aria-label': label, 'aria-pressed': done, onClick: (e: React.MouseEvent) => { e.stopPropagation(); onClick(); } }
        : { role: 'img', 'aria-label': label })}
      data-done={done}
      className="task-check"
      style={onClick ? undefined : { cursor: 'default' }}
    >
      <motion.svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} style={{ overflow: 'visible' }} initial={false}>
        <motion.circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          initial={false}
          animate={{ stroke: done ? 'var(--color-done)' : 'var(--color-text-tertiary)' }}
          transition={reduce ? { duration: 0 } : { duration: 0.18, ease: EASE_OUT }}
        />
        <motion.circle
          cx="12"
          cy="12"
          r="9"
          fill="var(--color-done)"
          initial={false}
          animate={{ opacity: done ? 1 : 0, scale: done ? 1 : 0.6 }}
          transition={reduce ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
          style={{ transformOrigin: '12px 12px' }}
        />
        <motion.path
          d="M7.5 12.25 10.5 15.25 16.75 8.75"
          fill="none"
          stroke="var(--color-done-ink)"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.24, ease: EASE_OUT, delay: done ? 0.05 : 0 }}
        />
        {done && mounted.current && !reduce &&
          CRUMBS.map((c, i) => (
            <motion.circle
              key={i}
              cx="12"
              cy="12"
              r={c.r}
              fill="var(--color-done)"
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ x: c.d * 0.72, y: -c.d * 0.72, opacity: 0 }}
              transition={{ duration: 0.55, ease: EASE_OUT, delay: 0.08 + i * 0.05 }}
            />
          ))}
      </motion.svg>
    </Tag>
  );
}
