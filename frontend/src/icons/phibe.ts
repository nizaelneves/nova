// Icons drawn for Phibe (24x24, they take the current text colour), for modules the Solar set has no good match for.
const line = (body: string) =>
  `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">${body}</g>`;

// Fibonacci sunflower: 13 dots placed at the golden angle (137.5 degrees).
const SUNFLOWER = [
  [10.2, 13.7, 0.9], [12.3, 8.5, 1], [14.6, 15.4, 1.1], [7.1, 11.1, 1.1], [16.7, 9, 1.2], [10.4, 17.9, 1.2], [9, 6.1, 1.3],
  [18.6, 14.4, 1.3], [5.1, 14.9, 1.4], [15.4, 4.8, 1.4], [14.5, 19.9, 1.5], [4.5, 7.7, 1.5], [20.8, 10.1, 1.6],
]
  .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`)
  .join('');

export const PHIBE_ICONS = {
  sunflower: `<g fill="currentColor">${SUNFLOWER}</g>`,
  desk: line('<rect x="7.5" y="3" width="9" height="6.5" rx="1.2"/><path d="M12 9.5V11M3 11h18M5 11v9.5M19 11v9.5M9.5 14h5v3.5h-5z"/>'),
  transcript: line('<path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M14 3v4h4 M8.5 11v2 M11 9.5v5 M13.5 10.5v3 M8.5 17.5h7"/>'),
  'graduation-cap': line('<path d="M2 9l10-5 10 5-10 5z M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5 M22 9v6"/>'),
} as const;
