import { setupServer } from 'msw/node';
import { INDEX_URL } from '../lib/config';
import { OTHER_INDEX_URL } from './fixtures';
import { createHandlers } from './handlers';

/** Node mock of the index for Vitest. */
export const server = setupServer(...createHandlers(INDEX_URL), ...createHandlers(OTHER_INDEX_URL));
