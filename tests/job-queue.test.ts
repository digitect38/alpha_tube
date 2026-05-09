import { describe, it, expect } from 'vitest';
import { JobQueue, parseJobConcurrency } from '@/lib/job-queue';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('JobQueue', () => {
  it('rejects invalid concurrency', () => {
    expect(() => new JobQueue(0)).toThrow();
    expect(() => new JobQueue(-1)).toThrow();
    expect(() => new JobQueue(NaN)).toThrow();
  });

  it('runs at most N jobs concurrently', async () => {
    const q = new JobQueue(2);
    const gates = Array.from({ length: 5 }, () => deferred<void>());
    let active = 0;
    let peakActive = 0;

    for (const g of gates) {
      q.enqueue({
        async run() {
          active++;
          peakActive = Math.max(peakActive, active);
          await g.promise;
          active--;
        },
      });
    }

    // Give the queue a tick to schedule.
    await Promise.resolve();
    await Promise.resolve();
    expect(active).toBe(2);
    expect(q.activeCount).toBe(2);
    expect(q.pendingCount).toBe(3);

    // Drain: open all gates in order, the queue should pull from waiting.
    for (const g of gates) g.resolve();
    await q.drain();

    expect(peakActive).toBeLessThanOrEqual(2);
    expect(q.activeCount).toBe(0);
    expect(q.pendingCount).toBe(0);
  });

  it('preserves FIFO order', async () => {
    const q = new JobQueue(1);
    const order: number[] = [];
    for (let i = 0; i < 5; i++) {
      q.enqueue({
        async run() {
          order.push(i);
          // Yield so the queue gets a chance to interleave (it shouldn't).
          await new Promise(r => setTimeout(r, 5));
        },
      });
    }
    await q.drain();
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it('isolates errors — a throwing job does not stop subsequent jobs', async () => {
    const q = new JobQueue(1);
    const ran: string[] = [];
    const errors: unknown[] = [];

    q.enqueue({
      async run() { ran.push('a'); throw new Error('boom'); },
      onError(e) { errors.push(e); },
    });
    q.enqueue({ async run() { ran.push('b'); } });
    q.enqueue({ async run() { ran.push('c'); } });

    await q.drain();
    expect(ran).toEqual(['a', 'b', 'c']);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('boom');
  });

  it('drain() resolves immediately when nothing is queued', async () => {
    const q = new JobQueue(1);
    await expect(q.drain()).resolves.toBeUndefined();
  });

  it('a job enqueued after drain() finishes still runs', async () => {
    const q = new JobQueue(1);
    let ran = false;
    q.enqueue({ async run() {} });
    await q.drain();
    q.enqueue({ async run() { ran = true; } });
    await q.drain();
    expect(ran).toBe(true);
  });
});

describe('parseJobConcurrency', () => {
  it('uses the configured positive integer', () => {
    expect(parseJobConcurrency('4')).toBe(4);
  });

  it('falls back for invalid values instead of crashing module import', () => {
    expect(parseJobConcurrency(undefined)).toBe(2);
    expect(parseJobConcurrency('')).toBe(2);
    expect(parseJobConcurrency('abc')).toBe(2);
    expect(parseJobConcurrency('0')).toBe(2);
    expect(parseJobConcurrency('-1')).toBe(2);
  });
});
