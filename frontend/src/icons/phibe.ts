// Icons drawn for Phibe (24x24, they take the current text colour), for modules the Solar set has no good match for.
const line = (body: string) =>
  `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">${body}</g>`;

export const PHIBE_ICONS = {
  // A newspaper: the quick digest.
  newspaper: line('<path d="M4 5h12a1 1 0 0 1 1 1v13H5a1 1 0 0 1-1-1z M17 9h3v9a1 1 0 0 1-1 1h-2 M7 9h6 M7 12.500h6 M7 16h4"/>'),
  // A card with a plus on top: the Horizon card switch.
  'card-plus': line('<rect x="3" y="8" width="15" height="12" rx="3"/><path d="M3 12.500h15"/><path d="M19 3v6M16 6h6"/>'),
  // A slim four-point star with curved sides: the North Star.
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
  // A two-armed spiral galaxy with a bright core: Horizon.
  galaxy: line('<path d="M12 12c-2-4 .7-8 5-8.500 3.800-.4 6 2 5.500 5M12 12c2 4-.7 8-5 8.500-3.800.4-6-2-5.500-5"/><circle cx="12" cy="12" r="1.500" fill="currentColor"/>'),
  // Three planets of different sizes, sharing one space: Projects.
  projects: line('<circle cx="8" cy="8.500" r="4.500"/><circle cx="18" cy="7" r="2.500"/><circle cx="15.500" cy="16.500" r="4"/><circle cx="6.500" cy="18.500" r="1.500" fill="currentColor"/>'),
  // A stopwatch: the focus timer in the island.
  'focus-timer': line('<circle cx="12" cy="13.500" r="7.500"/><path d="M12 13.500V9.500M9.500 3h5M18 6l1.500-1.500"/>'),
  // A plug in a socket, and the same plug cut off: connected and disconnected.
  plug: line('<path d="M9 3v4M15 3v4M6.500 7h11v3.500a5.500 5.500 0 0 1-11 0z M12 16v5"/>'),
  'plug-off': line('<path d="M9 3v4M15 3v4M6.500 7h11v3.500a5.500 5.500 0 0 1-11 0z M12 16v5 M3.500 3.500l17 17"/>'),
  // Two sliders: the model settings.
  sliders: line('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  // A dot with two rings spreading out: a beat, the Pulse widget.
  beat: line('<circle cx="12" cy="12" r="2.8" fill="currentColor"/><circle cx="12" cy="12" r="6.4"/><circle cx="12" cy="12" r="10" opacity=".55"/>'),
  // Signal waves around a dot: the feed of the quick digest.
  feed: line('<path d="M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8"/><circle cx="6.500" cy="17.500" r="1.500" fill="currentColor"/>'),
  'pause-circle': line('<circle cx="12" cy="12" r="9.500"/><path d="M10 9v6M14 9v6"/>'),
  // Tabler "writing-sign" (MIT): a hand signing, the Copies of the Swipe File.
  'writing-sign': '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M3 19q5-3 5-6c0-3-1-3-2-3s-2.032 1.085-2 3c.034 2.048 1.658 2.877 2.5 4C8 19 9 19.5 10 18q1-1.5 1.5-2.5q1.5 3.5 4 3.5H18m2-2V5c0-1.121-.879-2-2-2s-2 .879-2 2v12l2 2zM16 7h4"/>',
  // Phosphor "terminal-window" (MIT, 256 grid): the Prompts of the Swipe File.
  'terminal-window': '<g transform="scale(.09375)" fill="currentColor"><path d="M128 128a8 8 0 0 1-3 6.25l-40 32a8 8 0 1 1-10-12.5L107.19 128L75 102.25a8 8 0 1 1 10-12.5l40 32a8 8 0 0 1 3 6.25m48 24h-40a8 8 0 0 0 0 16h40a8 8 0 0 0 0-16m56-96v144a16 16 0 0 1-16 16H40a16 16 0 0 1-16-16V56a16 16 0 0 1 16-16h176a16 16 0 0 1 16 16m-16 144V56H40v144z"/></g>',
  // Tabler "edit" (MIT): the pen-and-page that edits a card.
  edit: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M7 7H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1"/><path d="M20.385 6.585a2.1 2.1 0 0 0-2.97-2.97L9 12v3h3zM16 5l3 3"/></g>',
  // Tabler "recycle" (MIT): the Trash of Memoir.
  recycle: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="m12 17l-2 2l2 2"/><path d="M10 19h9a2 2 0 0 0 1.75-2.75l-.55-1M8.536 11l-.732-2.732L5.072 9"/><path d="m7.804 8.268l-4.5 7.794a2 2 0 0 0 1.506 2.89l1.141.024M15.464 11l2.732.732L18.928 9"/><path d="m18.196 11.732l-4.5-7.794a2 2 0 0 0-3.256-.14l-.591.976"/></g>',
  // Lucide "brain-cog" (ISC): the Brain of Memoir.
  'brain-cog': '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"><path d="m10.852 14.772l-.383.923m.383-6.467l-.383-.923m2.679 6.467l.382.924m0-7.391l-.382.923m1.624 1.624l.923-.383m-.923 2.679l.923.383m2.302-8.406a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M4.033 17.483A4 4 0 0 0 11.46 20c.184-.31.896-.31 1.076 0a4 4 0 0 0 7.43-2.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.002 5.125a4 4 0 0 0-2.525 5.77"/><path d="M6.293 6.294a3 3 0 0 1-.287-1.098l-.004-.07a3 3 0 0 1 5.968-.543c.05.02.057.01.059 0a3 3 0 0 1 5.968.542l-.004.071a3 3 0 0 1-.287 1.098m-8.478 4.558l-.923-.383m.923 2.679l-.923.383"/><circle cx="12" cy="12" r="3"/></g>',
  // lucide "library" (open licence): Memoir navigation.
  'lucide-library': '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"  d="m16 6l4 14M12 6v14M8 8v12M4 4v16"/></g>',
  // ph "graph" (open licence): Memoir navigation.
  'ph-graph': '<svg viewBox="0 0 256 256" width="24" height="24" fill="currentColor"><path fill="currentColor" d="M200 152a31.84 31.84 0 0 0-19.53 6.68l-23.11-18A31.65 31.65 0 0 0 160 128c0-.74 0-1.48-.08-2.21l13.23-4.41A32 32 0 1 0 168 104c0 .74 0 1.48.08 2.21l-13.23 4.41A32 32 0 0 0 128 96a32.6 32.6 0 0 0-5.27.44L115.89 81A32 32 0 1 0 96 88a32.6 32.6 0 0 0 5.27-.44l6.84 15.4a31.92 31.92 0 0 0-8.57 39.64l-25.71 22.84a32.06 32.06 0 1 0 10.63 12l25.71-22.84a31.91 31.91 0 0 0 37.36-1.24l23.11 18A31.65 31.65 0 0 0 168 184a32 32 0 1 0 32-32m0-64a16 16 0 1 1-16 16a16 16 0 0 1 16-16M80 56a16 16 0 1 1 16 16a16 16 0 0 1-16-16M56 208a16 16 0 1 1 16-16a16 16 0 0 1-16 16m56-80a16 16 0 1 1 16 16a16 16 0 0 1-16-16m88 72a16 16 0 1 1 16-16a16 16 0 0 1-16 16"/></svg>',
  // lucide "files" (open licence): Memoir navigation.
  'lucide-files': '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" ><path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/><path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706zM5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1"/></g></g>',
  // lucide "images" (open licence): Memoir navigation.
  'lucide-images': '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" ><path d="m22 11l-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16"/><path d="M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2"/><circle cx="13" cy="7" r="1" fill="currentColor"/><rect width="14" height="14" x="8" y="2" rx="2"/></g></g>',
  // tabler "player-play" (open licence): Memoir navigation.
  'tabler-player-play': '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"  d="M7 4v16l13-8z"/></g>',
  // lucide "tags" (open licence): Memoir navigation.
  'lucide-tags': '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" ><path d="M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1zM2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193"/><circle cx="10.5" cy="6.5" r=".5" fill="currentColor"/></g></g>',
  // ph "folders" (open licence): Memoir navigation.
  'ph-folders': '<svg viewBox="0 0 256 256" width="24" height="24" fill="currentColor"><path fill="currentColor" d="M224 64h-69.33l-27.74-20.8a16.12 16.12 0 0 0-9.6-3.2H72a16 16 0 0 0-16 16v16H40a16 16 0 0 0-16 16v112a16 16 0 0 0 16 16h152.89A15.13 15.13 0 0 0 208 200.89V184h16.89A15.13 15.13 0 0 0 240 168.89V80a16 16 0 0 0-16-16m-32 136H40V88h45.33l29.87 22.4a8 8 0 0 0 4.8 1.6h72Zm32-32h-16v-56a16 16 0 0 0-16-16h-69.33L94.93 75.2a16.12 16.12 0 0 0-9.6-3.2H72V56h45.33l29.87 22.4A8 8 0 0 0 152 80h72Z"/></svg>',
} as const;
