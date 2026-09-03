import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { IdentizenLogo } from '@identizen/ui';
import { DEMO_SOURCE, IDENTIZEN_DOCS } from '@/lib/config';

const PAGES = [
  { to: '/docs', label: 'How this demo works', exact: true },
  { to: '/docs/quickstart', label: '1 · Quickstart (CLI)', exact: false },
  { to: '/docs/register', label: '2 · Register your site', exact: false },
  { to: '/docs/login', label: '3 · The login button', exact: false },
  { to: '/docs/step-up', label: '4 · Approve a transaction', exact: false },
] as const;

export interface DocsLayoutProps {
  title: string;
  lede: string;
  children: ReactNode;
}

/** Two-column docs page: section nav on the left, prose and code on the right. */
export function DocsLayout({ title, lede, children }: DocsLayoutProps) {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-10 md:grid-cols-[14rem_1fr] md:py-14">
      <nav
        aria-label="Developer guide"
        className="flex flex-col gap-1 md:sticky md:top-24 md:self-start"
      >
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-muted">
          Developer guide
        </p>
        {PAGES.map((p) => (
          <Link
            key={p.to}
            to={p.to}
            activeOptions={{ exact: p.exact }}
            className="rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-1 hover:text-fg"
            activeProps={{ className: 'bg-accent-soft text-accent-soft-fg font-medium' }}
          >
            {p.label}
          </Link>
        ))}
        <div className="mt-6 flex flex-col gap-2 border-t pt-4 text-sm">
          <a href={DEMO_SOURCE} className="text-fg-muted hover:text-fg">
            This demo&apos;s source
          </a>
          <a
            href={IDENTIZEN_DOCS}
            className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg"
          >
            Full docs at <IdentizenLogo height={14} />
          </a>
        </div>
      </nav>
      <article className="prose-bank min-w-0 max-w-3xl">
        <h1 className="font-display text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-lg text-fg-muted">{lede}</p>
        <div className="mt-8 flex flex-col gap-8">{children}</div>
      </article>
    </div>
  );
}

/** A numbered step with a heading and free content. */
export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex gap-4">
      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-fg">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {children}
      </div>
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="leading-relaxed text-fg-muted">{children}</p>;
}
