// Feature barrels (each feature's public surface).
export * from './features/activity';
export * from './features/auth';
export * from './features/deep-link';
export * from './features/devices';
export * from './features/overview';
export * from './features/pairings';
export * from './features/sessions';
export * from './features/settings';

// Shared presentational components.
export { AppShell, NAV, type AppShellProps, type NavItem } from './components/shared/app-shell';
export { ConfirmButton, type ConfirmButtonProps } from './components/shared/confirm-button';
export { EmptyState, type EmptyStateProps } from './components/shared/empty-state';
export { PageHeader, type PageHeaderProps } from './components/shared/page-header';
export { StatusBadge } from './components/shared/status-badge';

// Index client, runtime configuration, formatting.
export { api, ApiError, UnauthorizedError, type ApiOptions } from './lib/http';
export {
  INDEX_URL,
  MOCK_MODE,
  appOrigin,
  indexUrlFromHost,
  redirectUri,
  resolveClientId,
  resolveIndexUrl,
  type IndexUrlSources,
  type RuntimeConfig,
} from './lib/config';
export { relativeTime, shortId, titleCase } from './lib/format';
