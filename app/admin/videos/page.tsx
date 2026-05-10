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
  originalPath: string;
  sourceDir: string;
  hidden: 'no' | 'by_id' | 'by_pattern';
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
    fetch('/apps/alpha_tube/api/admin/videos')
      .then(r => r.json())
      .then(d => setRows(d.videos ?? []));

  useEffect(() => { load(); }, []);

  const toggleVisibility = async (row: Row) => {
    if (row.hidden === 'by_pattern') return;   // patterns edited on Visibility page
    setBusy(row.id); setErr(null);
    const nextHidden = row.hidden === 'no';
    const r = await fetch(`/apps/alpha_tube/api/admin/visibility/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden: nextHidden }),
    });
    setBusy(null);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErr(d.error ?? `Toggle failed (${r.status})`);
      return;
    }
    setRows(rs => rs.map(x => x.id === row.id ? { ...x, hidden: nextHidden ? 'by_id' : 'no' } : x));
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Videos ({rows.length})</h1>
      <p className="text-neutral-400 text-sm mb-4">
        Toggle visibility here. To remove a video permanently (delete files + DB row), use a separate procedure.
      </p>
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
              <th className="py-2 pr-3">Source folder</th>
              <th className="py-2 pr-3">Format</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={r.id}
                className={
                  'border-b border-neutral-900 hover:bg-neutral-950 ' +
                  (r.hidden !== 'no' ? 'opacity-60' : '')
                }
              >
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <a href={`/apps/alpha_tube/watch/${r.id}`} className="hover:underline">{r.title}</a>
                    {r.hidden === 'by_id' && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-neutral-700 text-neutral-200 rounded">hidden</span>
                    )}
                    {r.hidden === 'by_pattern' && (
                      <span
                        className="px-1.5 py-0.5 text-[10px] bg-amber-900/60 text-amber-200 rounded"
                        title="Hidden by a path pattern. Edit on the Visibility page."
                      >
                        pattern-hidden
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-600 font-mono">{r.id}</div>
                </td>
                <td className="py-2 pr-3 text-neutral-400">@{r.authorHandle}</td>
                <td className="py-2 pr-3 text-neutral-400">{r.category}</td>
                <td className={`py-2 pr-3 ${STATUS_CLR[r.status] ?? ''}`}>{r.status}</td>
                <td className="py-2 pr-3 text-neutral-400 tabular-nums">{fmtDur(r.duration)}</td>
                <td className="py-2 pr-3 text-neutral-400 tabular-nums">{r.viewCount}</td>
                <td className="py-2 pr-3 text-neutral-500 text-xs max-w-[20rem] truncate" title={r.originalPath}>
                  {r.sourceDir}
                </td>
                <td className="py-2 pr-3 text-neutral-500 text-xs">
                  {r.hasHls ? 'HLS' : ''}{r.hasHls && r.hasMp4 ? ' + ' : ''}{r.hasMp4 ? 'MP4' : ''}
                </td>
                <td className="py-2 text-right">
                  {r.hidden === 'by_pattern' ? (
                    <span className="text-xs text-neutral-500">—</span>
                  ) : (
                    <button
                      onClick={() => toggleVisibility(r)}
                      disabled={busy === r.id}
                      className={
                        'px-2 py-1 text-xs rounded disabled:opacity-50 ' +
                        (r.hidden === 'by_id'
                          ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
                          : 'bg-amber-900/40 hover:bg-amber-900/70 text-amber-200')
                      }
                    >
                      {busy === r.id ? '…' : r.hidden === 'by_id' ? 'Show' : 'Hide'}
                    </button>
                  )}
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
