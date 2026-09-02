import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { setSession } from '@/features/auth';
import { DEVICE_IPHONE, MOCK_SESSION } from '@/mocks/fixtures';
import { state } from '@/mocks/handlers';
import { DevicesRoute } from '../routes/devices-route';

function renderRoute() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DevicesRoute />
    </QueryClientProvider>,
  );
}

describe('devices', () => {
  it('lists devices with status and revokes one after confirmation', async () => {
    setSession(MOCK_SESSION);
    renderRoute();
    const list = await screen.findByRole('list', { name: 'Devices' });
    expect(list.querySelectorAll(':scope > li')).toHaveLength(3);
    expect(screen.getAllByText('active')).toHaveLength(2);
    expect(screen.getByText('revoked')).toBeInTheDocument();

    const [first] = screen.getAllByRole('button', { name: /^Revoke device/ });
    await userEvent.click(first!);
    await userEvent.click(screen.getByRole('button', { name: 'Revoke device' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Device revoked'));
    expect(state.fixtures.devices.find((d) => d.id === DEVICE_IPHONE)?.status).toBe('revoked');
    await waitFor(() => expect(screen.getAllByText('revoked')).toHaveLength(2));
  });

  it('a 401 clears the session', async () => {
    setSession({ ...MOCK_SESSION, accessToken: 'stale' });
    renderRoute();
    await waitFor(() => expect(sessionStorage.getItem('idz:session')).toBeNull());
  });
});
