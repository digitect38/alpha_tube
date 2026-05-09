import { currentUser } from '@/lib/auth';
import { listSubscriptionVideos } from '@/lib/queries';
import { VideoCard } from '@/app/_components/VideoCard';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function Subscriptions() {
  const me = currentUser();
  if (!me) {
    return (
      <div className="max-w-md mx-auto mt-12 text-neutral-300">
        Not authenticated through the portal. Sign in first.
      </div>
    );
  }
  const videos = listSubscriptionVideos(me.id);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Subscriptions</h1>
      {videos.length === 0 ? (
        <div className="py-16 text-center text-neutral-400">
          <p className="text-lg">No videos from your subscriptions yet.</p>
          <p className="mt-2 text-sm">
            Visit a channel and tap <span className="text-white">Subscribe</span> to see their
            uploads here. <Link href="/" className="underline">Browse channels</Link>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {videos.map(v => <VideoCard key={v.id} v={v} />)}
        </div>
      )}
    </div>
  );
}
