/** Auto-matching of a Bank/Card name to one of the bundled logo images.
 *
 * Mirrors `match_logo_key` in `phi.finances.store` exactly — checked from
 * most-specific to least-specific so "Santander Empresas" never matches
 * plain "Santander" first. The backend persists the match as `logo_key` on
 * create/rename; this copy exists only to show a live preview while typing.
 */
export type LogoKey = 'santander' | 'santander_empresas' | 'c6' | 'caixa';

export function matchLogoKey(name: string): LogoKey | null {
  const n = (name || '').toLowerCase();
  if (n.includes('santander') && n.includes('empresas')) return 'santander_empresas';
  if (n.includes('santander')) return 'santander';
  if (n.includes('c6')) return 'c6';
  if (n.includes('caixa')) return 'caixa';
  return null;
}

/** Bundled logo files under `public/bank-logos/`. `santander_empresas` has no
 * distinct public-domain logo file available (no separate Wikimedia Commons
 * asset exists for it, as of this writing) — it falls back to the neutral
 * icon rather than silently reusing the plain Santander mark. */
const LOGO_FILES: Record<LogoKey, string | null> = {
  santander: '/bank-logos/santander.svg',
  santander_empresas: null,
  c6: '/bank-logos/c6.svg',
  caixa: '/bank-logos/caixa.svg',
};

export function logoUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return LOGO_FILES[key as LogoKey] ?? null;
}
