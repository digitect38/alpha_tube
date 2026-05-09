'use client';
import { useEffect, useState } from 'react';
import { useViewer } from './ViewerProvider';

export function LikeButton({
  videoId,
  initialCount,
  initialLiked = false,
}: {
  videoId: string;
  initialCount: number;
  initialLiked?: boolean;
}) {
  const { loaded, viewer } = useViewer();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loaded || !viewer) return;

    let cancelled = false;
    fetch(`/apps/video_stream/api/videos/${videoId}/like`)
      .then(r => r.json())
      .then(d => {
        if (!cancelled && typeof d.liked === 'boolean') setLiked(d.liked);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [loaded, viewer, videoId]);

  const click = async () => {
    if (!viewer) return;
    if (busy) return;
    setBusy(true);
    const r = await fetch(`/apps/video_stream/api/videos/${videoId}/like`, { method: 'POST' });
    if (r.ok) {
      const d = await r.json();
      setLiked(d.liked);
      setCount(d.count);
    }
    setBusy(false);
  };

  return (
    <button
      onClick={click}
      disabled={busy || !viewer}
      className={
        'px-4 py-1.5 rounded-full text-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ' +
        (liked ? 'bg-white text-black' : 'bg-neutral-800 hover:bg-neutral-700')
      }
    >
      <span>{liked ? '👍' : '👍🏻'}</span>
      <span>{count}</span>
    </button>
  );
}
