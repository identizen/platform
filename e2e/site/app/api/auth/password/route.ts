import { getIdentizen } from '@/lib/identizen';
import { createSession, findUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

function field(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === 'string' ? v : '';
}

/** The site's own primary login (Path B keeps it). */
export async function POST(req: Request): Promise<Response> {
  const cfg = await getIdentizen();
  const form = await req.formData();
  const username = field(form, 'username');
  const password = field(form, 'password');
  const user = findUser(username);
  if (!user || user.password !== password) {
    return Response.redirect(`${cfg.siteUrl}/login?error=bad_credentials`, 303);
  }
  await createSession({ username });
  return Response.redirect(`${cfg.siteUrl}/account`, 303);
}
