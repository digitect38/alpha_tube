import { NextRequest, NextResponse } from 'next/server';
import { searchVideos } from '@/lib/queries';

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  return NextResponse.json({ q, videos: await searchVideos(q) });
}
