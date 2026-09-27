/**
 * The Fromenance verify widget, loaded once from the CDN and mounted through its SPA entry point
 * (`window.Fromenance.mount`). The script tag form in the docs auto-mounts on page load, which a
 * router-driven React page never gets, so this module loads the script itself.
 *
 * The widget posts to api.fromenance.com/v1/public/submit with the public site key and the page
 * origin. Nothing secret is involved on this side.
 */
import { FROMENANCE_WIDGET_URL } from '@/lib/config';

/** What the public verify API answers. Mirrors docs.fromenance.com/verify-page/api. */
export interface PublicVerdict {
  status: 'decided' | 'pending';
  poll_token: string | null;
  submission_id: string;
  outcome: 'verified' | 'not_verified' | 'known_fraud' | null;
  rule: string | null;
  matched_sent_at: string | null;
  signals?: {
    code_found: boolean;
    recipient_match: boolean | null;
    fingerprint_distance: number | null;
  } | null;
  display: {
    institution_name: string;
    logo_url: string | null;
    accent: string | null;
    fraud_contact: string | null;
    support_url: string | null;
    outcome_label: string;
    verdict_text: string;
    next_step: string;
  } | null;
}

export interface WidgetOptions {
  siteKey: string;
  apiOrigin?: string;
  target: HTMLElement;
  theme?: 'light' | 'dark' | 'auto';
  accent?: string;
  institutionName?: string;
  onVerdict?: (verdict: PublicVerdict) => void;
  turnstileSiteKey?: string;
}

export interface FromenanceGlobal {
  mount: (opts: WidgetOptions) => unknown;
  version: string;
}

declare global {
  interface Window {
    Fromenance?: FromenanceGlobal;
  }
}

let loading: Promise<FromenanceGlobal> | null = null;

/** Load verify.js once. Concurrent callers share the same promise; a failed load can be retried. */
export function loadFromenance(doc: Document = document): Promise<FromenanceGlobal> {
  const existing = doc.defaultView?.Fromenance;
  if (existing) return Promise.resolve(existing);
  if (loading) return loading;
  loading = new Promise<FromenanceGlobal>((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = FROMENANCE_WIDGET_URL;
    script.async = true;
    script.addEventListener('load', () => {
      const api = doc.defaultView?.Fromenance;
      if (api) {
        resolve(api);
        return;
      }
      loading = null;
      reject(new Error('verify.js loaded but window.Fromenance is missing'));
    });
    script.addEventListener('error', () => {
      loading = null;
      script.remove();
      reject(new Error(`Could not load ${FROMENANCE_WIDGET_URL}`));
    });
    doc.head.append(script);
  });
  return loading;
}

/** Test hook: forget an in-flight load. */
export function resetFromenanceLoader(): void {
  loading = null;
}

export interface VerifyFormValues {
  text?: string;
  code?: string;
  email?: string;
}

/**
 * Fill the mounted widget's fields, for the "try this sample" buttons. The widget owns its DOM, so
 * this addresses the fields by the accessible labels it renders. Returns false when nothing was
 * mounted yet.
 */
export function fillVerifyForm(root: HTMLElement, values: VerifyFormValues): boolean {
  const text = root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message text"]');
  const code = root.querySelector<HTMLInputElement>('input[aria-label="Reference code"]');
  const email = root.querySelector<HTMLInputElement>('input[aria-label="Your email address"]');
  if (!text || !code || !email) return false;
  text.value = values.text ?? '';
  code.value = values.code ?? '';
  email.value = values.email ?? '';
  text.focus();
  return true;
}

/** The theme the widget should render with: the site's explicit choice, else the system's. */
export function widgetTheme(doc: Document = document): 'light' | 'dark' {
  const chosen = doc.documentElement.getAttribute('data-theme');
  if (chosen === 'light' || chosen === 'dark') return chosen;
  const view = doc.defaultView;
  if (view && typeof view.matchMedia === 'function') {
    return view.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

/**
 * Follow the site's theme toggle and the system setting. The widget resolves its theme once at
 * mount, so the page restamps `data-theme` on the widget root instead of remounting (a remount
 * would throw away a pasted message or a verdict).
 */
export function watchTheme(
  cb: (theme: 'light' | 'dark') => void,
  doc: Document = document,
): () => void {
  const notify = () => cb(widgetTheme(doc));
  const observer = new MutationObserver(notify);
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const view = doc.defaultView;
  const mq =
    view && typeof view.matchMedia === 'function'
      ? view.matchMedia('(prefers-color-scheme: dark)')
      : null;
  mq?.addEventListener('change', notify);
  return () => {
    observer.disconnect();
    mq?.removeEventListener('change', notify);
  };
}
