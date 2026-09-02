import { getIdentizen } from '@/lib/identizen';
import { destroySession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  const cfg = await getIdentizen();
  await destroySession();
  return Response.redirect(`${cfg.siteUrl}/`, 303);
}
