/** Desktop-safe HTTP for plugin APIs (Electron main process avoids CORS). */

export type HttpResult = { ok: boolean; status: number; data: unknown };

export async function desktopRequest(
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<HttpResult> {
  const method = options?.method ?? 'GET';
  const headers = options?.headers ?? {};
  const body = options?.body;

  if (window.arkDesktop?.httpRequest) {
    return window.arkDesktop.httpRequest(url, { method, headers, body });
  }

  if (method === 'GET' && window.arkDesktop?.httpGet) {
    return window.arkDesktop.httpGet(url, headers);
  }

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

export function apiErrorMessage(res: HttpResult, fallback: string) {
  if (typeof res.data === 'object' && res.data && 'message' in res.data) {
    return String((res.data as { message: string }).message);
  }
  if (typeof res.data === 'object' && res.data && 'error' in res.data) {
    const err = (res.data as { error: unknown }).error;
    if (typeof err === 'object' && err && 'message' in err) {
      return String((err as { message: string }).message);
    }
    if (typeof err === 'string') return err;
  }
  return `${fallback} (${res.status})`;
}
