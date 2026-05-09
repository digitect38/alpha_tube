import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { getDb, type UserRow } from './db';

// The portal authenticates users at /apps/* and forwards their identity via
// these headers. This is our sole source of identity — there is no separate
// login on the video app.
const PORTAL_USER_HEADER    = 'x-portal-user';        // stable id (username/email)
const PORTAL_NAME_HEADER    = 'x-portal-user-name';   // percent-encoded
const PORTAL_EMAIL_HEADER   = 'x-portal-user-email';
const PORTAL_PICTURE_HEADER = 'x-portal-user-picture'; // percent-encoded

// Shared secret between portal and this app. When set, every accepted request
// must carry it — prevents an attacker from forging X-Portal-User if the
// container is ever reachable without going through the portal proxy. When
// unset (default in dev), we fall back to trusting headers as before.
const PORTAL_AUTH_HEADER = 'x-portal-auth';
let warnedNoSecret = false;
function authenticatedByProxy(headerValue: string | null): boolean {
  const expected = process.env.PORTAL_SHARED_SECRET ?? '';
  if (!expected) {
    if (!warnedNoSecret) {
      warnedNoSecret = true;
      console.warn(
        '[auth] PORTAL_SHARED_SECRET is unset — accepting X-Portal-User without verification.\n' +
        '       Set it in both portal and video containers to prevent header forgery.',
      );
    }
    return true;   // backward-compat dev mode
  }
  return headerValue === expected;
}

const PLACEHOLDER_NAME_RE = /^User [a-f0-9]{8}$/;

function safeDecode(s: string | null): string {
  if (!s) return '';
  try { return decodeURIComponent(s); } catch { return s; }
}

export function currentUser(): UserRow | null {
  const h = headers();
  if (!authenticatedByProxy(h.get(PORTAL_AUTH_HEADER))) return null;
  const sub = h.get(PORTAL_USER_HEADER);
  if (!sub) return null;
  const name    = safeDecode(h.get(PORTAL_NAME_HEADER));
  const email   = h.get(PORTAL_EMAIL_HEADER);
  const picture = safeDecode(h.get(PORTAL_PICTURE_HEADER));
  return findOrCreateUser(sub, { name, email, picture });
}

export function currentAdmin(): UserRow | null {
  const u = currentUser();
  return u && u.is_admin === 1 ? u : null;
}

function findOrCreateUser(
  sub: string,
  profile: { name: string; email: string | null; picture: string },
): UserRow {
  const db = getDb();
  const existing = db
    .prepare(`SELECT * FROM users WHERE google_sub = ?`)
    .get(sub) as UserRow | undefined;

  if (existing) {
    // Heal old auto-provisioned rows: when the portal didn't supply name/email
    // before, the row got a placeholder display_name like "User a3f9c2e8".
    // The next visit (with proper headers now) is a good time to fix that.
    const updates: Record<string, string | null> = {};
    if (profile.name && PLACEHOLDER_NAME_RE.test(existing.display_name)) {
      updates.display_name = profile.name;
    }
    if (profile.email && !existing.email) updates.email = profile.email;
    if (profile.picture && !existing.avatar_url) updates.avatar_url = profile.picture;
    if (Object.keys(updates).length > 0) {
      const setSql = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      db.prepare(`UPDATE users SET ${setSql} WHERE id = ?`)
        .run(...Object.values(updates), existing.id);
      Object.assign(existing, updates);
    }
    return existing;
  }

  // Auto-provision on first request.
  const seed = crypto.createHash('sha1').update(sub).digest('hex').slice(0, 8);
  let handle = handleFromEmail(profile.email) ?? `user_${seed}`;
  let i = 2;
  while (db.prepare(`SELECT 1 FROM users WHERE handle = ?`).get(handle)) {
    const base = handleFromEmail(profile.email) ?? `user_${seed}`;
    handle = `${base}_${i++}`;
  }
  const displayName = profile.name || `User ${seed}`;

  const result = db
    .prepare(
      `INSERT INTO users (handle, display_name, email, avatar_url, password_hash, google_sub, created_at)
       VALUES (?, ?, ?, ?, '', ?, ?)`,
    )
    .run(
      handle,
      displayName,
      profile.email || null,
      profile.picture || null,
      sub,
      Date.now(),
    );

  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(Number(result.lastInsertRowid)) as UserRow;
}

function handleFromEmail(email: string | null): string | null {
  if (!email) return null;
  const local = email.split('@')[0]?.toLowerCase().replace(/[^a-z0-9_]/g, '') ?? '';
  if (local.length < 3 || local.length > 24) return null;
  return local;
}
