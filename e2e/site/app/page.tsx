import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getSession();
  if (session?.sub && !session.username) redirect('/dashboard');
  const q = await searchParams;
  return (
    <div className="card">
      <h1>Acme Demo</h1>
      <p>A sample relying party for Identizen.</p>
      {q.error ? (
        <p className="error" data-testid="error">
          Login failed: {q.error}
        </p>
      ) : null}
      <a className="button" href="/api/auth/login">
        Continue with Identizen
      </a>
      <p>
        Or use the site&apos;s own login: <Link href="/login">password sign in</Link>
      </p>
    </div>
  );
}
