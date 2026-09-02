import { describe, expect, it } from 'vitest';
import { BRAND_ASSETS, BRAND_RED, brandFileNames, inlineSvg } from './brand';

describe('brand assets', () => {
  it('ships every asset as a real SVG with a unique file name', () => {
    const names = brandFileNames();
    expect(new Set(names).size).toBe(names.length);
    for (const a of BRAND_ASSETS) {
      expect(a.svg.startsWith('<svg')).toBe(true);
      expect(a.svg).toContain('viewBox=');
    }
  });

  it('uses the brand red exactly once in the default logo', () => {
    const logo = BRAND_ASSETS.find((a) => a.file === 'identizen-lockup.svg');
    expect(logo?.svg.split(BRAND_RED).length).toBe(2);
    expect(logo?.svg).toContain('currentColor');
  });

  it('resizes only the root element when inlining', () => {
    const seal = BRAND_ASSETS.find((a) => a.file === 'kimi-seal.svg');
    const html = inlineSvg(seal!.svg, 32, 'shrink-0');
    expect(html.startsWith('<svg height="32" class="shrink-0" ')).toBe(true);
    expect(html).not.toMatch(/<svg[^>]*\swidth=/);
    // the seal background and the 口 box keep their geometry
    expect(html).toContain('<rect width="100" height="100" rx="24"');
    expect(html).toMatch(/<rect x="35" y="61" width="42" height="31"/);
  });
});
