/**
 * Deep links: `https://app.identizen.com/l/<id>` (universal / app link) and `identizen://l/<id>`
 * open a sign-in request; `identizen://enroll?index=…&token=…` (and `https://…/enroll?…`) opens
 * org enrollment. expo-router maps both to `app/l/[id].tsx` / `app/enroll.tsx` via the `scheme`
 * and associated domains in app.json; this module only parses.
 */
import * as Linking from 'expo-linking';
import { parseChallengeId } from '../challenges/receive';
import { parseEnrollmentLink, type EnrollmentLink } from '../enrollment/links';

export { parseChallengeId, parseEnrollmentLink };
export type { EnrollmentLink };

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

export function enrollmentFromUrl(url: string | null | undefined): EnrollmentLink | null {
  return parseEnrollmentLink(url);
}
