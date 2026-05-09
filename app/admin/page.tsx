import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default function AdminDashboard() {
  const db = getDb();
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM videos)                          AS total_videos,
      (SELECT COUNT(*) FROM videos WHERE status = 'ready')   AS ready,
      (SELECT COUNT(*) FROM videos WHERE status = 'processing') AS processing,
      (SELECT COUNT(*) FROM videos WHERE status = 'failed')  AS failed,
      (SELECT COUNT(*) FROM users)                           AS users,
      (SELECT COUNT(*) FROM users WHERE is_admin = 1)        AS admins,
      (SELECT COUNT(*) FROM comments)                        AS comments,
      (SELECT COUNT(*) FROM likes)                           AS likes
  `).get() as Record<string, number>;

  const cells: [string, number, string?][] = [
    ['Videos', stats.total_videos],
    ['Ready', stats.ready, 'text-green-400'],
    ['Processing', stats.processing, 'text-yellow-400'],
    ['Failed', stats.failed, 'text-red-400'],
    ['Users', stats.users],
    ['Admins', stats.admins],
    ['Comments', stats.comments],
    ['Likes', stats.likes],
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Admin dashboard</h1>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cells.map(([label, n, cls]) => (
          <div key={label} className="p-4 bg-neutral-900 rounded">
            <div className="text-xs text-neutral-400 uppercase tracking-wide">{label}</div>
            <div className={`text-2xl font-semibold ${cls ?? ''}`}>{n}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
