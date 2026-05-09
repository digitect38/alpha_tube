import { listVideos } from '@/lib/queries';
import { VideoCard } from './_components/VideoCard';

export const revalidate = 15;

const CATEGORIES = ['All', 'General', 'Education', 'Tech', 'Music', 'Gaming', 'Vlog'];

export default async function Home({ searchParams }: { searchParams: { c?: string } }) {
  const cat = searchParams.c && searchParams.c !== 'All' ? searchParams.c : undefined;
  const videos = await listVideos({ category: cat, limit: 48 });

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
        {CATEGORIES.map(c => {
          const active = (cat ?? 'All') === c;
          return (
            <a
              key={c}
              href={c === 'All' ? '/apps/video/' : `/apps/video/?c=${encodeURIComponent(c)}`}
              className={
                'px-3 py-1 rounded-full text-sm whitespace-nowrap ' +
                (active ? 'bg-white text-black' : 'bg-neutral-800 hover:bg-neutral-700')
              }
            >
              {c}
            </a>
          );
        })}
      </div>

      {videos.length === 0 ? (
        <div className="text-center py-20 text-neutral-400">
          <p className="text-xl">No videos yet.</p>
          <p className="mt-2 text-sm">Sign up and upload one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {videos.map(v => <VideoCard key={v.id} v={v} />)}
        </div>
      )}
    </div>
  );
}
