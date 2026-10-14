import type { IconName } from '../Icon';

export interface SeedArea {
  id: string;
  title: string;
  icon: IconName;
  color: string;
  /** Folders every area starts with, A-Z. */
  folders: string[];
  /** Areas that share material with this one; they glow while this one is hovered. */
  related: string[];
}

/** The default swipe file for a generalist marketer. */
export const SEED_AREAS: SeedArea[] = [
  {
    id: 'copywriting', title: 'Copywriting', icon: 'pencil', color: '#ffc857',
    folders: ['Ad Copy', 'Email Subjects', 'Headlines', 'Hooks', 'Sales Pages', 'Scripts'],
    related: ['funnels', 'email', 'seo'],
  },
  {
    id: 'design', title: 'Design', icon: 'palette', color: '#a78bfa',
    folders: ['Brand Identity', 'Carousels', 'Landing Pages', 'Packaging', 'Thumbnails', 'Typography'],
    related: ['social', 'funnels'],
  },
  {
    id: 'paid-media', title: 'Paid Media', icon: 'megaphone', color: '#ff7a6b',
    folders: ['Ad Creatives', 'Audiences', 'Campaign Structures', 'Case Studies', 'Offers', 'Reports'],
    related: ['funnels', 'strategy', 'design', 'growth'],
  },
  {
    id: 'social', title: 'Social Media', icon: 'social-media', color: '#ff8fb1',
    folders: ['Formats', 'Hooks', 'Reels & Shorts', 'Trends', 'UGC', 'Video Scripts'],
    related: ['design', 'copywriting', 'growth'],
  },
  {
    id: 'email', title: 'Email Marketing', icon: 'mail', color: '#6ea8ff',
    folders: ['Automations', 'Newsletters', 'Onboarding', 'Promotions', 'Segments', 'Welcome Series'],
    related: ['copywriting', 'funnels', 'crm'],
  },
  {
    id: 'crm', title: 'CRM', icon: 'users', color: '#fb923c',
    folders: ['Automations', 'Contacts', 'Lead Scoring', 'Pipelines', 'Reports', 'Segments'],
    related: ['email', 'funnels', 'technology'],
  },
  {
    id: 'funnels', title: 'Funnels', icon: 'funnel', color: '#20e7aa',
    folders: ['Checkout', 'Landing Pages', 'Lead Magnets', 'Offers', 'Pricing', 'Upsells'],
    related: ['copywriting', 'paid-media', 'email', 'crm'],
  },
  {
    id: 'seo', title: 'SEO', icon: 'magnifer', color: '#10c3d3',
    folders: ['Blog Posts', 'Content Calendar', 'Keywords', 'Link Building', 'Pillar Pages', 'Technical'],
    related: ['copywriting', 'strategy', 'growth'],
  },
  {
    id: 'strategy', title: 'Strategy', icon: 'rook', color: '#ffe3bd',
    folders: ['Analytics', 'Competitors', 'Frameworks', 'Positioning', 'Pricing Models', 'Research'],
    related: ['paid-media', 'seo', 'growth'],
  },
  {
    id: 'growth', title: 'Growth', icon: 'trending-up', color: '#a3e635',
    folders: ['Acquisition', 'Case Studies', 'Experiments', 'Referral Loops', 'Retention', 'Viral Loops'],
    related: ['paid-media', 'funnels', 'strategy', 'social'],
  },
  {
    id: 'technology', title: 'Technology', icon: 'cpu', color: '#f0abfc',
    folders: ['AI Tools', 'Analytics Stack', 'Automation', 'Integrations', 'No-Code', 'Tracking'],
    related: ['crm', 'growth'],
  },
  {
    id: 'wikipedia', title: 'Wikipedia', icon: 'book-2', color: '#cbd5e1',
    folders: ['Articles', 'Definitions', 'Glossary', 'Guides', 'People', 'References'],
    related: ['strategy', 'technology'],
  },
];
