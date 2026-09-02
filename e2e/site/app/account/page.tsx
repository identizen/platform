import { redirect } from 'next/navigation';
import { findUser, getSession } from '@/lib/session';
import { VerifyPanel } from './verify-button';

export const dynamic = 'force-dynamic';

export default async function Account({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getSession();
  if (!session?.username) redirect('/login');
  const user = findUser(session.username);
  const q = await searchParams;
  return (
    <div className="card">
      <h1>Account</h1>
      {q.error ? (
        <p className="error" data-testid="error">
          {q.error}
        </p>
      ) : null}
      <dl>
        <dt>user</dt>
        <dd data-testid="username">{session.username}</dd>
        <dt>enrolled</dt>
        <dd>
          <code data-testid="enrolled">{user?.enrolledSub ?? 'not enrolled'}</code>
        </dd>
        <dt>acr</dt>
        <dd data-testid="acr">{session.acr ?? 'none'}</dd>
        <dt>amr</dt>
        <dd data-testid="amr">{session.amr?.join(',') ?? ''}</dd>
      </dl>
      <div className="row">
        {user?.enrolledSub ? (
          <a className="button" href="/api/auth/login?mode=stepup">
            Step up
          </a>
        ) : (
          <a className="button" href="/api/auth/login?mode=enroll">
            Enroll your phone
          </a>
        )}
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="secondary">
            Log out
          </button>
        </form>
      </div>
      {user?.enrolledSub ? <VerifyPanel /> : null}
    </div>
  );
}
