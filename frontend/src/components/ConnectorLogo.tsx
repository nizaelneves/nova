import { BRANDS } from '../icons/brands';
import { Icon, type IconName } from './Icon';

// Connectors without a brand logo get a plain icon instead.
const FALLBACK: Record<string, IconName> = {
  upload: 'upload-minimalistic',
  weather: 'layers',
  oura: 'target',
  granola: 'document-text',
};

/**
 * A connector's logo on a dark rounded tile. Brand logos are stored in the
 * project (no internet needed); one-colour logos take the text colour.
 */
export function ConnectorLogo({ id, size = 48 }: { id: string; size?: number }) {
  const brand = BRANDS[id];
  const inner = Math.round(size * 0.5);
  return (
    <div className="logo-tile" style={{ width: size, height: size }} aria-hidden="true">
      {brand ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 0 ${brand.width} ${brand.height}`}
          width={inner}
          height={inner}
          style={brand.mono ? { color: 'var(--color-heading)' } : undefined}
          fill={brand.mono ? 'currentColor' : undefined}
          // The markup comes from our own generated file, never from user input.
          dangerouslySetInnerHTML={{ __html: brand.body }}
        />
      ) : (
        <Icon name={FALLBACK[id] ?? 'link-round'} size={inner} style={{ color: 'var(--color-text-secondary)' }} />
      )}
    </div>
  );
}
