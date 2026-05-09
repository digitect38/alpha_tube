'use client';
import { useState } from 'react';

type Props = {
  handle: string;
  initialFollowing: boolean;
  initialFollowers: number;
  authed: boolean;
  isSelf: boolean;
};

export function FollowButton({ handle, initialFollowing, initialFollowers, authed, isSelf }: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [followers, setFollowers] = useState(initialFollowers);
  const [busy, setBusy] = useState(false);

  if (isSelf) {
    return (
      <span className="text-sm text-neutral-400 tabular-nums">{followers} followers</span>
    );
  }

  const click = async () => {
    if (!authed) { window.location.href = '/'; return; }
    if (busy) return;
    setBusy(true);
    const r = await fetch(`/apps/video_stream/api/channel/${handle}/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle' }),
    });
    setBusy(false);
    if (!r.ok) return;
    const d = await r.json();
    setFollowing(!!d.following);
    setFollowers(typeof d.followers === 'number' ? d.followers : followers);
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={click}
        disabled={busy}
        className={
          'px-4 py-1.5 rounded-full text-sm font-medium ' +
          (following
            ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
            : 'bg-white text-black hover:bg-neutral-200')
        }
      >
        {following ? 'Subscribed' : 'Subscribe'}
      </button>
      <span className="text-sm text-neutral-400 tabular-nums">{followers} followers</span>
    </div>
  );
}
