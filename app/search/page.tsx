import { searchVideos } from '@/lib/queries';
import { VideoCard } from '@/app/_components/VideoCard';

export const revalidate = 15;

export default async function Search({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q ?? '';
  const videos = q ? await searchVideos(q) : [];
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">
        {q ? `Results for "${q}"` : 'Search'}
      </h1>
      {q && videos.length === 0 && <p className="text-neutral-400">No matches.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {videos.map(v => <VideoCard key={v.id} v={v} />)}
      </div>
    </div>
  );
}
