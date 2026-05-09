export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { reconcileStuckJobs } = await import('./lib/reconcile');
  reconcileStuckJobs();
}
