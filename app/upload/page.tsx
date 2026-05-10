'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const CATEGORIES = ['General', 'Education', 'Tech', 'Music', 'Gaming', 'Vlog'];

export default function Upload() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [tags, setTags] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/apps/alpha_tube/api/auth/me')
      .then(r => r.json())
      .then(d => setAuthed(!!d.user));
  }, []);

  if (authed === false) {
    return (
      <div className="max-w-md mx-auto mt-12 text-neutral-300">
        Not authenticated through the portal. Open the portal home and sign in first.
      </div>
    );
  }
  if (authed === null) return <div>Loading…</div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!file || !title.trim()) { setErr('File and title required'); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', title);
    fd.append('description', description);
    fd.append('category', category);
    fd.append('tags', tags);

    setStatus('Uploading…');
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/apps/alpha_tube/api/upload');
    xhr.upload.onprogress = ev => {
      if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      try {
        const d = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          setStatus('Uploaded. Transcoding in background…');
          setTimeout(() => router.push(`/watch/${d.id}`), 1500);
        } else {
          setErr(d.error ?? `Upload failed (${xhr.status})`);
          setStatus(null);
        }
      } catch {
        setErr('Bad server response');
        setStatus(null);
      }
    };
    xhr.onerror = () => { setErr('Network error'); setStatus(null); };
    xhr.send(fd);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Upload a video</h1>
      <form onSubmit={submit} className="space-y-4">
        <input
          type="file"
          accept="video/*"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:bg-neutral-800 file:border-0 file:rounded file:text-white"
          required
        />
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded"
          required
        />
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Description"
          rows={4}
          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded"
        />
        <div className="flex gap-3">
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="px-3 py-2 bg-neutral-900 border border-neutral-700 rounded"
          >
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <input
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="tags, comma, separated"
            className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-700 rounded"
          />
        </div>
        {progress !== null && (
          <div className="w-full bg-neutral-800 rounded h-2 overflow-hidden">
            <div className="bg-red-600 h-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        {status && <div className="text-neutral-300 text-sm">{status}</div>}
        {err && <div className="text-red-400 text-sm">{err}</div>}
        <button
          disabled={progress !== null && progress < 100}
          className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded"
        >
          Upload
        </button>
      </form>
    </div>
  );
}
