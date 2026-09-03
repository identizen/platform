import { CodeBlock } from '@/components/shared/code-block';
import { CLIENT_ID, INDEX_URL } from '@/lib/config';
import { DocsLayout, P, Step } from '../components/docs-layout';

const CLI = `npx identizen register-site \\
  --index https://index.identizen.com \\
  --name "JT Merlin Bank" \\
  --rp-id jtmerlin.com \\
  --redirect-uri https://jtmerlin.com/callback
`;

const CURL = `# The CLI is a thin wrapper over one call. A public (PKCE-only) client gets no secret,
# which is what a single-page app like this one needs.
curl -X POST https://index.identizen.com/sites \\
  -H 'content-type: application/json' \\
  -d '{
    "name": "JT Merlin Bank (demo)",
    "rp_id": "jtmerlin.com",
    "redirect_uris": ["https://jtmerlin.com/callback"],
    "public": true
  }'
`;

const RESPONSE = `{
  "client_id": "${CLIENT_ID}",
  "client_secret": null,
  "rp_id": "jtmerlin.com",
  "name": "JT Merlin Bank (demo)",
  "redirect_uris": ["https://jtmerlin.com/callback"]
}
`;

const ENV = `# .env.production (committed: both values are public)
VITE_IDENTIZEN_INDEX_URL=${INDEX_URL}
VITE_IDENTIZEN_CLIENT_ID=${CLIENT_ID}
`;

const PROVIDER = `// src/main.tsx
import { IdentizenProvider } from '@identizen/react';

<IdentizenProvider indexUrl={INDEX_URL} clientId={CLIENT_ID}>
  <App />
</IdentizenProvider>
`;

export function RegisterRoute() {
  return (
    <DocsLayout
      title="Register your site"
      lede="A site is a name, an rp_id (the origin the phone will show and sign), and the callback URLs. That is the entire configuration. This is the exact registration this demo uses."
    >
      <Step n={1} title="Register with the CLI">
        <CodeBlock code={CLI} terminal />
      </Step>
      <Step n={2} title="Or with one HTTP call">
        <CodeBlock code={CURL} terminal />
        <CodeBlock code={RESPONSE} title="response" />
        <P>
          <code>rp_id</code> is what the phone displays under the site name and what every approval
          is bound to. A phishing site on another origin cannot reuse a JT Merlin approval, even one
          the person was tricked into giving.
        </P>
      </Step>
      <Step n={3} title="Put the two values in your app">
        <CodeBlock code={ENV} title=".env.production" />
        <CodeBlock code={PROVIDER} title="src/main.tsx" />
        <P>
          Server-rendered apps keep the client secret on the server and use the confidential flow
          instead. The <code>identizen init</code> scaffold does that for you.
        </P>
      </Step>
    </DocsLayout>
  );
}
