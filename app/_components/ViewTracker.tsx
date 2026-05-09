'use client';

import { useEffect } from 'react';

export function ViewTracker({ videoId }: { videoId: string }) {
  useEffect(() => {
    const url = `/apps/video/api/videos/${videoId}/view`;

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, new Blob([], { type: 'application/json' }));
      return;
    }

    fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
  }, [videoId]);

  return null;
}
