#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const videoId = process.argv[2];
if (!videoId) {
  console.error('Usage: node scripts/process-video.mjs <video_id>');
  process.exit(1);
}

const APP_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(APP_DIR, 'data');
const paths = {
  data: DATA_DIR,
  originals: path.join(DATA_DIR, 'originals'),
  hls: path.join(DATA_DIR, 'hls'),
  thumbnails: path.join(DATA_DIR, 'thumbnails'),
};

fs.mkdirSync(paths.hls, { recursive: true });
fs.mkdirSync(paths.thumbnails, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'video.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const VARIANTS = [
  { name: '360p', height: 360, vBitrate: '800k', aBitrate: '96k', maxrate: '856k', bufsize: '1200k' },
  { name: '720p', height: 720, vBitrate: '2800k', aBitrate: '128k', maxrate: '2996k', bufsize: '4200k' },
  { name: '1080p', height: 1080, vBitrate: '5000k', aBitrate: '192k', maxrate: '5350k', bufsize: '7500k' },
];

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let out = '';
    let err = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(out || err);
      else reject(new Error(`${cmd} exited ${code}: ${err.slice(-2000)}`));
    });
  });
}

async function probe(input) {
  const out = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration',
    '-of', 'json',
    input,
  ]);
  const parsed = JSON.parse(out);
  const stream = parsed.streams?.[0] ?? {};
  return {
    duration: parseFloat(parsed.format?.duration ?? '0'),
    width: stream.width ?? 0,
    height: stream.height ?? 0,
  };
}

async function makeThumbnail(input, output, atSeconds = 1) {
  await run('ffmpeg', [
    '-y',
    '-ss', String(atSeconds),
    '-i', input,
    '-frames:v', '1',
    '-vf', 'scale=480:-2',
    '-q:v', '4',
    output,
  ]);
}

async function transcodeToHLS(id, originalPath) {
  const outDir = path.join(paths.hls, id);
  fs.mkdirSync(outDir, { recursive: true });

  const info = await probe(originalPath);
  const sourceHeight = info.height || 1080;
  const usable = VARIANTS.filter(v => v.height <= sourceHeight);
  if (usable.length === 0) usable.push(VARIANTS[0]);

  for (const variant of usable) {
    const variantDir = path.join(outDir, variant.name);
    fs.mkdirSync(variantDir, { recursive: true });
    await run('ffmpeg', [
      '-y',
      '-i', originalPath,
      '-vf', `scale=-2:${variant.height},format=yuv420p`,
      '-c:v', 'libx264',
      '-profile:v', 'main',
      '-pix_fmt', 'yuv420p',
      '-preset', 'veryfast',
      '-b:v', variant.vBitrate,
      '-maxrate', variant.maxrate,
      '-bufsize', variant.bufsize,
      '-g', '48',
      '-keyint_min', '48',
      '-sc_threshold', '0',
      '-c:a', 'aac',
      '-b:a', variant.aBitrate,
      '-ac', '2',
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_playlist_type', 'vod',
      '-hls_segment_filename', path.join(variantDir, 'seg_%03d.ts'),
      path.join(variantDir, 'index.m3u8'),
    ]);
  }

  const masterLines = ['#EXTM3U', '#EXT-X-VERSION:3'];
  for (const variant of usable) {
    const bandwidth = (parseInt(variant.vBitrate, 10) + parseInt(variant.aBitrate, 10)) * 1000;
    const resHeight = variant.height;
    const resWidth =
      Math.round((info.width / info.height) * resHeight / 2) * 2
      || (resHeight * 16) / 9;
    masterLines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resWidth}x${resHeight},NAME="${variant.name}"`,
      `${variant.name}/index.m3u8`,
    );
  }

  const masterPath = path.join(outDir, 'master.m3u8');
  fs.writeFileSync(masterPath, `${masterLines.join('\n')}\n`);

  const thumbnail = `${id}.jpg`;
  await makeThumbnail(originalPath, path.join(paths.thumbnails, thumbnail));

  return {
    duration: info.duration,
    masterRel: path.relative(paths.hls, masterPath),
    thumbnail,
  };
}

async function processVideo(id) {
  const video = db.prepare(`SELECT * FROM videos WHERE id = ?`).get(id);
  if (!video) return;

  db.prepare(`UPDATE videos SET status = 'processing' WHERE id = ?`).run(id);
  const now = Date.now();
  const jobId = db.prepare(
    `INSERT INTO jobs (video_id, kind, status, created_at, started_at)
     VALUES (?, 'transcode', 'running', ?, ?)`,
  ).run(id, now, now).lastInsertRowid;

  try {
    const result = await transcodeToHLS(id, video.original_path);
    db.prepare(
      `UPDATE videos
       SET status = 'ready', duration = ?, hls_master = ?, thumbnail = ?, ready_at = ?
       WHERE id = ?`,
    ).run(result.duration, result.masterRel, result.thumbnail, Date.now(), id);
    db.prepare(`UPDATE jobs SET status = 'done', finished_at = ? WHERE id = ?`)
      .run(Date.now(), jobId);
  } catch (error) {
    db.prepare(`UPDATE videos SET status = 'failed' WHERE id = ?`).run(id);
    db.prepare(`UPDATE jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?`)
      .run(String(error?.message ?? error), Date.now(), jobId);
    console.error('[transcode]', id, error);
    process.exitCode = 1;
  }
}

await processVideo(videoId);
