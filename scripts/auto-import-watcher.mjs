#!/usr/bin/env node
// Standalone watcher: periodically runs import-folder.mjs against the
// configured source directory. Lives outside the Next.js bundle so it
// doesn't interact with webpack at build time. Started in the background
// from the container CMD alongside `next start`.

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const INTERVAL_MS = Number(process.env.AUTO_IMPORT_INTERVAL_MS ?? 60_000);
const SOURCE_DIR = process.env.IMPORT_SOURCE_DIR
  ?? '/Users/woosj/DevelopMac/youtube_create';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const IMPORT_SCRIPT = path.join(SCRIPT_DIR, 'import-folder.mjs');

let running = false;

function runOnce() {
  if (running) return;
  if (!fs.existsSync(SOURCE_DIR)) {
    console.warn(`[auto-import] source missing: ${SOURCE_DIR}`);
    return;
  }
  running = true;
  const child = spawn('node', [IMPORT_SCRIPT, SOURCE_DIR], {
    env: { ...process.env, DATA_DIR: process.env.DATA_DIR ?? '/app/data' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', d => (out += d.toString()));
  child.stderr.on('data', d => (out += d.toString()));
  child.on('close', code => {
    running = false;
    // Only surface a log when something actually changed or failed,
    // so the container log doesn't fill with empty "imported 0" lines.
    if (code !== 0) {
      console.warn(`[auto-import] exit ${code}\n${out.slice(-2000)}`);
    } else if (!/imported 0,/.test(out)) {
      process.stdout.write(`[auto-import] ${out}`);
    }
  });
  child.on('error', e => {
    running = false;
    console.warn('[auto-import] spawn error', e);
  });
}

if (INTERVAL_MS <= 0) {
  console.log('[auto-import] disabled (AUTO_IMPORT_INTERVAL_MS=0)');
  process.exit(0);
}

console.log(`[auto-import] polling ${SOURCE_DIR} every ${INTERVAL_MS}ms`);
setTimeout(runOnce, 5_000);
setInterval(runOnce, INTERVAL_MS);
