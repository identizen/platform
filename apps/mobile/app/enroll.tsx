import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EnrollmentInfo } from '../src/enrollment/api';
import { enrollmentLinkFromParams } from '../src/enrollment/links';
import {
  beginEnrollment,
  claimEnrollment,
  pollEnrollment,
  toEnrollmentError,
  type EnrollmentError,
} from '../src/enrollment/machine';
import { readEnrollment, type PendingEnrollment } from '../src/identity/store';
import { EnrollScreen, type EnrollPhase } from '../src/screens/EnrollScreen';

const RETRYABLE = new Set(['network', 'unknown', 'attestation_failed']);

function errorPhase(e: EnrollmentError): EnrollPhase {
  return { kind: 'error', code: e.code, message: e.message, retryable: RETRYABLE.has(e.code) };
}

/** `identizen://enroll?index=…&token=…` (and the https form on the associated domain). */
export default function Enroll() {
  const router = useRouter();
  const params = useLocalSearchParams<{ index?: string; token?: string }>();
  const link = useMemo(
    () => enrollmentLinkFromParams({ index: params.index, token: params.token }),
    [params.index, params.token],
  );
  const [phase, setPhase] = useState<EnrollPhase>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const info = useRef<EnrollmentInfo | null>(null);
  const abort = useRef<AbortController | null>(null);

  const poll = useCallback((pending: PendingEnrollment) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPhase({ kind: 'waiting', org: pending.org, polling: true });
    void pollEnrollment(pending, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      if (result === 'timeout') setPhase({ kind: 'waiting', org: pending.org, polling: false });
      else if (result !== 'canceled') setPhase({ kind: result, org: pending.org });
    });
  }, []);

  useEffect(() => {
    if (!link) {
      setPhase({ kind: 'invalid' });
      return;
    }
    let canceled = false;
    setPhase({ kind: 'loading' });
    void (async () => {
      const state = await readEnrollment();
      if (canceled) return;
      // Reopened from Home (or a second tap on the same link) after claiming: resume polling.
      if (state.pending && state.pending.token === link.token) {
        poll(state.pending);
        return;
      }
      try {
        const next = await beginEnrollment(link);
        info.current = next;
        if (!canceled) setPhase({ kind: 'ready', info: next, busy: false });
      } catch (err) {
        if (!canceled) setPhase(errorPhase(toEnrollmentError(err)));
      }
    })();
    return () => {
      canceled = true;
      abort.current?.abort();
    };
  }, [link, poll, attempt]);

  const enroll = async () => {
    if (!link || phase.kind !== 'ready') return;
    setPhase({ ...phase, busy: true });
    try {
      const outcome = await claimEnrollment(link, phase.info);
      if (outcome.kind === 'approved') setPhase({ kind: 'approved', org: outcome.org });
      else
        poll({ token: link.token, indexUrl: link.index, org: outcome.org, claimedAt: Date.now() });
    } catch (err) {
      setPhase(errorPhase(toEnrollmentError(err)));
    }
  };

  const leave = () => {
    abort.current?.abort();
    router.replace('/home');
  };

  return (
    <EnrollScreen
      phase={phase}
      onEnroll={() => void enroll()}
      onCheckLater={leave}
      onRetry={() => {
        // A failed claim keeps the org sheet; a failed begin fetches it again.
        if (info.current) setPhase({ kind: 'ready', info: info.current, busy: false });
        else setAttempt((n) => n + 1);
      }}
      onDone={leave}
      onBack={leave}
    />
  );
}
