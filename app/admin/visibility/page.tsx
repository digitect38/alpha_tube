'use client';
import { useEffect, useState } from 'react';

type HiddenVideo = { id: string; title: string | null; originalPath: string | null };
type State = { hiddenVideos: HiddenVideo[]; hiddenPatterns: string[] } | null;

const ID_RE = /^[a-f0-9]{16}$/;

export default function AdminVisibility() {
  const [state, setState] = useState<State>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [newId, setNewId] = useState('');
  const [newPattern, setNewPattern] = useState('');

  useEffect(() => {
    fetch('/apps/alpha_tube/api/admin/visibility')
      .then((r) => r.json())
      .then(setState);
  }, []);

  if (!state) return <div className="text-neutral-400">Loading…</div>;

  const save = async (next: { hiddenIds: string[]; hiddenPatterns: string[] }) => {
    setBusy(true);
    setErr(null);
    setSaved(false);
    const r = await fetch('/apps/alpha_tube/api/admin/visibility', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    setBusy(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErr(d.error ?? `Save failed (${r.status})`);
      return;
    }
    setState(await r.json());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const removeId = (id: string) => {
    save({
      hiddenIds: state.hiddenVideos.map((v) => v.id).filter((x) => x !== id),
      hiddenPatterns: state.hiddenPatterns,
    });
  };

  const removePattern = (p: string) => {
    save({
      hiddenIds: state.hiddenVideos.map((v) => v.id),
      hiddenPatterns: state.hiddenPatterns.filter((x) => x !== p),
    });
  };

  const addId = () => {
    const id = newId.trim().toLowerCase();
    if (!ID_RE.test(id)) {
      setErr('Video ID must be exactly 16 hex characters.');
      return;
    }
    if (state.hiddenVideos.some((v) => v.id === id)) {
      setErr('Already hidden.');
      return;
    }
    save({
      hiddenIds: [...state.hiddenVideos.map((v) => v.id), id],
      hiddenPatterns: state.hiddenPatterns,
    });
    setNewId('');
  };

  const addPattern = () => {
    const p = newPattern.trim();
    if (!p) return;
    if (ID_RE.test(p)) {
      setErr('Looks like a video ID — use the ID input above instead.');
      return;
    }
    if (state.hiddenPatterns.includes(p)) {
      setErr('Already added.');
      return;
    }
    save({
      hiddenIds: state.hiddenVideos.map((v) => v.id),
      hiddenPatterns: [...state.hiddenPatterns, p],
    });
    setNewPattern('');
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Visibility</h1>
        <p className="text-neutral-400 text-sm">
          Hidden entries are removed from all listings and return 404 on direct access.
          Backed by <code className="text-neutral-300">data/visibility.yml</code>; takes
          effect within ~15 s.
        </p>
      </div>

      {err && <div className="text-red-400 text-sm">{err}</div>}
      {saved && <div className="text-green-400 text-sm">Saved.</div>}

      <section>
        <h2 className="text-lg font-medium mb-3">Hidden videos ({state.hiddenVideos.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-400 border-b border-neutral-800">
              <tr>
                <th className="py-2 pr-3">ID</th>
                <th className="py-2 pr-3">Title</th>
                <th className="py-2 pr-3">Source</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {state.hiddenVideos.map((v) => (
                <tr key={v.id} className="border-b border-neutral-900">
                  <td className="py-2 pr-3 font-mono text-xs">{v.id}</td>
                  <td className="py-2 pr-3">
                    {v.title ?? <span className="text-neutral-500">— not in DB —</span>}
                  </td>
                  <td className="py-2 pr-3 text-neutral-500 text-xs truncate max-w-[24rem]" title={v.originalPath ?? ''}>
                    {v.originalPath ?? '—'}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => removeId(v.id)}
                      disabled={busy}
                      className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 rounded"
                    >
                      Show
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {state.hiddenVideos.length === 0 && (
            <div className="text-neutral-500 py-4 text-center text-sm">No hidden videos.</div>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addId()}
            placeholder="Video ID (16 hex chars)"
            className="flex-1 max-w-md px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded font-mono text-sm"
          />
          <button
            onClick={addId}
            disabled={busy || !newId.trim()}
            className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded"
          >
            Hide
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Path patterns ({state.hiddenPatterns.length})</h2>
        <p className="text-neutral-500 text-sm mb-3">
          Globs matched against original_path or basename. e.g. <code className="text-neutral-300">**/draft/**</code>,
          {' '}<code className="text-neutral-300">*.private.mp4</code>.
        </p>
        <ul className="space-y-1.5 mb-3">
          {state.hiddenPatterns.map((p) => (
            <li key={p} className="flex items-center justify-between border-b border-neutral-900 pb-1.5">
              <code className="text-sm">{p}</code>
              <button
                onClick={() => removePattern(p)}
                disabled={busy}
                className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 rounded"
              >
                Remove
              </button>
            </li>
          ))}
          {state.hiddenPatterns.length === 0 && (
            <li className="text-neutral-500 text-sm">No patterns.</li>
          )}
        </ul>
        <div className="flex gap-2">
          <input
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPattern()}
            placeholder="**/draft/** or *.private.mp4"
            className="flex-1 max-w-md px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded font-mono text-sm"
          />
          <button
            onClick={addPattern}
            disabled={busy || !newPattern.trim()}
            className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded"
          >
            Add
          </button>
        </div>
      </section>
    </div>
  );
}
