import { useCallback, useEffect, useRef, useState } from 'react';
import { VirtualPhone, webStore, type PendingRequest } from '../lib/virtual-phone';

/** Fired by the playground login on every SDK state change. */
export interface ChallengeEventDetail {
  challengeId: string;
  status: string;
  method: string | null;
  mode: 'virtual' | 'phone';
}
export const CHALLENGE_EVENT = 'identizen:challenge';
export const MODE_EVENT = 'identizen:mode';
const ACTIVE = new Set(['starting', 'discovering', 'waiting']);
const POLL_MS = 1000;

export type PhoneScreen =
  | { kind: 'idle' }
  | { kind: 'request'; pending: PendingRequest; busy: boolean }
  | { kind: 'result'; ok: boolean; title: string; detail: string };

export interface VirtualPhoneView {
  screen: PhoneScreen;
  registered: boolean;
  deviceId: string | null;
  mode: 'virtual' | 'phone';
  polling: boolean;
  approve: () => void;
  deny: () => void;
  reset: () => void;
}

/** The virtual phone's state machine: listens to the login, scans, polls, signs. */
export function useVirtualPhone(indexUrl: string): VirtualPhoneView {
  const phoneRef = useRef<VirtualPhone | null>(null);
  const [screen, setScreenState] = useState<PhoneScreen>({ kind: 'idle' });
  const screenRef = useRef<PhoneScreen>({ kind: 'idle' });
  const setScreen = useCallback((next: PhoneScreen | ((s: PhoneScreen) => PhoneScreen)) => {
    const value = typeof next === 'function' ? next(screenRef.current) : next;
    screenRef.current = value;
    setScreenState(value);
  }, []);
  const [registered, setRegistered] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [mode, setMode] = useState<'virtual' | 'phone'>('virtual');
  const [polling, setPolling] = useState(false);
  const activeRef = useRef<string | null>(null);
  const handledRef = useRef(new Set<string>());
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phone = (): VirtualPhone => {
    if (!phoneRef.current) {
      phoneRef.current = new VirtualPhone({ indexUrl, store: webStore(localStorage) });
    }
    return phoneRef.current;
  };

  const sync = useCallback(() => {
    const p = phone();
    setRegistered(p.registered);
    setDeviceId(p.deviceId);
  }, []);

  const showResult = useCallback(
    (ok: boolean, title: string, detail: string) => {
      setScreen({ kind: 'result', ok, title, detail });
      if (resultTimer.current) clearTimeout(resultTimer.current);
      resultTimer.current = setTimeout(() => setScreen({ kind: 'idle' }), 3500);
    },
    [setScreen],
  );

  const present = useCallback(
    (pending: PendingRequest) => {
      if (resultTimer.current) clearTimeout(resultTimer.current);
      setScreen({ kind: 'request', pending, busy: false });
    },
    [setScreen],
  );

  useEffect(() => {
    sync();
    const onMode = (e: Event) => setMode((e as CustomEvent<'virtual' | 'phone'>).detail);
    const onChallenge = (e: Event) => {
      const d = (e as CustomEvent<ChallengeEventDetail>).detail;
      setMode(d.mode);
      if (d.mode !== 'virtual') return;
      if (ACTIVE.has(d.status)) {
        activeRef.current = d.challengeId;
        setPolling(true);
        if (d.method === 'qr' && !handledRef.current.has(d.challengeId)) {
          handledRef.current.add(d.challengeId);
          phone()
            .scan(d.challengeId)
            .then((p) => {
              sync();
              present(p);
            })
            .catch((err: unknown) =>
              showResult(false, 'Could not read the code', err instanceof Error ? err.message : ''),
            );
        }
      } else {
        activeRef.current = null;
        setPolling(false);
        if (d.status === 'expired' || d.status === 'cancelled') {
          setScreen((s) =>
            s.kind === 'request' && s.pending.challenge.id === d.challengeId ? { kind: 'idle' } : s,
          );
        }
      }
    };
    window.addEventListener(CHALLENGE_EVENT, onChallenge);
    window.addEventListener(MODE_EVENT, onMode);
    return () => {
      window.removeEventListener(CHALLENGE_EVENT, onChallenge);
      window.removeEventListener(MODE_EVENT, onMode);
      if (resultTimer.current) clearTimeout(resultTimer.current);
    };
  }, [present, setScreen, showResult, sync]);

  // Poll the inbox (never faster than once a second) only while a login is pending.
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    let inFlight = false;
    const tick = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const p = phone();
        if (!p.registered) await p.register();
        sync();
        const fresh = await p.pollInbox();
        const first = fresh[0];
        if (first) {
          handledRef.current.add(first.challenge.id);
          present(first);
        }
      } catch {
        /* index unreachable; try again next tick */
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [polling, present, sync]);

  const approve = useCallback(() => {
    const s = screenRef.current;
    if (s.kind !== 'request' || s.busy) return;
    setScreen({ ...s, busy: true });
    phone()
      .approve(s.pending.challenge.id)
      .then((r) =>
        r.ok
          ? showResult(true, 'Approved', 'Signed assertion sent to the index.')
          : showResult(false, 'The index said no', r.error ?? ''),
      )
      .catch((err: unknown) =>
        showResult(false, 'Could not approve', err instanceof Error ? err.message : ''),
      );
  }, [setScreen, showResult]);

  const deny = useCallback(() => {
    const s = screenRef.current;
    if (s.kind !== 'request' || s.busy) return;
    setScreen({ ...s, busy: true });
    phone()
      .deny(s.pending.challenge.id)
      .then(() => showResult(false, 'Denied', 'The site was told you declined.'))
      .catch((err: unknown) =>
        showResult(false, 'Could not deny', err instanceof Error ? err.message : ''),
      );
  }, [setScreen, showResult]);

  const reset = useCallback(() => {
    phone().reset();
    handledRef.current.clear();
    setScreen({ kind: 'idle' });
    sync();
  }, [setScreen, sync]);

  return { screen, registered, deviceId, mode, polling, approve, deny, reset };
}
