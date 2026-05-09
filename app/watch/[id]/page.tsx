import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getVideo } from '@/lib/queries';
import { Player } from '@/app/_components/Player';
import { Comments } from '@/app/_components/Comments';
import { LikeButton } from '@/app/_components/LikeButton';
import { ShareButton } from '@/app/_components/ShareButton';
import { ViewTracker } from '@/app/_components/ViewTracker';

export const revalidate = 15;

export default async function Watch({ params }: { params: { id: string } }) {
  const v = await getVideo(params.id);
  if (!v) notFound();
  const publicOrigin = process.env.PUBLIC_ORIGIN ?? null;

  if (v.status !== 'ready') {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center">
        <h1 className="text-xl mb-2">{v.title}</h1>
        <p className="text-neutral-400">
          {v.status === 'processing' && 'This video is still being processed. Refresh in a moment…'}
          {v.status === 'failed' && 'Processing failed. The uploader will need to re-upload.'}
        </p>
      </div>
    );
  }

  const playbackSrc = v.hlsMaster
    ? `/apps/video_stream/api/stream/${v.id}/master.m3u8`
    : `/apps/video_stream/api/file/${v.id}`;
  const poster = v.thumbnail ? `/apps/video_stream/api/thumbnail/${v.thumbnail}` : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <div>
        <ViewTracker videoId={v.id} />
        <Player
          src={playbackSrc}
          poster={poster}
          title={v.title}
          artist={v.author.displayName}
          artwork={poster}
        />
        <h1 className="mt-4 text-xl font-semibold">{v.title}</h1>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/channel/${v.author.handle}`}
              className="font-medium hover:underline"
            >
              {v.author.displayName}
            </Link>
            <span className="text-sm text-neutral-400">@{v.author.handle}</span>
          </div>
          <div className="flex items-center gap-2">
            <LikeButton videoId={v.id} initialCount={v.likeCount} />
            <ShareButton videoId={v.id} title={v.title} publicOrigin={publicOrigin} />
          </div>
        </div>
        <div className="mt-3 p-3 bg-neutral-900 rounded text-sm">
          <div className="text-neutral-400 mb-1">
            {v.viewCount.toLocaleString()} views · {new Date(v.createdAt).toLocaleDateString()} · {v.category}
          </div>
          {v.description && <p className="whitespace-pre-wrap">{v.description}</p>}
          {v.tags.length > 0 && (
            <div className="mt-2 flex gap-2 flex-wrap">
              {v.tags.map(t => (
                <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="text-blue-400 hover:underline">#{t}</Link>
              ))}
            </div>
          )}
        </div>
        <Comments videoId={v.id} />
      </div>
      <aside className="text-sm text-neutral-400">
        <p>Up next sidebar — coming soon.</p>
      </aside>
    </div>
  );
}
