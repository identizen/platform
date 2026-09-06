import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from '@tanstack/react-router';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@identizen/ui';
import { useSession } from '@/features/auth';
import { shortId } from '@/lib/format';
import { createCustomer, findCustomer } from '../api/customers';

/**
 * /signup: the one-time step between a first Identizen approval and a bank account.
 * The phone has already proved the identity; the bank now attaches a person to it.
 */
export function SignupRoute() {
  const session = useSession();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!session) return <Navigate to="/login" replace />;
  if (findCustomer(session.claims.sub)) return <Navigate to="/app" replace />;
  const { claims } = session;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Tell us your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email.');
    if (phone.replace(/\D/g, '').length < 7) return setError('Enter a mobile number.');
    createCustomer({ sub: claims.sub, name, email, phone, signupAmr: claims.amr });
    void navigate({ to: '/app', replace: true });
  };

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-10 px-6 py-12 md:grid-cols-[1fr_1.1fr] md:py-20">
      <div className="flex flex-col justify-center gap-5">
        <p className="font-medium text-sm text-bank-soft-fg">Open an account</p>
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
          Your phone is verified. Now, who are you?
        </h1>
        <p className="max-w-md text-lg text-fg-muted">
          Identizen proved that the person holding your phone approved this sign-in. It told us
          nothing else: no name, no email, no password. A bank needs those for statements, contact,
          and the law, so we ask once and keep them under your identity.
        </p>
        <dl className="grid gap-2 rounded-lg border bg-surface-1 p-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-fg-muted">Your identifier at this bank</dt>
            <dd className="font-mono" title={claims.sub}>
              {shortId(claims.sub, 10)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-fg-muted">Approved with</dt>
            <dd className="font-mono">{claims.amr.join(' + ')}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-fg-muted">Known to any other site as</dt>
            <dd>a different identifier</dd>
          </div>
        </dl>
        <p className="text-xs text-fg-muted">
          The identifier is stable: a new phone restored from your 24 words produces the same one,
          so you will land in this account, not a new one. Developers: see{' '}
          <Link to="/docs/customers" className="text-accent underline">
            how this page links an identity to a customer
          </Link>
          .
        </p>
      </div>
      <Card className="self-center">
        <CardHeader>
          <CardTitle>Account holder details</CardTitle>
          <CardDescription>
            Invented details are fine. This is a demo bank and nothing here is real.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email for statements</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Mobile number</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <Button type="submit">Open my account</Button>
            <p className="text-center text-xs text-fg-muted">
              No password to set. Your phone stays the only way in.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
