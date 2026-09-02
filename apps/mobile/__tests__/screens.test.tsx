import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { Challenge } from '@identizen/protocol';
import { ApproveScreen } from '../src/screens/ApproveScreen';
import { ListScreen, type ListItem } from '../src/screens/ListScreen';
import { OnboardingScreen } from '../src/screens/OnboardingScreen';
import { PassphraseScreen } from '../src/screens/PassphraseScreen';
import { RestoreScreen, validatePhrase } from '../src/screens/RestoreScreen';
import { SettingsScreen, validateHandle } from '../src/screens/SettingsScreen';
import { VerifyWordsScreen, pickWordIndexes } from '../src/screens/VerifyWordsScreen';
import { mapDevice } from '../src/app/lists';

const WORDS =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art'.split(
    ' ',
  );

const challenge = (over: Partial<Challenge> = {}): Challenge => ({
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
  ...over,
});

describe('onboarding', () => {
  it('offers create and restore', async () => {
    const onCreate = jest.fn();
    const onRestore = jest.fn();
    await render(<OnboardingScreen onCreate={onCreate} onRestore={onRestore} />);
    await fireEvent.press(screen.getByTestId('create-identity'));
    await fireEvent.press(screen.getByTestId('restore-identity'));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('shows all 24 words and the warning, and continues', async () => {
    const onContinue = jest.fn();
    await render(<PassphraseScreen words={WORDS} onContinue={onContinue} />);
    expect(screen.getByText(/no one — including us/)).toBeOnTheScreen();
    expect(screen.getByText('art')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('passphrase-continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('checks 3 words: wrong entries are reported, right ones verify', async () => {
    const onVerified = jest.fn();
    await render(
      <VerifyWordsScreen
        words={WORDS}
        indexes={[0, 5, 23]}
        onVerified={onVerified}
        onBack={jest.fn()}
      />,
    );
    await fireEvent.changeText(screen.getByTestId('word-1'), 'abandon');
    await fireEvent.changeText(screen.getByTestId('word-6'), 'abandon');
    await fireEvent.changeText(screen.getByTestId('word-24'), 'wrong');
    await fireEvent.press(screen.getByTestId('verify-continue'));
    expect(screen.getByRole('alert')).toHaveTextContent(/Word 24/);
    expect(onVerified).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('word-24'), ' ART ');
    await fireEvent.press(screen.getByTestId('verify-continue'));
    expect(onVerified).toHaveBeenCalledTimes(1);
    expect(pickWordIndexes(24, 3, () => 0.5)).toHaveLength(3);
    expect(new Set(pickWordIndexes(24, 3, () => 0.999)).size).toBe(3);
    expect(pickWordIndexes(24)).toHaveLength(3);
  });

  it('restore validates the phrase before calling through', async () => {
    const onRestore = jest.fn(() => Promise.reject(new Error('bad checksum')));
    await render(<RestoreScreen onRestore={onRestore} onBack={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('phrase-input'), 'abandon abandon');
    await fireEvent.press(screen.getByTestId('restore-submit'));
    expect(screen.getByRole('alert')).toHaveTextContent(/24 words/);
    expect(onRestore).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('phrase-input'), WORDS.join(' '));
    await fireEvent.press(screen.getByTestId('restore-submit'));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(WORDS.join(' ')));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/does not check out/));
    expect(validatePhrase(`${WORDS.join(' ')} zzzz`)).toMatch(/24 words/);
    expect(validatePhrase(WORDS.map((w, i) => (i === 3 ? 'notaword' : w)).join(' '))).toMatch(
      /notaword/,
    );
    expect(validatePhrase(WORDS.join(' '))).toBeNull();
  });
});

describe('approve screen', () => {
  it('login variant: site name, code, no reason box; approving shows the result', async () => {
    const onApprove = jest.fn(() => Promise.resolve('approved' as const));
    await render(
      <ApproveScreen
        challenge={challenge()}
        onApprove={onApprove}
        onDeny={jest.fn()}
        onDone={jest.fn()}
      />,
    );
    expect(screen.getByTestId('approve-login')).toBeOnTheScreen();
    expect(screen.getByTestId('rp-name')).toHaveTextContent('Example App');
    expect(screen.getByTestId('match-code')).toHaveTextContent('47');
    expect(screen.queryByTestId('reason-box')).toBeNull();
    await fireEvent.press(screen.getByTestId('approve'));
    await waitFor(() => expect(screen.getByTestId('approve-approved')).toBeOnTheScreen());
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('mfa variant has no reason; transaction variant shows the reason verbatim', async () => {
    const first = await render(
      <ApproveScreen
        challenge={challenge({ acr: 'idz:mfa' })}
        onApprove={jest.fn()}
        onDeny={jest.fn()}
        onDone={jest.fn()}
      />,
    );
    expect(screen.getByTestId('approve-mfa')).toBeOnTheScreen();
    expect(screen.queryByTestId('reason-box')).toBeNull();
    await first.unmount();
    await render(
      <ApproveScreen
        challenge={challenge({
          acr: 'idz:mfa',
          reason: 'Approve wire transfer of $12,000 to Acme?',
        })}
        onApprove={jest.fn()}
        onDeny={jest.fn()}
        onDone={jest.fn()}
      />,
    );
    expect(screen.getByTestId('approve-transaction')).toBeOnTheScreen();
    expect(screen.getByTestId('reason-box')).toHaveTextContent(
      'Approve wire transfer of $12,000 to Acme?',
    );
  });

  it('deny calls through and shows declined; failed approvals show an error', async () => {
    const onDeny = jest.fn(() => Promise.resolve());
    await render(
      <ApproveScreen
        challenge={challenge()}
        onApprove={jest.fn(() => Promise.resolve('failed' as const))}
        onDeny={onDeny}
        onDone={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId('approve'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/rejected/));
    await fireEvent.press(screen.getByTestId('deny'));
    await waitFor(() => expect(screen.getByTestId('approve-denied')).toBeOnTheScreen());
    expect(onDeny).toHaveBeenCalledTimes(1);
  });
});

describe('lists and settings', () => {
  it('devices list: current device is not revocable; revoke needs a confirm tap', async () => {
    const items: ListItem[] = [
      mapDevice({
        id: 'dev_01K3ZB2N9G0000000000000001',
        status: 'active',
        push_platform: 'apns',
        has_ble: true,
        last_seen_at: null,
        created_at: 'x',
        current: true,
      }),
      mapDevice({
        id: 'dev_01K3ZB2N9G0000000000000002',
        status: 'active',
        push_platform: null,
        has_ble: false,
        last_seen_at: null,
        created_at: 'x',
        current: false,
      }),
    ];
    const onRevoke = jest.fn(() => Promise.resolve());
    await render(
      <ListScreen
        heading="Devices"
        intro=""
        items={items}
        loading={false}
        error={null}
        emptyText="none"
        revokeLabel="Revoke"
        onRevoke={onRevoke}
        onRefresh={jest.fn()}
        onBack={jest.fn()}
      />,
    );
    expect(screen.getByText('This phone')).toBeOnTheScreen();
    expect(screen.queryByTestId('revoke-dev_01K3ZB2N9G0000000000000001')).toBeNull();
    await fireEvent.press(screen.getByTestId('revoke-dev_01K3ZB2N9G0000000000000002'));
    expect(onRevoke).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('confirm-dev_01K3ZB2N9G0000000000000002'));
    await waitFor(() => expect(onRevoke).toHaveBeenCalledWith('dev_01K3ZB2N9G0000000000000002'));
  });

  it('settings validates the handle like the index does', async () => {
    expect(validateHandle('')).toBeNull();
    expect(validateHandle('ab')).toMatch(/3 to 32/);
    expect(validateHandle('-bad')).toMatch(/start and end/);
    expect(validateHandle('George')).toBeNull();
    const onSaveHandle = jest.fn(() => Promise.resolve());
    await render(
      <SettingsScreen
        indexUrl="http://index.test"
        handle={null}
        registered
        theme="system"
        biometricRequired
        onSaveHandle={onSaveHandle}
        onSaveIndexUrl={jest.fn()}
        onTheme={jest.fn()}
        onBiometricRequired={jest.fn()}
        onShowPhrase={jest.fn()}
        onForget={jest.fn()}
        onBack={jest.fn()}
      />,
    );
    await fireEvent.changeText(screen.getByTestId('handle-input'), 'x');
    await fireEvent.press(screen.getByTestId('save-handle'));
    expect(screen.getByRole('alert')).toHaveTextContent(/3 to 32/);
    expect(onSaveHandle).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('handle-input'), 'George');
    await fireEvent.press(screen.getByTestId('save-handle'));
    expect(onSaveHandle).toHaveBeenCalledWith('george');
  });
});
