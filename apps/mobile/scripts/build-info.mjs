// Stamp the build: EAS runs this from the eas-build-post-install hook, so the binary knows when
// and from which commit it was built. Locally the committed default (nulls) stays in place.
// Run by hand to stamp a local build: `node scripts/build-info.mjs`.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const env = process.env;
let commit = env.EAS_BUILD_GIT_COMMIT_HASH ?? null;
if (!commit) {
  try {
    commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    commit = null;
  }
}

const info = {
  builtAt: new Date().toISOString(),
  commit,
  profile: env.EAS_BUILD_PROFILE ?? null,
  buildId: env.EAS_BUILD_ID ?? null,
};

const src = `/**
 * Build stamp. Written by scripts/build-info.mjs during EAS builds; the committed version holds
 * nulls so local runs show "development build". Do not hand-edit.
 */
export interface BuildInfo {
  builtAt: string | null;
  commit: string | null;
  profile: string | null;
  buildId: string | null;
}

export const BUILD_INFO: BuildInfo = ${JSON.stringify(info, null, 2)};
`;
writeFileSync(new URL('../src/build-info.ts', import.meta.url), src);
console.info(
  `build info: ${info.builtAt} ${info.commit?.slice(0, 7) ?? 'no commit'} ${info.profile ?? ''}`,
);
