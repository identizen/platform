/**
 * recipient_hash for Fromenance registrations, from the docs sample (samples/recipient-hash.ts).
 *
 *   recipient_hash = "hmac-sha256:" + hex( HMAC-SHA256( key = tenant HMAC secret,
 *                                                        message = canonical(address) ) )
 *   canonical(address): trim, keep only the part inside <> when a display name is present,
 *                       lowercase, strip a leading "mailto:"
 *
 * The raw address never leaves this process.
 */

export function canonicalAddress(input: string): string {
  let s = input.trim();
  const angle = /<([^>]+)>/.exec(s);
  if (angle?.[1]) s = angle[1];
  s = s.trim().toLowerCase();
  s = s.replace(/^mailto:/, '');
  return s;
}

export async function recipientHash(address: string, tenantSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(tenantSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(canonicalAddress(address)),
  );
  let hex = '';
  for (const b of new Uint8Array(sig)) hex += b.toString(16).padStart(2, '0');
  return `hmac-sha256:${hex}`;
}
