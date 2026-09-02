import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const session = await getSession();
  if (!session?.sub) redirect('/');
  return (
    <div className="card">
      <h1>Signed in</h1>
      <dl>
        <dt>sub</dt>
        <dd>
          <code data-testid="sub">{session.sub}</code>
        </dd>
        <dt>acr</dt>
        <dd data-testid="acr">{session.acr}</dd>
        <dt>amr</dt>
        <dd data-testid="amr">{session.amr?.join(',')}</dd>
        <dt>sid</dt>
        <dd>
          <code data-testid="sid">{session.sid}</code>
        </dd>
      </dl>
      <div className="row">
        <a className="button secondary" href="/api/auth/login?mode=stepup">
          Step up
        </a>
        <form action="/api/auth/logout" method="post">
          <button type="submit">Log out</button>
        </form>
      </div>
    </div>
  );
}
