import { createApp } from './app';
import type { Env } from './env';
import { runScheduledJobs } from './services/scheduled';

export { ChallengeSession } from './do/challenge-session';
export { RequestGuard } from './do/request-guard';
export type { Env } from './env';

const app = createApp();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> | Response {
    return app.fetch(request, env, ctx);
  },
  /** Cron trigger (wrangler.jsonc `triggers.crons`): retries what the index still owes sites. */
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(runScheduledJobs(env));
  },
} satisfies ExportedHandler<Env>;
