/**
 * Failover honesty matrix (#18): no key / free-key wiring / local-path messaging.
 * Does not call live APIs — asserts capacity + router honesty strings exist and
 * catalog wiring for free providers is intact.
 *
 * npm run smoke:failover-matrix
 */
const storage = new Map();
const localStorageShim = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => { storage.set(k, String(v)); },
  removeItem: (k) => { storage.delete(k); },
  clear: () => { storage.clear(); },
  get length() { return storage.size; },
  key: (i) => [...storage.keys()][i] ?? null,
};
globalThis.localStorage = localStorageShim;
globalThis.window = {
  localStorage: localStorageShim,
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
};

const { honestNoLiveChatReply } = await import('../src/lib/novaCapacity.ts');
const { resolvePreferredCloudProvider } = await import('../src/lib/cloudChat.ts');
const { isEngineDownloadable } = await import('../src/lib/api.ts');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) {
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
    failed += 1;
  } else {
    console.log(`OK ${name}`);
  }
}

// Config A — no live path: honesty copy must steer to key or local install
const noBrain = honestNoLiveChatReply();
check(
  'A no-key honesty',
  /live model|free key|local brain|Groq|Local AI/i.test(noBrain)
    && !/\(no response\)/i.test(noBrain),
);

// Config B — free keyed providers resolve (Groq / Google)
check(
  'B free Groq wiring',
  resolvePreferredCloudProvider('groq-llama', 'Llama 3.3 (Groq)')?.providerId === 'groq',
);
check(
  'B free Google wiring',
  resolvePreferredCloudProvider('gemini-flash', 'Gemini 2.0 Flash')?.providerId === 'google',
);

// Config C — default local Engine download exists for Chat pin path
check(
  'C local Qwen downloadable',
  isEngineDownloadable('qwen25-15b') || isEngineDownloadable('qwen2.5-1.5b') || isEngineDownloadable('qwen25-05b'),
  'expected a small Qwen Engine id in ENGINE_DOWNLOADABLE_IDS',
);

// Vision honesty: non-downloadable vision must not look installable
check('Vision LLaVA not downloadable', !isEngineDownloadable('llava-13b'));
check('Vision MiniCPM not downloadable', !isEngineDownloadable('minicpm-v'));
check('Vision Qwen2-VL is downloadable', isEngineDownloadable('qwen2-vl-7b'));

if (failed) {
  console.error(`\n${failed} failover-matrix check(s) failed`);
  process.exit(1);
}
console.log('\nOK: failover honesty matrix (A/B/C + vision) passed');
