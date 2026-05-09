import path from 'node:path';
import { spawn } from 'node:child_process';

// Spawn the standalone CLI worker (scripts/process-video.mjs) for one video.
// Returns a promise that resolves when the worker exits 0, rejects otherwise.
// Sharing one helper between the upload route and the startup reconciler so
// the spawn args stay in lockstep.
export function runTranscodeWorker(videoId: string): Promise<void> {
  const workerScript = path.join(process.cwd(), 'scripts', 'process-video.mjs');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerScript, videoId], {
      stdio: 'ignore',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`process-video exited ${code}`));
    });
  });
}
