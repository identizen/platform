import type { Cents } from '@/lib/money';

export type TransferKind = 'ach' | 'wire';

export type TransferStatus = 'needs_approval' | 'scheduled' | 'sent' | 'declined';

export interface Transfer {
  id: string;
  kind: TransferKind;
  fromAccountId: string;
  payeeId: string;
  amount: Cents;
  memo: string;
  status: TransferStatus;
  createdAt: string;
  /** Filled in when the phone approved: the Identizen challenge that was signed. */
  approval: {
    challengeId: string;
    approvedAt: string;
    /** The exact text the person saw on the phone and signed. */
    reason: string;
  } | null;
}

/** ACH moves under this amount go straight through; everything else asks the phone. */
export const ACH_APPROVAL_THRESHOLD: Cents = 100_000;
