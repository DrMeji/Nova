/**
 * Smoke: conversation continuity — soft follow-ups must keep history + coding topic.
 * npx tsx --tsconfig tsconfig.app.json scripts/smoke-followup-intent.mjs
 */
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

const {
  looksLikeConversationalPlanningAsk,
  looksLikeGreenfieldIdea,
  shouldInjectPlanningConversation,
} = await import('../src/lib/chatIdeaIntent.ts');
const { planningConversationHint } = await import('../src/lib/chatPlanMode.ts');
const {
  buildRouterHistory,
  inferThreadTopic,
  isTopicShift,
  packHistoryPrompt,
  routerSystemPrompt,
} = await import('../src/lib/chatHistory.ts');

const planCases = [
  {
    name: 'teach me to code',
    content: 'can you teach me how to code',
    pending: false,
    expectInject: false,
  },
  {
    name: 'bare more details (EcoBuddy repro)',
    content: 'I would like more details please',
    pending: false,
    expectInject: false,
  },
  {
    name: 'more details with pending product brief',
    content: 'I would like more details please',
    pending: true,
    expectInject: true,
  },
  {
    name: 'explicit stack ask',
    content: 'what stack should I use for my app',
    pending: false,
    expectInject: true,
  },
  {
    name: 'tell me more bare',
    content: 'tell me more',
    pending: false,
    expectInject: false,
  },
];

let failed = 0;
for (const c of planCases) {
  const inject = shouldInjectPlanningConversation(c.content, { pendingIdea: c.pending });
  const ok = inject === c.expectInject;
  if (!ok) failed += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} plan:${c.name}`,
    JSON.stringify({
      inject,
      expect: c.expectInject,
      greenfield: looksLikeGreenfieldIdea(c.content),
      conversational: looksLikeConversationalPlanningAsk(c.content),
    }),
  );
}

const hint = planningConversationHint(undefined);
if (/THIS specific product idea/i.test(hint)) {
  failed += 1;
  console.log('FAIL planningConversationHint still forces product idea');
} else {
  console.log('PASS planningConversationHint does not force product idea');
}

// --- Continuity / topic memory (movies-after-coding bug) ---
const dive = 'i would like to dive deeper in recommended area';
const teachThread = [
  { role: 'user', content: 'Hello NOVA' },
  { role: 'assistant', content: 'Hello! How can I assist you today?' },
  { role: 'user', content: 'can you teach me how to code' },
  {
    role: 'assistant',
    content:
      'Here is a path: 1) pick Python 2) learn variables 3) practice on LeetCode. Would you like to dive deeper into any of these steps or focus on a specific area?',
  },
];

const histKeep = buildRouterHistory(teachThread, dive, undefined, { keepContinuity: false, kind: 'chat' });
const shifted = isTopicShift(
  [
    ...teachThread.map(t => ({ role: t.role, content: t.content })),
    { role: 'user', content: dive },
  ],
  dive,
);
const topic = inferThreadTopic([
  ...teachThread.map(t => ({ role: /** @type {'user'|'assistant'} */ (t.role), content: t.content })),
  { role: 'user', content: dive },
]);
const packed = packHistoryPrompt(
  histKeep.map(t => ({ role: t.role, content: t.content })),
  dive,
);
const sys = routerSystemPrompt(histKeep);

const continuityCases = [
  {
    name: 'dive deeper is not topic shift',
    ok: shifted === false,
    detail: { shifted },
  },
  {
    name: 'history kept after dive deeper',
    ok: histKeep.length >= 4 && histKeep.some(t => /teach me how to code/i.test(t.content)),
    detail: { turns: histKeep.length, roles: histKeep.map(t => t.role) },
  },
  {
    name: 'topic is coding',
    ok: topic.kind === 'coding',
    detail: topic,
  },
  {
    name: 'packed prompt includes prior coding ask',
    ok: /teach me how to code/i.test(packed) && /Thread topic:.*learn(?:ing)? to code/i.test(packed),
    detail: { packedHead: packed.slice(0, 220) },
  },
  {
    name: 'system prompt anchors coding, not movies-as-default',
    ok: /learning to code/i.test(sys) && /Deepen the previous answer/i.test(sys),
    detail: { sysHead: sys.slice(0, 280) },
  },
  {
    name: 'weather to build still shifts when keepContinuity false',
    ok: (() => {
      const h = buildRouterHistory(
        [
          { role: 'user', content: 'what is the weather in Paris' },
          { role: 'assistant', content: 'It is sunny in Paris.' },
        ],
        'build me a todo app with React',
        undefined,
        { keepContinuity: false, kind: 'chat' },
      );
      return h.length === 1 && /todo app/i.test(h[0].content);
    })(),
    detail: {},
  },
  {
    name: 'explicit ninja switch allowed with continuity on',
    ok: (() => {
      const h = buildRouterHistory(
        teachThread,
        'actually tell me about ninja warriors instead',
        undefined,
        { keepContinuity: true, kind: 'chat' },
      );
      return h.some(t => /teach me how to code/i.test(t.content))
        && h.some(t => /ninja warriors/i.test(t.content));
    })(),
    detail: {},
  },
];

for (const c of continuityCases) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'} continuity:${c.name}`, JSON.stringify(c.detail));
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll follow-up + continuity checks passed.');
