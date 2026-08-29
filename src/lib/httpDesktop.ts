/** Desktop-safe HTTP for plugin APIs (Electron main process avoids CORS). */

export type HttpResult = { ok: boolean; status: number; data: unknown };

export type DesktopHttpOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Inject Authorization from main-process secrets. never pass keys in headers when set. */
  authProviderId?: string;
};

function extractStreamText(data: unknown): string {
  if (typeof data === 'object' && data && 'choices' in data) {
    const choices = (data as {
      choices?: { message?: { content?: string }; delta?: { content?: string } }[];
    }).choices;
    return choices?.map(choice => choice.message?.content || choice.delta?.content || '').join('') || '';
  }
  if (typeof data !== 'object' || !data || !('raw' in data)) return '';
  const raw = String((data as { raw?: unknown }).raw || '');
  let text = '';
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const parsed = JSON.parse(payload) as {
        choices?: { message?: { content?: string }; delta?: { content?: string } }[];
        delta?: { text?: string };
      };
      text += parsed.choices?.map(choice => choice.message?.content || choice.delta?.content || '').join('')
        || parsed.delta?.text
        || '';
    } catch {
      // Ignore non-JSON keep-alive/data lines.
    }
  }
  return text;
}

export async function desktopRequest(
  url: string,
  options?: DesktopHttpOptions,
): Promise<HttpResult> {
  const method = options?.method ?? 'GET';
  const headers = options?.headers ?? {};
  const body = options?.body;
  const authProviderId = options?.authProviderId;

  if (window.arkDesktop?.httpRequest) {
    return window.arkDesktop.httpRequest(url, { method, headers, body, authProviderId });
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

/**
 * Stream SSE from main (OpenAI-compatible chat). onChunk receives text deltas.
 * Falls back to buffered desktopRequest when stream IPC is unavailable.
 */
export async function desktopStreamRequest(
  url: string,
  options: DesktopHttpOptions,
  onChunk: (text: string) => void,
): Promise<{ ok: boolean; status?: number; text: string; error?: string }> {
  if (!window.arkDesktop?.httpStream) {
    const res = await desktopRequest(url, options);
    if (!res.ok) {
      return { ok: false, status: res.status, text: '', error: apiErrorMessage(res, 'Stream error') };
    }
    const text = extractStreamText(res.data).trim();
    if (text) onChunk(text);
    if (!text) {
      return { ok: false, status: res.status, text: '', error: 'Stream returned no text' };
    }
    return { ok: true, status: res.status, text };
  }

  const streamId = `http-${crypto.randomUUID().slice(0, 10)}`;
  let full = '';
  let err: string | undefined;
  const stop = window.arkDesktop.onHttpStreamChunk?.((payload) => {
    if (payload?.streamId && payload.streamId !== streamId) return;
    if (payload?.type === 'delta' && payload.text) {
      full += payload.text;
      onChunk(payload.text);
    }
    if (payload?.type === 'done' && typeof payload.text === 'string' && !full) {
      full = payload.text;
    }
    if (payload?.type === 'error') {
      err = payload.error || 'Stream error';
    }
  });

  try {
    const result = await window.arkDesktop.httpStream(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      authProviderId: options.authProviderId,
      streamId,
    });
    if (err) return { ok: false, text: full, error: err };
    if (result && result.ok === false) {
      return {
        ok: false,
        status: result.status,
        text: full || result.text || '',
        error: result.error || err || 'Stream failed',
      };
    }
    const text = full || result?.text || '';
    return { ok: true, status: result?.status, text };
  } finally {
    stop?.();
  }
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
