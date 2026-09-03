import { Link } from '@tanstack/react-router';
import { Button } from '@identizen/ui';
import { FeatureGrid } from '../components/feature-grid';
import { Hero } from '../components/hero';
import { Products } from '../components/products';

export function HomeRoute() {
  return (
    <>
      <Hero />
      <Products />
      <FeatureGrid />
      <section className="mx-auto w-full max-w-6xl px-6 pb-20">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-surface-1 px-6 py-5">
          <p className="text-sm text-fg-muted">
            <strong className="text-fg">Building a site like this?</strong> The developer pages show
            how JT Merlin integrates Identizen, with the real source.
          </p>
          <Button variant="outline" asChild>
            <Link to="/docs">Developer guide</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
