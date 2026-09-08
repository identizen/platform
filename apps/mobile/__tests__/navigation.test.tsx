import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Challenge } from '@identizen/protocol';
import { setApiFetch } from '../src/api/client';
import {
  createIdentity,
  listIndexes,
  register,
  setFetch,
  type IndexSummary,
} from '../src/identity/identity';
import { addIndex } from '../src/identity/indexes';
import { HomeScreen } from '../src/screens/HomeScreen';
import { ListScreen } from '../src/screens/ListScreen';
import {
  SettingsScreen,
  formatAbout,
  type SettingsScreenProps,
} from '../src/screens/SettingsScreen';
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

const PUBLIC: IndexSummary = {
  indexUrl: 'https://index.identizen.com',
  idz: 'idz_01K3ZB2N9G0000000000000000',
  deviceId: 'dev_1',
  handle: 'george',
  registered: true,
  active: true,
};
const ACME: IndexSummary = {
  indexUrl: 'https://acme.index.test',
  idz: 'idz_01K3ZB2N9G0000000000000000',
  deviceId: 'dev_2',
  handle: null,
  registered: true,
  active: false,
};

const settingsProps = (over: Partial<SettingsScreenProps> = {}): SettingsScreenProps => ({
  indexes: [PUBLIC],
  handle: null,
  registered: true,
  theme: 'system',
  biometricRequired: true,
  bluetoothEnabled: true,
  bluetoothSupported: false,
  onBluetoothEnabled: jest.fn(),
  onSaveHandle: jest.fn(),
  onMakeActive: jest.fn(),
  onForgetIndex: jest.fn(),
  onAddIndex: jest.fn(),
  onTheme: jest.fn(),
  onBiometricRequired: jest.fn(),
  onShowPhrase: jest.fn(),
  onForget: jest.fn(),
  about: { version: '0.1.0', build: '4', builtAt: '2026-09-03T14:34:00Z', commit: '2d84922abc' },
  ...over,
});

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
    await render(<SettingsScreen {...settingsProps()} />);
    expect(screen.queryByText('Back')).toBeNull();
    expect(screen.getByTestId('forget')).toBeOnTheScreen();
    expect(screen.getByTestId('about-line')).toHaveTextContent(/^Identizen 0\.1\.0 \(4\) · built /);
    expect(screen.getByTestId('about-line')).toHaveTextContent(/· 2d84922$/);
    expect(formatAbout({ version: null, build: null, builtAt: null, commit: null })).toBe(
      'development build',
    );
  });
});

describe('settings: indexes', () => {
  it('lists every index with the identity id, marks the active one, switches and forgets with a confirm', async () => {
    const onMakeActive = jest.fn(() => Promise.resolve());
    const onForgetIndex = jest.fn(() => Promise.resolve());
    await render(
      <SettingsScreen
        {...settingsProps({ indexes: [PUBLIC, ACME], onMakeActive, onForgetIndex })}
      />,
    );
    // The old single "Index" field is gone; the card replaces it.
    expect(screen.queryByLabelText('Index URL')).toBeNull();
    expect(screen.getByText('Indexes')).toBeOnTheScreen();
    expect(screen.getByTestId('index-row-index.identizen.com')).toHaveTextContent(
      /^index\.identizen\.comidz_01K3ZB…0000active/,
    );
    expect(screen.getByTestId('index-row-acme.index.test')).toHaveTextContent(
      /^acme\.index\.testidz_01K3ZB…0000Make active/,
    );
    // Only a non-active index can be made active.
    expect(screen.queryByTestId('make-active-index.identizen.com')).toBeNull();
    await fireEvent.press(screen.getByTestId('make-active-acme.index.test'));
    await waitFor(() => expect(onMakeActive).toHaveBeenCalledWith('https://acme.index.test'));
    // Forgetting asks once.
    await fireEvent.press(screen.getByTestId('forget-index-acme.index.test'));
    expect(onForgetIndex).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('forget-index-confirm-acme.index.test'));
    await waitFor(() => expect(onForgetIndex).toHaveBeenCalledWith('https://acme.index.test'));
  });

  it('the last index cannot be forgotten from the card', async () => {
    await render(<SettingsScreen {...settingsProps({ indexes: [PUBLIC] })} />);
    expect(screen.queryByTestId('forget-index-index.identizen.com')).toBeNull();
    expect(screen.getByTestId('forget')).toBeOnTheScreen();
  });

  it('adds an index by registering there, and refuses an address that is not an index', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/devices/nonce'))
        return Response.json({ nonce: 'n'.repeat(40), exp: Math.floor(Date.now() / 1000) + 120 });
      if (url.endsWith('/devices'))
        return Response.json(
          {
            device_id: url.startsWith('https://acme') ? 'dev_acme' : 'dev_public',
            idz: 'I'.repeat(32),
            index_pubkey: 'A'.repeat(43),
            handle: null,
          },
          { status: 201 },
        );
      return Response.json({ error: 'not_found' }, { status: 404 });
    };
    setFetch(fetchImpl);
    setApiFetch(fetchImpl);
    await createIdentity({
      activeIndexUrl: 'https://index.identizen.com',
      biometricRequired: false,
      bluetoothEnabled: false,
    });
    await register(null);
    calls.length = 0;

    await render(
      <SettingsScreen
        {...settingsProps({ onAddIndex: (url) => addIndex(url).then(() => undefined) })}
      />,
    );
    await fireEvent.changeText(screen.getByTestId('add-index-input'), 'acme.index.test');
    await fireEvent.press(screen.getByTestId('add-index'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/https:\/\/host/));
    expect(calls).toEqual([]);

    await fireEvent.changeText(screen.getByTestId('add-index-input'), 'https://acme.index.test/');
    await fireEvent.press(screen.getByTestId('add-index'));
    await waitFor(() =>
      expect(calls).toEqual([
        'POST https://acme.index.test/devices/nonce',
        'POST https://acme.index.test/devices',
      ]),
    );
    await waitFor(() => expect(screen.getByTestId('add-index-input').props.value).toBe(''));
    const indexes = await listIndexes();
    expect(indexes.map((i) => [i.indexUrl, i.deviceId, i.active])).toEqual([
      ['https://acme.index.test', 'dev_acme', true],
      ['https://index.identizen.com', 'dev_public', false],
    ]);
  });
});

describe('home', () => {
  const home = {
    idz: 'idz_01K3ZB2N9G0000000000000000',
    handle: 'george',
    indexUrl: 'https://index.identizen.com',
    registered: true,
    pending: [{ challenge, receivedAt: 1, via: 'push' as const }],
    activity: [],
    onOpenChallenge: jest.fn(),
    onScan: jest.fn(),
    onRegister: jest.fn(),
  };

  it('shows the brand, the handle, pending requests and one clear scan action', async () => {
    const onOpenChallenge = jest.fn();
    const onScan = jest.fn();
    await render(<HomeScreen {...home} onOpenChallenge={onOpenChallenge} onScan={onScan} />);
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

  it('shows an index switcher only when the phone holds more than one', async () => {
    const onSelectIndex = jest.fn();
    const one = await render(
      <HomeScreen {...home} indexes={[PUBLIC]} onSelectIndex={onSelectIndex} />,
    );
    expect(screen.queryByTestId('index-switcher')).toBeNull();
    expect(screen.getByText('index.identizen.com')).toBeOnTheScreen();
    await one.unmount();

    await render(<HomeScreen {...home} indexes={[PUBLIC, ACME]} onSelectIndex={onSelectIndex} />);
    expect(screen.getByTestId('index-switcher')).toBeOnTheScreen();
    expect(screen.getByLabelText('Use index.identizen.com')).toBeSelected();
    expect(screen.getByLabelText('Use acme.index.test')).not.toBeSelected();
    await fireEvent.press(screen.getByTestId('index-chip-index.identizen.com'));
    expect(onSelectIndex).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('index-chip-acme.index.test'));
    expect(onSelectIndex).toHaveBeenCalledWith('https://acme.index.test');
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
