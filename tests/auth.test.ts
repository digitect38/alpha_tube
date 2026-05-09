import { describe, it, expect, afterEach } from 'vitest';
import { setHeaders } from './_setup';
import { currentUser, currentAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';

afterEach(() => {
  delete process.env.PORTAL_SHARED_SECRET;
});

function withHeaders(h: Record<string, string>) {
  // Headers stored under lowercase keys to mirror Node's normalisation.
  const lower: Record<string, string> = {};
  for (const k of Object.keys(h)) lower[k.toLowerCase()] = h[k];
  setHeaders(lower);
}

describe('currentUser()', () => {
  it('returns null when no portal header is present', () => {
    setHeaders({});
    expect(currentUser()).toBeNull();
  });

  it('auto-provisions a user on first request', () => {
    withHeaders({ 'x-portal-user': 'sub-abc-123' });
    const u = currentUser();
    expect(u).not.toBeNull();
    expect(u!.google_sub).toBe('sub-abc-123');
    expect(u!.handle).toMatch(/^user_[a-f0-9]{8}$/);
    expect(u!.display_name).toMatch(/^User [a-f0-9]{8}$/);
    expect(u!.is_admin).toBe(0);
  });

  it('returns the same row on the second call (no duplicate inserts)', () => {
    withHeaders({ 'x-portal-user': 'sub-abc-123' });
    const u1 = currentUser();
    const u2 = currentUser();
    expect(u2!.id).toBe(u1!.id);
    const count = (getDb().prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n;
    expect(count).toBe(1);
  });

  it('uses the email local-part as handle when forwarded', () => {
    withHeaders({
      'x-portal-user': 'sub-1',
      'x-portal-user-email': 'jane.doe@example.com',
      'x-portal-user-name': 'Jane Doe',
    });
    const u = currentUser();
    expect(u!.handle).toBe('janedoe');
    expect(u!.display_name).toBe('Jane Doe');
    expect(u!.email).toBe('jane.doe@example.com');
  });

  it('decodes percent-encoded non-ASCII names (e.g. Korean)', () => {
    withHeaders({
      'x-portal-user': 'sub-2',
      'x-portal-user-name': encodeURIComponent('홍길동'),
    });
    const u = currentUser();
    expect(u!.display_name).toBe('홍길동');
  });

  it('heals a placeholder display_name on the next visit when name arrives', () => {
    // First visit: no name forwarded → placeholder
    withHeaders({ 'x-portal-user': 'sub-3' });
    const u1 = currentUser();
    expect(u1!.display_name).toMatch(/^User [a-f0-9]{8}$/);

    // Second visit: portal now forwards a real name → row updated in place
    withHeaders({ 'x-portal-user': 'sub-3', 'x-portal-user-name': 'Real Name' });
    const u2 = currentUser();
    expect(u2!.id).toBe(u1!.id);
    expect(u2!.display_name).toBe('Real Name');
  });

  it('does NOT overwrite a user-customised display_name', () => {
    withHeaders({ 'x-portal-user': 'sub-4', 'x-portal-user-name': 'Real Name' });
    const u1 = currentUser();
    // Simulate the user editing their own profile to a custom value.
    getDb().prepare(`UPDATE users SET display_name = ? WHERE id = ?`).run('Custom Pick', u1!.id);

    // Even if the portal forwards a different name, custom value sticks.
    withHeaders({ 'x-portal-user': 'sub-4', 'x-portal-user-name': 'Some Other Thing' });
    const u2 = currentUser();
    expect(u2!.display_name).toBe('Custom Pick');
  });

  it('backfills email and avatar_url when missing', () => {
    withHeaders({ 'x-portal-user': 'sub-5' });
    const u1 = currentUser();
    expect(u1!.email).toBeNull();
    expect(u1!.avatar_url).toBeNull();

    withHeaders({
      'x-portal-user': 'sub-5',
      'x-portal-user-email': 'a@b.com',
      'x-portal-user-picture': encodeURIComponent('https://x/y.jpg'),
    });
    const u2 = currentUser();
    expect(u2!.email).toBe('a@b.com');
    expect(u2!.avatar_url).toBe('https://x/y.jpg');
  });
});

describe('PORTAL_SHARED_SECRET enforcement', () => {
  it('without a secret configured, header-only auth still works (dev/back-compat)', () => {
    delete process.env.PORTAL_SHARED_SECRET;
    withHeaders({ 'x-portal-user': 'sub-x' });
    expect(currentUser()).not.toBeNull();
  });

  it('with a secret, missing X-Portal-Auth → null (rejects forged identity)', () => {
    process.env.PORTAL_SHARED_SECRET = 'topsecret';
    withHeaders({ 'x-portal-user': 'sub-x' });
    expect(currentUser()).toBeNull();
  });

  it('with a secret, wrong X-Portal-Auth → null', () => {
    process.env.PORTAL_SHARED_SECRET = 'topsecret';
    withHeaders({ 'x-portal-user': 'sub-x', 'x-portal-auth': 'guess' });
    expect(currentUser()).toBeNull();
  });

  it('with a secret, matching X-Portal-Auth → user is provisioned normally', () => {
    process.env.PORTAL_SHARED_SECRET = 'topsecret';
    withHeaders({ 'x-portal-user': 'sub-x', 'x-portal-auth': 'topsecret' });
    const u = currentUser();
    expect(u).not.toBeNull();
    expect(u!.google_sub).toBe('sub-x');
  });

  it('admin gate also requires the secret when configured', () => {
    process.env.PORTAL_SHARED_SECRET = 'topsecret';
    withHeaders({ 'x-portal-user': 'sub-admin', 'x-portal-auth': 'topsecret' });
    const u = currentUser();
    getDb().prepare(`UPDATE users SET is_admin = 1 WHERE id = ?`).run(u!.id);

    // Without secret → not admin (in fact, not even a user)
    withHeaders({ 'x-portal-user': 'sub-admin' });
    expect(currentAdmin()).toBeNull();

    withHeaders({ 'x-portal-user': 'sub-admin', 'x-portal-auth': 'topsecret' });
    expect(currentAdmin()?.is_admin).toBe(1);
  });
});

describe('currentAdmin()', () => {
  it('returns null when the portal user is not an admin', () => {
    withHeaders({ 'x-portal-user': 'sub-regular' });
    expect(currentAdmin()).toBeNull();
  });

  it('returns the user when is_admin = 1', () => {
    withHeaders({ 'x-portal-user': 'sub-boss' });
    const u = currentUser();
    getDb().prepare(`UPDATE users SET is_admin = 1 WHERE id = ?`).run(u!.id);

    withHeaders({ 'x-portal-user': 'sub-boss' });
    const admin = currentAdmin();
    expect(admin).not.toBeNull();
    expect(admin!.is_admin).toBe(1);
  });

  it('returns null with no portal header', () => {
    setHeaders({});
    expect(currentAdmin()).toBeNull();
  });
});
