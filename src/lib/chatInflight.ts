/**
 * Track in-flight Chat/Image generations so App can keep AIChat mounted
 * while the user visits Settings / Models / etc.
 */

type Listener = () => void;

let inflightCount = 0;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach(fn => {
    try { fn(); } catch { /* ignore */ }
  });
}

export function beginChatInflight() {
  inflightCount += 1;
  notify();
}

export function endChatInflight() {
  inflightCount = Math.max(0, inflightCount - 1);
  notify();
}

export function hasChatInflight(): boolean {
  return inflightCount > 0;
}

export function subscribeChatInflight(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
