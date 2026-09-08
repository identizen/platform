/**
 * Deep links: `https://app.identizen.com/l/<id>` (universal / app link) and `identizen://l/<id>`
 * open a sign-in request, optionally with `?index=<issuer>` naming the index that issued it;
 * `identizen://enroll?index=…&token=…` (and `https://…/enroll?…`) opens org enrollment.
 * expo-router maps both to `app/l/[id].tsx` / `app/enroll.tsx` via the `scheme` and associated
 * domains in app.json; this module only parses.
 */
import * as Linking from 'expo-linking';
import { parseChallengeId, parseChallengeLink, type ChallengeLink } from '../challenges/receive';
import { parseEnrollmentLink, type EnrollmentLink } from '../enrollment/links';

export { parseChallengeId, parseChallengeLink, parseEnrollmentLink };
export type { ChallengeLink, EnrollmentLink };

export function challengeIdFromUrl(url: string | null | undefined): string | null {
  return challengeLinkFromUrl(url)?.id ?? null;
}

/** The challenge id and, when the link names it, the issuing index. */
export function challengeLinkFromUrl(url: string | null | undefined): ChallengeLink | null {
  if (!url) return null;
  try {
    const parsed = Linking.parse(url);
    const path = parsed.path ?? '';
    const id = parseChallengeId(path) ?? parseChallengeId(url);
    if (!id) return null;
    return parseChallengeLink(url) ?? { id, index: null };
  } catch {
    return parseChallengeLink(url);
  }
}

export function enrollmentFromUrl(url: string | null | undefined): EnrollmentLink | null {
  return parseEnrollmentLink(url);
}
