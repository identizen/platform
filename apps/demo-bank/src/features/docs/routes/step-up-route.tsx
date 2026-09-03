import { TRANSFERS_SOURCE } from '@/features/transfers';
import { CodeBlock } from '@/components/shared/code-block';
import { DocsLayout, P, Step } from '../components/docs-layout';

const VERIFY = `# Server side, with the site's client secret: the index pushes the reason to the phone
# bound to \`sub\` and returns an id you poll (or a webhook fires). The response carries the
# signed assertion, so your ledger can prove what was approved without trusting the browser.
curl -X POST https://index.identizen.com/v1/verify \\
  -H "authorization: Bearer $IDENTIZEN_CLIENT_SECRET" \\
  -H 'content-type: application/json' \\
  -d '{ "sub": "<the customer sub>", "reason": "Wire $12,000.00 to Acme Supply Co. (···4471)", "ttl": 90 }'

# then
curl https://index.identizen.com/v1/verify/<id> \\
  -H "authorization: Bearer $IDENTIZEN_CLIENT_SECRET"
# -> { "status": "approved", "assertion": { ...signed, "reason": "Wire $12,000.00 ..." } }
`;

const OIDC_STEP_UP = `// Prefer OIDC? Re-authorize with acr_values=idz:mfa and the customer's sub as login_hint.
// The id_token comes back with acr "idz:mfa" and amr showing Face ID.
const url = authorizationUrl({
  indexUrl, clientId, redirectUri, state, nonce, codeChallenge,
  acrValues: 'idz:mfa',
  loginHint: session.sub,
});
`;

export function StepUpRoute() {
  return (
    <DocsLayout
      title="Approve a transaction"
      lede="Wires and large transfers push a challenge to the customer's phone with the exact transaction text. The phone shows it above the match code; Face ID signs it. What was approved is what was shown."
    >
      <Step n={1} title="Push the reason to the phone">
        <P>
          <code>IdentizenStepUp</code> takes the customer&apos;s <code>sub</code> and a{' '}
          <code>reason</code> of up to 140 characters. It pushes the challenge to the phone bound to
          that sub, renders the match code, and reports the terminal state.
        </P>
        <CodeBlock
          code={TRANSFERS_SOURCE.approvalPanel}
          title="src/features/transfers/components/approval-panel.tsx"
        />
      </Step>
      <Step n={2} title="Decide what needs it">
        <P>
          JT Merlin asks for every wire and for ACH at or above one thousand dollars. The rule lives
          with the transfer logic, not in the identity code.
        </P>
        <CodeBlock
          code={TRANSFERS_SOURCE.useTransfers}
          title="src/features/transfers/hooks/use-transfers.ts"
        />
      </Step>
      <Step n={3} title="Verify on the server before money moves">
        <P>
          This demo has no server, so it trusts the approved state the SDK reports. A bank should
          not. The Verification API does the same push from the server, and the result carries the
          phone&apos;s signed assertion over the reason, which is the audit record.
        </P>
        <CodeBlock code={VERIFY} terminal />
        <CodeBlock code={OIDC_STEP_UP} title="alternative: OIDC step-up" />
      </Step>
    </DocsLayout>
  );
}
