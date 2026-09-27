import { ICONS, type IconName } from '../icons/solar';

export type { IconName };

/**
 * One of Nova's icons (Solar, "linear" style). Icons are stored in the project,
 * so nothing is downloaded at run time. They take the current text colour.
 */
export function Icon({
  name,
  size = 20,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
      // The markup comes from our own generated file, never from user input.
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
