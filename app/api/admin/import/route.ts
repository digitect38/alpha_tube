import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { currentAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DEFAULT_SOURCE = process.env.IMPORT_SOURCE_DIR
  ?? '/Users/woosj/DevelopMac/youtube_create';

export async function GET() {
  if (!currentAdmin()) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({
    sourceDir: DEFAULT_SOURCE,
    exists: fs.existsSync(DEFAULT_SOURCE),
  });
}

export async function POST(req: NextRequest) {
  if (!currentAdmin()) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const sourceDir = (body && body.sourceDir) || DEFAULT_SOURCE;
  if (!fs.existsSync(sourceDir)) {
    return NextResponse.json({ error: `source not found: ${sourceDir}` }, { status: 400 });
  }

  const scriptPath = path.join(process.cwd(), 'scripts', 'import-folder.mjs');

  return await new Promise<NextResponse>((resolve) => {
    const child = spawn('node', [scriptPath, sourceDir], {
      env: { ...process.env, DATA_DIR: process.env.DATA_DIR ?? '/app/data' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stderr += d.toString()));
    child.on('close', code => {
      resolve(NextResponse.json({
        ok: code === 0,
        exitCode: code,
        stdout: stdout.slice(-8000),
        stderr: stderr.slice(-2000),
      }));
    });
    child.on('error', e => {
      resolve(NextResponse.json({ ok: false, error: String(e) }, { status: 500 }));
    });
  });
}
