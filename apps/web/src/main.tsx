import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { initTheme } from '@identizen/ui/theme';
import { MOCK_MODE } from '@identizen/dashboard';
import './app.css';
import { router } from './router';

// Runs before the first render, so the stored theme applies without an inline script
// (the page ships a strict Content-Security-Policy; see public/_headers).
initTheme();

async function boot(): Promise<void> {
  if (MOCK_MODE) {
    const { worker } = await import('@identizen/dashboard/mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 10_000, refetchOnWindowFocus: true } },
  });
  const rootEl = document.getElementById('root');
  if (!rootEl) throw new Error('missing #root');
  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void boot();
