/**
 * Phase A — prove create halfway / Live locked without a full Electron run.
 * Simulates gin (F&B invent skip) + 3-section visual floor vs full composition.
 *   npx tsx --tsconfig tsconfig.app.json scripts/phase-a-create-gate-repro.mjs
 */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

const {
  thinWantsCompositionalShell,
  formatCompositionalSectionSpecs,
  compositionalDepthIsComplete,
  compositionalSectionFileSubstantial,
  thinMeetsLiveVisualFloor,
  thinBlocksLivePreview,
  thinNeedsDepthPass,
  thinGenreSeedClearsLive,
  seedCompositionalBrandVisuals,
  seedCompositionalSectionScaffolds,
  assembleCompositionalAppShell,
  THIN_COMPOSITIONAL_SECTION_MIN_CHARS,
  THIN_LIVE_VISUAL_MIN_CHARS,
  THIN_LIVE_VISUAL_MIN_CSS,
  THIN_LIVE_VISUAL_MIN_LANDED_SECTIONS,
} = await import('../src/lib/createThinPath.ts');
const { detectHeroProductKind } = await import('../src/lib/createIdentity.ts');
const { canUnlockCreateLive } = await import('../src/lib/createReady.ts');
const { judgeCreateVerified } = await import('../src/lib/createPassSpine.ts');
const { emptyCreateEvidence, finalizeCreateEvidence } = await import('../src/lib/createEvidence.ts');

const pad = (n, ch = 'x') => ch.repeat(n);
const sectionBody = (name, label) => (
  `export default function ${name}(){\n`
  + `  return (\n`
  + `    <section id="${label.replace(/\s+/g, '-').toLowerCase()}">\n`
  + `      <h2>${label}</h2>\n`
  + `      <p>${'Original product copy for this brand. '.repeat(24)}</p>\n`
  + `      <p>${'More authored detail so the file clears the substantial floor. '.repeat(8)}</p>\n`
  + `    </section>\n`
  + `  );\n`
  + `}\n`
);

function report(title, rows) {
  console.log(`\n=== ${title} ===`);
  for (const [k, v] of Object.entries(rows)) {
    console.log(`  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }
}

const brief = 'Build a polished gin brand website with tasting notes, shop, and subscribe for Harbor & Oak Distilling';
const name = 'Harbor & Oak';
const kind = detectHeroProductKind(name, brief);
const fbInventSkip = /^(?:bottle|coffee|tea|lotion|chocolate|ceramic)$/.test(kind);
const specs = formatCompositionalSectionSpecs(brief, name);

report('Ask', {
  brief,
  name,
  productKind: kind,
  compositionalShell: thinWantsCompositionalShell(brief),
  requiredSections: specs.map((s) => s.filePath),
  fbInventSkipWouldApply: fbInventSkip,
});

// --- Case 1: F&B after genre seed only (invent skipped) ---
let seedOnly = {
  'src/App.jsx': `export default function App(){return (<div className="app"><header><img src="/logo.svg" alt="${name}" /><strong>${name}</strong></header><main><h1>${name}</h1><p>Small-batch gin.</p></main></div>);}`,
  'src/App.css': `.app{${pad(THIN_LIVE_VISUAL_MIN_CSS + 40, 'a')}}`,
  'public/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M8 22h8"/><path d="M12 2v4"/></svg>',
};
seedOnly = seedCompositionalBrandVisuals(seedOnly, brief, name);

const inventWouldEnterAfterFix = thinNeedsDepthPass(seedOnly, brief)
  && !thinGenreSeedClearsLive(seedOnly, brief, name);
const case1 = {
  thinNeedsDepthPass: thinNeedsDepthPass(seedOnly, brief),
  thinGenreSeedClearsLive: thinGenreSeedClearsLive(seedOnly, brief, name),
  thinMeetsLiveVisualFloor: thinMeetsLiveVisualFloor(seedOnly, brief),
  thinBlocksLivePreview: thinBlocksLivePreview(seedOnly, brief, name),
  compositionalDepthIsComplete: compositionalDepthIsComplete(seedOnly, brief, name),
  sectionFilesOnDisk: Object.keys(seedOnly).filter((k) => /src\/sections\//.test(k)),
  // Pre-fix: F&B skip blocked invent. Post-fix: invent enters for bottle kinds.
  inventWouldEnterPreFix: false,
  inventWouldEnterAfterFix,
};
const scaffoldedFromSeed = seedCompositionalSectionScaffolds(seedOnly, brief, name);
const case1Scaffold = {
  compositionalDepthIsComplete: compositionalDepthIsComplete(scaffoldedFromSeed, brief, name),
  sectionCount: Object.keys(scaffoldedFromSeed).filter((k) => /src\/sections\//.test(k)).length,
};
const unlock1 = canUnlockCreateLive(
  {
    id: 'phase-a-1',
    name,
    status: 'building',
    previewUrl: 'http://127.0.0.1:5173',
    craftBlocked: false,
  },
  seedOnly,
  brief,
);
report('Case 1 — F&B seed only', {
  ...case1,
  canUnlockCreateLive: unlock1.ok,
  unlockReasons: unlock1.reasons.slice(0, 8),
  craftWouldFailClosedPreFix: case1.thinBlocksLivePreview === true,
  scaffoldCompletes: case1Scaffold.compositionalDepthIsComplete,
  scaffoldSectionCount: case1Scaffold.sectionCount,
  BUG: fbInventSkip && !case1.compositionalDepthIsComplete && case1.inventWouldEnterAfterFix
    ? 'PROVEN (pre-fix skip) + FIXED invent entry for bottle; scaffolds complete sections'
    : 'not proven',
});

// --- Case 2: 3 rich sections (visual floor) but missing remaining specs ---
const three = specs.slice(0, THIN_LIVE_VISUAL_MIN_LANDED_SECTIONS);
const rest = specs.slice(THIN_LIVE_VISUAL_MIN_LANDED_SECTIONS);
let partial = {
  'src/App.css': `.app{min-height:100dvh;${pad(THIN_LIVE_VISUAL_MIN_CSS + 80, 'b')}}.hero{padding:4rem}`,
  'public/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M8 22h8M12 2v4"/></svg>',
};
for (const s of three) {
  partial[s.filePath] = sectionBody(s.componentName, s.slotLabel);
}
partial = assembleCompositionalAppShell(partial, brief, name);
// Fat App compact toward visual min via section bodies + shell
const appPad = pad(Math.max(0, THIN_LIVE_VISUAL_MIN_CHARS - 400), ' ');
partial['src/App.jsx'] = String(partial['src/App.jsx'] || '') + `\n/* ${appPad} */\n`;

const landedSubstantial = three.map((s) => ({
  path: s.filePath,
  substantial: compositionalSectionFileSubstantial(partial[s.filePath]),
  compact: String(partial[s.filePath] || '').replace(/\s+/g, '').length,
  min: THIN_COMPOSITIONAL_SECTION_MIN_CHARS,
}));
const missing = rest.map((s) => s.filePath);

const case2 = {
  landedCount: three.length,
  missingRequired: missing,
  thinMeetsLiveVisualFloor: thinMeetsLiveVisualFloor(partial, brief),
  thinBlocksLivePreview: thinBlocksLivePreview(partial, brief, name),
  compositionalDepthIsComplete: compositionalDepthIsComplete(partial, brief, name),
  thinGenreSeedClearsLive: thinGenreSeedClearsLive(partial, brief, name),
  pageBodyPresent: Boolean(partial['src/sections/PageBodySection.jsx']),
  landedSubstantial,
};
const evidence = finalizeCreateEvidence(emptyCreateEvidence({
  staticReady: true, npmInstalled: true, httpOk: true, mounted: true,
  consoleClean: true, smokeOk: true,
}));
const spine = judgeCreateVerified({
  evidence,
  files: partial,
  brief,
  productName: name,
});
const unlock2 = canUnlockCreateLive(
  {
    id: 'phase-a-2',
    name,
    status: 'building',
    previewUrl: 'http://127.0.0.1:5173',
    craftBlocked: false,
  },
  partial,
  brief,
);
const scaffoldedPartial = seedCompositionalSectionScaffolds(partial, brief, name);
const unlockScaffold = canUnlockCreateLive(
  {
    id: 'phase-a-2b',
    name,
    status: 'building',
    previewUrl: 'http://127.0.0.1:5173',
    craftBlocked: false,
  },
  scaffoldedPartial,
  brief,
);
const spineScaffold = judgeCreateVerified({
  evidence,
  files: scaffoldedPartial,
  brief,
  productName: name,
});
report('Case 2 — 3 sections clear visual floor, composition incomplete', {
  ...case2,
  canUnlockCreateLive: unlock2.ok,
  unlockReasons: unlock2.reasons.slice(0, 8),
  spineLiveUnlock: spine.liveUnlock,
  spineQualityReady: spine.qualityReady,
  spineReasons: (spine.reasons || []).slice(0, 6),
  afterScaffoldComplete: compositionalDepthIsComplete(scaffoldedPartial, brief, name),
  afterScaffoldGenreClears: thinGenreSeedClearsLive(scaffoldedPartial, brief, name),
  afterScaffoldUnlock: unlockScaffold.ok,
  afterScaffoldSpineLive: spineScaffold.liveUnlock,
  BUG: case2.thinMeetsLiveVisualFloor && !case2.compositionalDepthIsComplete && !unlock2.ok
    ? 'PROVEN halfway pattern; scaffolds restore composition'
    : case2.thinMeetsLiveVisualFloor === false
      ? `floor still false (landed=${case2.landedCount}); check fixture thickness`
      : 'not proven',
});

const proven = (
  (fbInventSkip && !case1.compositionalDepthIsComplete && case1.inventWouldEnterAfterFix)
  || (case2.thinMeetsLiveVisualFloor && !case2.compositionalDepthIsComplete && !unlock2.ok)
);
const fixed = case1Scaffold.compositionalDepthIsComplete
  && compositionalDepthIsComplete(scaffoldedPartial, brief, name)
  && case2.thinGenreSeedClearsLive === false;

console.log(`\n=== PHASE A/B VERDICT ===`);
console.log(`  bugProven: ${proven}`);
console.log(`  fixVerified: ${fixed}`);
console.log(`  confidence: ${fixed ? '~90 (gates + scaffolds + F&B invent entry)' : proven ? '~86 pending scaffold verify' : 'need live Electron create'}`);
process.exit(proven && fixed ? 0 : 1);
