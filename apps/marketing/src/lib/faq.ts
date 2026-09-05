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
        question: 'What is Identizen?',
        answer:
          'Identizen is an open-source, device-based login system. A private key is created on the user’s phone and never leaves it. Websites integrate Identizen as a standard OpenID Connect provider, and each sign-in is a signature the user approves on the phone with Face ID or a fingerprint. There is no password, no email address, and no Google or Microsoft account involved.',
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
          'A request from your server for the user to approve one specific action, such as “Wire $12,000.00 to Acme Supply Co.” The phone shows exactly that text, the user approves it with biometrics, and the signature covers the text, so the approval cannot be reused for a different amount or payee. Your server verifies the signed result before acting.',
      },
      {
        question: 'What does the site learn about the user?',
        answer:
          'A stable identifier that is unique to your site, and nothing else unless the user chooses to share a public handle. No email, name, phone number, or identifiers that other sites could correlate. Your app decides what profile data to ask for after sign-in.',
      },
      {
        question: 'What does Identizen cost?',
        answer:
          'The protocol, apps, SDKs, and the hosted public index are free and Apache-2.0 licensed. An enterprise tier adds a hosted organisation index, a fleet console, SSO bridging, audit export, and an SLA, priced per active device.',
      },
    ],
  },
  {
    heading: 'Security and recovery',
    items: [
      {
        question: 'What happens if the user loses their phone?',
        answer:
          'They restore the identity on a new phone from the 24-word recovery phrase shown when it was created, and revoke the lost phone from the dashboard at app.identizen.com or from another device. Revoking signs the lost phone out of every site and unpairs every browser it had paired.',
      },
      {
        question: 'What does the Identizen index store?',
        answer:
          'Public keys, a push token, a Bluetooth key that only the index can resolve, the per-site identifiers, and an audit trail of approvals and revocations. It never stores private keys, recovery phrases, passwords, emails, or anything that could sign in as the user. The index cannot approve a login on its own.',
      },
      {
        question: 'Is Identizen resistant to phishing?',
        answer:
          'Yes. The phone signs the site’s registered identifier, the browser session, and the action, and shows a match code that the browser also shows. A look-alike site cannot present a request for the real site, and an approval captured on one site is useless on another.',
      },
      {
        question: 'Which phones are supported?',
        answer:
          'iOS 16 and later with Face ID or Touch ID, and Android 10 and later with a fingerprint or face unlock. Nearby sign-in over Bluetooth needs a phone that can advertise as a Bluetooth peripheral, which most phones from the last few years can.',
      },
    ],
  },
];

export const FAQS: readonly Faq[] = FAQ_GROUPS.flatMap((g) => g.items);
