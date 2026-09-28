import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { BANK_NAME, FROMENANCE_SITE_KEY, FROMENANCE_TURNSTILE_SITE_KEY } from '@/lib/config';
import {
  fillVerifyForm,
  loadFromenance,
  recallVerifyEmail,
  rememberVerifyEmail,
  setVerifyEmail,
  verifyEmailField,
  watchTheme,
  widgetTheme,
  type PublicVerdict,
  type VerifyFormValues,
} from '../api/widget';

export interface VerifyWidgetHandle {
  /** Put a sample into the widget's fields. False until the widget has mounted. */
  fill: (values: VerifyFormValues) => boolean;
  /**
   * Put the visitor's own address into the widget and remember it in this browser, so a message
   * they had sent to themselves is checked against the right recipient. False until mounted.
   */
  setEmail: (email: string) => boolean;
}

export interface VerifyWidgetProps {
  onVerdict?: (verdict: PublicVerdict) => void;
  ref?: Ref<VerifyWidgetHandle>;
}

/** The bank's accent, read from the design tokens so the widget's button matches the site. */
function bankAccent(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
  return v || '#1f5c47';
}

/**
 * Mounts the Fromenance verify widget into a div this component owns. The widget renders its own
 * form and verdict card; this component only loads it, hands it the site key and theme, relays the
 * verdict to the page, and keeps the visitor's address in the form: the registry matches a code to
 * the address that received the message, so a paste without the address cannot come back Verified.
 */
export function VerifyWidget({ onVerdict, ref }: VerifyWidgetProps) {
  const target = useRef<HTMLDivElement>(null);
  const latest = useRef(onVerdict);
  const remembered = useRef<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    latest.current = onVerdict;
  }, [onVerdict]);

  useImperativeHandle(ref, () => ({
    fill: (values) => (target.current ? fillVerifyForm(target.current, values) : false),
    setEmail: (email) => {
      remembered.current = email;
      rememberVerifyEmail(email);
      return target.current ? setVerifyEmail(target.current, email) : false;
    },
  }));

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    let cancelled = false;
    remembered.current = recallVerifyEmail();
    loadFromenance()
      .then((api) => {
        if (cancelled) return;
        api.mount({
          siteKey: FROMENANCE_SITE_KEY,
          target: el,
          institutionName: BANK_NAME,
          theme: widgetTheme(),
          accent: bankAccent(),
          onVerdict: (v) => latest.current?.(v),
          ...(FROMENANCE_TURNSTILE_SITE_KEY
            ? { turnstileSiteKey: FROMENANCE_TURNSTILE_SITE_KEY }
            : {}),
        });
        if (remembered.current) setVerifyEmail(el, remembered.current);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    // The widget owns its submit button. Before its handler runs, an empty address field gets the
    // address this visitor last asked a demo email to be sent to.
    const beforeSubmit = (event: Event) => {
      const t = event.target;
      if (!(t instanceof Element) || !t.closest('button')) return;
      const field = verifyEmailField(el);
      if (field && field.value.trim() === '' && remembered.current)
        field.value = remembered.current;
    };
    el.addEventListener('click', beforeSubmit, true);
    const stop = watchTheme((theme) => {
      el.querySelector('.frv')?.setAttribute('data-theme', theme);
    });
    return () => {
      cancelled = true;
      stop();
      el.removeEventListener('click', beforeSubmit, true);
      el.replaceChildren();
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {state === 'loading' && (
        <p className="text-sm text-fg-muted" role="status">
          Loading the verify form.
        </p>
      )}
      {state === 'error' && (
        <p className="rounded-md border border-danger/40 bg-danger-soft p-3 text-sm" role="alert">
          The verify form could not load. Check your connection and reload the page.
        </p>
      )}
      <div ref={target} data-testid="fromenance-verify" />
    </div>
  );
}
