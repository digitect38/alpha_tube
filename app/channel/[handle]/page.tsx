import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import {
  getUserByHandle,
  listChannelVideos,
  countFollowers,
  isFollowing,
} from '@/lib/queries';
import { VideoCard } from '@/app/_components/VideoCard';
import { FollowButton } from '@/app/_components/FollowButton';

export const dynamic = 'force-dynamic';

export default async function Channel({ params }: { params: { handle: string } }) {
  const user = await getUserByHandle(params.handle);
  if (!user) notFound();
  const videos = await listChannelVideos(params.handle);
  const me = currentUser();
  const followers = countFollowers(user.id);
  const following = me ? isFollowing(me.id, user.id) : false;
  const isSelf = !!me && me.id === user.id;

  return (
    <div>
      <header className="mb-6 pb-6 border-b border-neutral-800">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">{user.display_name}</h1>
            <div className="text-neutral-400 text-sm">@{user.handle} · {videos.length} videos</div>
            {user.bio && <p className="mt-2 text-neutral-300">{user.bio}</p>}
          </div>
          <FollowButton
            handle={user.handle}
            initialFollowing={following}
            initialFollowers={followers}
            authed={!!me}
            isSelf={isSelf}
          />
        </div>
      </header>
      {videos.length === 0 ? (
        <p className="text-neutral-400">No videos yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {videos.map(v => <VideoCard key={v.id} v={v} />)}
        </div>
      )}
    </div>
  );
}
