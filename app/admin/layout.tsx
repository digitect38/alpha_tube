import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = currentAdmin();
  if (!me) redirect('/');

  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
      <aside className="text-sm border-r border-neutral-800 md:pr-4">
        <div className="text-neutral-500 mb-3 uppercase tracking-wide text-xs">Admin</div>
        <nav className="space-y-1">
          <Link href="/admin"        className="block px-3 py-1.5 rounded hover:bg-neutral-900">Dashboard</Link>
          <Link href="/admin/videos" className="block px-3 py-1.5 rounded hover:bg-neutral-900">Videos</Link>
          <Link href="/admin/users"  className="block px-3 py-1.5 rounded hover:bg-neutral-900">Users</Link>
          <Link href="/admin/import" className="block px-3 py-1.5 rounded hover:bg-neutral-900">Import</Link>
        </nav>
        <div className="text-xs text-neutral-500 mt-6">Signed in as <span className="text-neutral-300">@{me.handle}</span></div>
      </aside>
      <section>{children}</section>
    </div>
  );
}
