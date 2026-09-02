import { createApp } from './app';
import type { Env } from './env';

export { ChallengeSession } from './do/challenge-session';
export { RequestGuard } from './do/request-guard';
export type { Env } from './env';

const app = createApp();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> | Response {
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
