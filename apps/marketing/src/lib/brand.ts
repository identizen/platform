import lockup from '@identizen/ui/brand/identizen-lockup.svg?raw';
import lockupSeal from '@identizen/ui/brand/identizen-lockup-seal.svg?raw';
import wordmark from '@identizen/ui/brand/identizen-wordmark.svg?raw';
import wordmarkPlain from '@identizen/ui/brand/identizen-wordmark-plain.svg?raw';
import mark from '@identizen/ui/brand/kimi-mark.svg?raw';
import markRedBox from '@identizen/ui/brand/kimi-mark-red-kuchi.svg?raw';
import seal from '@identizen/ui/brand/kimi-seal.svg?raw';
import sealInk from '@identizen/ui/brand/kimi-seal-ink.svg?raw';
import markBrush from '@identizen/ui/brand/alt/kimi-mark-brush.svg?raw';
import markDisplay from '@identizen/ui/brand/alt/kimi-mark-display.svg?raw';

/** Hanko vermilion, the one red in the identity. */
export const BRAND_RED = '#E0412E';

export interface BrandAsset {
  /** File name served at `/brand/<file>` and downloaded as-is. */
  file: string;
  name: string;
  use: string;
  svg: string;
  /** Background the asset is designed for, used when previewing it. */
  ground: 'paper' | 'sumi' | 'any';
}

/** Every downloadable asset, in the order the brand page lists them. */
export const BRAND_ASSETS: readonly BrandAsset[] = [
  {
    file: 'identizen-lockup.svg',
    name: 'Logo',
    use: 'Ink mark and wordmark with the red dot. Uses currentColor, so it inverts with the theme.',
    svg: lockup,
    ground: 'any',
  },
  {
    file: 'identizen-lockup-seal.svg',
    name: 'Logo, seal',
    use: 'Red seal with the plain wordmark, for places where the mark must be an object.',
    svg: lockupSeal,
    ground: 'any',
  },
  {
    file: 'identizen-wordmark.svg',
    name: 'Wordmark',
    use: 'Bricolage Grotesque SemiBold, outlined. The first i carries the seal.',
    svg: wordmark,
    ground: 'any',
  },
  {
    file: 'identizen-wordmark-plain.svg',
    name: 'Wordmark, plain',
    use: 'Single color. Pair with the red seal.',
    svg: wordmarkPlain,
    ground: 'any',
  },
  {
    file: 'kimi-mark.svg',
    name: 'Mark',
    use: '君 alone in currentColor. Headers, favicons on plain grounds, watermarks.',
    svg: mark,
    ground: 'any',
  },
  {
    file: 'kimi-mark-red-kuchi.svg',
    name: 'Mark, red box',
    use: 'The 口 box in vermilion. Strong alone; not for use next to the wordmark.',
    svg: markRedBox,
    ground: 'any',
  },
  {
    file: 'kimi-seal.svg',
    name: 'Seal',
    use: 'App icon, favicon, avatar.',
    svg: seal,
    ground: 'any',
  },
  {
    file: 'kimi-seal-ink.svg',
    name: 'Seal, ink',
    use: 'For dark grounds where red would shout.',
    svg: sealInk,
    ground: 'paper',
  },
  {
    file: 'alt/kimi-mark-brush.svg',
    name: 'Mark, brush',
    use: 'A shodō cut of 君 for print and large formats only.',
    svg: markBrush,
    ground: 'any',
  },
  {
    file: 'alt/kimi-mark-display.svg',
    name: 'Mark, display',
    use: 'Heavy cut for merchandise and stickers.',
    svg: markDisplay,
    ground: 'any',
  },
];

/** Inline an asset at a given pixel height, keeping its aspect ratio. */
export function inlineSvg(svg: string, height: number, className?: string): string {
  // Only the root tag loses its intrinsic size; inner rects keep theirs.
  const open = /<svg[^>]*>/.exec(svg)?.[0];
  if (!open) throw new Error('inlineSvg: not an SVG document');
  const sized = open
    .replace(/\s(width|height)="[^"]*"/g, '')
    .replace('<svg ', `<svg height="${height}" ${className ? `class="${className}" ` : ''}`);
  return svg.replace(open, sized);
}

export const brandFileNames = (): string[] => BRAND_ASSETS.map((a) => a.file);
