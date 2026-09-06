/**
 * The one conceptual model every page descends from. Copy that appears on more than one page
 * lives here so the sites cannot drift: home, /accountless, /authorization, the FAQ, and
 * llms.txt all quote these strings.
 */
import type { IconName } from './icons';

export const CATEGORY = 'Accountless identity';

/** The definition, in the words used everywhere. */
export const DEFINITION =
  'Accountless identity means there is no identity-provider account to create, protect, reset, or breach. The person’s phone holds a cryptographic identity, their biometric unlocks it, and every application receives a standard OpenID Connect assertion.';

/** The objection a technical reader raises first, answered in one breath. */
export const CLARIFICATION =
  'Accountless does not mean an application cannot keep user data. It means the identity does not depend on a credential account at a provider. Your app still stores whatever it needs under the per-site identifier it receives; nothing at Identizen can sign in as the user.';

export const VERBS: { verb: string; quote: string; text: string; href: string; icon: IconName }[] =
  [
    {
      verb: 'Authenticate',
      quote: 'I am this identity.',
      text: 'Sign people into your app without a password or a provider account. Your app receives a standard OIDC id_token with a per-site identifier.',
      href: 'https://docs.identizen.com/quickstart/',
      icon: 'key',
    },
    {
      verb: 'Verify',
      quote: 'It is really me, right now.',
      text: 'Ask the phone for a fresh biometric approval when a session needs more assurance: a new country, a sensitive page, an admin console.',
      href: 'https://docs.identizen.com/add-mfa/',
      icon: 'fingerprint',
    },
    {
      verb: 'Authorize',
      quote: 'I approve this specific action.',
      text: 'Send the exact action to the phone. The person reads it, approves it, and the signature is bound to that text, so it cannot be reused for anything else.',
      href: '/authorization',
      icon: 'shield',
    },
  ];

/** Two stacks, side by side. The index is in the picture on purpose. */
export const TRADITIONAL_STACK = [
  { node: 'You', note: '' },
  { node: 'Identity-provider account', note: 'a record someone else owns' },
  { node: 'Password, passkey, or MFA', note: 'credentials that protect that record' },
  { node: 'Identity provider', note: 'holds the credential database' },
  { node: 'Application', note: '' },
];

export const IDENTIZEN_STACK = [
  { node: 'You', note: '' },
  { node: 'Your phone', note: 'holds the cryptographic identity' },
  { node: 'Your biometric', note: 'unlocks it for one request' },
  { node: 'Index', note: 'routes and verifies; stores no secrets' },
  { node: 'Application', note: 'receives standard OIDC' },
];

/** Concrete things a person can be asked to approve. Real product surfaces, not hypotheticals. */
export const APPROVAL_EXAMPLES = [
  'Approve wire of $82,419.00 to Acme Manufacturing?',
  'Deploy commit 18acb21 to production?',
  'Grant Global Administrator to jordan@example.com?',
  'Release this medical record to Dr. Okafor?',
  'Let the purchasing agent buy 500 units from Vendor X for $14,200?',
];
