import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/auth';
import { listAllVideos } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!currentAdmin()) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ videos: listAllVideos() });
}
