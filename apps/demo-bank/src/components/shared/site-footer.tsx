import { Link } from '@tanstack/react-router';
import { IdentizenLogo } from '@identizen/ui';
import { DEMO_SOURCE, IDENTIZEN_DOCS, IDENTIZEN_SITE, IDENTIZEN_SOURCE } from '@/lib/config';

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-surface-1">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">
            <strong className="text-fg">JT Merlin Bank is not a bank.</strong> It is a demo
            application maintained by the Identizen project. No accounts, balances, transfers, or
            people on this site are real. Do not enter real financial information.
          </p>
          <a
            href={IDENTIZEN_SITE}
            className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg"
          >
            <span>Login and approvals powered by</span>
            <IdentizenLogo height={18} />
          </a>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-medium">This demo</p>
          <Link to="/docs" className="text-fg-muted hover:text-fg">
            How it is built
          </Link>
          <Link to="/docs/quickstart" className="text-fg-muted hover:text-fg">
            Add Identizen to your app
          </Link>
          <a href={DEMO_SOURCE} className="text-fg-muted hover:text-fg">
            Source on GitHub
          </a>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-medium">Identizen</p>
          <a href={IDENTIZEN_SITE} className="text-fg-muted hover:text-fg">
            identizen.com
          </a>
          <a href={IDENTIZEN_DOCS} className="text-fg-muted hover:text-fg">
            Documentation
          </a>
          <a href={IDENTIZEN_SOURCE} className="text-fg-muted hover:text-fg">
            Open source, Apache-2.0
          </a>
        </div>
      </div>
    </footer>
  );
}
