import { sha256, toBase64Url, utf8Encode } from '@identizen/protocol';

/**
 * The device identifier a site sees (`idz_device` in the id_token and at `/userinfo`) is derived
 * per site, like `sub`, so two sites cannot match a phone by comparing it (PROTOCOL.md §5):
 *
 *   idz_device = "dev_" + base64url(SHA-256("identizen/v1/pairwise-device\n" + rp_id + "\n" + device_id))[0:26]
 *
 * The index-side `device_id` never leaves the index through OIDC. (A Verification API result
 * carries the phone's signed assertion, whose `device_id` is the real one; that is documented.)
 */
export function pairwiseDeviceId(rpId: string, deviceId: string): string {
  const digest = sha256(utf8Encode(`identizen/v1/pairwise-device\n${rpId}\n${deviceId}`));
  return `dev_${toBase64Url(digest).slice(0, 26)}`;
}
