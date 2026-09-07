import type { Faq } from './seo';

/**
 * Answers written to be quoted whole: one direct answer per question, plain words, facts that
 * match the docs. Rendered on /faq and emitted as FAQPage structured data.
 */
export const FAQ_GROUPS: readonly { heading: string; items: readonly Faq[] }[] = [
  {
    heading: 'What it is',
    items: [
      {
        question: 'What does accountless identity mean?',
        answer:
          'It means there is no identity-provider account to create, protect, reset, or breach. The person’s phone holds a cryptographic identity, their biometric unlocks it for one request, and every application receives a standard OpenID Connect assertion with its own per-site identifier. Applications can still keep whatever user data they need under that identifier; what does not exist is a credential account at a provider that could sign in as the person.',
      },
      {
        question: 'What is Identizen?',
        answer:
          'Identizen is accountless identity, open source. A private key is created on the user’s phone and never leaves it. Websites integrate Identizen as a standard OpenID Connect provider, and each sign-in is a signature the user approves on the phone with Face ID or a fingerprint. There is no password, no email address, and no Google or Microsoft account involved.',
      },
      {
        question: 'How is Identizen different from passkeys?',
        answer:
          'Both replace passwords with device-held keys. Passkeys are synced through Apple, Google, or a password manager and tie a site to a browser or platform account. Identizen keeps one identity on the phone, uses it from any browser through a QR code, push notification, or Bluetooth, gives every site its own identifier, and lets the site ask the user to approve a specific action such as a wire transfer with the details shown on the phone. It is also an OpenID Connect provider, so a site adds it the way it would add any social login.',
      },
      {
        question: 'Is Identizen an authenticator app like Google Authenticator or Duo?',
        answer:
          'No. Authenticator apps produce a second factor on top of a password. Identizen is the whole login: there is no password to add a factor to. The phone signs a challenge that includes the site, the browser, and the action, so the approval cannot be phished or replayed on another site.',
      },
      {
        question: 'What does the user see when they sign in?',
        answer:
          'On a computer, the site shows a QR code and a two-digit match code. The user scans it with the Identizen app, sees the site name and the same two digits, and approves with Face ID or a fingerprint. After the first sign-in from a browser, later sign-ins arrive on the phone as a notification, with no QR. On a computer with Bluetooth, the site can find the phone nearby and skip the QR as well. On the phone itself, the site opens the app directly.',
      },
    ],
  },
  {
    heading: 'For developers',
    items: [
      {
        question: 'How do I add Identizen to my website?',
        answer:
          'Register a client and add a standard OpenID Connect login with PKCE, pointing at the hosted index at index.identizen.com or your own. The @identizen/react package gives you a login button and step-up component, the identizen CLI scaffolds the callback route for Next.js and Express, and any existing OIDC library works too. The quickstart at docs.identizen.com takes about five minutes.',
      },
      {
        question: 'Do I need to run my own server?',
        answer:
          'No. The public index at index.identizen.com is a hosted OpenID Provider that any site can use for free. If you want to control the infrastructure, the index is open source and runs on Cloudflare Workers with Postgres; the self-hosting guide covers it.',
      },
      {
        question: 'What is step-up approval?',
        answer:
          'A request from your server for the user to approve one specific action, such as “Wire $12,000.00 to Acme Supply Co.” The phone shows exactly that text, the user approves it with biometrics, and the signature covers the text, so the approval cannot be reused for a different amount or payee. Your server acts on the result the index returns, and can re-verify the assertion itself.',
      },
      {
        question:
          'How do I link an accountless identity to a real user with a name, email, and billing details?',
        answer:
          'Key your user record on the sub claim. It is unique to your site, identical on every phone that holds the identity (a restore from the 24 words yields the same value), and rejected by the index if anyone else tries to use it. A login whose sub is unknown to your database is a sign-up: ask for the name, contact, and billing details your product needs, once, and store them under that sub. Identizen never sees them. The demo bank at jtmerlin.com shows the whole flow with its source.',
      },
      {
        question: 'What does the site learn about the user?',
        answer:
          'A stable identifier that is unique to your site, and nothing else unless the user has set a public handle and your site asks for the handle scope. No email, name, or phone number. The token also carries a session id and a device id, and the device id is derived per site like the identifier. Your app decides what profile data to ask for after sign-in.',
      },
      {
        question: 'What does Identizen cost?',
        answer:
          'The protocol, apps, SDKs, and the hosted public index are free and Apache-2.0 licensed. An enterprise tier, in development, will add a hosted organisation index, a fleet console, SSO bridging, audit export, and an SLA, priced per active device. Talk to us for early access.',
      },
    ],
  },
  {
    heading: 'Security and recovery',
    items: [
      {
        question: 'Can Identizen approve actions taken by an AI agent?',
        answer:
          'Yes, with the same Verification API used for wire transfers. When an agent reaches a boundary the application defines, the application’s server composes the exact action text, Identizen pushes it to the owner’s phone, and the agent continues only if a signed biometric approval comes back. The agent never writes the text and never sees a button it could press itself.',
      },
      {
        question: 'What happens if the user loses their phone?',
        answer:
          'They restore the identity on a new phone from the 24-word recovery phrase shown when it was created, and revoke the lost phone from the dashboard at app.identizen.com or from another device. Revoking signs the lost phone out of every site and unpairs every browser it had paired.',
      },
      {
        question: 'What does the Identizen index store?',
        answer:
          'Public keys, a push token, a Bluetooth key that only the index can resolve, the per-site identifiers, an audit trail of approvals and revocations and, for paired browsers, a public key plus the browser’s user-agent and last IP. It never stores private keys, recovery phrases, passwords, emails, or anything that could sign in as the user. The index cannot approve a login on its own.',
      },
      {
        question: 'Is Identizen resistant to phishing?',
        answer:
          'Yes. The phone signs the site’s registered identifier, the browser session, and the action, and shows a match code that the browser also shows. A look-alike site cannot present a request for the real site, and an approval captured on one site is useless on another.',
      },
      {
        question: 'Which phones are supported?',
        answer:
          'iPhones with Face ID or Touch ID on a current iOS, and Android phones with a fingerprint or face unlock and a screen lock set. Nearby sign-in over Bluetooth needs a phone that can advertise as a Bluetooth peripheral, which most phones from the last few years can.',
      },
    ],
  },
];

export const FAQS: readonly Faq[] = FAQ_GROUPS.flatMap((g) => g.items);
