export const dynamic = 'force-dynamic';

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  return (
    <div className="card">
      <h1>Sign in to Acme</h1>
      <p>The site&apos;s own login. Identizen is added as the second factor.</p>
      {q.error ? (
        <p className="error" data-testid="error">
          {q.error}
        </p>
      ) : null}
      <form action="/api/auth/password" method="post" style={{ display: 'grid', gap: 12 }}>
        <label>
          Username
          <input name="username" defaultValue="" autoComplete="username" />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" />
        </label>
        <button type="submit">Sign in</button>
      </form>
    </div>
  );
}
