/**
 * Click-to-source MVP — Live element selection → edit context for next turn.
 * Frontman-lite: store selector + snippet; chat edit consumes it.
 */

export type ClickToSourcePayload = {
  selector: string;
  tagName: string;
  text: string;
  className: string;
  outerHtml: string;
  at: number;
};

const STORE = new Map<string, ClickToSourcePayload>();

export function setClickToSource(projectKey: string, payload: Omit<ClickToSourcePayload, 'at'>): ClickToSourcePayload {
  const full: ClickToSourcePayload = { ...payload, at: Date.now() };
  STORE.set(String(projectKey || 'default'), full);
  return full;
}

export function consumeClickToSource(projectKey: string): ClickToSourcePayload | null {
  const key = String(projectKey || 'default');
  const hit = STORE.get(key) || null;
  if (hit) STORE.delete(key);
  return hit;
}

export function peekClickToSource(projectKey: string): ClickToSourcePayload | null {
  return STORE.get(String(projectKey || 'default')) || null;
}

/** Resolve project key for Live selections (disk root preferred). */
export function clickToSourceProjectKey(): string {
  try {
    const last = JSON.parse(localStorage.getItem('NOVA:last-disk-target') || '{}') || {};
    return String(last.path || last.name || 'default');
  } catch {
    return 'default';
  }
}

/** Host window listener — Live iframe postMessage → store for next edit. */
export function installClickToSourceHost(): () => void {
  if (typeof window === 'undefined') return () => {};
  const onMsg = (ev: MessageEvent) => {
    const d = ev.data;
    if (!d) return;
    const key = clickToSourceProjectKey();
    if (d.type === 'nova-cts-select') {
      setClickToSource(key, {
        selector: String(d.selector || ''),
        tagName: String(d.tagName || ''),
        className: String(d.className || ''),
        text: String(d.text || ''),
        outerHtml: String(d.outerHtml || ''),
      });
      try {
        window.dispatchEvent(new CustomEvent('NOVA:cts-select', { detail: { key, selector: d.selector } }));
      } catch { /* ignore */ }
      return;
    }
    // Live annotations (Lovable / AI Studio style sticky notes on preview).
    if (d.type === 'nova-cts-annotate' && d.note) {
      void import('@/lib/inventWave4Pack').then((m) => {
        m.addLiveAnnotation(key, {
          selector: String(d.selector || ''),
          note: String(d.note || ''),
        });
        try {
          window.dispatchEvent(new CustomEvent('NOVA:cts-annotate', {
            detail: { key, selector: d.selector, note: d.note },
          }));
        } catch { /* ignore */ }
      });
    }
  };
  window.addEventListener('message', onMsg);
  return () => window.removeEventListener('message', onMsg);
}

export function formatClickToSourceAsk(payload: ClickToSourcePayload, userAsk: string): string {
  return [
    String(userAsk || '').trim(),
    '',
    '## Live selection (click-to-source)',
    `- selector: \`${payload.selector}\``,
    `- tag: ${payload.tagName}`,
    `- class: ${payload.className || '(none)'}`,
    `- text: ${payload.text.slice(0, 200)}`,
    '```html',
    payload.outerHtml.slice(0, 1200),
    '```',
    'Edit the source that owns this element. Prefer surgical JSX/CSS change.',
  ].join('\n');
}

/** Injected into Live preview for select mode (Vite). */
export const CLICK_TO_SOURCE_BOOTSTRAP = `
(function(){
  if (window.__novaClickToSource) return;
  window.__novaClickToSource = true;
  let on = false;
  function cssPath(el){
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + el.id;
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 5) {
      let part = n.tagName.toLowerCase();
      if (n.classList && n.classList.length) part += '.' + [...n.classList].slice(0,2).join('.');
      parts.unshift(part);
      n = n.parentElement;
    }
    return parts.join(' > ');
  }
  window.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'nova-cts-toggle') on = !!ev.data.on;
  });
  document.addEventListener('click', (ev) => {
    if (!on) return;
    ev.preventDefault();
    ev.stopPropagation();
    const t = ev.target;
    if (!t || !t.tagName) return;
    const payload = {
      type: 'nova-cts-select',
      selector: cssPath(t),
      tagName: t.tagName.toLowerCase(),
      className: String(t.className || ''),
      text: String(t.textContent || '').trim().slice(0, 240),
      outerHtml: String(t.outerHTML || '').slice(0, 1500),
    };
    try { window.parent && window.parent.postMessage(payload, '*'); } catch (_) {}
  }, true);
})();
`;
