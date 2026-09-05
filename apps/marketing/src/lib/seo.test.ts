import { describe, expect, it } from 'vitest';
import { FAQS } from './faq';
import { blogPosting, faqPage, graph, jsonLd, organization, softwareApplication } from './seo';
import { SITE } from './site';

describe('structured data', () => {
  it('builds one graph with the organisation and website first', () => {
    const g = graph([softwareApplication()]);
    expect(g['@context']).toBe('https://schema.org');
    const types = (g['@graph'] as { '@type': string }[]).map((n) => n['@type']);
    expect(types).toEqual(['Organization', 'WebSite', 'SoftwareApplication']);
  });

  it('links nodes by id so crawlers can join them', () => {
    const org = organization();
    const app = softwareApplication();
    expect(app.author).toEqual({ '@id': org['@id'] });
    expect(org.sameAs).toContain(SITE.github);
  });

  it('turns the FAQ list into a FAQPage with every question answered', () => {
    const page = faqPage(`${SITE.url}/faq/`, FAQS);
    const entities = page.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    expect(entities).toHaveLength(FAQS.length);
    for (const e of entities) {
      expect(e.name.endsWith('?')).toBe(true);
      expect(e.acceptedAnswer.text.length).toBeGreaterThan(80);
    }
  });

  it('dates and attributes a blog post', () => {
    const post = blogPosting({
      url: `${SITE.url}/blog/x/`,
      title: 'X',
      description: 'd',
      published: new Date('2026-09-01T00:00:00Z'),
      author: SITE.name,
    });
    expect(post.datePublished).toBe('2026-09-01T00:00:00.000Z');
    expect(post.author).toEqual({ '@id': `${SITE.url}/#organization` });
    expect(post.image).toBe(`${SITE.url}/og.png`);
  });

  it('serialises without a way to close the script tag', () => {
    const out = jsonLd({ '@type': 'Thing', name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out)).toMatchObject({ name: '</script><script>alert(1)</script>' });
  });
});
