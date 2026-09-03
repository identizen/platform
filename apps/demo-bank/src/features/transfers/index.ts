import approvalPanelSource from './components/approval-panel.tsx?raw';
import useTransfersSource from './hooks/use-transfers.ts?raw';

export { TransferRoute } from './routes/transfer-route';
export { ActivityRoute } from './routes/activity-route';
export { needsApproval } from './hooks/use-transfers';
export { ACH_APPROVAL_THRESHOLD } from './types';

/** The real source of this feature, shown verbatim on the docs pages. */
export const TRANSFERS_SOURCE = {
  approvalPanel: approvalPanelSource,
  useTransfers: useTransfersSource,
};
