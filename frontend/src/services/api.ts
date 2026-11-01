export async function api<T = any>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch('/api' + path, {
    ...options,
    headers:
      options?.body instanceof FormData
        ? { 'X-Solar-Client': '1' }
        : { 'Content-Type': 'application/json', 'X-Solar-Client': '1', ...options?.headers },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      message = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    } catch {
      /* Preserve HTTP evidence when a proxy returns HTML. */
    }
    throw new Error(message);
  }
  return response.json();
}
export async function pollJob(id: string, update: (job: any) => void) {
  while (true) {
    const job = await api('/jobs/' + id);
    update(job);
    if (job.status === 'failed') throw new Error(job.message);
    if (job.status === 'cancelled') throw new Error('Calculation cancelled');
    if (job.status === 'complete') return job.result;
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
}
export const download = (run: string, query: string) =>
  window.open(`/api/runs/${run}/export?${query}`, '_blank', 'noopener');
