import { AUTH_SOURCE } from '@/features/auth';
import { CodeBlock } from '@/components/shared/code-block';
import { DocsLayout, P, Step } from '../components/docs-layout';

const INSTALL = `npm install @identizen/react @identizen/sdk
`;

export function LoginDocsRoute() {
  return (
    <DocsLayout
      title="The login button"
      lede="JT Merlin is a single-page app with no server, so it uses the public PKCE flow from the browser. Three files, shown here as they are in the repository."
    >
      <Step n={1} title="Install two packages">
        <CodeBlock code={INSTALL} terminal />
        <P>
          <code>@identizen/react</code> gives you a provider, a button, and a step-up component.
          <code> @identizen/sdk</code> underneath handles discovery (paired phone, Bluetooth, QR),
          the WebSocket to the index, and the OIDC helpers.
        </P>
      </Step>
      <Step n={2} title="Render the button">
        <P>
          The button starts a login and renders the whole waiting state itself: match code, QR, or
          &quot;sent to your phone&quot; when this browser is already paired. When the phone
          approves, the index returns an OIDC redirect and the button follows it. The only work here
          is preparing PKCE.
        </P>
        <CodeBlock
          code={AUTH_SOURCE.loginComponent}
          title="src/features/auth/components/identizen-login.tsx"
        />
      </Step>
      <Step n={3} title="Finish the sign-in on /callback">
        <P>
          Exchange the code at the index&apos;s <code>/token</code> endpoint with the PKCE verifier,
          check <code>state</code> and <code>nonce</code>, keep the claims. It runs once per
          callback URL even if React mounts the route twice.
        </P>
        <CodeBlock
          code={AUTH_SOURCE.callback}
          title="src/features/auth/routes/callback-route.tsx"
        />
        <CodeBlock code={AUTH_SOURCE.oidc} title="src/features/auth/api/oidc.ts" />
      </Step>
      <Step n={4} title="What the site now knows">
        <P>
          <code>sub</code>, a stable identifier that is different for every site the person uses.{' '}
          <code>acr</code>, whether this was a plain login or a step-up. <code>amr</code>, how the
          phone authenticated them. <code>sid</code>, for back-channel logout when the person
          revokes the session from their phone. No email, no name, no phone number.
        </P>
      </Step>
    </DocsLayout>
  );
}
