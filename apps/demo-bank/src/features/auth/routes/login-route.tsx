import { Link, Navigate } from '@tanstack/react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@identizen/ui';
import { ShieldCheck, Smartphone, Zap } from 'lucide-react';
import { IdentizenLogin } from '../components/identizen-login';
import { useSession } from '../hooks/use-session';

const POINTS = [
  { icon: Smartphone, text: 'Your phone is the key. No password to type, reuse, or leak.' },
  {
    icon: ShieldCheck,
    text: 'Every sign-in is signed to jtmerlin.com. A phished copy cannot replay it.',
  },
  {
    icon: Zap,
    text: 'After the first login this browser is paired: later logins push straight to your phone.',
  },
];

/** /login: the whole login page. One button; Identizen renders the code and QR inside it. */
export function LoginRoute() {
  const session = useSession();
  if (session) return <Navigate to="/app" replace />;
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-10 px-6 py-12 md:grid-cols-[1.1fr_1fr] md:py-20">
      <div className="flex flex-col justify-center gap-5">
        <p className="font-medium text-sm text-bank-soft-fg">Online banking</p>
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
          Sign in with your phone.
        </h1>
        <p className="max-w-md text-lg text-fg-muted">
          JT Merlin has no passwords. Approve on your phone with Face ID and you are in.
        </p>
        <ul className="mt-2 flex flex-col gap-3">
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm text-fg-muted">
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
              {text}
            </li>
          ))}
        </ul>
      </div>
      <Card className="self-center">
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>
            Install the Identizen app on your phone first if you have not. Then continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <IdentizenLogin />
          <p className="text-center text-xs text-fg-muted">
            First time here? The same button creates your account. Read{' '}
            <Link to="/docs/login" className="text-accent underline">
              how this page is built
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
