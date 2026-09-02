'use client';

import { useEffect, useState } from 'react';

interface VerifyResult {
  verification_id: string;
  status: string;
  reason_hash_matches?: boolean;
  webhook_status?: string | null;
}

/** Transaction approval over the Verification API (Path B, server-to-server). */
export function VerifyPanel() {
  const [reason, setReason] = useState('Approve wire transfer of $12,000 to Acme?');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function start() {
    setBusy(true);
    setResult(null);
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const started = (await res.json()) as VerifyResult;
    setResult(started);
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const poll = (await (
        await fetch(`/api/verify?id=${started.verification_id}`)
      ).json()) as VerifyResult;
      setResult(poll);
      if (poll.status !== 'pending') break;
    }
    setBusy(false);
  }

  return (
    <div style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <label>
        Reason
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button type="button" onClick={() => void start()} disabled={!ready || busy}>
        Approve on phone
      </button>
      {result ? (
        <dl>
          <dt>verification</dt>
          <dd>
            <code>{result.verification_id}</code>
          </dd>
          <dt>status</dt>
          <dd data-testid="verify-status">{result.status}</dd>
          <dt>reason</dt>
          <dd data-testid="verify-reason-ok">
            {result.status === 'approved'
              ? result.reason_hash_matches
                ? 'reason hash matches'
                : 'reason hash MISMATCH'
              : '—'}
          </dd>
          <dt>webhook</dt>
          <dd data-testid="webhook-status">{result.webhook_status ?? 'pending'}</dd>
        </dl>
      ) : null}
    </div>
  );
}
