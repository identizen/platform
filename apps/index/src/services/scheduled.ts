import { createDb } from '@identizen/db';
import type { Env } from '../env';
import { deliveryContext, sweepDeliveries, type SweepReport } from './deliveries';

export interface ScheduledReport {
  deliveries: SweepReport;
}

/**
 * What the Worker's cron trigger runs every five minutes: the delivery sweep. A host with its own
 * scheduler (the enterprise index runs one per tenant) calls `sweepDeliveries` itself with the
 * tenant's database; the container fires this through `wrangler dev --test-scheduled`.
 */
export async function runScheduledJobs(
  env: Env,
  fetchImpl: typeof fetch = (i, init) => fetch(i, init),
): Promise<ScheduledReport> {
  const handle = createDb(env.HYPERDRIVE.connectionString, { max: 1 });
  try {
    const deliveries = await sweepDeliveries(deliveryContext(env, fetchImpl), handle.db);
    return { deliveries };
  } finally {
    await handle.close();
  }
}
