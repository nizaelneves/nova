import { useId } from 'react';
import { PHI_AVATAR_MARKUP, PHI_AVATAR_VIEWBOX } from '../lib/phiAvatarSvg';

/**
 * Phi's snail (style 1: the shell hiding its owner, only the eyes show).
 * The drawing comes from lib/phiAvatarSvg.ts; the eyes blink through CSS
 * (`.phi-blink` in index.css), so it costs nothing while it is still.
 */
export function PhiAvatar({ size = 56, className }: { size?: number; className?: string }) {
  // useId gives ":r1:"; gradient ids must be plain so url(#id) resolves everywhere.
  const prefix = `phi${useId().replace(/[^a-zA-Z0-9]/g, '')}-`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={PHI_AVATAR_VIEWBOX}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
      // The markup is our own generated drawing, never user input.
      dangerouslySetInnerHTML={{ __html: PHI_AVATAR_MARKUP.replace(/@@/g, prefix) }}
    />
  );
}
