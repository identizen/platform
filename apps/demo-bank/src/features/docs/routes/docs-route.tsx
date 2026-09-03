import { Link } from '@tanstack/react-router';
import { Button } from '@identizen/ui';
import { DocsLayout, P } from '../components/docs-layout';

const FLOW = [
  ['Browser', 'Starts a login. Shows a two-digit code and a QR, or pushes to a paired phone.'],
  [
    'Index',
    'index.identizen.com. Signs the challenge, relays it, issues OIDC tokens. Stores no secrets.',
  ],
  ['Phone', 'Holds the only private key. Shows the site, the code, the reason. Face ID signs.'],
] as const;

export function DocsRoute() {
  return (
    <DocsLayout
      title="How this demo works"
      lede="JT Merlin is a plain React app. Everything identity-related is two npm packages and one registration call. These pages show the real source of this site, not a simplified copy."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {FLOW.map(([who, what]) => (
          <div key={who} className="rounded-lg border bg-surface-1 p-4">
            <p className="font-semibold">{who}</p>
            <p className="mt-1 text-sm text-fg-muted">{what}</p>
          </div>
        ))}
      </div>
      <P>
        The bank never sees a password and never stores a credential. Login is standard OpenID
        Connect with PKCE: the index is the provider, the site is a relying party. What makes it
        different from a social login is where the key lives and what gets signed: the phone signs a
        challenge that names <code>jtmerlin.com</code>, and for money movement it signs the exact
        text of the transaction.
      </P>
      <div className="rounded-lg border p-5">
        <h2 className="font-semibold">What is real here, and what is not</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
          <li>
            Real: the login, the browser pairing, the push to your phone, the step-up with the
            reason on screen, the signed approval.
          </li>
          <li>
            Real: the site registration on the hosted index, and every line of code on these pages.
          </li>
          <li>
            Not real: JT Merlin, its accounts, balances, payees, and transfers. They are constants
            in the bundle.
          </li>
          <li>
            Not done here: server-side verification of approvals. This site has no server. The
            step-up page shows the call a real bank would make.
          </li>
        </ul>
      </div>
      <P>
        Four short pages cover the integration in the order you would do it: the CLI quickstart for
        a fresh app, registering a site by hand, the login button and callback, and transaction
        approval. Each shows terminal steps or the actual file from this site.
      </P>
      <div className="flex gap-2">
        <Button asChild>
          <Link to="/docs/quickstart">Start with the quickstart</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/login">Try the login first</Link>
        </Button>
      </div>
    </DocsLayout>
  );
}
