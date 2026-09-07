import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import type { EnrollmentInfo } from '../src/enrollment/api';
import { ENROLLMENT_MESSAGES } from '../src/enrollment/machine';
import { EnrollScreen, managementSentence, type EnrollPhase } from '../src/screens/EnrollScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { ScanScreen } from '../src/screens/ScanScreen';
import { SettingsScreen } from '../src/screens/SettingsScreen';

// A camera that exposes its props, so the test can feed it a scanned code.
jest.mock('expo-camera', () => {
  const { View } = jest.requireActual<{ View: ComponentType<Record<string, unknown>> }>(
    'react-native',
  );
  return {
    CameraView: (props: Record<string, unknown>) => <View testID="camera" {...props} />,
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});

const info: EnrollmentInfo = {
  org: { display_name: 'Acme', logo_url: null },
  member_email_masked: 'g***@acme.example',
  index: 'https://acme.index.test',
  policy: { require_attestation: false },
  expires_at: '',
  nonce: 'n',
};

const handlers = () => ({
  onEnrol: jest.fn(),
  onCheckLater: jest.fn(),
  onRetry: jest.fn(),
  onDone: jest.fn(),
  onBack: jest.fn(),
});

const renderPhase = async (phase: EnrollPhase) => {
  const h = handlers();
  const r = await render(<EnrollScreen phase={phase} {...h} />);
  return { ...h, r };
};

describe('EnrollScreen', () => {
  it('shows the org sheet: name, masked email, what management means, and Enrol', async () => {
    const h = await renderPhase({ kind: 'ready', info, busy: false });
    expect(screen.getByTestId('enroll-org')).toHaveTextContent('Acme');
    expect(screen.getByTestId('enroll-email')).toHaveTextContent('g***@acme.example');
    expect(screen.getByText(managementSentence('Acme'))).toBeOnTheScreen();
    expect(managementSentence('Acme')).toMatch(/they never get your keys/);
    await fireEvent.press(screen.getByTestId('enroll-submit'));
    expect(h.onEnrol).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('enroll-cancel'));
    expect(h.onBack).toHaveBeenCalledTimes(1);
  });

  it('shows the logo and the verified-device note when the org asks for one', async () => {
    await renderPhase({
      kind: 'ready',
      info: {
        ...info,
        org: { display_name: 'Acme', logo_url: 'https://acme.example/logo.png' },
        policy: { require_attestation: true },
      },
      busy: false,
    });
    expect(screen.getByLabelText('Acme logo')).toBeOnTheScreen();
    expect(screen.getByText('Acme requires a verified device.')).toBeOnTheScreen();
  });

  it('waiting offers "check later" and says when polling has stopped', async () => {
    const h = await renderPhase({ kind: 'waiting', org: 'Acme', polling: true });
    expect(screen.getByText(/needs to approve this phone/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('enroll-later'));
    expect(h.onCheckLater).toHaveBeenCalledTimes(1);
    await h.r.rerender(
      <EnrollScreen phase={{ kind: 'waiting', org: 'Acme', polling: false }} {...handlers()} />,
    );
    expect(screen.getByText(/has not decided yet/)).toBeOnTheScreen();
  });

  it('renders the outcomes and the attestation explanation', async () => {
    const h = await renderPhase({ kind: 'approved', org: 'Acme' });
    expect(screen.getByText('You are enrolled')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('enroll-done'));
    expect(h.onDone).toHaveBeenCalledTimes(1);
    await h.r.unmount();

    const d = await renderPhase({ kind: 'denied', org: 'Acme' });
    expect(screen.getByText('Enrolment declined')).toBeOnTheScreen();
    await d.r.unmount();

    const e = await renderPhase({
      kind: 'error',
      code: 'attestation_required',
      message: ENROLLMENT_MESSAGES.attestation_required,
      retryable: false,
    });
    expect(screen.getByTestId('enroll-error-attestation_required')).toBeOnTheScreen();
    expect(screen.getByText(/only enrols verified devices/)).toBeOnTheScreen();
    expect(screen.queryByTestId('enroll-retry')).toBeNull();
    await e.r.unmount();

    const n = await renderPhase({
      kind: 'error',
      code: 'network',
      message: ENROLLMENT_MESSAGES.network,
      retryable: true,
    });
    await fireEvent.press(screen.getByTestId('enroll-retry'));
    expect(n.onRetry).toHaveBeenCalledTimes(1);
    await n.r.unmount();

    await renderPhase({ kind: 'invalid' });
    expect(screen.getByText('That is not an Identizen enrolment link.')).toBeOnTheScreen();
  });
});

describe('managed-by surfaces', () => {
  const home = {
    idz: 'idz_01K3ZB2N9G0000000000000000',
    handle: 'george',
    indexUrl: 'https://acme.index.test',
    registered: true,
    pending: [],
    activity: [],
    onOpenChallenge: jest.fn(),
    onScan: jest.fn(),
    onRegister: jest.fn(),
  };

  it('Home shows "Managed by" and a pending enrollment card that reopens the flow', async () => {
    const onCheck = jest.fn();
    await render(
      <HomeScreen
        {...home}
        managedBy={{ org: 'Acme', index: 'https://acme.index.test' }}
        pendingEnrollment={{
          token: 't'.repeat(20),
          indexUrl: 'https://acme.index.test',
          org: 'Acme',
          claimedAt: 1,
        }}
        onCheckEnrollment={onCheck}
      />,
    );
    expect(screen.getByTestId('managed-by')).toHaveTextContent('Managed by Acme');
    expect(screen.getByText(/Waiting for Acme to approve this phone/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('check-enrollment'));
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it('Home without enrollment shows neither', async () => {
    await render(<HomeScreen {...home} />);
    expect(screen.queryByTestId('managed-by')).toBeNull();
    expect(screen.queryByTestId('check-enrollment')).toBeNull();
  });

  it('Settings shows the org and its index URL', async () => {
    await render(
      <SettingsScreen
        indexUrl="https://acme.index.test"
        handle={null}
        registered
        theme="system"
        biometricRequired
        bluetoothEnabled
        bluetoothSupported={false}
        managedBy={{ org: 'Acme', index: 'https://acme.index.test' }}
        onBluetoothEnabled={jest.fn()}
        onSaveHandle={jest.fn()}
        onSaveIndexUrl={jest.fn()}
        onTheme={jest.fn()}
        onBiometricRequired={jest.fn()}
        onShowPhrase={jest.fn()}
        onForget={jest.fn()}
        about={{ version: null, build: null, builtAt: null, commit: null }}
      />,
    );
    expect(screen.getByText('Managed by Acme')).toBeOnTheScreen();
    expect(screen.getByTestId('managed-index')).toHaveTextContent('https://acme.index.test');
    expect(screen.getByText(/They never get your keys/)).toBeOnTheScreen();
  });
});

describe('scanning an enrollment QR', () => {
  it('routes the enrollment link instead of treating it as a bad sign-in code', async () => {
    const onEnrollmentLink = jest.fn();
    const onScanned = jest.fn(() => Promise.resolve());
    await render(
      <ScanScreen onScanned={onScanned} onEnrollmentLink={onEnrollmentLink} onBack={jest.fn()} />,
    );
    const camera = screen.getByTestId('camera').props as {
      onBarcodeScanned: (e: { data: string }) => void;
    };
    camera.onBarcodeScanned({
      data: `identizen://enroll?index=https://acme.index.test&token=${'t'.repeat(20)}`,
    });
    expect(onEnrollmentLink).toHaveBeenCalledWith({
      index: 'https://acme.index.test',
      token: 't'.repeat(20),
    });
    expect(onScanned).not.toHaveBeenCalled();
  });
});
