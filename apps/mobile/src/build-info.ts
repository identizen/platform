/**
 * Build stamp. Written by scripts/build-info.mjs during EAS builds; the committed version holds
 * nulls so local runs show "development build". Do not hand-edit.
 */
export interface BuildInfo {
  builtAt: string | null;
  commit: string | null;
  profile: string | null;
  buildId: string | null;
}

export const BUILD_INFO: BuildInfo = {
  builtAt: null,
  commit: null,
  profile: null,
  buildId: null,
};
