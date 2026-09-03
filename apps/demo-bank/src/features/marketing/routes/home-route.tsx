import { Link } from '@tanstack/react-router';
import { Button } from '@identizen/ui';
import { FeatureGrid } from '../components/feature-grid';
import { Hero } from '../components/hero';

export function HomeRoute() {
  return (
    <>
      <Hero />
      <FeatureGrid />
      <section className="mx-auto w-full max-w-6xl px-6 pb-20">
        <div className="grid gap-6 rounded-xl border bg-surface-1 p-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Building something like this?
            </h2>
            <p className="mt-2 max-w-2xl text-fg-muted">
              JT Merlin is about 40 files of React on top of two npm packages. The developer pages
              walk through the real source: registering the site, the login button, the callback,
              and transaction approval with the reason shown on the phone.
            </p>
          </div>
          <Button size="lg" variant="outline" asChild>
            <Link to="/docs">Read the integration guide</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
