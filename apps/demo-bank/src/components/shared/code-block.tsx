import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@identizen/ui';

export interface CodeBlockProps {
  code: string;
  /** Shown in the block's title bar, e.g. a file name or "terminal". */
  title?: string;
  /** Terminal blocks get a "$" gutter and a copy button that skips the prompt. */
  terminal?: boolean;
  className?: string;
}

/** Monospace block with a title bar and copy button. No syntax highlighting: the code is the point. */
export function CodeBlock({ code, title, terminal = false, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const text = code.replace(/\n$/, '');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <figure className={cn('overflow-hidden rounded-lg border bg-surface-1', className)}>
      <figcaption className="flex items-center justify-between border-b px-4 py-2 text-xs text-fg-muted">
        <span className="font-mono">{title ?? (terminal ? 'terminal' : 'code')}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2 hover:text-fg"
          aria-label="Copy code"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </figcaption>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code>
          {terminal
            ? text.split('\n').map((line, i) => (
                <span key={i} className="block">
                  {line.startsWith('#') ? (
                    <span className="text-fg-subtle">{line}</span>
                  ) : (
                    <>
                      <span className="select-none text-accent">$ </span>
                      {line}
                    </>
                  )}
                </span>
              ))
            : text}
        </code>
      </pre>
    </figure>
  );
}
