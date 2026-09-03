// Regenerate src/components/brand.tsx from packages/ui/brand so the mobile app never carries a
// hand-copied logo. Run from apps/mobile: `node scripts/gen-brand.mjs`.
import { readFileSync, writeFileSync } from 'node:fs';

const brand = (f) =>
  readFileSync(new URL(`../../../packages/ui/brand/${f}`, import.meta.url), 'utf8');

const wordmark = brand('identizen-wordmark.svg');
const viewBox = /viewBox="([^"]+)"/.exec(wordmark)[1];
const [, , vw, vh] = viewBox.split(' ').map(Number);
const path = /<path[^>]*\sd="([^"]+)"/.exec(wordmark)[1];
const transform = /<path[^>]*transform="([^"]+)"/.exec(wordmark)[1];
const dot = /<circle[^>]*cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/.exec(wordmark);
const hanko = /fill="(#[0-9A-Fa-f]{6})"/.exec(wordmark.slice(wordmark.indexOf('<circle')))[1];

const markPaths = [...brand('kimi-mark.svg').matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
const markRect = /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" rx="([^"]+)"/.exec(
  brand('kimi-mark.svg'),
);

const tsx = `/**
 * Brand marks for the mobile app, generated from packages/ui/brand by scripts/gen-brand.mjs.
 * Do not hand-edit. The mark is 君 (kimi, "you"); the wordmark is outlined Bricolage Grotesque.
 * Rule from the brand README: the hanko red appears once per composition, on the seal or the
 * first i's dot, never both.
 */
import { useColorScheme } from 'nativewind';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { tokens } from '../theme/tokens';

export const HANKO_RED = '${hanko}';
export const PAPER = '#FAFAF7';

export type BrandTone = 'fg' | 'accent' | 'muted' | 'paper';

/** Resolve a brand tone to a hex from the token mirror for the active scheme. */
export function useBrandColor(tone: BrandTone): string {
  const { colorScheme } = useColorScheme();
  const set = colorScheme === 'dark' ? tokens.dark : tokens.light;
  if (tone === 'paper') return PAPER;
  if (tone === 'accent') return set.accent;
  if (tone === 'muted') return set['fg-muted'];
  return set.fg;
}

const MARK_PATHS = ${JSON.stringify(markPaths)};
const MARK_RECT = { x: ${markRect[1]}, y: ${markRect[2]}, width: ${markRect[3]}, height: ${markRect[4]}, rx: ${markRect[5]} };

/** The 君 mark, monoline, in one color. Minimum 16 px. */
export function Mark({ size = 24, tone = 'fg', color }: { size?: number; tone?: BrandTone; color?: string }) {
  const toneColor = useBrandColor(tone);
  const stroke = color ?? toneColor;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Identizen">
      {MARK_PATHS.map((d) => (
        <Path key={d} d={d} stroke={stroke} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ))}
      <Rect {...MARK_RECT} stroke={stroke} strokeWidth={8} strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** The red seal: hanko square with the paper glyph. App icon, onboarding hero. */
export function Seal({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Identizen">
      <Rect width={100} height={100} rx={24} fill={HANKO_RED} />
      {MARK_PATHS.map((d) => (
        <Path key={d} d={d} stroke={PAPER} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" transform="translate(50 50) scale(0.72) translate(-50 -50)" />
      ))}
      <Rect {...MARK_RECT} stroke={PAPER} strokeWidth={8} strokeLinejoin="round" fill="none" transform="translate(50 50) scale(0.72) translate(-50 -50)" />
    </Svg>
  );
}

const WORDMARK_D = ${JSON.stringify(path)};
const WORDMARK_RATIO = ${vw} / ${vh};

/** "identizen" with the red dot on the first i. Pair with the ink mark, never with the seal. */
export function Wordmark({ height = 22, tone = 'fg', dot = true }: { height?: number; tone?: BrandTone; dot?: boolean }) {
  const fill = useBrandColor(tone);
  return (
    <Svg width={height * WORDMARK_RATIO} height={height} viewBox="${viewBox}" accessibilityLabel="identizen">
      <Path d={WORDMARK_D} fill={fill} transform="${transform}" />
      {dot ? <Circle cx={${dot[1]}} cy={${dot[2]}} r={${dot[3]}} fill={HANKO_RED} /> : null}
    </Svg>
  );
}

/** Horizontal lockup: ink mark + wordmark with the red dot. Default header brand. */
export function Lockup({ height = 22, tone = 'fg' }: { height?: number; tone?: BrandTone }) {
  return (
    <View className="flex-row items-center" style={{ gap: height * 0.45 }} accessibilityRole="header">
      <Mark size={height * 1.15} tone={tone} />
      <Wordmark height={height} tone={tone} />
    </View>
  );
}
`;
writeFileSync(new URL('../src/components/brand.tsx', import.meta.url), tsx);
console.info('wrote brand.tsx', markPaths.length, 'mark paths, wordmark', path.length, 'chars');
