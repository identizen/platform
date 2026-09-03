import { Link } from '@tanstack/react-router';
import { Button, KimiMark } from '@identizen/ui';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

const TRUST = ['No monthly fees', '4.15% APY on savings', 'Approve payments on your phone'];

/** Landing hero: a bank talking to a customer, with the one thing that makes it different. */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_15%_20%,var(--color-bank-soft),transparent_70%)]"
      />
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-16 md:grid-cols-[1.05fr_1fr] md:py-24">
        <div className="flex flex-col gap-6">
          <p className="text-sm font-medium text-bank-soft-fg">Personal banking</p>
          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Banking that moves at the speed of a tap.
          </h1>
          <p className="max-w-lg text-lg text-fg-muted">
            Checking, savings, and business accounts with no passwords to remember. Sign in with
            your phone, and approve every wire and large transfer with Face ID before it leaves.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link to="/login">
                Open an account <ArrowRight aria-hidden="true" className="ml-1 size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-fg-muted">
            {TRUST.map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <CheckCircle2 aria-hidden="true" className="size-4 text-accent" />
                {t}
              </li>
            ))}
          </ul>
          <p className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
            <KimiMark size={12} /> Sign-in and approvals by Identizen. This bank is a demo.
          </p>
        </div>

        <figure className="relative mx-auto w-full max-w-md md:max-w-none">
          <img
            src="/hero.jpg"
            srcSet="/hero-sm.jpg 800w, /hero.jpg 1400w"
            sizes="(min-width: 768px) 40vw, 90vw"
            width={1400}
            height={2100}
            alt="A smiling customer in a green patterned shirt"
            className="aspect-[4/5] w-full rounded-2xl object-cover object-top shadow-md"
            loading="eager"
            fetchPriority="high"
          />
          <div className="absolute -bottom-5 left-4 right-4 flex flex-col gap-2 sm:left-auto sm:right-6 sm:w-72">
            <div className="rounded-xl border bg-surface-0/95 p-4 shadow-md backdrop-blur">
              <p className="text-xs text-fg-muted">Everyday Checking</p>
              <p className="tnum font-display text-2xl font-semibold tracking-tight">$12,480.22</p>
              <p className="mt-1 text-xs text-success-soft-fg">+$6,125.00 payroll · today</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-idz/30 bg-idz-soft px-3 py-2 text-xs text-idz-soft-fg shadow-sm">
              <KimiMark size={14} />
              <span>
                <strong>Wire approved on your phone.</strong> $12,000.00 to Acme Supply Co.
              </span>
            </div>
          </div>
          <figcaption className="sr-only">Photo from Pexels.</figcaption>
        </figure>
      </div>
    </section>
  );
}
