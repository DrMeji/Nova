/**
 * BrainProfile + GPU limits smoke (no Electron required).
 */
import assert from 'node:assert/strict';

// Minimal stubs so modules that touch window/localStorage don't explode.
globalThis.window = globalThis.window || {};
globalThis.localStorage = globalThis.localStorage || {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const {
  assertVramFits,
  maxCoderParamsBForVram,
  preferredCoderQuant,
  allowTwoLocalModels,
  parseGgufQuant,
} = await import('../src/lib/gpuLimits.ts');

assert.equal(maxCoderParamsBForVram(3), 0);
assert.equal(maxCoderParamsBForVram(5), 3);
assert.equal(maxCoderParamsBForVram(8), 7);
assert.equal(maxCoderParamsBForVram(16), 14);
assert.equal(preferredCoderQuant(12), 'Q5_K_M');
assert.equal(preferredCoderQuant(6), 'Q4_K_M');
assert.equal(allowTwoLocalModels(32, 8), true);
assert.equal(allowTwoLocalModels(16, 8), false);
assert.equal(parseGgufQuant('qwen-7b-Q4_K_M.gguf'), 'Q4_K_M');

const q3 = assertVramFits({ vramGb: 16, idOrName: 'coder-7b-Q3_K_M.gguf' });
assert.equal(q3.ok, false);

const tinyVram = assertVramFits({ vramGb: 2, idOrName: 'qwen25-coder-7b-Q4_K_M' });
assert.equal(tinyVram.ok, false);

const fit7 = assertVramFits({ vramGb: 8, idOrName: 'qwen25-coder-7b-Q4_K_M' });
assert.equal(fit7.ok, true);

// Profile gates via pure helpers exported from brainProfile (isWeak + assert with fake profile)
const {
  isWeakCoderId,
  assertCoderAllowed,
  assertMultiModelAllowed,
} = await import('../src/lib/brainProfile.ts');

assert.equal(isWeakCoderId('qwen25-15b'), true);
assert.equal(isWeakCoderId('qwen25-coder-7b'), false);

const weakPc = {
  ramGB: 8,
  vramGB: 0,
  cores: 4,
  gpuName: 'iGPU',
  gpuUsable: false,
  maxCoderParamsB: 0,
  maxChatParamsB: 3,
  allowMultiModel: false,
  preferredQuant: 'Q4_K_M',
  recommend: {
    chat: { id: 'llama32-3b', name: 'Llama 3.2 3B', role: 'chat' },
    coder: null,
    vision: null,
  },
  reason: '8 GB · CPU',
  probedAt: Date.now(),
};

assert.equal(assertCoderAllowed(weakPc, 'qwen25-coder-7b', '7B').ok, false);
assert.equal(assertCoderAllowed(weakPc, 'qwen25-15b', '1.5B').ok, false);
assert.equal(assertMultiModelAllowed(weakPc).ok, false);

const fatPc = {
  ...weakPc,
  ramGB: 32,
  vramGB: 12,
  gpuUsable: true,
  maxCoderParamsB: 14,
  allowMultiModel: true,
  reason: '32 GB · GPU 12 GB',
};
assert.equal(assertCoderAllowed(fatPc, 'qwen25-coder-7b', '7B').ok, true);
assert.equal(assertCoderAllowed(fatPc, 'qwen25-15b', '1.5B').ok, false);
assert.equal(assertMultiModelAllowed(fatPc).ok, true);

console.log('brain-profile smoke ok');
