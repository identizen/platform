# @identizen/react

```bash
npm install @identizen/react @identizen/sdk
```

```tsx
import { IdentizenProvider, IdentizenButton } from '@identizen/react';

<IdentizenProvider indexUrl="https://index.identizen.com" clientId="idz_live_…">
  <IdentizenButton
    login={{
      redirectUri: 'https://app.example.com/api/auth/callback',
      state,
      nonce,
      codeChallenge,
    }}
    onSuccess={(s) => router.push('/dashboard')}
  />
</IdentizenProvider>;
```

`<IdentizenButton>` renders the idle button, then the match code and QR (or "check your phone" when the browser is paired / a deep link on mobile), then approved / denied / expired / error with a retry. Status changes are announced through a live region.

Path B: `<IdentizenStepUp sub={boundSub} reason="Approve wire of $12,000?" onApproved={…} />`.

`useIdentizen()` exposes `startLogin`, `enroll`, `stepUp`, `cancel`, `state`, and `busy` for custom UI. Style through your own classes (`className`, `panelClassName`) or the `data-idz` attributes.
