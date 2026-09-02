import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { resetFixtures } from '@/mocks/handlers';
import { server } from '@/mocks/node';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  resetFixtures();
  sessionStorage.clear();
  localStorage.clear();
});
afterAll(() => server.close());
