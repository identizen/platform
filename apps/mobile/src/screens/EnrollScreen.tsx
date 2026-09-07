import { Image, Text, View } from 'react-native';
import { Building2 } from 'lucide-react-native';
import { Body, Button, Card, ErrorText, Heading, Muted, Screen } from '../components/ui';
import { useBrandColor } from '../components/brand';
import type { EnrollmentInfo } from '../enrollment/api';
import type { EnrollmentErrorCode } from '../enrollment/machine';

export type EnrollPhase =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'ready'; info: EnrollmentInfo; busy: boolean }
  | { kind: 'waiting'; org: string; polling: boolean }
  | { kind: 'approved'; org: string }
  | { kind: 'denied'; org: string }
  | { kind: 'expired'; org: string }
  | { kind: 'error'; code: EnrollmentErrorCode; message: string; retryable: boolean };

export interface EnrollScreenProps {
  phase: EnrollPhase;
  onEnrol: () => void;
  onCheckLater: () => void;
  onRetry: () => void;
  onDone: () => void;
  onBack: () => void;
}

/** What the org gets, in one sentence, shown before the user commits. */
export function managementSentence(org: string): string {
  return `This phone will be managed by ${org}: they can disable or remove it and see your sign-in activity; they never get your keys.`;
}

function OrgHeader({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const muted = useBrandColor('muted');
  return (
    <View className="items-center gap-3">
      {logoUrl ? (
        <Image
          source={{ uri: logoUrl }}
          accessibilityLabel={`${name} logo`}
          className="h-16 w-16 rounded-lg"
          resizeMode="contain"
        />
      ) : (
        <View className="h-16 w-16 items-center justify-center rounded-lg bg-surface-2 dark:bg-surface-2-dark">
          <Building2 size={32} color={muted} />
        </View>
      )}
      <Text
        className="text-center font-semibold text-2xl text-fg dark:text-fg-dark"
        testID="enroll-org"
      >
        {name}
      </Text>
    </View>
  );
}

function Centered({ children, testID }: { children: React.ReactNode; testID: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-3" testID={testID}>
      {children}
    </View>
  );
}

export function EnrollScreen({
  phase,
  onEnrol,
  onCheckLater,
  onRetry,
  onDone,
  onBack,
}: EnrollScreenProps) {
  const title = 'Join an organisation';
  if (phase.kind === 'loading') {
    return (
      <Screen scroll={false} testID="enroll-loading" title={title} onBack={onBack}>
        <Centered testID="enroll-loading-body">
          <Muted>Checking the enrolment link…</Muted>
        </Centered>
      </Screen>
    );
  }
  if (phase.kind === 'invalid') {
    return (
      <Screen scroll={false} testID="enroll-invalid" title={title} onBack={onBack}>
        <Centered testID="enroll-invalid-body">
          <ErrorText>That is not an Identizen enrolment link.</ErrorText>
        </Centered>
        <Button label="Done" onPress={onDone} testID="enroll-done" />
      </Screen>
    );
  }
  if (phase.kind === 'error') {
    return (
      <Screen scroll={false} testID={`enroll-error-${phase.code}`} title={title} onBack={onBack}>
        <Centered testID="enroll-error-body">
          <Heading>Cannot enrol</Heading>
          <Body center>{phase.message}</Body>
        </Centered>
        <View className="gap-2">
          {phase.retryable ? (
            <Button label="Try again" onPress={onRetry} testID="enroll-retry" />
          ) : null}
          <Button
            label="Done"
            variant={phase.retryable ? 'secondary' : 'primary'}
            onPress={onDone}
            testID="enroll-done"
          />
        </View>
      </Screen>
    );
  }
  if (phase.kind === 'ready') {
    const { info, busy } = phase;
    return (
      <Screen scroll testID="enroll-ready" title={title} onBack={onBack}>
        <View className="flex-1 gap-5 pt-4">
          <OrgHeader name={info.org.display_name} logoUrl={info.org.logo_url} />
          <Card>
            <Muted>Enrolling as</Muted>
            <Text className="font-mono text-base text-fg dark:text-fg-dark" testID="enroll-email">
              {info.member_email_masked}
            </Text>
          </Card>
          <Body>{managementSentence(info.org.display_name)}</Body>
          {info.policy.require_attestation ? (
            <Muted>{info.org.display_name} requires a verified device.</Muted>
          ) : null}
        </View>
        <View className="gap-2">
          <Button label="Enrol" onPress={onEnrol} busy={busy} testID="enroll-submit" />
          <Button
            label="Not now"
            variant="secondary"
            onPress={onBack}
            disabled={busy}
            testID="enroll-cancel"
          />
        </View>
      </Screen>
    );
  }
  if (phase.kind === 'waiting') {
    return (
      <Screen scroll={false} testID="enroll-waiting" title={title} onBack={onBack}>
        <Centered testID="enroll-waiting-body">
          <Heading>Waiting for approval</Heading>
          <Body center>
            {phase.polling
              ? `An administrator at ${phase.org} needs to approve this phone. You can wait here or check back later.`
              : `${phase.org} has not decided yet. Come back later; Home will show the result.`}
          </Body>
        </Centered>
        <Button
          label="Check later"
          variant="secondary"
          onPress={onCheckLater}
          testID="enroll-later"
        />
      </Screen>
    );
  }
  const heading =
    phase.kind === 'approved'
      ? 'You are enrolled'
      : phase.kind === 'denied'
        ? 'Enrolment declined'
        : 'Enrolment expired';
  const detail =
    phase.kind === 'approved'
      ? `This phone is now managed by ${phase.org}.`
      : phase.kind === 'denied'
        ? `${phase.org} declined this phone. Ask your administrator if you think that is wrong.`
        : `${phase.org} did not decide in time. Ask your administrator for a new link.`;
  return (
    <Screen scroll={false} testID={`enroll-${phase.kind}`} title={title}>
      <Centered testID="enroll-result-body">
        <Heading>{heading}</Heading>
        <Body center>{detail}</Body>
      </Centered>
      <Button label="Done" onPress={onDone} testID="enroll-done" />
    </Screen>
  );
}
