import * as React from 'react';
import {
  createIdentizen,
  type Identizen,
  type IdentizenConfig,
  type LoginSession,
  type LoginState,
  type StartLoginOptions,
} from '@identizen/sdk';

export interface IdentizenProviderProps extends IdentizenConfig {
  children: React.ReactNode;
  /** Supply a pre-built client (tests, custom transports). */
  client?: Identizen;
}

const IdentizenContext = React.createContext<Identizen | null>(null);

/** Provides the Identizen client to the tree. One per app. */
export function IdentizenProvider({
  children,
  client,
  ...config
}: IdentizenProviderProps): React.JSX.Element {
  const value = React.useMemo(
    () => client ?? createIdentizen(config),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config is compared by its primitive parts
    [client, config.indexUrl, config.clientId, config.pairing],
  );
  return <IdentizenContext.Provider value={value}>{children}</IdentizenContext.Provider>;
}

export interface UseIdentizen {
  client: Identizen;
  /** Current login state, or null when idle. */
  state: LoginState | null;
  /** True while a login is in flight. */
  busy: boolean;
  /** Start a login (Path A) and track its state. Resolves with the terminal state. */
  startLogin: (options?: StartLoginOptions) => Promise<LoginState>;
  /** Path B enrollment. */
  enroll: (options?: Omit<StartLoginOptions, 'prompt'>) => Promise<LoginState>;
  /** Path B step-up for a bound sub. */
  stepUp: (
    sub: string,
    options?: Omit<StartLoginOptions, 'acr' | 'loginHint'>,
  ) => Promise<LoginState>;
  cancel: () => void;
  reset: () => void;
}

/** Login state and actions for the nearest <IdentizenProvider>. */
export function useIdentizen(): UseIdentizen {
  const client = React.useContext(IdentizenContext);
  if (!client) throw new Error('useIdentizen must be used inside <IdentizenProvider>');
  const [state, setState] = React.useState<LoginState | null>(null);
  const sessionRef = React.useRef<LoginSession | null>(null);
  const unsubscribeRef = React.useRef<(() => void) | null>(null);

  const track = React.useCallback((session: LoginSession): Promise<LoginState> => {
    unsubscribeRef.current?.();
    sessionRef.current?.cancel();
    sessionRef.current = session;
    unsubscribeRef.current = session.subscribe(setState);
    return session.done;
  }, []);

  React.useEffect(
    () => () => {
      unsubscribeRef.current?.();
      sessionRef.current?.cancel();
    },
    [],
  );

  const busy =
    state !== null &&
    (state.status === 'starting' || state.status === 'discovering' || state.status === 'waiting');

  return {
    client,
    state,
    busy,
    startLogin: React.useCallback((options) => track(client.startLogin(options)), [client, track]),
    enroll: React.useCallback((options) => track(client.enroll(options)), [client, track]),
    stepUp: React.useCallback(
      (sub, options) => track(client.stepUp(sub, options)),
      [client, track],
    ),
    cancel: React.useCallback(() => sessionRef.current?.cancel(), []),
    reset: React.useCallback(() => {
      unsubscribeRef.current?.();
      sessionRef.current?.cancel();
      sessionRef.current = null;
      setState(null);
    }, []),
  };
}
