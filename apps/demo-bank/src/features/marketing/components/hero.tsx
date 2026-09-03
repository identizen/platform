import { Link } from '@tanstack/react-router';
import { Button, KimiMark } from '@identizen/ui';
import { ArrowRight } from 'lucide-react';

/** Landing hero: the pitch a bank would make, plus the honest line under it. */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_10%,var(--color-bank-soft),transparent_70%)]"
      />
      <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 md:grid-cols-2 md:py-28">
        <div className="flex flex-col justify-center gap-6">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-idz/30 bg-idz-soft px-3 py-1 text-xs font-medium text-idz-soft-fg">
            <KimiMark size={14} /> Passwordless, powered by Identizen
          </p>
          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Banking that never asks for a password.
          </h1>
          <p className="max-w-lg text-lg text-fg-muted">
            Sign in with your phone. Approve every wire and large transfer with Face ID, with the
            amount and payee on screen before you say yes. Nothing to remember, nothing to phish.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link to="/login">
                Open the demo <ArrowRight aria-hidden="true" className="ml-1 size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/docs">See how it is built</Link>
            </Button>
          </div>
          <p className="text-xs text-fg-muted">
            Needs the Identizen app on an iPhone. Every account you will see is fictional.
          </p>
        </div>
        <PhoneMock />
      </div>
    </section>
  );
}

/** A stylised approval screen, so the landing page shows what the phone will show. */
function PhoneMock() {
  return (
    <div className="flex items-center justify-center">
      <div
        aria-hidden="true"
        className="w-64 rounded-[2rem] border-8 border-surface-3 bg-surface-0 p-5 shadow-md"
      >
        <p className="text-center text-xs text-fg-muted">Approve for</p>
        <p className="text-center font-semibold">JT Merlin Bank</p>
        <p className="text-center text-xs text-fg-muted">jtmerlin.com</p>
        <div className="mt-4 rounded-md border bg-surface-2 p-3 text-sm">
          Wire $12,000.00 to Acme Supply Co. (···4471)
        </div>
        <p className="mt-5 text-center font-mono text-5xl font-semibold tracking-[0.2em]">47</p>
        <p className="mt-1 text-center text-[11px] text-fg-muted">
          Make sure your screen shows the same code.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <div className="rounded-md bg-idz py-2.5 text-center text-sm font-semibold text-white">
            Approve
          </div>
          <div className="rounded-md border py-2.5 text-center text-sm">Deny</div>
        </div>
      </div>
    </div>
  );
}
