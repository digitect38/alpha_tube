'use client';
import { useState } from 'react';

export function ShareButton({
  videoId,
  title,
  publicOrigin,
}: {
  videoId: string;
  title: string;
  publicOrigin?: string | null;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');

  const click = async () => {
    if (typeof window === 'undefined') return;
    // Prefer the explicit public origin baked in by the server so a share
    // link is always public, even when the page was reached over an internal
    // IP or localhost during testing.
    const origin = publicOrigin && /^https?:\/\//.test(publicOrigin)
      ? publicOrigin.replace(/\/$/, '')
      : window.location.origin;
    const url = `${origin}/apps/video/watch/${videoId}`;

    // Prefer the OS share sheet on mobile / supported browsers.
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e: any) {
        // AbortError = user cancelled; not an error.
        if (e?.name === 'AbortError') return;
        // Fall through to clipboard.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      // Clipboard blocked (insecure context, denied permissions, etc.).
      // Fallback: prompt the user with the URL pre-selected.
      window.prompt('Copy this link:', url);
      setState('idle');
    }
  };

  return (
    <button
      onClick={click}
      className={
        'px-4 py-1.5 rounded-full text-sm flex items-center gap-2 ' +
        (state === 'copied'
          ? 'bg-green-700/40 text-green-200'
          : 'bg-neutral-800 hover:bg-neutral-700')
      }
    >
      <span>{state === 'copied' ? '✓' : '🔗'}</span>
      <span>{state === 'copied' ? 'Copied!' : 'Share'}</span>
    </button>
  );
}
