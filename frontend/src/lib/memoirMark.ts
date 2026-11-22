/**
 * The Memoir wordmark, drawn the way the Phibe one is: lowercase, one even stroke with round ends, "mem" in the text colour
 * and "oir" in the brand gradient (cyan to mint), a mint dot on the i and another inside the o, like the dot inside Phibe's e.
 */
export const MARK_VIEWBOX = '0 -32 832 158';

const W = 'stroke="currentColor"', G = (id: string) => `stroke="url(#${id})"`;
const stroke = (d: string, s: string, w = 26) => `<path d="${d}" fill="none" ${s} stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** The wordmark as SVG markup. `id` keeps the gradient of each copy on the page apart. */
export function memoirMark(id: string, label = 'Memoir'): string {
  const g = G(id);
  return `<svg viewBox="${MARK_VIEWBOX}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="540" y1="0" x2="832" y2="0"><stop offset="0" stop-color="#8fe3ff"/><stop offset="1" stop-color="#20e7aa"/></linearGradient></defs>
${stroke('M13 13V109', W)}${stroke('M13 45A32 32 0 0 1 77 45V109', W)}${stroke('M77 45A32 32 0 0 1 141 45V109', W)}
${stroke('M299 61A48 48 0 1 0 284.9 94.9', W)}${stroke('M203 65H299', W, 18)}
${stroke('M361 13V109', W)}${stroke('M361 45A32 32 0 0 1 425 45V109', W)}${stroke('M425 45A32 32 0 0 1 489 45V109', W)}
<circle cx="599" cy="61" r="48" fill="none" ${g} stroke-width="26"/><circle cx="599" cy="61" r="11" fill="#20e7aa"/>
${stroke('M709 39V109', g)}<circle cx="709" cy="-14.3" r="14.6" fill="#20e7aa"/>
${stroke('M771 13V109', g)}${stroke('M771 61A48 48 0 0 1 819 13', g)}
</svg>`;
}
