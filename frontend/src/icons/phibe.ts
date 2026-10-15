// Icons drawn for Phibe (24x24, they take the current text colour), for modules the Solar set has no good match for.
const line = (body: string) =>
  `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">${body}</g>`;

export const PHIBE_ICONS = {
  // A slim four-point star with curved sides: the North Star.
  'north-star': line('<path d="M12 3C12.600 8.500 15.500 11.400 21 12 15.500 12.600 12.600 15.500 12 21 11.400 15.500 8.500 12.600 3 12 8.500 11.400 11.400 8.500 12 3z"/>'),
  'social-media': line('<path d="M12 3C7 3 3 6.6 3 11c0 2.3 1.1 4.3 2.9 5.8L5 21l4.2-2.1c.9.2 1.8.3 2.8.3 5 0 9-3.6 9-8s-4-8-9-8z M12 14.4l-2.7-2.7a1.8 1.8 0 0 1 2.7-2.4 1.8 1.8 0 0 1 2.7 2.4z"/>'),
  pencil: line('<path d="M4 20l1-4.5L16.5 4a2.1 2.1 0 0 1 3 3L8 18.5z M14.5 6l3.5 3.5 M13 21h7"/>'),
  palette: line('<path d="M12 3a9 9 0 1 0 0 18c1.200 0 1.800-.8 1.800-1.600 0-.5-.2-.9-.5-1.200-.3-.3-.5-.7-.5-1.200 0-1 .8-1.800 1.800-1.800H17a4 4 0 0 0 4-4C21 6.500 17 3 12 3z"/><circle cx="7.500" cy="11.500" r="1" fill="currentColor"/><circle cx="10" cy="7.500" r="1" fill="currentColor"/><circle cx="14.500" cy="7.500" r="1" fill="currentColor"/>'),
  megaphone: line('<path d="M3 10v4h3l7 4V6L6 10z M16 9.500a4 4 0 0 1 0 5 M18.500 7a7.500 7.500 0 0 1 0 10"/>'),
  funnel: line('<path d="M3 4h18l-7 8.500V19l-4 2v-8.500z"/>'),
  mail: line('<rect x="3" y="5.500" width="18" height="13" rx="2.500"/><path d="M3.500 7.500l8.500 6 8.500-6"/>'),
  users: line('<circle cx="9" cy="8" r="3.200"/><path d="M3 19c0-3 2.700-5 6-5s6 2 6 5"/><path d="M15.500 5.200A3 3 0 0 1 15.500 11 M17 14.200c2.200.3 4 1.800 4 4.800"/>'),
  rook: line('<path d="M6 20.5h12M7.5 20.5l.8-9h7.4l.8 9M6.5 11.5h11M7 11.5V6h2v1.8h2V6h2v1.8h2V6h2v5.5"/>'),
  'trending-up': line('<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>'),
  orbit: line('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="17.7" cy="6.3" r="1.6" fill="currentColor"/>'),
  spiral: line('<path d="M3 16.1A11.1 11.1 0 0 1 14.1 5A6.9 6.9 0 0 1 21 11.9A4.2 4.2 0 0 1 16.8 16.1A2.7 2.7 0 0 1 14.1 13.4A1.6 1.6 0 0 1 15.7 11.8"/>'),
  transcript: line('<path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M14 3v4h4 M8.5 11v2 M11 9.5v5 M13.5 10.5v3 M8.5 17.5h7"/>'),
  // A two-armed spiral galaxy with a bright core: Horizon.
  galaxy: line('<path d="M12 12c-2-4 .7-8 5-8.500 3.800-.4 6 2 5.500 5M12 12c2 4-.7 8-5 8.500-3.800.4-6-2-5.500-5"/><circle cx="12" cy="12" r="1.500" fill="currentColor"/>'),
  // An eye of Horus: the watching guide of Mentor.
  'horus-eye': line('<path d="M2 11c3.500-5 6.500-6.500 10-6.500S18.500 6 22 11c-3.500 5-6.500 6.500-10 6.500S5.500 16 2 11z"/><circle cx="12" cy="11" r="3"/><circle cx="12" cy="11" r="1" fill="currentColor"/><path d="M11 17.200V21M14.500 16.800c1.200 1.700 3 2.200 4.500 1.200"/>'),
  // Three planets of different sizes, sharing one space: Projects.
  projects: line('<circle cx="8" cy="8.500" r="4.500"/><circle cx="18" cy="7" r="2.500"/><circle cx="15.500" cy="16.500" r="4"/><circle cx="6.500" cy="18.500" r="1.500" fill="currentColor"/>'),
} as const;
