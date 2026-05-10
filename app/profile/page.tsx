'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Profile() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [authed, setAuthed] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/apps/alpha_tube/api/profile')
      .then(async r => {
        if (r.status === 401) { setAuthed(false); setLoaded(true); return; }
        const d = await r.json();
        setDisplayName(d.profile.displayName);
        setHandle(d.profile.handle);
        setBio(d.profile.bio);
        setLoaded(true);
      });
  }, []);

  if (!loaded) return <div className="text-neutral-400">Loading…</div>;
  if (!authed) {
    return (
      <div className="max-w-md mx-auto mt-12 text-neutral-300">
        Not authenticated through the portal.
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null); setSaved(false);
    const r = await fetch('/apps/alpha_tube/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, handle, bio }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(d.error ?? 'Save failed'); return; }
    setSaved(true);
    router.refresh();
  };

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Profile</h1>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <div className="text-sm text-neutral-400 mb-1">Display name</div>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded"
            maxLength={50}
            required
          />
        </label>
        <label className="block">
          <div className="text-sm text-neutral-400 mb-1">Handle</div>
          <div className="flex items-center gap-2">
            <span className="text-neutral-500">@</span>
            <input
              value={handle}
              onChange={e => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-700 rounded font-mono"
              maxLength={24}
              required
            />
          </div>
          <div className="text-xs text-neutral-500 mt-1">3–24 chars: a-z, 0-9, underscore. Your channel URL becomes /channel/{handle || '…'}.</div>
        </label>
        <label className="block">
          <div className="text-sm text-neutral-400 mb-1">Bio</div>
          <textarea
            value={bio}
            onChange={e => setBio(e.target.value)}
            rows={4}
            maxLength={500}
            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded"
          />
          <div className="text-xs text-neutral-500 mt-1">{bio.length} / 500</div>
        </label>
        {err && <div className="text-red-400 text-sm">{err}</div>}
        {saved && <div className="text-green-400 text-sm">Saved.</div>}
        <button
          disabled={busy}
          className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
