const DURATION = 900;
const SVG_NS = 'http://www.w3.org/2000/svg';
let counter = 0;

/**
 * Makes an element disintegrate: it breaks up into fine grains that drift away (up and to the right) until
 * nothing is left. It is the element itself that dissolves, through an SVG filter (noise decides which grains
 * go first), not a cloud of dots drawn over it. The promise resolves when it is gone, so the caller can remove
 * it from the list then. With "reduce motion" on, it resolves immediately. The second argument is kept so
 * existing callers do not change; the effect has no tint.
 */
export function disintegrate(el: HTMLElement | null | undefined, _tint?: string): Promise<void> {
  if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();

  const id = `phibe-disint-${counter++}`;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'fixed';
  svg.innerHTML = `
    <filter id="${id}" x="-30%" y="-40%" width="170%" height="180%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="${(counter * 7) % 97}" result="grain"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="1" seed="${(counter * 13) % 89}" result="flow"/>
      <feDisplacementMap in="SourceGraphic" in2="flow" scale="0" xChannelSelector="R" yChannelSelector="G" result="moved"/>
      <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  9 0 0 0 0" result="mask"/>
      <feComposite in="moved" in2="mask" operator="in"/>
    </filter>`;
  document.body.appendChild(svg);
  const move = svg.querySelector('feDisplacementMap')!;
  const mask = svg.querySelector('feColorMatrix')!;

  const before = { filter: el.style.filter, transform: el.style.transform, pointerEvents: el.style.pointerEvents };
  el.style.pointerEvents = 'none';
  el.style.filter = `url(#${id})`;
  el.style.willChange = 'filter, transform';

  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now: number) => {
      const k = Math.min(1, (now - start) / DURATION);
      const e = k * k * (3 - 2 * k); // ease in and out
      // A grain stays while its noise is above the level; the level rises until every grain is gone.
      const level = 0.2 + 0.62 * e; // the noise lives roughly between 0.25 and 0.75
      mask.setAttribute('values', `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  9 0 0 0 ${(-9 * level).toFixed(3)}`);
      move.setAttribute('scale', String(Math.round(70 * e)));
      el.style.transform = `translate(${(18 * e).toFixed(1)}px, ${(-12 * e).toFixed(1)}px)`;
      if (k < 1) requestAnimationFrame(frame);
      else {
        el.style.opacity = '0'; // stays hidden until the caller removes it
        el.style.filter = before.filter;
        el.style.transform = before.transform;
        el.style.willChange = '';
        svg.remove();
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}
