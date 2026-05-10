'use client';
import { useEffect, useState } from 'react';
import { useViewer } from './ViewerProvider';

type Comment = {
  id: number;
  body: string;
  createdAt: number;
  author: { handle: string; displayName: string };
};

export function Comments({ videoId }: { videoId: string }) {
  const { loaded, viewer } = useViewer();
  const [items, setItems] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetch(`/apps/alpha_tube/api/videos/${videoId}/comments`)
      .then(r => r.json())
      .then(d => setItems(d.comments));
  };

  useEffect(() => { load(); }, [videoId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const r = await fetch(`/apps/alpha_tube/api/videos/${videoId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    setBusy(false);
    if (r.ok) {
      const d = await r.json();
      setItems([d.comment, ...items]);
      setBody('');
    }
  };

  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold mb-3">{items.length} comments</h2>
      {viewer ? (
        <form onSubmit={submit} className="mb-6 flex gap-2">
          <input
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 px-3 py-2 bg-transparent border-b border-neutral-700 focus:outline-none focus:border-white"
          />
          <button disabled={busy || !body.trim()} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-full text-sm">
            Comment
          </button>
        </form>
      ) : loaded ? (
        <p className="text-neutral-400 text-sm mb-4">Sign in via the portal to comment.</p>
      ) : null}
      <ul className="space-y-4">
        {items.map(c => (
          <li key={c.id}>
            <div className="text-sm">
              <a href={`/apps/alpha_tube/channel/${c.author.handle}`} className="font-medium hover:underline">
                {c.author.displayName}
              </a>
              <span className="text-neutral-500 ml-2">{new Date(c.createdAt).toLocaleDateString()}</span>
            </div>
            <p className="text-neutral-200 mt-0.5 whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
