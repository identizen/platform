/**
 * Structured data (schema.org JSON-LD) and the site-wide graph nodes. Search engines read these
 * for rich results; answer engines and LLM crawlers read them as the canonical description of
 * what Identizen is. Every builder returns a plain object; `jsonLd` serialises it safely for an
 * inline <script>.
 */
import { SITE } from './site';

export type JsonLd = Record<string, unknown>;

export const ORG_ID = `${SITE.url}/#organization`;
export const SITE_ID = `${SITE.url}/#website`;
export const APP_ID = `${SITE.url}/#software`;

export const SAME_AS: readonly string[] = [
  SITE.github,
  `https://x.com/${SITE.twitter.replace(/^@/, '')}`,
  'https://www.npmjs.com/package/@identizen/react',
];

export function organization(): JsonLd {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE.name,
    url: `${SITE.url}/`,
    logo: { '@type': 'ImageObject', url: `${SITE.url}/icon-512.png`, width: 512, height: 512 },
    sameAs: SAME_AS,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      url: `${SITE.url}/contact/`,
      availableLanguage: 'en',
    },
  };
}

export function website(): JsonLd {
  return {
    '@type': 'WebSite',
    '@id': SITE_ID,
    url: `${SITE.url}/`,
    name: SITE.name,
    description: SITE.description,
    publisher: { '@id': ORG_ID },
    inLanguage: 'en',
  };
}

/** The product itself: free, open source, phone app plus a hosted OpenID Provider. */
export function softwareApplication(): JsonLd {
  return {
    '@type': 'SoftwareApplication',
    '@id': APP_ID,
    name: SITE.name,
    url: `${SITE.url}/`,
    description: SITE.description,
    applicationCategory: 'SecurityApplication',
    applicationSubCategory: 'Passwordless authentication',
    operatingSystem: 'iOS, Android, Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    license: 'https://www.apache.org/licenses/LICENSE-2.0',
    isAccessibleForFree: true,
    softwareHelp: { '@type': 'CreativeWork', url: `${SITE.docs}/` },
    downloadUrl: SITE.github,
    author: { '@id': ORG_ID },
    featureList: [
      'Passwordless sign-in approved on the phone with Face ID or a fingerprint',
      'Standard OpenID Connect provider with PKCE; no proprietary SDK required',
      'Step-up approval that shows the exact action being signed',
      'Per-site identifiers; no email, name, or phone number shared with sites',
      'Nearby sign-in over Bluetooth, QR code, or push notification',
      '24-word recovery phrase; keys never leave the device',
    ],
  };
}

export interface WebPageInput {
  url: string;
  title: string;
  description: string;
  type?: 'WebPage' | 'FAQPage' | 'AboutPage' | 'ContactPage' | 'CollectionPage';
}

export function webPage(input: WebPageInput): JsonLd {
  return {
    '@type': input.type ?? 'WebPage',
    '@id': `${input.url}#webpage`,
    url: input.url,
    name: input.title,
    description: input.description,
    isPartOf: { '@id': SITE_ID },
    about: { '@id': APP_ID },
    inLanguage: 'en',
  };
}

export interface Faq {
  question: string;
  answer: string;
}

export function faqPage(url: string, faqs: readonly Faq[]): JsonLd {
  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    url,
    isPartOf: { '@id': SITE_ID },
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

export interface ArticleInput {
  url: string;
  title: string;
  description: string;
  published: Date;
  author: string;
  image?: string;
}

export function blogPosting(input: ArticleInput): JsonLd {
  const authorIsOrg = input.author === SITE.name;
  return {
    '@type': 'BlogPosting',
    '@id': `${input.url}#article`,
    mainEntityOfPage: input.url,
    url: input.url,
    headline: input.title,
    description: input.description,
    datePublished: input.published.toISOString(),
    dateModified: input.published.toISOString(),
    author: authorIsOrg ? { '@id': ORG_ID } : { '@type': 'Person', name: input.author },
    publisher: { '@id': ORG_ID },
    image: input.image ?? `${SITE.url}/og.png`,
    isPartOf: { '@id': SITE_ID },
    inLanguage: 'en',
  };
}

export function breadcrumbs(items: readonly { name: string; url: string }[]): JsonLd {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** One @graph per page: the site-wide nodes plus whatever the page adds. */
export function graph(nodes: readonly JsonLd[]): JsonLd {
  return { '@context': 'https://schema.org', '@graph': [organization(), website(), ...nodes] };
}

/** Serialise for an inline <script type="application/ld+json">; `</script>` cannot break out. */
export function jsonLd(data: JsonLd): string {
  return JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
}
