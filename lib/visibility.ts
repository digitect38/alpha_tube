import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import picomatch from 'picomatch';
import { getDb } from './db';

const YML_PATH = path.join(
  process.env.DATA_DIR ?? path.join(process.cwd(), 'data'),
  'visibility.yml',
);

type Rule = {
  ids: Set<string>;
  matchers: ((p: string) => boolean)[];
};

let cached: { mtimeMs: number; rule: Rule } | null = null;
let warnedMissing = false;

const EMPTY: Rule = { ids: new Set(), matchers: [] };

const ID_RE = /^[a-f0-9]{16}$/;

function buildRule(parsed: unknown): Rule {
  const list: unknown[] = Array.isArray((parsed as any)?.hidden)
    ? (parsed as any).hidden
    : [];
  const ids = new Set<string>();
  const matchers: ((p: string) => boolean)[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const s = item.trim();
    if (!s) continue;
    if (ID_RE.test(s)) {
      ids.add(s);
    } else {
      // Match either full path or basename, so users can write either
      // "**/draft/**" or "*.private.mp4".
      const full = picomatch(s);
      const base = picomatch(s, { basename: true });
      matchers.push((p) => full(p) || base(p));
    }
  }
  return { ids, matchers };
}

function loadRule(): Rule {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(YML_PATH);
  } catch {
    if (!warnedMissing) {
      warnedMissing = true;
      console.log(`[visibility] no rules file at ${YML_PATH} (all videos visible)`);
    }
    return EMPTY;
  }
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.rule;

  let parsed: unknown;
  try {
    parsed = yaml.load(fs.readFileSync(YML_PATH, 'utf8'));
  } catch (e) {
    console.warn('[visibility] failed to parse yml — all videos visible:', e);
    return EMPTY;
  }

  const rule = buildRule(parsed);
  cached = { mtimeMs: stat.mtimeMs, rule };
  console.log(
    `[visibility] loaded ${rule.ids.size} id(s) and ${rule.matchers.length} pattern(s)`,
  );
  return rule;
}

export function isHidden(id: string, originalPath?: string | null): boolean {
  return classifyHidden(id, originalPath) !== 'no';
}

// Distinguish *why* a video is hidden so the admin UI can offer the right
// action: id-hides flip with a single click; pattern-hides need editing the
// pattern list.
export function classifyHidden(
  id: string,
  originalPath?: string | null,
): 'no' | 'by_id' | 'by_pattern' {
  const rule = loadRule();
  if (rule.ids.has(id)) return 'by_id';
  if (originalPath && rule.matchers.some((m) => m(originalPath))) return 'by_pattern';
  return 'no';
}

// Single-id toggle used by the admin UI. Reads, mutates the id list, and
// writes the file back atomically. Patterns are left untouched.
export function setHiddenById(id: string, hidden: boolean) {
  const { hiddenIds, hiddenPatterns } = readSplit();
  const set = new Set(hiddenIds);
  if (hidden) set.add(id);
  else set.delete(id);
  writeSplit({ hiddenIds: [...set], hiddenPatterns });
}

// Read the raw yml entries split into ids vs patterns (everything that isn't
// a 16-char hex id). Used by the admin GUI to render two sections.
export function readSplit(): { hiddenIds: string[]; hiddenPatterns: string[] } {
  let raw: unknown;
  try {
    raw = yaml.load(fs.readFileSync(YML_PATH, 'utf8'));
  } catch {
    return { hiddenIds: [], hiddenPatterns: [] };
  }
  const list: unknown[] = Array.isArray((raw as any)?.hidden) ? (raw as any).hidden : [];
  const hiddenIds: string[] = [];
  const hiddenPatterns: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const s = item.trim();
    if (!s) continue;
    if (ID_RE.test(s)) hiddenIds.push(s);
    else hiddenPatterns.push(s);
  }
  return { hiddenIds, hiddenPatterns };
}

// Atomic write of the yml. Comments in an existing file are not preserved
// (yaml.dump can't round-trip them) — operators who care about comments
// should edit the file by hand and skip the GUI.
export function writeSplit(input: { hiddenIds: string[]; hiddenPatterns: string[] }) {
  const seen = new Set<string>();
  const ordered = [...input.hiddenIds, ...input.hiddenPatterns]
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(s) && (seen.add(s), true));
  const yml = yaml.dump({ hidden: ordered }, { lineWidth: 200 });
  fs.mkdirSync(path.dirname(YML_PATH), { recursive: true });
  const tmp = YML_PATH + '.tmp';
  fs.writeFileSync(tmp, yml, 'utf8');
  fs.renameSync(tmp, YML_PATH);
  cached = null;
}

// id-only convenience for routes that don't already have original_path on hand
// (stream, thumbnail). Skips the DB hit when no path matchers are configured.
export function isVideoHidden(id: string): boolean {
  const rule = loadRule();
  if (rule.ids.has(id)) return true;
  if (rule.matchers.length === 0) return false;
  const row = getDb()
    .prepare(`SELECT original_path FROM videos WHERE id = ?`)
    .get(id) as { original_path: string | null } | undefined;
  if (!row?.original_path) return false;
  return rule.matchers.some((m) => m(row.original_path!));
}
