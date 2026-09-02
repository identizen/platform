export const SITE = {
  name: 'Identizen',
  tagline: 'Login with your phone.',
  description:
    'Identizen is an open-source, device-based identity system. Your phone holds the key; sites integrate standard OIDC. One tap, Face ID, in. No password, no email, no big-tech account.',
  url: 'https://identizen.com',
  docs: 'https://docs.identizen.com',
  app: 'https://app.identizen.com',
  github: 'https://github.com/identizen/platform',
  twitter: '@identizen',
} as const;

export interface NavItem {
  href: string;
  label: string;
  external?: boolean;
}

export const NAV: readonly NavItem[] = [
  { href: '/developers', label: 'Developers' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/blog', label: 'Blog' },
  { href: SITE.docs, label: 'Docs', external: true },
  { href: '/playground', label: 'Playground' },
];

export const FOOTER: readonly { heading: string; items: readonly NavItem[] }[] = [
  {
    heading: 'Product',
    items: [
      { href: '/developers', label: 'Developers' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/playground', label: 'Playground' },
      { href: SITE.app, label: 'Dashboard', external: true },
    ],
  },
  {
    heading: 'Resources',
    items: [
      { href: SITE.docs, label: 'Documentation', external: true },
      { href: `${SITE.docs}/protocol`, label: 'Protocol spec', external: true },
      { href: SITE.github, label: 'GitHub', external: true },
      { href: '/blog', label: 'Blog' },
    ],
  },
  {
    heading: 'Company',
    items: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
      { href: '/legal/privacy', label: 'Privacy' },
      { href: '/legal/terms', label: 'Terms' },
    ],
  },
];

/** Is `href` the current page (or a parent section of it)? */
export function isActive(current: string, href: string): boolean {
  if (href.startsWith('http')) return false;
  if (href === '/') return current === '/';
  return current === href || current.startsWith(`${href}/`);
}
