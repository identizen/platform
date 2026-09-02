/**
 * Deep links: `https://app.identizen.com/l/<id>` (universal / app link) and `identizen://l/<id>`.
 * expo-router maps both to the `app/l/[id].tsx` route via the `scheme` and associated domains in
 * app.json; this module only parses and opens.
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
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

/** After approval the site's OIDC callback continues in the system browser. */
export async function openRedirect(redirect: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(redirect);
  } catch {
    await Linking.openURL(redirect);
  }
}
