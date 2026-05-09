// In-memory FIFO with a concurrency cap. Used by the upload pipeline so a
// burst of uploads doesn't spawn N parallel ffmpeg processes and pin the box.
// Persists nothing — if the container restarts mid-job, the watching DB rows
// stay in `processing` and a future task should reconcile them.

export type Job = {
  /** Long-running async work; throws are caught and routed to onError. */
  run(): Promise<void>;
  /** Optional: side-channel error reporter (logging, metric, etc.). */
  onError?(err: unknown): void;
};

export class JobQueue {
  private running = 0;
  private waiting: Job[] = [];

  constructor(public readonly concurrency: number) {
    if (!Number.isFinite(concurrency) || concurrency < 1) {
      throw new Error(`JobQueue concurrency must be ≥ 1, got ${concurrency}`);
    }
  }

  enqueue(job: Job): void {
    this.waiting.push(job);
    this.tick();
  }

  /** Number of jobs currently executing. */
  get activeCount(): number { return this.running; }
  /** Number of jobs waiting for a slot. */
  get pendingCount(): number { return this.waiting.length; }

  /** Resolves once every queued job — running and waiting — has finished. */
  drain(): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        if (this.running === 0 && this.waiting.length === 0) resolve();
        else this.idleHooks.push(check);
      };
      check();
    });
  }

  private idleHooks: Array<() => void> = [];

  private tick() {
    while (this.running < this.concurrency && this.waiting.length > 0) {
      const job = this.waiting.shift()!;
      this.running++;
      // Detach the work onto the microtask queue so enqueue() always returns
      // synchronously and a fast-failing run() can't re-enter tick() before
      // the running counter is correct.
      Promise.resolve()
        .then(() => job.run())
        .catch(err => {
          if (job.onError) {
            try { job.onError(err); } catch { /* swallow */ }
          } else {
            // No handler → at least don't lose it.
            console.error('[job-queue] unhandled error:', err);
          }
        })
        .finally(() => {
          this.running--;
          // Notify drain() waiters before kicking the next batch — keeps the
          // semantics simple for tests.
          if (this.running === 0 && this.waiting.length === 0) {
            const hooks = this.idleHooks;
            this.idleHooks = [];
            for (const h of hooks) h();
          }
          this.tick();
        });
    }
  }
}

export function parseJobConcurrency(value: string | undefined, fallback = 2): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

// Reuse a single queue across hot reloads in dev so we don't accidentally
// build up multiple workers all racing for the same DB row.
const g = globalThis as { __transcodeQueue?: JobQueue };

const concurrency = parseJobConcurrency(process.env.TRANSCODE_CONCURRENCY);

if (!g.__transcodeQueue) g.__transcodeQueue = new JobQueue(concurrency);

export const transcodeQueue = g.__transcodeQueue;
