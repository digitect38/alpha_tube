import { getDb } from './db';
import { transcodeQueue } from './job-queue';
import { runTranscodeWorker } from './transcode-worker';

// Videos in `processing` are waiting on (or running) a transcode worker. If
// the container restarted while one of those was in flight, the row stays
// stuck forever. Kept as a pure query function so it's easy to unit-test.
export type StuckJob = { id: string };

export function findStuckJobs(): StuckJob[] {
  return getDb()
    .prepare(`SELECT id FROM videos WHERE status = 'processing' ORDER BY created_at ASC`)
    .all() as StuckJob[];
}

// Re-queue every stuck transcode. Called once at startup from
// instrumentation.ts. Safe to call again — the queue itself dedups via the
// globalThis singleton; running this twice in the same process would spawn
// two workers per video, so we guard against repeated invocation here too.
let alreadyReconciled = false;
export function reconcileStuckJobs(): number {
  if (alreadyReconciled) return 0;
  alreadyReconciled = true;
  const rows = findStuckJobs();
  if (rows.length === 0) return 0;
  console.log(`[reconcile] re-queueing ${rows.length} stuck transcode job(s)`);
  for (const row of rows) {
    transcodeQueue.enqueue({
      run: () => runTranscodeWorker(row.id),
      onError: err => console.error('[reconcile-worker]', row.id, err),
    });
  }
  return rows.length;
}

// Test-only helper to flip the guard back so reconcileStuckJobs can be
// exercised more than once in a single test process.
export function __resetReconcilerGuard() {
  alreadyReconciled = false;
}
