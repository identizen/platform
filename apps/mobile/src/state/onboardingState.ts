/**
 * The 24 words travel between the passphrase and verify routes in memory only (never in route
 * params, never persisted outside the keychain). Cleared as soon as verification succeeds.
 */
let words: string[] | null = null;

export const onboardingState = {
  set(mnemonic: string): void {
    words = mnemonic.split(' ');
  },
  get(): string[] | null {
    return words;
  },
  clear(): void {
    words = null;
  },
};
