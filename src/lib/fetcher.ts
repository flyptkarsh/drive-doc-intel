/** Fetches a JSON API route, throwing the server's error message on failure. */
export async function apiFetch<T = { ok: true }>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

/** POSTs a JSON body (or nothing) to an API route. */
export function apiPost<T = { ok: true }>(url: string, body?: unknown): Promise<T> {
  return apiFetch<T>(url, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** SWR fetcher. */
export const swrFetcher = <T>(url: string) => apiFetch<T>(url);
