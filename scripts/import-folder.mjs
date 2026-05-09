#!/usr/bin/env node
// Import every .mp4 under a source folder into the video portal.
// Idempotent: re-running skips files already imported (by path hash).
//
//   node scripts/import-folder.mjs /Users/woosj/DevelopMac/youtube_create
//
// Each MP4 becomes a video served directly via /api/file (HTTP byte ranges,
// no transcode). Sibling files used as metadata if present:
//   description.txt    → video.description
//   thumbnail.jpg      → video.thumbnail
//   Cover.png / cover  → fallback thumbnail (re-encoded to jpg)
// Top-level subfolder name → category.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';

const ROOT = process.argv[2];
if (!ROOT) {
  console.error('Usage: node scripts/import-folder.mjs <source_folder>');
  process.exit(1);
}
if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) {
  console.error(`Not a directory: ${ROOT}`);
  process.exit(1);
}

const APP_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(APP_DIR, 'data');
const DB_PATH = path.join(DATA_DIR, 'video.db');
const THUMB_DIR = path.join(DATA_DIR, 'thumbnails');
fs.mkdirSync(THUMB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// Mirror the app schema so the script can run before the Next.js server has
// ever opened the DB.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    handle        TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    email         TEXT UNIQUE,
    password_hash TEXT NOT NULL DEFAULT '',
    google_sub    TEXT,
    avatar_url    TEXT,
    bio           TEXT,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS videos (
    id            TEXT PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    category      TEXT NOT NULL DEFAULT 'General',
    tags          TEXT NOT NULL DEFAULT '[]',
    status        TEXT NOT NULL DEFAULT 'processing',
    duration      REAL,
    original_path TEXT NOT NULL,
    hls_master    TEXT,
    mp4_path      TEXT,
    thumbnail     TEXT,
    view_count    INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    ready_at      INTEGER
  );
`);

// Patch existing schemas to match the live app.
const videoCols = db.prepare(`PRAGMA table_info(videos)`).all().map(c => c.name);
if (!videoCols.includes('mp4_path')) db.exec(`ALTER TABLE videos ADD COLUMN mp4_path TEXT`);
const userCols = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
if (!userCols.includes('is_admin')) db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`);

// Find or create the system uploader user that owns imported videos.
function ensureSystemUser() {
  const row = db.prepare(`SELECT id FROM users WHERE handle = ?`).get('onemusic');
  if (row) {
    db.prepare(`UPDATE users SET is_admin = 1 WHERE id = ? AND is_admin = 0`).run(row.id);
    return row.id;
  }
  const r = db.prepare(`
    INSERT INTO users (handle, display_name, password_hash, is_admin, created_at)
    VALUES (?, ?, '', 1, ?)
  `).run('onemusic', 'One Music', Date.now());
  return Number(r.lastInsertRowid);
}

function probeDuration(file) {
  const r = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ], { encoding: 'utf8' });
  const d = parseFloat((r.stdout || '').trim());
  return isFinite(d) ? d : null;
}

function makeThumb(srcImage, destJpg) {
  const r = spawnSync('ffmpeg', [
    '-y', '-i', srcImage, '-vf', 'scale=480:-2', '-q:v', '4', destJpg,
  ], { encoding: 'utf8' });
  return r.status === 0;
}

function makeThumbFromVideo(srcVideo, destJpg) {
  const r = spawnSync('ffmpeg', [
    '-y', '-ss', '5', '-i', srcVideo,
    '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', destJpg,
  ], { encoding: 'utf8' });
  return r.status === 0;
}

function findSibling(dir, names) {
  for (const n of names) {
    const p = path.join(dir, n);
    if (fs.existsSync(p)) return p;
  }
  // Case-insensitive scan as a fallback.
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch { return null; }
  for (const n of names) {
    const lower = n.toLowerCase();
    const hit = entries.find(e => e.toLowerCase() === lower);
    if (hit) return path.join(dir, hit);
  }
  return null;
}

function findSiblingMatching(dir, exts) {
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch { return null; }
  // Prefer files whose stem looks like cover/thumbnail/album art.
  const preferred = ['cover', 'thumbnail', 'thumb', 'art', 'poster'];
  const matchExt = name => exts.includes(path.extname(name).toLowerCase());
  const found = entries.filter(matchExt);
  for (const stem of preferred) {
    const hit = found.find(n => n.toLowerCase().includes(stem));
    if (hit) return path.join(dir, hit);
  }
  return found[0] ? path.join(dir, found[0]) : null;
}

function titleFromFilename(file) {
  return path.basename(file, path.extname(file))
    .replace(/\s*-\s*One Music\s*$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function categoryFor(file) {
  // Top-level folder under ROOT becomes the category.
  const rel = path.relative(ROOT, file);
  const parts = rel.split(path.sep);
  if (parts.length <= 1) return 'General';
  return parts[0]
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || 'General';
}

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(mp4|mov|m4v|webm|mkv)$/i.test(e.name)) yield p;
  }
}

const userId = ensureSystemUser();
const insert = db.prepare(`
  INSERT INTO videos (id, user_id, title, description, category, tags, status,
                      duration, original_path, mp4_path, thumbnail, created_at, ready_at)
  VALUES (?, ?, ?, ?, ?, '[]', 'ready', ?, ?, ?, ?, ?, ?)
`);
const exists = db.prepare(`SELECT 1 FROM videos WHERE id = ?`);

let added = 0, skipped = 0, failed = 0;

for (const file of walk(ROOT)) {
  const id = crypto.createHash('sha1').update(file).digest('hex').slice(0, 16);
  if (exists.get(id)) { skipped++; continue; }

  const dir = path.dirname(file);
  const title = titleFromFilename(file);
  const category = categoryFor(file);

  let description = '';
  const descPath = findSibling(dir, ['description.txt', 'Description.txt']);
  if (descPath) {
    try { description = fs.readFileSync(descPath, 'utf8').trim().slice(0, 8000); } catch {}
  }

  const duration = probeDuration(file);
  if (duration === null) {
    console.warn(`! skip (probe failed) ${file}`);
    failed++;
    continue;
  }

  const thumbName = `${id}.jpg`;
  const thumbDest = path.join(THUMB_DIR, thumbName);
  let thumbOk = false;
  const existingThumb = findSibling(dir, ['thumbnail.jpg', 'thumbnail.jpeg', 'thumbnail.png']);
  if (existingThumb) {
    thumbOk = makeThumb(existingThumb, thumbDest);
  }
  if (!thumbOk) {
    const cover = findSiblingMatching(dir, ['.png', '.jpg', '.jpeg']);
    if (cover) thumbOk = makeThumb(cover, thumbDest);
  }
  if (!thumbOk) thumbOk = makeThumbFromVideo(file, thumbDest);

  const now = Date.now();
  insert.run(
    id, userId, title, description, category,
    duration, file, file,
    thumbOk ? thumbName : null,
    now, now,
  );
  added++;
  console.log(`+ ${title}  (${category}, ${Math.round(duration)}s)`);
}

console.log(`\nimported ${added}, skipped ${skipped}, failed ${failed}`);
