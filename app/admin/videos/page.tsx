'use client';
import { useEffect, useState } from 'react';

type Row = {
  id: string;
  title: string;
  category: string;
  status: string;
  duration: number | null;
  viewCount: number;
  createdAt: number;
  authorHandle: string;
  hasMp4: boolean;
  hasHls: boolean;
};

const STATUS_CLR: Record<string, string> = {
  ready: 'text-green-400',
  processing: 'text-yellow-400',
  failed: 'text-red-400',
};

function fmtDur(s: number | null) {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}h${m}m` : `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function AdminVideos() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () =>
    fetch('/apps/video/api/admin/videos')
      .then(r => r.json())
      .then(d => setRows(d.videos ?? []));

  useEffect(() => { load(); }, []);

  const del = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This removes the video, comments, likes, HLS variants, and thumbnail. The original source file is kept if it lives outside the app data dir.`)) return;
    setBusy(id); setErr(null);
    const r = await fetch(`/apps/video/api/admin/videos/${id}`, { method: 'DELETE' });
    setBusy(null);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErr(d.error ?? `Delete failed (${r.status})`);
      return;
    }
    setRows(rs => rs.filter(r => r.id !== id));
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Videos ({rows.length})</h1>
      {err && <div className="text-red-400 mb-3 text-sm">{err}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-400 border-b border-neutral-800">
            <tr>
              <th className="py-2 pr-3">Title</th>
              <th className="py-2 pr-3">Owner</th>
              <th className="py-2 pr-3">Category</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Duration</th>
              <th className="py-2 pr-3">Views</th>
              <th className="py-2 pr-3">Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-neutral-900 hover:bg-neutral-950">
                <td className="py-2 pr-3">
                  <a href={`/apps/video/watch/${r.id}`} className="hover:underline">{r.title}</a>
                  <div className="text-xs text-neutral-600 font-mono">{r.id}</div>
                </td>
                <td className="py-2 pr-3 text-neutral-400">@{r.authorHandle}</td>
                <td className="py-2 pr-3 text-neutral-400">{r.category}</td>
                <td className={`py-2 pr-3 ${STATUS_CLR[r.status] ?? ''}`}>{r.status}</td>
                <td className="py-2 pr-3 text-neutral-400 tabular-nums">{fmtDur(r.duration)}</td>
                <td className="py-2 pr-3 text-neutral-400 tabular-nums">{r.viewCount}</td>
                <td className="py-2 pr-3 text-neutral-500 text-xs">
                  {r.hasHls ? 'HLS' : ''}{r.hasHls && r.hasMp4 ? ' + ' : ''}{r.hasMp4 ? 'MP4' : ''}
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => del(r.id, r.title)}
                    disabled={busy === r.id}
                    className="px-2 py-1 text-xs bg-red-900/40 hover:bg-red-900/70 text-red-300 rounded disabled:opacity-50"
                  >
                    {busy === r.id ? '…' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="text-neutral-500 py-8 text-center">No videos.</div>}
      </div>
    </div>
  );
}
