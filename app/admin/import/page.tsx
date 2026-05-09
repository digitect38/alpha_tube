'use client';
import { useEffect, useState } from 'react';

export default function AdminImport() {
  const [src, setSrc] = useState<{ sourceDir: string; exists: boolean } | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; stdout?: string; stderr?: string; error?: string } | null>(null);

  useEffect(() => {
    fetch('/apps/video/api/admin/import').then(r => r.json()).then(setSrc);
  }, []);

  const run = async () => {
    setRunning(true); setResult(null);
    const r = await fetch('/apps/video/api/admin/import', { method: 'POST' });
    const d = await r.json().catch(() => ({ ok: false, error: 'bad response' }));
    setResult(d);
    setRunning(false);
  };

  if (!src) return <div className="text-neutral-400">Loading…</div>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Import</h1>
      <p className="text-neutral-400 mb-4">
        Walks the source folder and registers every <code className="text-neutral-300">.mp4</code> as a
        ready-to-stream video. Idempotent — already-imported files are skipped.
      </p>
      <div className="bg-neutral-900 rounded p-4 mb-4">
        <div className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Source dir</div>
        <div className="font-mono text-sm">{src.sourceDir}</div>
        <div className={`text-xs mt-1 ${src.exists ? 'text-green-400' : 'text-red-400'}`}>
          {src.exists ? '✓ accessible from container' : '✗ not mounted into container'}
        </div>
      </div>
      <button
        onClick={run}
        disabled={running || !src.exists}
        className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded"
      >
        {running ? 'Importing…' : 'Run import'}
      </button>
      {result && (
        <div className={`mt-6 p-4 rounded ${result.ok ? 'bg-green-900/20 border border-green-900/40' : 'bg-red-900/20 border border-red-900/40'}`}>
          <div className="font-medium mb-2">{result.ok ? 'Done.' : 'Failed.'}</div>
          {result.error && <div className="text-red-300 text-sm">{result.error}</div>}
          {result.stdout && (
            <pre className="text-xs whitespace-pre-wrap text-neutral-300 max-h-96 overflow-auto">{result.stdout}</pre>
          )}
          {result.stderr && (
            <pre className="text-xs whitespace-pre-wrap text-red-300 mt-2">{result.stderr}</pre>
          )}
        </div>
      )}
    </div>
  );
}
