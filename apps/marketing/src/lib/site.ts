export const SITE = {
  name: 'Identizen',
  tagline: 'Accountless identity. Login with your phone.',
  description:
    'Identizen is accountless identity, open source. Your phone holds your identity, your biometric unlocks it, and applications receive standard OpenID Connect. No password, no email, no identity-provider account to create, reset, or breach.',
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
  { href: '/accountless', label: 'Accountless' },
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
      { href: '/accountless', label: 'Accountless identity' },
      { href: '/authorization', label: 'Signed authorization' },
      { href: '/agent-authorization', label: 'Agent authorization' },
      { href: '/compare/passkeys', label: 'Identizen vs passkeys' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/download', label: 'Download the app' },
    ],
  },
  {
    heading: 'Developers',
    items: [
      { href: SITE.docs, label: 'Documentation', external: true },
      { href: '/developers', label: 'Developers' },
      { href: '/playground', label: 'Playground' },
      { href: `${SITE.docs}/protocol`, label: 'Protocol spec', external: true },
      { href: SITE.github, label: 'GitHub', external: true },
      { href: '/llms.txt', label: 'llms.txt' },
    ],
  },
  {
    heading: 'Resources',
    items: [
      { href: '/faq', label: 'FAQ' },
      { href: '/help', label: 'Help' },
      { href: '/security', label: 'Security' },
      { href: '/blog', label: 'Blog' },
      { href: '/rss.xml', label: 'RSS' },
      { href: SITE.app, label: 'Dashboard', external: true },
    ],
  },
  {
    heading: 'Company',
    items: [
      { href: '/about', label: 'About' },
      { href: '/brand', label: 'Brand' },
      { href: '/contact', label: 'Contact' },
      { href: '/legal/privacy', label: 'Privacy' },
      { href: '/legal/terms', label: 'Terms' },
      { href: '/legal/delete', label: 'Delete your data' },
    ],
  },
];

/** Is `href` the current page (or a parent section of it)? */
export function isActive(current: string, href: string): boolean {
  if (href.startsWith('http')) return false;
  if (href === '/') return current === '/';
  return current === href || current.startsWith(`${href}/`);
}
