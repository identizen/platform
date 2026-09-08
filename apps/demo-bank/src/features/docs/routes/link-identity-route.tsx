import { AUTH_SOURCE } from '@/features/auth';
import { CUSTOMERS_SOURCE } from '@/features/customers';
import { CodeBlock } from '@/components/shared/code-block';
import { DocsLayout, P, Step } from '../components/docs-layout';

const CLAIMS = `{
  "sub": "NcSuRV6Y3pDcgKd0-mbxGnDqXf9E9k5w",   // unique to jtmerlin.com, stable for life
  "sid": "3kQ9vZ2mXc7…",                         // this Identizen session; changes every login
  "acr": "idz:login",                            // or idz:mfa after a step-up
  "amr": ["face"],                        // how the phone authenticated the person
  "idz_device": "dev_01M1…",                     // which phone signed; changes per device
  "idz_handle": "jordan"                         // optional, only if set and the site asked
}`;

const RULES = [
  [
    'Key on sub',
    'It is the only claim that is unique to your site and stable across phones, restores, and sessions. Store it as the customer primary key or a unique column.',
  ],
  [
    'Never key on sid or idz_device',
    'A session id changes every login. A device id changes when the person gets a new phone. Keep them for audit, not for identity.',
  ],
  [
    'Do not key on the handle',
    'It is optional, the person can change it, and most people will not set one.',
  ],
  [
    'Collect what you need, once',
    'Name, contact details, addresses, tax and KYC data are your business, not Identizen’s. Ask after the first approval and keep them under the sub.',
  ],
] as const;

export function LinkIdentityRoute() {
  return (
    <DocsLayout
      title="Link an identity to a customer"
      lede="Identizen proves that a specific phone-held identity approved a sign-in. It does not tell you who that person is. The bank attaches a person, with a name and contact details, to that identity once, on sign-up, and recognizes it forever after. This page shows how."
    >
      <Step n={1} title="What the id_token gives you">
        <P>
          After the phone approves and the callback exchanges the code, the id_token carries these
          claims. One of them is the link.
        </P>
        <CodeBlock code={CLAIMS} title="id_token claims (annotated)" />
        <P>
          <code>sub</code> is the hash of a public key the phone derives from its seed and the
          site&apos;s registered host. The same seed on a new phone derives the same key, so a
          restore from the 24 words yields the same <code>sub</code>. A different site gets a
          different key, so no two sites can correlate the person. The index refuses any later
          assertion for that <code>sub</code> that is not signed by the same key.
        </P>
        <div className="grid gap-3 sm:grid-cols-2">
          {RULES.map(([title, text]) => (
            <div key={title} className="rounded-lg border bg-surface-1 p-4">
              <p className="font-semibold">{title}</p>
              <p className="mt-1 text-sm text-fg-muted">{text}</p>
            </div>
          ))}
        </div>
      </Step>
      <Step n={2} title="The directory: customers keyed by sub">
        <P>
          The bank keeps one table keyed by <code>sub</code>. A real bank puts this in its core
          system behind the server that verified the token; this site has no server, so it is
          localStorage. The shape is the point.
        </P>
        <CodeBlock
          code={CUSTOMERS_SOURCE.directory}
          title="src/features/customers/api/customers.ts"
        />
      </Step>
      <Step n={3} title="The branch: known sub, or sign-up">
        <P>
          The callback looks the <code>sub</code> up. A hit is a returning customer and lands in the
          bank. A miss is a new identity and goes to the sign-up page. That is the whole difference
          between sign-in and sign-up in an accountless system: the button is the same, the phone
          does the same thing, and your database decides.
        </P>
        <CodeBlock
          code={AUTH_SOURCE.callback}
          title="src/features/auth/routes/callback-route.tsx"
        />
      </Step>
      <Step n={4} title="Sign-up: attach a person to the identity">
        <P>
          The form asks for what a bank needs and nothing Identizen already provided. There is no
          password to set, no security questions, and no email verification loop needed for login,
          because login is the phone. Verify the email for statements if you want; it is not a
          credential.
        </P>
        <CodeBlock
          code={CUSTOMERS_SOURCE.signup}
          title="src/features/customers/routes/signup-route.tsx"
        />
      </Step>
      <Step n={5} title="Existing customers and lost phones">
        <P>
          <strong>Already have customers?</strong> Keep your current login and let each person bind
          a phone from inside a signed-in session with <code>prompt=enroll</code>. The returned{' '}
          <code>sub</code> goes on their existing record. From then on the phone can be the login or
          the approval step. The Identizen docs call this Path B.
        </P>
        <P>
          <strong>New phone, same identity.</strong> Restoring from the 24 words produces the same{' '}
          <code>sub</code>. The person revokes the old phone from the dashboard; your records do not
          change.
        </P>
        <P>
          <strong>Lost the phone and the words.</strong> The identity is gone and a new one will
          have a new <code>sub</code>. This is the same situation as a customer who lost every
          credential: verify who they are through your own process (ID check, branch visit, whatever
          your policy is), then bind the new <code>sub</code> to the existing record with the
          enrollment flow above. Identizen cannot do this for you, by design: nothing at Identizen
          can vouch for a person.
        </P>
      </Step>
    </DocsLayout>
  );
}
