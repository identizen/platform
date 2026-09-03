import { Card, CardContent } from '@identizen/ui';
import { Bluetooth, Fingerprint, KeyRound, QrCode, ScrollText, ShieldOff } from 'lucide-react';

const FEATURES = [
  {
    icon: Fingerprint,
    title: 'Face ID is the login',
    body: 'A key on your phone signs each login. The bank never holds a password, so there is none to steal.',
  },
  {
    icon: ScrollText,
    title: 'Read before you approve',
    body: 'Wires and large transfers show the exact amount and payee on your phone. Approving signs that text.',
  },
  {
    icon: ShieldOff,
    title: 'Phishing does not work',
    body: 'Every approval is bound to jtmerlin.com. A look-alike site cannot reuse it, even if you are fooled.',
  },
  {
    icon: QrCode,
    title: 'First login: scan',
    body: 'On a new computer, scan the code on screen. A two-digit match code stops push bombing.',
  },
  {
    icon: KeyRound,
    title: 'After that: one tap',
    body: 'The browser is paired. Later logins go straight to your phone as a notification.',
  },
  {
    icon: Bluetooth,
    title: 'Or just be nearby',
    body: 'On Chrome, the site can find your phone over Bluetooth and skip the QR entirely.',
  },
];

export function FeatureGrid() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <h2 className="font-display text-3xl font-semibold tracking-tight">Security you can see</h2>
      <p className="mt-2 max-w-2xl text-fg-muted">
        Every item below is a real Identizen feature working in this demo, not a promise.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <Card key={title}>
            <CardContent className="flex flex-col gap-3 p-5">
              <span className="inline-flex size-9 items-center justify-center rounded-md bg-accent-soft text-accent-soft-fg">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-fg-muted">{body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
