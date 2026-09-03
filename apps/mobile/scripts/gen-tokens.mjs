// Regenerate apps/mobile/src/theme/tokens.js from packages/ui/src/tokens.css (oklch -> sRGB hex).
import { readFileSync, writeFileSync } from 'node:fs';

const css = readFileSync(new URL('../../../packages/ui/src/tokens.css', import.meta.url), 'utf8');

function oklchToHex(L, C, h) {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3,
    m = m_ ** 3,
    s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const gam = (x) => {
    x = Math.min(1, Math.max(0, x));
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  };
  const to = (x) =>
    Math.round(gam(x) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(bb)}`;
}

function parseBlock(text) {
  const out = {};
  for (const m of text.matchAll(
    /--color-([a-z0-9-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g,
  )) {
    out[m[1]] = oklchToHex(+m[2], +m[3], +m[4]);
  }
  return out;
}

const themeBlock = css.slice(css.indexOf('@theme {'), css.indexOf('/* shadcn semantic aliases'));
const darkStart = css.indexOf(":root[data-theme='dark'] {");
const darkBlock = css.slice(darkStart, css.indexOf('color-scheme: dark;', darkStart));
const light = parseBlock(themeBlock);
const dark = parseBlock(darkBlock);

const fmt = (obj) =>
  Object.entries(obj)
    .map(([k, v]) => `  ${/^[a-z]+$/.test(k) ? k : `'${k}'`}: '${v}',`)
    .join('\n');

const js = `/**
 * Mirrored copy of packages/ui/src/tokens.css for React Native (NativeWind needs sRGB hex).
 * Generated from the oklch values there; do not hand-edit. Regenerate with
 * \`node scripts/gen-tokens.mjs\` from apps/mobile after a token changes in packages/ui.
 * Keep the names identical to the CSS custom properties minus the \`--color-\` prefix.
 * Dark values are exposed as \`<name>-dark\` so classes can use \`bg-surface-0 dark:bg-surface-0-dark\`.
 */
const light = {
${fmt(light)}
};

const dark = {
${fmt(dark)}
};

const colors = { ...light };
for (const [k, v] of Object.entries(dark)) colors[\`\${k}-dark\`] = v;

const radius = { sm: 6, md: 8, lg: 12, xl: 16 };

const tokens = { light, dark, colors, radius };

module.exports = { tokens, light, dark };
`;
writeFileSync(new URL('../src/theme/tokens.js', import.meta.url), js);
console.info(
  Object.keys(light).length,
  'light,',
  Object.keys(dark).length,
  'dark; accent',
  light.accent,
  dark.accent,
);
