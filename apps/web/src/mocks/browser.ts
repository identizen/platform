import { setupWorker } from 'msw/browser';
import { INDEX_URL } from '@/lib/config';
import { createHandlers } from './handlers';

/** Browser mock of the index (`VITE_IDENTIZEN_MOCK=1`): Playwright runs without Postgres or wrangler. */
export const worker = setupWorker(...createHandlers(INDEX_URL));
