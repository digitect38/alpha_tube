import { NextRequest, NextResponse } from 'next/server';
import { listVideos } from '@/lib/queries';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') ?? undefined;
  const limit = Number(searchParams.get('limit') ?? 24);
  const offset = Number(searchParams.get('offset') ?? 0);
  return NextResponse.json({ videos: await listVideos({ category, limit, offset }) });
}
