import { fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Challenge } from '@identizen/protocol';
import { HomeScreen } from '../src/screens/HomeScreen';
import { ListScreen } from '../src/screens/ListScreen';
import { SettingsScreen } from '../src/screens/SettingsScreen';
import { tokens } from '../src/theme/tokens';

const challenge: Challenge = {
  type: 'challenge',
  id: 'ch_01K3ZB2N9G0000000000000000',
  rp_id: 'app.example.com',
  rp_name: 'Example App',
  nonce: 'A'.repeat(43),
  code: '47',
  iat: 1,
  exp: 61,
  index: 'http://index.test',
  acr: 'idz:login',
  reason: null,
};

const listProps = {
  heading: 'Devices',
  intro: '',
  items: [],
  loading: false,
  error: null,
  emptyText: 'none',
  revokeLabel: 'Revoke',
  onRevoke: () => Promise.resolve(),
  onRefresh: jest.fn(),
};

describe('top bar navigation', () => {
  it('a stacked list shows a back chevron at the top and a tab list shows none', async () => {
    const onBack = jest.fn();
    const stacked = await render(<ListScreen {...listProps} onBack={onBack} />);
    await fireEvent.press(screen.getByTestId('back'));
    expect(onBack).toHaveBeenCalledTimes(1);
    await stacked.unmount();

    await render(<ListScreen {...listProps} />);
    expect(screen.queryByTestId('back')).toBeNull();
    expect(screen.queryByTestId('top-bar')).toBeNull();
    expect(screen.queryByText('Back')).toBeNull();
    expect(screen.queryByText('Refresh')).toBeNull();
  });

  it('settings no longer buries a Back button below the cards', async () => {
    await render(
      <SettingsScreen
        indexUrl="http://index.test"
        handle={null}
        registered
        theme="system"
        biometricRequired
        bluetoothEnabled
        bluetoothSupported={false}
        onBluetoothEnabled={jest.fn()}
        onSaveHandle={jest.fn()}
        onSaveIndexUrl={jest.fn()}
        onTheme={jest.fn()}
        onBiometricRequired={jest.fn()}
        onShowPhrase={jest.fn()}
        onForget={jest.fn()}
      />,
    );
    expect(screen.queryByText('Back')).toBeNull();
    expect(screen.getByTestId('forget')).toBeOnTheScreen();
  });
});

describe('home', () => {
  it('shows the brand, the handle, pending requests and one clear scan action', async () => {
    const onOpenChallenge = jest.fn();
    const onScan = jest.fn();
    await render(
      <HomeScreen
        idz="idz_01K3ZB2N9G0000000000000000"
        handle="george"
        indexUrl="https://index.identizen.com"
        registered
        pending={[{ challenge, receivedAt: 1, via: 'push' }]}
        activity={[]}
        onOpenChallenge={onOpenChallenge}
        onScan={onScan}
        onRegister={jest.fn()}
      />,
    );
    expect(screen.getAllByLabelText('Identizen').length).toBeGreaterThan(0);
    expect(screen.getByTestId('home-handle')).toHaveTextContent('@george');
    expect(screen.getByText('index.identizen.com')).toBeOnTheScreen();
    expect(screen.queryByText('Settings')).toBeNull();
    expect(screen.queryByText('Devices')).toBeNull();
    await fireEvent.press(screen.getByTestId(`pending-${challenge.id}`));
    expect(onOpenChallenge).toHaveBeenCalledWith(challenge.id);
    await fireEvent.press(screen.getByTestId('scan'));
    expect(onScan).toHaveBeenCalledTimes(1);
  });
});

describe('token mirror', () => {
  it('carries every color token from packages/ui, in both schemes, with the brand accent', () => {
    const css = readFileSync(join(__dirname, '../../../packages/ui/src/tokens.css'), 'utf8');
    const theme = css.slice(css.indexOf('@theme {'), css.indexOf('/* shadcn semantic aliases'));
    const names = [...theme.matchAll(/--color-([a-z0-9-]+):\s*oklch/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(20);
    expect(Object.keys(tokens.light).sort()).toEqual([...names].sort());
    expect(Object.keys(tokens.dark).sort()).toEqual([...names].sort());
    // Vermilion, not the old blue: red channel dominates in both schemes.
    for (const hex of [tokens.light.accent, tokens.dark.accent]) {
      const r = parseInt(hex.slice(1, 3), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      expect(r).toBeGreaterThan(b + 80);
    }
  });
});
