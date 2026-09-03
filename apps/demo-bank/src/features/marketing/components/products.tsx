import { Link } from '@tanstack/react-router';
import { Card, CardContent } from '@identizen/ui';
import { ArrowRight, Briefcase, PiggyBank, Wallet } from 'lucide-react';

const PRODUCTS = [
  {
    icon: Wallet,
    name: 'Everyday Checking',
    headline: 'No fees. Paid two days early.',
    points: [
      'No monthly fee or minimum balance',
      'Direct deposit arrives up to two days early',
      'Instant transfers between your accounts',
    ],
    stat: '$0',
    statLabel: 'monthly fee',
  },
  {
    icon: PiggyBank,
    name: 'High-Yield Savings',
    headline: 'A rate worth moving money for.',
    points: [
      'Interest compounds daily, paid monthly',
      'No tiers, no promotional cliff',
      'Move money in seconds, any time',
    ],
    stat: '4.15%',
    statLabel: 'APY',
  },
  {
    icon: Briefcase,
    name: 'Business Banking',
    headline: 'Wires your phone signs off on.',
    points: [
      'Same-day domestic wires and next-day ACH',
      'Every wire approved on your phone, amount and payee on screen',
      'Saved payees and a clean audit trail',
    ],
    stat: 'Same day',
    statLabel: 'wires',
  },
] as const;

export function Products() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16" aria-labelledby="products">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="products" className="font-display text-3xl font-semibold tracking-tight">
            Accounts for the way you actually bank
          </h2>
          <p className="mt-2 max-w-2xl text-fg-muted">
            Three accounts, one login, no passwords. Every number on this site is fictional.
          </p>
        </div>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {PRODUCTS.map(({ icon: Icon, name, headline, points, stat, statLabel }) => (
          <Card key={name} className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-4 p-6">
              <div className="flex items-center justify-between">
                <span className="inline-flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent-soft-fg">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="text-right">
                  <span className="tnum block font-display text-2xl font-semibold tracking-tight">
                    {stat}
                  </span>
                  <span className="block text-xs text-fg-muted">{statLabel}</span>
                </span>
              </div>
              <div>
                <h3 className="font-semibold">{name}</h3>
                <p className="text-sm text-fg-muted">{headline}</p>
              </div>
              <ul className="flex flex-1 flex-col gap-2 text-sm text-fg-muted">
                {points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-accent"
                    />
                    {p}
                  </li>
                ))}
              </ul>
              <Link
                to="/login"
                className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
              >
                Open {name} <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
