import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/tokens.css';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
  Switch,
  ThemeToggle,
  initTheme,
} from '../src/index';

initTheme();

const SURFACES = ['surface-0', 'surface-1', 'surface-2', 'surface-3', 'surface-4'] as const;
const SEMANTIC = [
  ['accent', 'accent-fg'],
  ['accent-soft', 'accent-soft-fg'],
  ['success', 'success-fg'],
  ['success-soft', 'success-soft-fg'],
  ['warning', 'warning-fg'],
  ['warning-soft', 'warning-soft-fg'],
  ['danger', 'danger-fg'],
  ['danger-soft', 'danger-soft-fg'],
] as const;

function Swatch({ bg, fg, label }: { bg: string; fg: string; label: string }) {
  return (
    <div
      className={`flex h-16 items-end rounded-md border p-2 bg-${bg} text-${fg}`}
      style={{ background: `var(--color-${bg})`, color: `var(--color-${fg})` }}
    >
      <code className="text-2xs">{label}</code>
    </div>
  );
}

function TokenSheet() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Identizen tokens</h1>
          <p className="text-sm text-fg-muted">
            One token sheet for marketing, docs, app, and mobile.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <section aria-labelledby="surfaces">
        <h2 id="surfaces" className="mb-3 text-sm font-medium text-fg-muted">
          Surfaces
        </h2>
        <div className="grid grid-cols-5 gap-2">
          {SURFACES.map((s) => (
            <Swatch key={s} bg={s} fg="fg" label={s} />
          ))}
        </div>
      </section>

      <section aria-labelledby="semantic">
        <h2 id="semantic" className="mb-3 text-sm font-medium text-fg-muted">
          Accent and semantic
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {SEMANTIC.map(([bg, fg]) => (
            <Swatch key={bg} bg={bg} fg={fg} label={bg} />
          ))}
        </div>
      </section>

      <section aria-labelledby="type" className="flex flex-col gap-2">
        <h2 id="type" className="mb-1 text-sm font-medium text-fg-muted">
          Type
        </h2>
        <p className="text-3xl font-semibold tracking-tight">Login with your phone.</p>
        <p className="text-base text-fg">
          No password, no email, no Google or Microsoft account. One tap, Face ID, in.
        </p>
        <p className="text-sm text-fg-muted">Standard OIDC. Five-line integration.</p>
        <pre className="rounded-md border bg-surface-1 p-3 text-xs">
          <code>{'npm install @identizen/react'}</code>
        </pre>
      </section>

      <section aria-labelledby="components" className="flex flex-col gap-6">
        <h2 id="components" className="text-sm font-medium text-fg-muted">
          Components
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button>Continue with Identizen</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button variant="destructive">Revoke</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="success">Active</Badge>
          <Badge variant="warning">Pending</Badge>
          <Badge variant="danger">Revoked</Badge>
        </div>
        <Separator />
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Register a site</CardTitle>
            <CardDescription>Give your site a name and an origin.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Example App" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="origin">Origin</Label>
              <Input id="origin" placeholder="app.example.com" />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="pairing">Browser pairing</Label>
              <Switch id="pairing" defaultChecked />
            </div>
            <Button className="self-start">Create</Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <TokenSheet />
    </StrictMode>,
  );
}
