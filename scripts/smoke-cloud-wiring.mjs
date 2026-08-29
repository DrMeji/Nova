/**
 * Smoke-test live cloud catalog ids resolve to router providers.
 * npm run smoke:cloud-wiring
 */
// cloudChat also constructs the Supabase client, whose browser storage hooks
// expect window during module initialization. Provide the smallest test shim.
const storage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
globalThis.localStorage = storage;
globalThis.window = {
  localStorage: storage,
  addEventListener: () => {},
  removeEventListener: () => {},
};

const { resolvePreferredCloudProvider } = await import('../src/lib/cloudChat.ts');

const cases = [
  ['llama31-405b', 'Llama 3.1 405B', 'openrouter'],
  ['qwen-coder-plus', 'Qwen2.5-Coder Plus', 'openrouter'],
  ['qwq-cloud', 'QwQ', 'openrouter'],
  ['groq-llama', 'Llama 3.3 (Groq)', 'groq'],
  ['gemini-flash', 'Gemini 2.0 Flash', 'google'],
  ['claude-sonnet', 'Claude Sonnet', 'anthropic'],
];

let failed = 0;
for (const [id, name, expected] of cases) {
  const result = resolvePreferredCloudProvider(id, name);
  if (result?.providerId !== expected) {
    console.error(`FAIL ${id}: expected ${expected}, got ${result?.providerId || 'none'}`);
    failed += 1;
  }
}

if (failed) process.exit(1);
console.log(`OK: ${cases.length} live cloud model mappings resolve`);
