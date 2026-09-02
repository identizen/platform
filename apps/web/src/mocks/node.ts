import { setupServer } from 'msw/node';
import { INDEX_URL } from '@/lib/config';
import { createHandlers } from './handlers';

/** Node mock of the index for Vitest. */
export const server = setupServer(...createHandlers(INDEX_URL));
