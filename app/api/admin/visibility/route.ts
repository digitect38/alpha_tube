import { NextRequest, NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { readSplit, writeSplit } from '@/lib/visibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_RE = /^[a-f0-9]{16}$/;

function enrich(hiddenIds: string[]): Array<{ id: string; title: string | null; originalPath: string | null }> {
  if (hiddenIds.length === 0) return [];
  const placeholders = hiddenIds.map(() => '?').join(',');
  const rows = getDb()
    .prepare(`SELECT id, title, original_path FROM videos WHERE id IN (${placeholders})`)
    .all(...hiddenIds) as Array<{ id: string; title: string; original_path: string }>;
  const map = new Map(rows.map((r) => [r.id, r]));
  return hiddenIds.map((id) => {
    const r = map.get(id);
    return {
      id,
      title: r?.title ?? null,
      originalPath: r?.original_path ?? null,
    };
  });
}

export async function GET() {
  if (!currentAdmin()) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { hiddenIds, hiddenPatterns } = readSplit();
  return NextResponse.json({
    hiddenVideos: enrich(hiddenIds),
    hiddenPatterns,
  });
}

export async function PUT(req: NextRequest) {
  if (!currentAdmin()) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({} as any));
  const rawIds: unknown[] = Array.isArray(body?.hiddenIds) ? body.hiddenIds : [];
  const rawPatterns: unknown[] = Array.isArray(body?.hiddenPatterns) ? body.hiddenPatterns : [];

  const hiddenIds = rawIds
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => ID_RE.test(s));
  const hiddenPatterns = rawPatterns
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !ID_RE.test(s));

  writeSplit({ hiddenIds, hiddenPatterns });

  return NextResponse.json({
    hiddenVideos: enrich(hiddenIds),
    hiddenPatterns,
  });
}
