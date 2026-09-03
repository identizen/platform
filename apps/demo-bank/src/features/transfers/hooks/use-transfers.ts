import { useCallback, useSyncExternalStore } from 'react';
import {
  addTransfer,
  listTransfers,
  newTransferId,
  subscribeTransfers,
  transfersSnapshot,
  updateTransfer,
} from '../api/store';
import { ACH_APPROVAL_THRESHOLD, type Transfer, type TransferKind } from '../types';

export interface NewTransfer {
  kind: TransferKind;
  fromAccountId: string;
  payeeId: string;
  amount: number;
  memo: string;
}

/** Whether a transfer must be approved on the phone before it moves. */
export function needsApproval(kind: TransferKind, amount: number): boolean {
  return kind === 'wire' || amount >= ACH_APPROVAL_THRESHOLD;
}

export function useTransfers() {
  useSyncExternalStore(subscribeTransfers, transfersSnapshot, () => '');
  const transfers = listTransfers();

  const create = useCallback((input: NewTransfer): Transfer => {
    const t: Transfer = {
      id: newTransferId(),
      ...input,
      status: needsApproval(input.kind, input.amount) ? 'needs_approval' : 'scheduled',
      createdAt: new Date().toISOString(),
      approval: null,
    };
    addTransfer(t);
    return t;
  }, []);

  const approve = useCallback((id: string, challengeId: string, reason: string) => {
    updateTransfer(id, {
      status: 'scheduled',
      approval: { challengeId, approvedAt: new Date().toISOString(), reason },
    });
  }, []);

  const decline = useCallback((id: string) => {
    updateTransfer(id, { status: 'declined' });
  }, []);

  return { transfers, create, approve, decline };
}
