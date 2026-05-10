import Link from 'next/link';

export type VideoCardData = {
  id: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  viewCount: number;
  createdAt: number;
  author: { handle: string; displayName: string };
};

function fmtDuration(s: number | null) {
  if (!s) return '';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function fmtAge(ts: number) {
  const diff = Date.now() - ts;
  const d = Math.floor(diff / 86400000);
  if (d < 1) return 'today';
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function VideoCard({ v }: { v: VideoCardData }) {
  return (
    <Link href={`/watch/${v.id}`} className="group block">
      <div className="relative aspect-video bg-neutral-900 rounded-lg overflow-hidden">
        {v.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/apps/alpha_tube/api/thumbnail/${v.thumbnail}`}
            alt={v.title}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-neutral-600">no thumbnail</div>
        )}
        {v.duration ? (
          <span className="absolute right-2 bottom-2 px-1.5 py-0.5 text-xs bg-black/80 rounded">
            {fmtDuration(v.duration)}
          </span>
        ) : null}
      </div>
      <h3 className="mt-2 font-medium line-clamp-2">{v.title}</h3>
      <div className="text-sm text-neutral-400">
        <div>{v.author.displayName}</div>
        <div>{v.viewCount.toLocaleString()} views · {fmtAge(v.createdAt)}</div>
      </div>
    </Link>
  );
}
