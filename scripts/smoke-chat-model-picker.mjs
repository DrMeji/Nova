/**
 * Chat model picker restore — Multimodal default + keyed cloud pins.
 * Run: npm run smoke:chat-model-picker
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

const { CHAT_MODELS, CLOUD_CHAT_WHEN_KEYED, defaultModelForKind } = await import('../src/views/aichat/aiChatHelpers.tsx');
const { setLocalPrefs, hasProviderApiKey } = await import('../src/lib/localPrefs.ts');

let failed = 0;
function check(name, cond) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', name);
  } else {
    console.log('ok', name);
  }
}

function seedProviderKeys(map) {
  localStorage.setItem('NOVA:provider-api-keys', JSON.stringify(map));
}

// Fresh Multimodal default
setLocalPrefs({ defaultModelId: 'NOVA-auto', lastChatModelId: undefined });
{
  const d = defaultModelForKind('chat');
  check('default → Multimodal', d.id === 'NOVA-auto' && d.source === 'auto');
}

check('catalog has Multimodal chat', CHAT_MODELS.some(m => m.id === 'NOVA-auto' && m.kind === 'chat'));
check('cloud catalog has HF', CLOUD_CHAT_WHEN_KEYED.some(m => m.id === 'hf-llama' && m.keyId === 'huggingface'));
check('cloud catalog has OpenRouter', CLOUD_CHAT_WHEN_KEYED.some(m => m.id === 'openrouter-free'));
check('cloud catalog has Gemini', CLOUD_CHAT_WHEN_KEYED.some(m => m.id === 'gemini-flash'));

// Without key → Multimodal fallback
seedProviderKeys({});
setLocalPrefs({ lastChatModelId: 'hf-llama', defaultModelId: 'hf-llama' });
{
  const d = defaultModelForKind('chat');
  check('HF pin without key → Multimodal', d.id === 'NOVA-auto' && d.source === 'auto');
  check('HF key absent', !hasProviderApiKey('huggingface'));
}

// With HF key → pin sticks
seedProviderKeys({ huggingface: 'hf_test_key_for_smoke' });
setLocalPrefs({ lastChatModelId: 'hf-llama', defaultModelId: 'hf-llama' });
{
  const d = defaultModelForKind('chat');
  check('HF pin when keyed → hf-llama', d.id === 'hf-llama' && d.source === 'cloud');
}

// OpenRouter pin
seedProviderKeys({ openrouter: 'or_test_key_for_smoke' });
setLocalPrefs({ lastChatModelId: 'openrouter-free', defaultModelId: 'openrouter-free' });
{
  const d = defaultModelForKind('chat');
  check('OpenRouter pin when keyed', d.id === 'openrouter-free' && d.source === 'cloud');
}

// Restore Multimodal
setLocalPrefs({ defaultModelId: 'NOVA-auto', lastChatModelId: undefined });
{
  const back = defaultModelForKind('chat');
  check('restore Multimodal', back.id === 'NOVA-auto' && back.source === 'auto');
}

// Host pin signal: cloud preferredSource for HF (mirrors makeChatHost)
seedProviderKeys({ huggingface: 'hf_test_key_for_smoke' });
setLocalPrefs({ lastChatModelId: 'hf-llama', defaultModelId: 'hf-llama' });
{
  const hf = defaultModelForKind('chat');
  check('host preferredSource cloud', hf.source === 'cloud');
  check('host preferredModelId hf-llama', hf.id === 'hf-llama');
}
setLocalPrefs({ defaultModelId: 'NOVA-auto', lastChatModelId: undefined });
{
  const auto = defaultModelForKind('chat');
  check('host preferredSource auto', auto.source === 'auto' && auto.id === 'NOVA-auto');
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nok chat-model-picker');
