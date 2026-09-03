import { CodeBlock } from '@/components/shared/code-block';
import { DocsLayout, P, Step } from '../components/docs-layout';

const CREATE = `# A fresh Next.js app, then let the CLI register it and scaffold the auth routes.
npx create-next-app@latest my-bank --ts --app --use-npm
cd my-bank
npx identizen init --index https://index.identizen.com
npm install
`;

const INIT_OUTPUT = `# What \`identizen init\` did:
#   registered "my-bank" with https://index.identizen.com
#   wrote IDENTIZEN_INDEX_URL, IDENTIZEN_CLIENT_ID, IDENTIZEN_CLIENT_SECRET to .env.local
#   created app/api/auth/login/route.ts, callback/route.ts, logout/route.ts,
#           app/api/auth/backchannel-logout/route.ts, lib/identizen.ts
`;

const BUTTON = `// app/page.tsx
export default function Home() {
  return (
    <main>
      <a href="/api/auth/login">Continue with Identizen</a>
    </main>
  );
}
`;

const SESSION = `// app/dashboard/page.tsx
import { getIdentizenSession } from '@/lib/identizen';

export default async function Dashboard() {
  const session = await getIdentizenSession();
  if (!session) redirect('/api/auth/login');
  // session.sub  stable per-site id      session.acr  'idz:login' | 'idz:mfa'
  // session.sid  for back-channel logout session.amr  ['face', 'hwk'] ...
  return <h1>Hello, {session.sub.slice(0, 8)}</h1>;
}
`;

const FAKE_PHONE = `# No iPhone handy? Run a fake phone that approves sign-ins. It polls the index's inbox,
# so it works against the hosted index with no inbound connectivity.
npx identizen dev --index https://index.identizen.com
# manual approve/deny in the browser instead of auto-approve:
npx identizen dev --index https://index.identizen.com --policy manual
`;

const RUN = `npm run dev
# open http://localhost:3000, click Continue with Identizen, approve on the phone (or the fake one)
`;

export function QuickstartRoute() {
  return (
    <DocsLayout
      title="Quickstart: a working login in five minutes"
      lede="The fastest path is a server-rendered app and the CLI. It registers your site, writes the environment, and scaffolds the four auth routes. JT Merlin itself is a single-page app; the next pages show that path."
    >
      <Step n={1} title="Create the app and register it">
        <CodeBlock code={CREATE} terminal />
        <CodeBlock code={INIT_OUTPUT} terminal title="what happened" />
        <P>
          One command, one registration. The client id identifies your site to the index; the secret
          stays on your server and is only used for the token exchange.
        </P>
      </Step>
      <Step n={2} title="Add the button">
        <CodeBlock code={BUTTON} title="app/page.tsx" />
        <P>
          That link is the whole integration. The login route redirects to the index&apos;s{' '}
          <code>/authorize</code> with PKCE; the callback exchanges the code and sets a signed
          session cookie.
        </P>
      </Step>
      <Step n={3} title="Run a phone">
        <CodeBlock code={FAKE_PHONE} terminal />
        <P>
          With a real iPhone, install the Identizen app instead. Either way the login page shows a
          two-digit match code, the phone shows the same one, and the person approves.
        </P>
      </Step>
      <Step n={4} title="Log in">
        <CodeBlock code={RUN} terminal />
      </Step>
      <Step n={5} title="Read the session">
        <CodeBlock code={SESSION} title="app/dashboard/page.tsx" />
        <P>
          There is no email in the token. The site gets a stable, per-site identifier and how the
          person authenticated. If your app needs an email, ask for it after login like any app.
        </P>
      </Step>
    </DocsLayout>
  );
}
