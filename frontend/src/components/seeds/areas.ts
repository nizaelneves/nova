import type { IconName } from '../Icon';

export interface SeedArea {
  id: string;
  title: string;
  /** One line shown in the middle of the orbit while the area is hovered. */
  tagline: string;
  icon: IconName;
  color: string;
  /** Folders every area starts with, A-Z. */
  folders: string[];
  /** Areas that share material with this one; they glow while this one is hovered. */
  related: string[];
}

/** The default swipe file for a generalist marketer: eight areas (a Fibonacci number). */
export const SEED_AREAS: SeedArea[] = [
  {
    id: 'copywriting', title: 'Copywriting', tagline: 'Words that sell', icon: 'pen', color: '#ffc857',
    folders: ['Ad Copy', 'Email Subjects', 'Headlines', 'Hooks', 'Sales Pages', 'Scripts'],
    related: ['funnels', 'email', 'seo'],
  },
  {
    id: 'design', title: 'Design', tagline: 'Looks worth stealing', icon: 'layers', color: '#a78bfa',
    folders: ['Brand Identity', 'Carousels', 'Landing Pages', 'Packaging', 'Thumbnails', 'Typography'],
    related: ['social', 'funnels'],
  },
  {
    id: 'paid-media', title: 'Paid Media', tagline: 'Ads that scale', icon: 'target', color: '#ff7a6b',
    folders: ['Ad Creatives', 'Audiences', 'Campaign Structures', 'Case Studies', 'Offers', 'Reports'],
    related: ['funnels', 'business', 'design'],
  },
  {
    id: 'social', title: 'Social & Video', tagline: 'Attention on demand', icon: 'clapperboard-play', color: '#ff8fb1',
    folders: ['Formats', 'Hooks', 'Reels & Shorts', 'Trends', 'UGC', 'Video Scripts'],
    related: ['design', 'copywriting'],
  },
  {
    id: 'email', title: 'Email & CRM', tagline: 'Inbox, owned', icon: 'inbox', color: '#6ea8ff',
    folders: ['Automations', 'Newsletters', 'Onboarding', 'Promotions', 'Segments', 'Welcome Series'],
    related: ['copywriting', 'funnels'],
  },
  {
    id: 'funnels', title: 'Funnels & Offers', tagline: 'From click to customer', icon: 'cart-large-2', color: '#20e7aa',
    folders: ['Checkout', 'Landing Pages', 'Lead Magnets', 'Offers', 'Pricing', 'Upsells'],
    related: ['copywriting', 'paid-media', 'email'],
  },
  {
    id: 'seo', title: 'SEO & Content', tagline: 'Found without paying', icon: 'magnifer', color: '#10c3d3',
    folders: ['Blog Posts', 'Content Calendar', 'Keywords', 'Link Building', 'Pillar Pages', 'Technical'],
    related: ['copywriting', 'business'],
  },
  {
    id: 'business', title: 'Business', tagline: 'Strategy and numbers', icon: 'buildings-2', color: '#ffe3bd',
    folders: ['Analytics', 'Competitors', 'Frameworks', 'Positioning', 'Pricing Models', 'Research'],
    related: ['paid-media', 'seo'],
  },
];
