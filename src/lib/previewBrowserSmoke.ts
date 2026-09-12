/**
 * After Preview starts, smoke-check the live URL (browser / fetch) so Ready
 * is not declared on a dead server.
 */

export type PreviewSmokeResult = {
  ok: boolean;
  status?: number;
  note: string;
};

export async function smokeCheckPreviewUrl(
  url: string,
  opts?: { timeoutMs?: number },
): Promise<PreviewSmokeResult> {
  const target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) {
    return { ok: false, note: 'No Preview URL yet' };
  }
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(target, {
      method: 'GET',
      signal: ctrl.signal,
      cache: 'no-store',
    });
    const status = res.status;
    if (status >= 200 && status < 400) {
      const html = await res.text().catch(() => '');
      if (html && /<!DOCTYPE|<html|<div id=["']root["']/i.test(html)) {
        return { ok: true, status, note: 'Preview page responded' };
      }
      return { ok: true, status, note: 'Preview server responded' };
    }
    return { ok: false, status, note: `Preview returned HTTP ${status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch failed';
    return { ok: false, note: `Preview unreachable (${msg})` };
  } finally {
    window.clearTimeout(timer);
  }
}
