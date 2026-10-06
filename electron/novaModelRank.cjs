/**
 * Shared Engine model ranking (keep in sync with src/lib/enginePick.ts).
 * Used by NOVA Engine + Brain API so Lindsay and in-app chat pick the same GGUF.
 * Never involves Ollama.
 */

const CHAT_ENGINE_RANK = [
  'qwen25-14b',
  'llama31-8b',
  'qwen25-7b',
  'mistral-7b',
  'deepseek-r1-distill-8b',
  'llama32-3b',
  'phi3-mini',
  'gemma2-2b',
  'qwen25-15b',
];

const CODER_ENGINE_RANK = [
  'qwen25-coder-14b',
  'qwen25-coder-7b',
  'deepseek-coder-v2-lite',
  'starcoder2-7b',
];

const WEAK_CHAT = new Set(['qwen25-15b', 'gemma2-2b', 'phi3-mini']);

const MIN_RAM_GB = {
  'qwen25-coder-14b': 16,
  'qwen25-14b': 16,
  'qwen25-coder-7b': 10,
  'qwen25-7b': 10,
  'llama31-8b': 10,
  'mistral-7b': 10,
  'deepseek-r1-distill-8b': 10,
  'deepseek-coder-v2-lite': 12,
  'starcoder2-7b': 10,
  'llama32-3b': 6,
};

const BUILD_ASK =
  /\b(build|create|make|scaffold|implement|refactor|debug|fix)\b[\s\S]{0,48}\b(app|website|component|function|api|project|calculator|tool|page|ui)\b/i;
const CODE_FILE =
  /\b(look (at|into)|review|open|edit|read)\b[\s\S]{0,40}\b(file|code|repo|project|source)\b/i;

function looksLikeCodeAsk(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/```[\w]*\n/.test(t)) return true;
  if (BUILD_ASK.test(t)) return true;
  if (CODE_FILE.test(t)) return true;
  if (/\b(typescript|javascript|python|react|node\.?js|html|css)\b/i.test(t)
    && /\b(build|write|create|fix|add)\b/i.test(t)) {
    return true;
  }
  return false;
}

function classifyIntent(message, kind) {
  if (kind === 'image' || kind === 'video') return 'media';
  if (kind === 'coding') return 'coding';
  if (looksLikeCodeAsk(message)) return 'coding';
  return 'chat';
}

function fitsRam(id, ramGb) {
  const need = MIN_RAM_GB[id];
  if (need == null) return true;
  return Number(ramGb) + 0.5 >= need;
}

function isWeakChatBrain(id) {
  if (!id) return true;
  return WEAK_CHAT.has(id);
}

function rankedReadyEngineIds(models, intent, ramGb) {
  const ram = Number(ramGb) > 0 ? Number(ramGb) : 8;
  const ready = new Set(
    (models || [])
      .filter((m) => m && m.status === 'ready' && m.id && m.id !== 'NOVA-core'
        && m.id !== 'NOVA-image-core' && m.id !== 'NOVA-video-core'
        && !String(m.id).includes('image') && !String(m.id).includes('video')
        && !String(m.id).startsWith('sd') && m.id !== 'flux-schnell-local')
      .map((m) => String(m.id)),
  );
  if (!ready.size) return [];

  const isCoder = (id) =>
    /coder|starcoder|codestral|codellama|devstral|deepseek-coder/i.test(id);

  if (intent === 'coding') {
    // Known quality order first (32B → 7B), then any other ready coder GGUFs.
    const ordered = [];
    for (const id of CODER_ENGINE_RANK) {
      if (!ready.has(id)) continue;
      if (!fitsRam(id, ram)) continue;
      ordered.push(id);
    }
    for (const id of ready) {
      if (ordered.includes(id)) continue;
      if (!isCoder(id)) continue;
      if (!fitsRam(id, ram)) continue;
      ordered.push(id);
    }
    return ordered;
  }

  const ordered = [];
  for (const id of CHAT_ENGINE_RANK) {
    if (!ready.has(id)) continue;
    if (!fitsRam(id, ram)) continue;
    ordered.push(id);
  }
  for (const id of ready) {
    if (ordered.includes(id)) continue;
    if (!fitsRam(id, ram)) continue;
    ordered.push(id);
  }
  if (!ordered.length) return [...ready];
  return ordered;
}

function pickReadyEngineId(models, intent, ramGb) {
  return rankedReadyEngineIds(models, intent, ramGb)[0];
}

/** Next ready GGUF when the current one is near context capacity. */
function pickSuccessorReadyId(models, intent, ramGb, currentId) {
  const ordered = rankedReadyEngineIds(models, intent, ramGb);
  return ordered.find((id) => id && id !== currentId) || null;
}

module.exports = {
  CHAT_ENGINE_RANK,
  CODER_ENGINE_RANK,
  looksLikeCodeAsk,
  classifyIntent,
  isWeakChatBrain,
  rankedReadyEngineIds,
  pickReadyEngineId,
  pickSuccessorReadyId,
};
