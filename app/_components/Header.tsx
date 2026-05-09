'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useViewer } from './ViewerProvider';

export function Header() {
  const { viewer: me } = useViewer();
  const [q, setQ] = useState('');
  const router = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    setQ(sp.get('q') ?? '');
  }, [sp]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    router.push(`/search?q=${encodeURIComponent(term)}`);
  };

  const logout = async () => {
    // Portal owns the session — its logout endpoint clears the cookie. The
    // video app's own session table has no entry to clear.
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {}
    window.location.href = '/';
  };

  return (
    <header className="border-b border-neutral-800 sticky top-0 bg-[#0f0f0f]/95 backdrop-blur z-10">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link href="/" className="font-bold text-lg flex items-center gap-2">
          <span className="text-red-500">▶</span> Alpha Tube
        </Link>
        <form onSubmit={submitSearch} className="flex-1 max-w-xl">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search videos…"
            className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded focus:outline-none focus:border-neutral-500"
          />
        </form>
        <nav className="flex items-center gap-3 text-sm">
          {me && (
            <Link href="/subscriptions" className="text-neutral-300 hover:text-white">Subscriptions</Link>
          )}
          <Link href="/upload" className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded">Upload</Link>
          {me && (
            <>
              {me.isAdmin && (
                <Link href="/admin" className="text-amber-300 hover:underline" title="Admin">Admin</Link>
              )}
              <Link href={`/channel/${me.handle}`} className="hover:underline">
                {me.displayName}
              </Link>
              <Link href="/profile" className="text-neutral-400 hover:text-white" title="Edit profile">⚙</Link>
              <button
                onClick={logout}
                className="text-neutral-400 hover:text-white"
                title="Sign out"
              >
                Logout
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
