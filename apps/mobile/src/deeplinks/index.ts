/**
 * Deep links: `https://app.identizen.com/l/<id>` (universal / app link) and `identizen://l/<id>`.
 * expo-router maps both to the `app/l/[id].tsx` route via the `scheme` and associated domains in
 * app.json; this module only parses and opens.
 */
import * as Linking from 'expo-linking';
import { parseChallengeId } from '../challenges/receive';

export { parseChallengeId };

export function challengeIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = Linking.parse(url);
    const path = parsed.path ?? '';
    return parseChallengeId(path) ?? parseChallengeId(url);
  } catch {
    return parseChallengeId(url);
  }
}
