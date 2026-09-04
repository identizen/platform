import { Platform } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { biometricName } from '../src/biometrics';
import { OnboardingScreen } from '../src/screens/OnboardingScreen';

describe('biometric wording per platform', () => {
  const original = Platform.OS;
  afterEach(() => {
    Platform.OS = original;
  });

  it('uses Apple names on iOS and the generic term on Android', async () => {
    Platform.OS = 'ios';
    expect(biometricName()).toBe('Face ID');
    Platform.OS = 'android';
    expect(biometricName()).toBe('your fingerprint or face');
  });

  it('onboarding copy follows the platform', async () => {
    Platform.OS = 'android';
    await render(<OnboardingScreen onCreate={jest.fn()} onRestore={jest.fn()} />);
    expect(screen.getByText(/One tap, your fingerprint or face, in\./)).toBeOnTheScreen();
  });
});
