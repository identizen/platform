import loginComponentSource from './components/identizen-login.tsx?raw';
import callbackSource from './routes/callback-route.tsx?raw';
import oidcSource from './api/oidc.ts?raw';

export { LoginRoute } from './routes/login-route';
export { CallbackRoute } from './routes/callback-route';
export { useSession } from './hooks/use-session';
export { setSession, getSession, type BankSession, type SessionClaims } from './api/session';

/** The real source of this feature, shown verbatim on the docs pages. */
export const AUTH_SOURCE = {
  loginComponent: loginComponentSource,
  callback: callbackSource,
  oidc: oidcSource,
};
