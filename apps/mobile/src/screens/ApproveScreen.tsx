import { useState } from 'react';
import { Text, View } from 'react-native';
import type { Challenge } from '@identizen/protocol';
import { MatchCode, ReasonBox } from '../components/challenge';
import { Button, ErrorText, Heading, Muted, Screen } from '../components/ui';

export type ApproveOutcome = 'approved' | 'denied' | 'cancelled' | 'failed';

export interface ApproveScreenProps {
  challenge: Challenge;
  /** Runs the biometric gate and signs. Resolves with the outcome; rejects on transport errors. */
  onApprove: () => Promise<ApproveOutcome>;
  onDeny: () => Promise<void>;
  onDone: () => void;
}

/**
 * The whole UX (PRD principle 5): site name, match code, the reason if there is one, and a
 * biometric prompt. Three variants driven by the challenge: login, MFA, transaction (MFA + reason).
 */
export function ApproveScreen({ challenge, onApprove, onDeny, onDone }: ApproveScreenProps) {
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [outcome, setOutcome] = useState<ApproveOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const variant =
    challenge.acr === 'idz:mfa' ? (challenge.reason ? 'transaction' : 'mfa') : 'login';
  const title =
    variant === 'login'
      ? 'Sign in to'
      : variant === 'mfa'
        ? 'Confirm it is you for'
        : 'Approve for';

  const approve = async () => {
    setBusy('approve');
    setError(null);
    try {
      const result = await onApprove();
      setOutcome(result);
      if (result === 'failed')
        setError('The index rejected the approval. Try again from the site.');
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };
  const deny = async () => {
    setBusy('deny');
    try {
      await onDeny();
      setOutcome('denied');
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  if (outcome === 'approved' || outcome === 'denied') {
    return (
      <Screen scroll={false} testID={`approve-${outcome}`}>
        <View className="flex-1 items-center justify-center gap-2">
          <Heading>{outcome === 'approved' ? 'Approved' : 'Declined'}</Heading>
          <Muted center>
            {outcome === 'approved'
              ? `You are signed in to ${challenge.rp_name}.`
              : `${challenge.rp_name} was told you declined.`}
          </Muted>
        </View>
        <Button label="Done" onPress={onDone} testID="approve-done" />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} testID={`approve-${variant}`} title="Sign-in request">
      <View className="flex-1 justify-center gap-4">
        <Muted center>{title}</Muted>
        <Text
          className="text-center font-semibold text-2xl text-fg dark:text-fg-dark"
          testID="rp-name"
        >
          {challenge.rp_name}
        </Text>
        <Muted center>{challenge.rp_id}</Muted>
        {challenge.reason ? <ReasonBox reason={challenge.reason} /> : null}
        <MatchCode code={challenge.code} />
        {error ? <ErrorText>{error}</ErrorText> : null}
      </View>
      <View className="gap-2">
        <Button
          label="Approve"
          onPress={() => void approve()}
          busy={busy === 'approve'}
          disabled={busy === 'deny'}
          testID="approve"
        />
        <Button
          label="Deny"
          variant="secondary"
          onPress={() => void deny()}
          busy={busy === 'deny'}
          disabled={busy === 'approve'}
          testID="deny"
        />
      </View>
    </Screen>
  );
}
