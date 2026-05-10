'use client';
import { useEffect, useState } from 'react';

type Row = {
  id: number;
  handle: string;
  displayName: string;
  email: string | null;
  isAdmin: boolean;
  videoCount: number;
  createdAt: number;
};

export default function AdminUsers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/apps/alpha_tube/api/auth/me').then(r => r.json()).then(d => setMeId(d.user?.id ?? null));
    fetch('/apps/alpha_tube/api/admin/users').then(r => r.json()).then(d => setRows(d.users ?? []));
  }, []);

  const toggle = async (u: Row) => {
    setBusy(u.id); setErr(null);
    const r = await fetch('/apps/alpha_tube/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: u.id, isAdmin: !u.isAdmin }),
    });
    setBusy(null);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErr(d.error ?? 'failed');
      return;
    }
    setRows(rs => rs.map(x => x.id === u.id ? { ...x, isAdmin: !u.isAdmin } : x));
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Users ({rows.length})</h1>
      {err && <div className="text-red-400 mb-3 text-sm">{err}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-400 border-b border-neutral-800">
            <tr>
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Handle</th>
              <th className="py-2 pr-3">Display name</th>
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">Videos</th>
              <th className="py-2 pr-3">Joined</th>
              <th className="py-2 pr-3">Admin</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id} className="border-b border-neutral-900">
                <td className="py-2 pr-3 text-neutral-500 tabular-nums">{u.id}</td>
                <td className="py-2 pr-3 font-mono">@{u.handle}</td>
                <td className="py-2 pr-3">{u.displayName}</td>
                <td className="py-2 pr-3 text-neutral-400">{u.email ?? '—'}</td>
                <td className="py-2 pr-3 tabular-nums">{u.videoCount}</td>
                <td className="py-2 pr-3 text-neutral-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="py-2 pr-3">
                  {u.isAdmin
                    ? <span className="px-1.5 py-0.5 text-xs bg-amber-900/40 text-amber-300 rounded">admin</span>
                    : <span className="text-neutral-600 text-xs">—</span>}
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => toggle(u)}
                    disabled={busy === u.id || (u.id === meId && u.isAdmin)}
                    title={u.id === meId && u.isAdmin ? 'You can\'t demote yourself' : ''}
                    className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 rounded"
                  >
                    {busy === u.id ? '…' : (u.isAdmin ? 'Demote' : 'Promote')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="text-neutral-500 py-8 text-center">No users.</div>}
      </div>
    </div>
  );
}
