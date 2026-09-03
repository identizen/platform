import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { IdentizenProvider } from '@identizen/react';
import { initTheme } from '@identizen/ui/theme';
import './app.css';
import { CLIENT_ID, INDEX_URL } from './lib/config';
import { router } from './router';

initTheme();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('missing #root');

createRoot(rootEl).render(
  <StrictMode>
    {/* One provider per app: the index to talk to and this site's public client id. */}
    <IdentizenProvider indexUrl={INDEX_URL} clientId={CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </IdentizenProvider>
  </StrictMode>,
);
