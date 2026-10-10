/**
 * Thin create path — Temp Nova shape inside Nova (approach only).
 *   npm run smoke:thin-create-path
 */
import assert from 'node:assert/strict';

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
  isThinCreatePath,
  formatThinCreateCraftRules,
  thinCraftMayContinue,
  thinNeedsDepthPass,
  thinBlocksLivePreview,
  thinMeetsLiveVisualFloor,
  seedCompositionalBrandVisuals,
  thinLiveVisualDeficits,
  thinDepthReplyGrew,
  thinDepthDeficits,
  thinDepthSameRejectStalled,
  thinDepthLedgerGain,
  compositionalDepthDropsDeliveredMarkers,
  readThinDepthLedger,
  formatThinDepthLedger,
  thinAppLooksTruncated,
  formatDepthContinuePrompt,
  formatDepthSectionSlots,
  thinWantsCompositionalShell,
  formatCompositionalSectionSpecs,
  spliceCompositionalAppShell,
  applyCompositionalDepthMerge,
  assembleCompositionalAppShell,
  nextCompositionalDepthTarget,
  compositionalSectionFileSubstantial,
  thinCreateLocksAppJsx,
  thinBriefIsGameFamily,
  THIN_CREATE,
  THIN_DEPTH_MIN_APP_CHARS,
  THIN_DEPTH_ABS_STEP_CHARS,
  THIN_DEPTH_CONTINUE_MAX,
  THIN_DEPTH_SAME_REJECT_BAIL,
  THIN_DEPTH_ZERO_GAIN_BAIL,
  THIN_COMPOSITIONAL_SECTION_MIN_CHARS,
  THIN_COMPOSITIONAL_SECTION_MAX,
  THIN_COMPOSITIONAL_SECTION_TARGET_CHARS,
  depthPersistKeys,
} = await import('../src/lib/createThinPath.ts');
const { runCreateSyntaxGate } = await import('../src/lib/createSyntaxGate.ts');
const { formatOriginalCraftRules, ensureThinDeterministicTokensCss } = await import('../src/lib/createDesignSystem.ts');
const { scoreCreateQuality, CREATE_QUALITY_RUBRIC_PREFIX } = await import('../src/lib/createQualityRubric.ts');
const { canUnlockCreateLive, askSectionHardMisses } = await import('../src/lib/createReady.ts');
const { judgeCreateVerified } = await import('../src/lib/createPassSpine.ts');
const { emptyCreateEvidence, finalizeCreateEvidence } = await import('../src/lib/createEvidence.ts');
const { previewReadyForBrief } = await import('../src/lib/createBuildQuality.ts');

assert.equal(THIN_CREATE, true);
assert.equal(isThinCreatePath(), true);

const rules = formatThinCreateCraftRules({
  brief: 'Build a tip calculator called TipWise',
  productName: 'TipWise',
}).join('\n');
assert.match(rules, /THIN CREATE/i);
assert.match(rules, /@@@FILE/);
assert.match(rules, /TipWise|tip calculator/i);
assert.doesNotMatch(rules, /TIP CONTRACT|TODO CONTRACT|genre recipe/i);
assert.match(rules, /Thin product plan|Family:/i, 'thin craft must include ProductPlan family');
assert.match(rules, /Required regions:/i, 'thin craft must include required regions');

const brandRules = formatThinCreateCraftRules({
  brief: 'Build a matcha brand website with origin story, tin hero, tasting notes, Shop + Steep CTAs',
  productName: 'Verdigris Matcha Co.',
}).join('\n');
assert.match(brandRules, /Family:\s*\*\*[^*]+\*\*/i, 'brand thin craft includes family');
assert.match(brandRules, /Required regions:/i, 'brand thin craft includes regions');
// P0: plan mustHave must agree with thin App.jsx lock — never require App.tsx.
assert.doesNotMatch(brandRules, /@@@FILE\s+src\/App\.tsx|REQUIRED @@@FILE:[^\n]*App\.tsx/i, 'thin brand plan must not require App.tsx');
assert.match(brandRules, /REQUIRED @@@FILE:[^\n]*src\/App\.jsx/i, 'thin brand plan requires App.jsx');
assert.match(brandRules, /\/logo\.svg|wordmark/i, 'thin brand craft requires nav brand mark law');
assert.match(brandRules, /COMPOSITIONAL SHELL/i, 'brand thin craft uses compositional shell');
assert.match(brandRules, /src\/sections\//i, 'brand thin craft lists section files');
assert.equal(thinWantsCompositionalShell('Build a tip calculator'), false);
assert.equal(thinWantsCompositionalShell('Build a matcha brand website'), true);
assert.doesNotMatch(rules, /REQUIRED @@@FILE:[^\n]*App\.tsx/i, 'thin tip plan must not require App.tsx');
assert.match(rules, /REQUIRED @@@FILE:[^\n]*src\/App\.jsx/i, 'thin tip plan requires App.jsx');

const gameRules = formatThinCreateCraftRules({
  brief: 'Build a playable pong arcade game with canvas loop',
  productName: 'PongLab',
}).join('\n');
assert.equal(thinBriefIsGameFamily('Build a pong game', 'PongLab'), true);
assert.equal(thinCreateLocksAppJsx('Build a pong game', 'PongLab'), false);
assert.doesNotMatch(gameRules, /Never emit src\/App\.tsx/i, 'game thin craft must not forbid App.tsx');
assert.match(gameRules, /App\.tsx or src\/App\.jsx/i, 'game thin craft allows tsx');

{
  const seeded = ensureThinDeterministicTokensCss(
    { 'src/App.css': '.app{}' },
    'Build a matcha brand website with tasting notes',
    'Verdigris',
  );
  assert.ok(seeded['src/styles/tokens.css']?.includes('--bg'), 'tokens.css seeded from brief palette');
  assert.match(seeded['src/App.css'], /tokens\.css/i, 'App.css imports tokens');
}

{
  const rubric = scoreCreateQuality({
    'src/App.jsx': `export default function App(){return (
      <main><h1>Hi</h1><img src="/logo.svg" alt="logo" /><button type="button" onClick={()=>{}}>Go</button></main>
    );}`,
    'src/App.css': ':root{--bg:#111;--accent:#0f0}.app{min-height:100dvh}',
  });
  assert.equal(rubric.ok, true, 'complete rubric fixture passes');
  assert.equal(rubric.score, 5);
  const weak = scoreCreateQuality({
    'src/App.jsx': 'export default function App(){return <div><h2>Sub</h2><img src="/x.png" /><button>Go</button></div>}',
    'src/App.css': '.x{color:red}',
  });
  assert.equal(weak.ok, false);
  assert.ok(weak.reasons.length >= 2);
  assert.ok(CREATE_QUALITY_RUBRIC_PREFIX.startsWith('quality rubric'));
}

// Depth growth = ledger gain (not prior+1125). Compact/line/landmark/CSS/logo all count.
{
  const thin = 'x'.repeat(3400);
  const step = thin + 'y'.repeat(Math.max(120, THIN_DEPTH_ABS_STEP_CHARS));
  assert.equal(thinDepthReplyGrew(thin, thin), false, 'identical App is not growth');
  assert.equal(thinDepthReplyGrew(thin, step), true, 'compact ledger gain accepts without landmarks');
  assert.equal(thinDepthReplyGrew(thin, thin.slice(0, 2000)), false, 'shrink is not growth');
  const landmarked = `${thin}\n${Array.from({ length: 6 }, (_, i) => `<section className="section">Block ${i}</section>`).join('\n')}\n${'y'.repeat(Math.max(200, THIN_DEPTH_ABS_STEP_CHARS))}`;
  assert.equal(thinDepthReplyGrew(thin, landmarked), true, 'landmark climb accepts');
  const floor = 'z'.repeat(THIN_DEPTH_MIN_APP_CHARS) + '\n'.repeat(280);
  assert.equal(thinDepthReplyGrew(thin, floor), true, 'clearing exit floor accepts');
  // CSS-only gain with App unchanged still counts when priorCss/nextCss provided.
  assert.equal(
    thinDepthReplyGrew(thin, thin, { priorCss: '.a{}', nextCss: `.a{}${'.b{}'.repeat(40)}` }),
    true,
    'CSS compact ledger gain accepts',
  );
  assert.equal(THIN_DEPTH_ZERO_GAIN_BAIL, 5, 'zero-gain bail gives 7B invent room');
  const led = readThinDepthLedger({ 'src/App.jsx': thin, 'src/App.css': '.x{}' });
  assert.ok(formatThinDepthLedger(led).includes('chars'), 'ledger format includes chars');
  assert.equal(thinDepthLedgerGain(led, led), false, 'identical ledger is not gain');
  assert.equal(thinAppLooksTruncated('export default function App(){return <div'), true, 'open tag truncated');
  assert.equal(
    thinAppLooksTruncated('export default function App(){return <div/>}'),
    false,
    'complete tiny App not truncated',
  );
}
// Consecutive same-reason thin rejects bail after THIN_DEPTH_SAME_REJECT_BAIL.
{
  const state = { key: '', bytes: -1, count: 0 };
  assert.equal(thinDepthSameRejectStalled({ reason: 'rewrite too thin (80 lines)', appBytes: 2000, state }), false);
  assert.equal(thinDepthSameRejectStalled({ reason: 'rewrite too thin (91 lines)', appBytes: 2010, state }), false);
  assert.equal(
    thinDepthSameRejectStalled({ reason: 'rewrite too thin (77 lines)', appBytes: 1995, state }),
    true,
    `bail after ${THIN_DEPTH_SAME_REJECT_BAIL} same-reason rejects`,
  );
  assert.equal(state.count, THIN_DEPTH_SAME_REJECT_BAIL);
}
{
  const tipSlots = formatDepthSectionSlots('Build a tip calculator called TipWise', 'TipWise').join(' ');
  assert.doesNotMatch(tipSlots, /steep|harvest|tasting notes|how to steep/i, 'tip slots must not be tea-branded');
  assert.match(tipSlots, /input|tool|result|chrome/i, 'tip slots derive from tool-panel family');
  const depthPrompt = formatDepthContinuePrompt({
    brief: 'Build a tip calculator called TipWise',
    productName: 'TipWise',
    priorApp: 'export default function App(){return <div/>}',
    priorCss: '.app{}',
    pass: 2,
    rejectReason: 'App.jsx unchanged after apply',
    deficits: ['App compact chars 100 < 9000'],
  });
  assert.match(depthPrompt, /REQUIRED:.*src\/App\.jsx/i, 'depth prompt requires App.jsx when App metrics open');
  assert.match(depthPrompt, /Previous attempt rejected/i, 'depth prompt feeds reject reason');
  assert.match(depthPrompt, /Still missing/i, 'depth prompt lists deficits');
  assert.match(depthPrompt, /LEDGER NOW:/i, 'depth prompt shows ledger');
  assert.match(depthPrompt, /Compose these sections/i, 'depth prompt lists section slots');
  assert.doesNotMatch(depthPrompt, /steep|harvest|how to steep/i, 'depth prompt must not use tea default slots for tip');
  assert.doesNotMatch(depthPrompt, /y{200,}/i, 'depth prompt must not re-feed huge prior exemplar');
}
{
  const brandBrief = 'Build a matcha brand website with tasting notes and Shop CTAs';
  const specs = formatCompositionalSectionSpecs(brandBrief, 'Verdigris');
  assert.ok(specs.length >= 4, 'compositional specs from depth slots');
  const monolith = {
    'src/App.jsx': `import './App.css';
export default function App(){return <div className="app"><h1>Hi</h1></div>;}`,
    'src/App.css': '.app{}',
  };
  const spliced = spliceCompositionalAppShell(monolith, specs);
  assert.match(spliced['src/App.jsx'], /import \w+Section from '\.\/sections\/\w+Section\.jsx'/);
  assert.match(spliced['src/App.jsx'], /<\w+Section\s*\/>/);
  const merged = applyCompositionalDepthMerge(monolith, brandBrief, 'Verdigris');
  // Empty App → shell only (no fat carve); may be empty of section imports until files land.
  assert.match(merged['src/App.jsx'] || '', /export default function App/);
  const compDepth = formatDepthContinuePrompt({
    brief: brandBrief,
    productName: 'Verdigris',
    priorApp: spliced['src/App.jsx'],
    priorCss: '.app{}',
    pass: 1,
    files: spliced,
  });
  assert.match(compDepth, /COMPOSITIONAL DEPTH/i, 'brand depth asks for one section file');
  assert.match(compDepth, /@@@FILE src\/sections\//i, 'brand depth names next section path');
  assert.doesNotMatch(compDepth, /Prior App outline/i, 'section pass blanks prior App outline');
  assert.doesNotMatch(compDepth, /Rewrite App\.jsx \+ App\.css — invent from the brief/i, 'compositional depth avoids whole-App rewrite ask');
  // Floor math must stay reachable: TARGET × MAX >= floor (self-consistent constants).
  assert.ok(
    THIN_COMPOSITIONAL_SECTION_TARGET_CHARS * THIN_COMPOSITIONAL_SECTION_MAX
      >= THIN_DEPTH_MIN_APP_CHARS,
    `floor math: TARGET(${THIN_COMPOSITIONAL_SECTION_TARGET_CHARS}) × MAX(${THIN_COMPOSITIONAL_SECTION_MAX}) must cover floor ${THIN_DEPTH_MIN_APP_CHARS}`,
  );
  assert.equal(
    THIN_COMPOSITIONAL_SECTION_TARGET_CHARS,
    Math.ceil(THIN_DEPTH_MIN_APP_CHARS / THIN_COMPOSITIONAL_SECTION_MAX),
    'TARGET must be derived from floor/MAX',
  );
  assert.ok(specs.length <= THIN_COMPOSITIONAL_SECTION_MAX, 'spec list capped at MAX');
  const names = specs.map((s) => s.componentName);
  assert.equal(new Set(names).size, names.length, 'no *2 twin component names');
  // 325-compact nav lands (≥ MIN=300) so targeting advances.
  const navBody = `export default function NavHeaderSection(){\n  return (\n    <header className="nav-header">${'x'.repeat(280)}</header>\n  );\n}\n`;
  assert.ok(navBody.replace(/\s+/g, '').length >= THIN_COMPOSITIONAL_SECTION_MIN_CHARS);
  assert.equal(compositionalSectionFileSubstantial(navBody), true, '325-compact nav counts as landed');
  const withNav = {
    ...spliced,
    'src/sections/NavHeaderSection.jsx': navBody,
  };
  const nextAfterNav = nextCompositionalDepthTarget(withNav, brandBrief, 'Verdigris');
  assert.ok(nextAfterNav, 'still has other thin targets');
  assert.notEqual(nextAfterNav.filePath, 'src/sections/NavHeaderSection.jsx', 'targeting advances past landed nav');
  const avoidNext = nextCompositionalDepthTarget(
    withNav,
    brandBrief,
    'Verdigris',
    nextAfterNav.filePath,
  );
  assert.ok(avoidNext);
  assert.notEqual(avoidNext.filePath, nextAfterNav.filePath, 'avoidPath skips the just-asked section');
  // Freebuff C2 — retired SET skips every rejected path (not only the last one).
  const retiredTwo = nextCompositionalDepthTarget(
    withNav,
    brandBrief,
    'Verdigris',
    [nextAfterNav.filePath, avoidNext.filePath],
  );
  assert.ok(retiredTwo);
  assert.notEqual(retiredTwo.filePath, nextAfterNav.filePath, 'retired set skips first reject');
  assert.notEqual(retiredTwo.filePath, avoidNext.filePath, 'retired set skips second reject');
  // Freebuff F — compositional depth never feeds Prior App outline (even with fat prior).
  const fatPriorPrompt = formatDepthContinuePrompt({
    brief: brandBrief,
    productName: 'Verdigris',
    priorApp: `${'x'.repeat(950)}export default function App(){return <div/>}`,
    priorCss: '.app{padding:1rem}',
    pass: 2,
    files: withNav,
    avoidSectionPath: [nextAfterNav.filePath],
  });
  assert.doesNotMatch(fatPriorPrompt, /Prior App outline/i, 'compositional never seeds Prior App outline');
  assert.doesNotMatch(fatPriorPrompt, /Prior CSS outline/i, 'compositional never seeds Prior CSS outline');
  // Assemble carves fat App — no inject-into-return / inline header in shell.
  const fatApp = {
    'src/App.jsx': `import './App.css';
export default function App() {
  return (
    <div className="app">
      <header className="nav-header"><img src="/logo.svg" alt="V" /><nav>Shop</nav></header>
      <main><h1>Hero</h1><button type="button" onClick={() => alert('Learn More CTA clicked')}>Learn More</button>
      <section>Story</section></main>
    </div>
  );
}`,
    'src/App.css': '.app{}',
    'src/sections/NavHeaderSection.jsx': navBody,
  };
  const assembled = assembleCompositionalAppShell(fatApp, brandBrief, 'Verdigris');
  assert.doesNotMatch(assembled['src/App.jsx'], /<header className="nav-header">/, 'shell has no inline nav-header');
  assert.match(assembled['src/App.jsx'], /import NavHeaderSection/);
  assert.match(assembled['src/App.jsx'], /PageBodySection|NavHeaderSection/);
  assert.ok(
    depthPersistKeys(assembled).some((k) => /src\/sections\//i.test(k)),
    'depthPersistKeys includes sections',
  );
  // Freebuff A — drop PageBody once ≥3 rich sections stand (2× stub bar; never three thin wrappers).
  const richPad = (ch) => String(ch).repeat(620);
  const fatWithThree = {
    ...fatApp,
    'src/sections/NavHeaderSection.jsx': `${navBody}\n/* ${richPad('n')} */`,
    'src/sections/HeroSection.jsx': `export default function HeroSection(){return(<section className="hero">${richPad('h')}</section>);}`,
    'src/sections/StorySection.jsx': `export default function StorySection(){return(<section className="story">${richPad('s')}</section>);}`,
    'src/sections/PageBodySection.jsx': `export default function PageBodySection(){return(<main>${'body '.repeat(80)}</main>);}`,
  };
  const dropped = assembleCompositionalAppShell(fatWithThree, brandBrief, 'Verdigris');
  assert.equal(Boolean(dropped['src/sections/PageBodySection.jsx']), false, 'PageBody dropped when ≥3 rich sections landed');
  assert.doesNotMatch(dropped['src/App.jsx'] || '', /PageBodySection/, 'shell no longer renders PageBody');
  // Thin wrappers alone must NOT drop PageBody (Lumenjar defect A inverse).
  const thinWrappers = {
    ...fatApp,
    'src/sections/NavHeaderSection.jsx': navBody,
    'src/sections/HeroSection.jsx': `export default function HeroSection(){return(<section className="hero">${'h'.repeat(320)}</section>);}`,
    'src/sections/StorySection.jsx': `export default function StorySection(){return(<section className="story">${'s'.repeat(320)}</section>);}`,
    'src/sections/PageBodySection.jsx': `export default function PageBodySection(){return(<main>${'body '.repeat(80)}</main>);}`,
  };
  const kept = assembleCompositionalAppShell(thinWrappers, brandBrief, 'Verdigris');
  assert.equal(
    Boolean(kept['src/sections/PageBodySection.jsx']),
    true,
    'PageBody kept when sections are only stub-length',
  );
  // §1 / §5 — depth must never trade away delivered interactivity or hero product art.
  const interactiveNotes = {
    'src/App.jsx': 'export default function App(){return <div className="app"/>}',
    'src/App.css': '.app{padding:1rem}',
    'src/sections/NotesSection.jsx': `import { useState } from 'react';
const NOTES = [{ title: 'Nose', body: 'Citrus peel' }];
export default function NotesSection(){
  const [open, setOpen] = useState(0);
  return (
    <section className="notes-band" id="notes">
      {NOTES.map((n, i) => (
        <button key={n.title} type="button" className={open === i ? 'note-card is-open' : 'note-card'} onClick={() => setOpen(i)}>
          <strong>{n.title}</strong>
        </button>
      ))}
    </section>
  );
}
`,
  };
  const staticClone = {
    ...interactiveNotes,
    'src/sections/NotesSection.jsx': `export default function NotesSection(){
  return (<section className="notes-band" id="notes"><h2>Tasting notes</h2><p>${'static copy '.repeat(60)}</p></section>);
}
`,
  };
  const cloneCompact = staticClone['src/sections/NotesSection.jsx'].replace(/\s+/g, '').length;
  const interactiveCompact = interactiveNotes['src/sections/NotesSection.jsx'].replace(/\s+/g, '').length;
  assert.ok(cloneCompact > interactiveCompact, 'fixture: static clone is the fatter file (old ledger compare would accept it)');
  assert.deepEqual(
    compositionalDepthDropsDeliveredMarkers(interactiveNotes, staticClone),
    ['src/sections/NotesSection.jsx:interactive'],
    'static clone drops the delivered interactive capability',
  );
  assert.equal(
    thinDepthReplyGrew('', '', { priorFiles: interactiveNotes, nextFiles: staticClone }),
    false,
    'fatter static clone of an interactive section is not depth growth',
  );
  const grownInteractive = {
    ...interactiveNotes,
    'src/sections/NotesSection.jsx': interactiveNotes['src/sections/NotesSection.jsx'].replace(
      '</section>',
      `${'<p>More tasting copy for this brief.</p>'.repeat(20)}</section>`,
    ),
  };
  assert.equal(
    thinDepthReplyGrew('', '', { priorFiles: interactiveNotes, nextFiles: grownInteractive }),
    true,
    'interactive growth toward TARGET is still accepted',
  );
  // Hero product art is covered by the same guard.
  const heroWithArt = {
    ...interactiveNotes,
    'src/sections/HeroSection.jsx': `const HERO_VISUAL = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
export default function HeroSection(){
  return (<section className="hero"><div className="hero-stage" aria-hidden="true"><img className="hero-art" src={HERO_VISUAL} alt="" /></div></section>);
}
`,
  };
  const heroStripped = {
    ...heroWithArt,
    'src/sections/HeroSection.jsx': `export default function HeroSection(){
  return (<section className="hero"><h1>Headline</h1><p>${'words '.repeat(80)}</p></section>);
}
`,
  };
  assert.deepEqual(
    compositionalDepthDropsDeliveredMarkers(heroWithArt, heroStripped),
    ['src/sections/HeroSection.jsx:hero-art'],
    'hero rewrite without product art is a dropped capability',
  );
  assert.equal(
    thinDepthReplyGrew('', '', { priorFiles: heroWithArt, nextFiles: heroStripped }),
    false,
    'stripping hero product art is not depth growth',
  );
  // UI-ready §F — Motion v1 survives an invented App.css that has no animation at all.
  const motionBrief = 'Build a coastal gin brand website with tasting notes and shop — not coffee';
  const motionlessFatCss = [
    '.app{padding:2rem}',
    '.hero-stage{min-height:40vh;position:relative}',
    '.hero-art{width:100%;height:100%}',
    `/* ${'pad '.repeat(500)}*/`,
  ].join('\n');
  assert.ok(motionlessFatCss.replace(/\s+/g, '').length >= 1600, 'fixture CSS clears the visual CSS floor');
  assert.doesNotMatch(motionlessFatCss, /@keyframes|prefers-reduced-motion/i, 'fixture has no motion');
  const motionSeeded = seedCompositionalBrandVisuals(
    { 'src/App.jsx': 'export default function App(){return <div className="app"/>}', 'src/App.css': motionlessFatCss },
    motionBrief,
    'Brinecove',
  );
  assert.match(String(motionSeeded['src/App.css']), /@keyframes ember-rise/, 'motion keyframes restored on invented CSS');
  assert.match(String(motionSeeded['src/App.css']), /prefers-reduced-motion/, 'reduced-motion guard restored');
  const alreadyMoving = [
    '.app{padding:1rem}',
    '.hero-stage{min-height:40vh}',
    '.hero-art{width:100%}',
    '@keyframes custom { from{opacity:0} to{opacity:1} }',
    '@media (prefers-reduced-motion: reduce){.app{animation:none}}',
    `/* ${'pad '.repeat(500)}*/`,
  ].join('\n');
  assert.ok(alreadyMoving.replace(/\s+/g, '').length >= 1600, 'fixture CSS clears the visual CSS floor');
  const motionKept = seedCompositionalBrandVisuals(
    { 'src/App.jsx': 'export default function App(){return <div className="app"/>}', 'src/App.css': alreadyMoving },
    motionBrief,
    'Brinecove',
  );
  assert.doesNotMatch(String(motionKept['src/App.css']), /@keyframes ember-rise/, 'existing model motion is left alone');
  // UI-ready §D — brief-required bands are hard Live misses for compositional asks only.
  const ginSeeded = seedCompositionalBrandVisuals(
    { 'src/App.jsx': 'export default function App(){return <div className="app"/>}', 'src/App.css': '.app{padding:1rem}' },
    motionBrief,
    'Brinecove',
  );
  assert.ok(
    !askSectionHardMisses(ginSeeded, motionBrief, 'Brinecove')
      .some((m) => /#notes|#shop|#subscribe|tasting notes|shop path|subscribe path|band purpose/i.test(m)),
    'seeded gin tree clears the brief-required bands',
  );
  const staticOnly = {
    'src/App.jsx': 'import "./App.css";\nexport default function App(){return (<div className="app"><header className="nav"><h1>Brinecove</h1></header><section className="hero"><h1>Brinecove</h1></section><footer>© Brinecove</footer></div>);}',
    'src/App.css': '.app{padding:2rem}',
  };
  const staticMisses = askSectionHardMisses(staticOnly, motionBrief, 'Brinecove');
  assert.ok(staticMisses.some((m) => /#notes|tasting notes/i.test(m)), 'static rewrite without notes blocks Live');
  assert.ok(staticMisses.some((m) => /#shop|shop path/i.test(m)), 'static rewrite without shop blocks Live');
  assert.deepEqual(
    askSectionHardMisses(staticOnly, 'Build a tip calculator called TipWise', 'TipWise'),
    [],
    'tip/tool creates are never blocked by the section gate',
  );
  // Syntax gate rejects mangled attribute + orphan-after-close (Patch 7).
  const mangled = `export default function App() {
  return (
    <div>
      <button type="button" onClick={() => alert('x') <NavHeaderSection />}>Learn More</button>
    </div>
  );
}
`;
  const orphan = `export default function App() {
  return (<div className="app"><h1>Hi</h1></div>);
}
</main></div>
`;
  const gateMangled = runCreateSyntaxGate({ 'src/App.jsx': mangled, 'src/App.css': '' });
  assert.equal(gateMangled.ok, false, 'gate rejects tag inside attribute expression');
  assert.ok(gateMangled.reasons.some((r) => /attribute expression|mangled splice/i.test(r)));
  const gateOrphan = runCreateSyntaxGate({ 'src/App.jsx': orphan, 'src/App.css': '' });
  assert.equal(gateOrphan.ok, false, 'gate rejects orphan JSX after component close');
  void THIN_DEPTH_CONTINUE_MAX;
  void THIN_DEPTH_ABS_STEP_CHARS;
  // Combglow class: gain clears on applied tree BEFORE assemble.
  {
    const { thinDepthFilesLedgerGain } = await import('../src/lib/createThinPath.ts');
    const prior = {
      'src/App.jsx': `import './App.css';
export default function App(){return(<div className="app"><header className="sticky-nav"><img src="/logo.svg" alt="B"/></header><main><h1>Hi</h1></main></div>);}`,
      'src/App.css': '.app{padding:1rem}',
      'src/sections/StorySection.jsx': `export default function StorySection(){return(<section>${'copy '.repeat(80)}</section>);}`,
    };
    const grown = {
      ...prior,
      'src/sections/NavHeaderSection.jsx': `export default function NavHeaderSection(){return(<nav><img src="/logo.svg" alt="B"/>${'link '.repeat(100)}</nav>);}`,
    };
    assert.equal(thinDepthFilesLedgerGain(prior, grown), true, 'section grow gains before assemble');
    const asm = assembleCompositionalAppShell(grown, brandBrief, 'Verdigris');
    assert.doesNotMatch(asm['src/App.jsx'], /sticky-nav/, 'assemble drops inline sticky-nav');
    assert.equal(
      thinDepthFilesLedgerGain(prior, asm, { allowLandmarkShellDrop: true }),
      true,
      'post-assemble with allowLandmarkShellDrop accepts real section growth',
    );
  }
}
// Ready / Live use visual floor — invent 9k may stay open after seed.
{
  const thinBrand = {
    'src/App.jsx': `export default function App() {
  return (
    <div className="app">
      <header><h1>Verdigris</h1></header>
      <section><p>Story</p></section>
      <section><p>Tin</p></section>
      <section><p>Notes</p></section>
      <section><p>Shop</p></section>
      <footer>©</footer>
    </div>
  );
}`,
    'src/App.css': '.app{padding:1rem;font-family:sans-serif;background:linear-gradient(#111,#222)}',
  };
  const brief = 'Build a matcha brand website with tasting notes and Shop CTAs';
  assert.equal(thinNeedsDepthPass(thinBrand, brief), true, 'thin brand still needs invent depth');
  assert.ok(thinDepthDeficits(thinBrand, brief).length > 0, 'invent deficits reported');
  assert.equal(thinBlocksLivePreview(thinBrand, brief), true, 'unsseeded thin brand blocks Live');
  const ready = previewReadyForBrief(thinBrand, { brief, productName: 'Verdigris' });
  assert.equal(ready.ok, false, 'Ready cannot be true while visual floor is open');
  assert.ok(ready.reasons.some((r) => /thin visual floor open/i.test(r)), 'Ready cites visual floor');
  const seeded = seedCompositionalBrandVisuals(thinBrand, brief, 'Verdigris');
  assert.equal(thinMeetsLiveVisualFloor(seeded, brief), true, 'seed clears visual Live floor');
  assert.equal(thinBlocksLivePreview(seeded, brief), false, 'seeded brand does not block Live');
  // Wave B — stop invent thrash once Live visual + genre honesty clear (9k soft only).
  assert.equal(
    thinNeedsDepthPass(seeded, brief),
    false,
    'seed that clears Live+genre must stop invent depth thrash',
  );
  // Graphics v1 — seeded hero must paint product SVG art (model-agnostic).
  const heroBody = Object.entries(seeded)
    .filter(([k]) => /Hero/i.test(k))
    .map(([, v]) => String(v || ''))
    .join('\n');
  assert.ok(/\bHERO_VISUAL\b/.test(heroBody), 'seed hero declares HERO_VISUAL');
  assert.ok(/data:image\/svg\+xml/i.test(heroBody), 'seed hero embeds SVG data URL');
  assert.ok(/className=["']hero-art["']/.test(heroBody), 'seed hero renders hero-art img');
  assert.ok(/\.hero-art\b/.test(String(seeded['src/App.css'] || '')), 'seed CSS styles hero-art');
  // previewReadyForBrief still scores App-only landmarks; Live unlock uses visual floor.
  const readySeeded = previewReadyForBrief(seeded, { brief, productName: 'Verdigris' });
  assert.equal(
    readySeeded.reasons.some((r) => /thin visual floor open/i.test(r)),
    false,
    'Ready must not cite visual floor after seed',
  );
  const unlock = canUnlockCreateLive(
    {
      id: 'j1',
      chatId: 'c1',
      path: '',
      projectId: 'p1',
      name: 'Verdigris',
      files: thinBrand,
      status: 'verifying',
      previewUrl: 'http://127.0.0.1:5173/',
      craftBlocked: true,
      blockedReasons: ['depth open'],
      updatedAt: Date.now(),
    },
    thinBrand,
    brief,
  );
  assert.equal(unlock.ok, false, 'canUnlockCreateLive refuses craft blocked + visual floor');
  const unlockSeeded = canUnlockCreateLive(
    {
      id: 'j2',
      chatId: 'c1',
      path: '',
      projectId: 'p1',
      name: 'Verdigris',
      files: seeded,
      status: 'verifying',
      previewUrl: 'http://127.0.0.1:5173/',
      craftBlocked: false,
      blockedReasons: [],
      updatedAt: Date.now(),
    },
    seeded,
    brief,
  );
  assert.equal(unlockSeeded.ok, true, 'canUnlockCreateLive ok after visual seed');
  assert.ok(thinLiveVisualDeficits(thinBrand, brief).length > 0, 'visual deficits before seed');
}

const viaOriginal = formatOriginalCraftRules({
  brief: 'Build a tip calculator called TipWise',
  productName: 'TipWise',
}).join('\n');
assert.match(viaOriginal, /THIN CREATE|@@@FILE/i, 'formatOriginalCraftRules must use thin prompt when thin is on');
assert.match(viaOriginal, /Family:|Required regions:/i, 'thin via formatOriginalCraftRules still carries plan');

const goodApp = {
  'src/App.tsx': `export default function App() {
  return <div className="app"><h1>TipWise</h1><input aria-label="bill" /><button type="button">Calc</button></div>;
}`,
  'src/App.css': '.app{padding:2rem}',
};
assert.equal(thinCraftMayContinue(goodApp, true), true);
assert.equal(thinCraftMayContinue(goodApp, false), false);
assert.equal(thinCraftMayContinue({ 'src/App.tsx': 'export default function App(){return null}' }, true), false);

const shell = {
  'src/App.tsx': `import { useState } from 'react';
import './App.css';
export default function App() {
  const [items, setItems] = useState([{ id: '1', title: 'Welcome', body: 'Ready' }]);
  const [draft, setDraft] = useState('');
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Sidebar"><strong>LeafNote</strong>
        <button type="button" onClick={() => setDraft('New note')}>New</button>
      </aside>
      <main className="workspace" id="main">
        <header className="workspace-head"><h1>LeafNote</h1>
          <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { setItems((p) => [...p, { id: String(Date.now()), title: draft, body: 'New item' }]); setDraft(''); } }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Add item" />
            <button type="submit">Add</button>
          </form>
        </header>
        <ul className="item-list">{items.map((it) => <li key={it.id}><strong>{it.title}</strong><span>{it.body}</span></li>)}</ul>
      </main>
    </div>
  );
}`,
  'src/App.css': `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Source+Sans+3:wght@400;600&display=swap');
.app-shell{display:grid;grid-template-columns:240px 1fr;min-height:100vh;font-family:'Source Sans 3',sans-serif;background:radial-gradient(circle at 20% 20%,#1a2332,#0b1020)}
.sidebar{padding:1.25rem;border-right:1px solid rgba(255,255,255,.14);display:flex;flex-direction:column;gap:.75rem;color:#e8eef8}
.workspace{padding:1.5rem}
.workspace-head{display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;justify-content:space-between}
.workspace-head h1{font-family:Fraunces,serif;font-size:clamp(2rem,4vw,3.2rem);margin:0;background:linear-gradient(120deg,#f8fafc,#93c5fd);-webkit-background-clip:text;color:transparent}
.item-list{list-style:none;padding:0;margin:1rem 0 0;display:grid;gap:.75rem}
.item-list li{padding:1rem;border:1px solid rgba(255,255,255,.12);border-radius:14px;display:flex;flex-direction:column;gap:.25rem}
`,
};

const ev = finalizeCreateEvidence(emptyCreateEvidence({
  staticReady: true,
  npmInstalled: true,
  httpOk: true,
  mounted: true,
  consoleClean: true,
  smokeOk: true,
}));

const floored = judgeCreateVerified({
  evidence: ev,
  files: shell,
  brief: 'Build a notes app with folders and empty state',
  productName: 'LeafNote',
  floorFallback: true,
});
assert.equal(floored.qualityReady, false, 'floorFallback must never quality-Ready under thin');

const repairOwned = judgeCreateVerified({
  evidence: ev,
  files: shell,
  brief: 'Build a notes app with folders and empty state',
  productName: 'LeafNote',
  floorFallback: false,
  repairOwnedProduct: true,
});
assert.equal(repairOwned.qualityReady, false, 'repairOwnedProduct must never quality-Ready');

// Graphics v1 + ask contract → Live judge (model-agnostic).
{
  const { detectHeroProductKind, svgHeroDataUrl, createIdentityFromBrief } = await import('../src/lib/createIdentity.ts');
  const { buildAskContract, scoreAskMatch } = await import('../src/lib/createAskContract.ts');
  assert.equal(
    detectHeroProductKind('Brinecove', 'coastal gin brand · not coffee'),
    'bottle',
    'gin brief → bottle silhouette',
  );
  assert.equal(
    detectHeroProductKind('Ashgrove Roasters', 'specialty coffee farm origin'),
    'coffee',
    'coffee brief → coffee bag silhouette',
  );
  assert.equal(
    detectHeroProductKind('Verdigris', 'ceremonial matcha tin brand'),
    'tea',
    'matcha brief → tea tin silhouette',
  );
  const gin = svgHeroDataUrl(createIdentityFromBrief('Brinecove', 'coastal gin · not coffee'), 'Brinecove');
  const coffee = svgHeroDataUrl(createIdentityFromBrief('Ashgrove', 'coffee roasters'), 'Ashgrove');
  assert.notEqual(gin, coffee, 'gin and coffee hero SVGs must differ');
  const ginSvg = decodeURIComponent(gin.replace(/^data:image\/svg\+xml[^,]*,/, ''));
  const coffeeSvg = decodeURIComponent(coffee.replace(/^data:image\/svg\+xml[^,]*,/, ''));
  assert.ok(/small batch/i.test(ginSvg), 'gin SVG labels spirits bottle');
  assert.ok(/whole bean/i.test(coffeeSvg), 'coffee SVG labels roast bag');
  // "hero with product visual" must NEVER draw the Apple phone stage on gin/coffee.
  const productVisualBrief = 'Build Saltmere. Coastal gin. Hero with product visual. Not coffee. Skip Plan.';
  const productVisualSvg = decodeURIComponent(
    svgHeroDataUrl(createIdentityFromBrief('Saltmere', productVisualBrief), 'Saltmere')
      .replace(/^data:image\/svg\+xml[^,]*,/, ''),
  );
  assert.ok(/small batch/i.test(productVisualSvg), 'product-visual gin brief still draws a bottle');
  assert.ok(!/#2997ff/i.test(productVisualSvg), 'product-visual gin brief never draws Apple phone glow');
  const { logoIconifyFor } = await import('../src/lib/brandAssets.ts');
  assert.equal(
    logoIconifyFor('Saltmere Gin', 'Coastal gin brand · not coffee'),
    'lucide:wine',
    'gin brief → wine mark (not sparkles/coffee)',
  );
  assert.equal(
    logoIconifyFor('Emberlot Roasters', 'Specialty coffee farm origin'),
    'lucide:coffee',
    'coffee brief → coffee mark',
  );
  const { briefPhrases, isCraftLeakCue } = await import('../src/lib/createAskContract.ts');
  const leakAsk = buildAskContract(
    'Build a brand-new marketing website for Saltmere Gin wj4v9. Coastal gin tasting notes. Skip Plan. Put it on disk.',
    'Saltmere Gin wj4v9',
  );
  assert.ok(!/-new marketing|wj4v9|Skip Plan/i.test(leakAsk.headline), `headline must not leak craft jargon: ${leakAsk.headline}`);
  assert.ok(!isCraftLeakCue('Coastal gin tasting notes'), 'real brand cue is kept');
  assert.ok(isCraftLeakCue('-new marketing Saltmere Gin wj4v9'), 'craft leak cue is rejected');
  assert.ok(
    !briefPhrases('Build a brand-new marketing website for Saltmere Gin wj4v9. Skip Plan.').some((p) => isCraftLeakCue(p)),
    'briefPhrases drops craft leak cues',
  );
  const { heroSectionWrongGenreArt } = await import('../src/lib/createThinPath.ts');
  const phoneHero = `const HERO_VISUAL = ${JSON.stringify(svgHeroDataUrl({ name: 'X', category: 'phone', brief: 'iphone' }, 'X'))};\nexport default function Hero(){return <section className="hero"><h1 className="hero-title">X — -new marketing X wj4v9</h1></section>}`;
  assert.equal(
    heroSectionWrongGenreArt(phoneHero, 'coastal gin · not coffee', 'Saltmere'),
    true,
    'phone + leak headline forces wrong-genre re-seed on gin',
  );
  const ginBrief = 'Build a coastal gin brand website with tasting notes and shop — not coffee';
  const ask = buildAskContract(ginBrief, 'Brinecove');
  assert.equal(ask.genre, 'spirits');
  assert.ok(ask.wantsNotes && ask.wantsShop && ask.forbidCoffeeCopy);
  const ginSeed = seedCompositionalBrandVisuals(
    {
      'src/App.jsx': 'export default function App(){return <div className="app"/>}',
      'src/App.css': '.app{padding:1rem}',
    },
    ginBrief,
    'Brinecove',
  );
  const ginHero = Object.entries(ginSeed).filter(([k]) => /Hero/i.test(k)).map(([, v]) => String(v)).join('\n');
  assert.ok(/data:image\/svg\+xml/i.test(ginHero), 'gin seed embeds hero SVG');
  assert.ok(
    /0a1628|12233a|6ec8b8/i.test(String(ginSeed['src/App.css'] || '')),
    'gin seed uses maritime palette (not olive coffee defaults)',
  );
  assert.ok(Object.keys(ginSeed).some((k) => /NotesSection/i.test(k)), 'ask contract seeds NotesSection');
  assert.ok(Object.keys(ginSeed).some((k) => /CatalogSection/i.test(k)), 'ask contract seeds CatalogSection');
  // Wave E — subscribe only when brief asks; gin+shop must not force newsletter band.
  assert.equal(ask.wantsSubscribe, false, 'gin shop brief does not wantSubscribe');
  assert.equal(
    Object.keys(ginSeed).some((k) => /SubscribeSection/i.test(k)),
    false,
    'no SubscribeSection without subscribe/newsletter cues',
  );
  const notes = String(ginSeed['src/sections/NotesSection.jsx'] || '');
  const shop = String(ginSeed['src/sections/CatalogSection.jsx'] || '');
  assert.ok(/useState/.test(notes) && /id=["']notes["']/.test(notes), 'notes interact stub');
  assert.ok(/useState/.test(shop) && /Add to bag/.test(shop), 'shop interact stub');
  const withSubBrief = `${ginBrief} and a newsletter subscribe club`;
  const subAsk = buildAskContract(withSubBrief, 'Brinecove');
  assert.equal(subAsk.wantsSubscribe, true);
  const subSeed = seedCompositionalBrandVisuals(
    { 'src/App.jsx': 'export default function App(){return <div className="app"/>}', 'src/App.css': '.app{}' },
    withSubBrief,
    'Brinecove',
  );
  assert.ok(Object.keys(subSeed).some((k) => /SubscribeSection/i.test(k)), 'subscribe cue seeds SubscribeSection');
  assert.ok(/type=["']email["']/.test(String(subSeed['src/sections/SubscribeSection.jsx'] || '')), 'subscribe interact stub');
  assert.ok(/ember-rise|stage-in/i.test(String(ginSeed['src/App.css'] || '')), 'motion v1 keyframes present');
  const match = scoreAskMatch(ginSeed, ginBrief, 'Brinecove');
  assert.equal(match.ok, true, `ask match should pass after seed: ${match.reasons.join('; ')}`);
  assert.ok(!/band purpose/i.test(match.reasons.join('; ')), 'seeded tree has no band-purpose deficits');
  assert.ok(!/coffee brand|careful roasting/i.test(Object.values(ginSeed).join('\n')), 'no coffee leak on gin seed');
  // UI-ready §G — band purpose: copy under the wrong anchor is a soft judge reason;
  // promoted to a hard Live miss for notes/shop on compositional asks only.
  const misplaced = {
    ...ginSeed,
    'src/sections/NotesSection.jsx': `export default function NotesSection(){\n  return (<section className="notes-band" id="notes"><h2>Details</h2><p>${'static '.repeat(50)}</p></section>);\n}\n`,
    'src/sections/CatalogSection.jsx': `${shop}<div className="notes-strip"><h3>Tasting notes</h3><p>${'Nose Palate Finish. '.repeat(3)}</p></div>`,
  };
  const misplacedMatch = scoreAskMatch(misplaced, ginBrief, 'Brinecove');
  assert.ok(
    misplacedMatch.reasons.some((r) => /band purpose: notes copy lives under #shop/.test(r)),
    `purpose mismatch surfaces as a soft judge reason: ${misplacedMatch.reasons.join('; ')}`,
  );
  assert.equal(misplacedMatch.ok, true, 'purpose alone never flips scoreAskMatch.ok (soft first)');
  const purposeHard = askSectionHardMisses(misplaced, ginBrief, 'Brinecove');
  assert.ok(
    purposeHard.some((m) => /band purpose: notes/.test(m)),
    `notes purpose mismatch hard-fails a compositional ask: ${purposeHard.join('; ')}`,
  );
  assert.deepEqual(
    askSectionHardMisses(misplaced, 'Build a tip calculator called TipWise', 'TipWise'),
    [],
    'tool asks never get band-purpose gates',
  );
  const subMoved = {
    ...subSeed,
    'src/sections/SubscribeSection.jsx': `export default function SubscribeSection(){\n  return (<section className="subscribe-band" id="subscribe"><h2>News</h2><p>${'static '.repeat(50)}</p></section>);\n}\n`,
    // SecondaryCtaSection is a second id="subscribe" home — strip its copy too.
    'src/sections/SecondaryCtaSection.jsx': `export default function SecondaryCtaSection(){\n  return (<section className="secondary-cta" id="subscribe"><p>${'static '.repeat(50)}</p></section>);\n}\n`,
    'src/sections/CatalogSection.jsx': `${String(subSeed['src/sections/CatalogSection.jsx'] || shop)}\n<div id="news-form"><form className="subscribe-form"><input type="email" /></form></div>`,
  };
  assert.ok(
    scoreAskMatch(subMoved, withSubBrief, 'Brinecove').reasons.some((r) => /band purpose: subscribe/.test(r)),
    'subscribe purpose mismatch is reported',
  );
  assert.ok(
    !askSectionHardMisses(subMoved, withSubBrief, 'Brinecove').some((m) => /band purpose: subscribe/.test(m)),
    'subscribe purpose stays soft (never a hard Live miss)',
  );
  // UI-ready §H — name-hashed framing + brief-word prop chip (offline, deterministic).
  const frameOf = (svg) => (decodeURIComponent(String(svg).replace(/^data:image\/svg\+xml[^,]*,/, '')).match(/data-frame="(\d)"/) || [])[1];
  const frames = ['Brinecove', 'Saltmere', 'Harborstill', 'Gullwing', 'Tidewatch', 'Marram']
    .map((n) => frameOf(svgHeroDataUrl(createIdentityFromBrief(n, 'coastal gin · not coffee'), n)));
  assert.ok(frames.every((f) => f !== undefined), 'every plate carries a hashed frame');
  assert.ok(new Set(frames).size > 1, `name hash varies framing across brands: ${frames.join(',')}`);
  assert.equal(
    frameOf(svgHeroDataUrl(createIdentityFromBrief('Brinecove', 'coastal gin · not coffee'), 'Brinecove')),
    frameOf(gin),
    'framing is deterministic for the same brand',
  );
  assert.match(ginSvg, /COASTAL/, 'brief word lands as an offline prop chip');
  assert.doesNotMatch(ginSvg, /\bCOFFEE\b/i, 'negated brief word never reaches the gin plate');
  // UI-ready §E — Interact v2: bag + subscribe persist in localStorage (no checkout).
  assert.match(shop, /const BAG_KEY = "nova\.bag\./, 'seed bag key is brand-namespaced');
  assert.match(shop, /localStorage\.getItem\(BAG_KEY\)/, 'seed bag restores from localStorage');
  assert.match(shop, /localStorage\.setItem\(BAG_KEY/, 'seed bag persists to localStorage');
  assert.match(shop, /useState\(loadBag\)/, 'seed bag hydrates lazily from storage');
  const subBody = String(subSeed['src/sections/SubscribeSection.jsx'] || '');
  assert.match(subBody, /const SUB_KEY = "nova\.subscribed\./, 'seed subscribe key is brand-namespaced');
  assert.match(subBody, /localStorage\.getItem\(SUB_KEY\)/, 'seed subscribe restores from localStorage');
  assert.match(subBody, /localStorage\.setItem\(SUB_KEY/, 'seed subscribe persists to localStorage');
  assert.ok(/useState/.test(subBody) && /onClick/.test(shop), 'stubs stay interactive after v2');
  const gateSeeded = runCreateSyntaxGate(ginSeed);
  assert.equal(gateSeeded.ok, true, `seeded tree passes the syntax gate: ${gateSeeded.reasons.join('; ')}`);
  // Patch 4 — brief-faithful copy: sentence cues land in seed story/notes.
  const cues = briefPhrases(
    'Build Harborstill. Coastal gin with juniper clarity. Small-batch stills by the cove. Not coffee.',
    6,
  );
  assert.ok(cues.length >= 2, 'briefPhrases splits sentences into multiple cues');
  const harborAsk = buildAskContract(
    'Build Harborstill. Coastal gin with juniper clarity. Small-batch stills by the cove. Not coffee.',
    'Harborstill',
  );
  const harborBlob = `${harborAsk.lede}\n${harborAsk.storyCards.map((c) => c.body).join('\n')}\n${harborAsk.noteItems.map((n) => n.body).join('\n')}`;
  assert.ok(/juniper|coastal|stills|cove/i.test(harborBlob), 'seed copy carries brief cues');
  // Patch 5 — non-F&B families get contract slots; tip never gets shop/notes.
  const tipAsk = buildAskContract('Build a tip calculator called TipWise', 'TipWise');
  assert.equal(tipAsk.compositionFamily, 'tool-panel');
  assert.equal(tipAsk.wantsNotes, false, 'tip never forces tasting notes');
  assert.equal(tipAsk.wantsShop, false, 'tip never forces shop');
  assert.ok(tipAsk.extraSlots.some((s) => /tool inputs|compute/i.test(s)), 'tool-panel gets tool slot');
  const lotionAsk = buildAskContract(
    'Build a lotion brand website with shop and subscribe for SoftPalm',
    'SoftPalm',
  );
  assert.ok(lotionAsk.wantsShop, 'lotion marketing with shop asks for shop');
  assert.ok(lotionAsk.extraSlots.some((s) => /shop|catalog/i.test(s)), 'lotion gets shop extra slot');
  // Depth status: stripped interactivity reports a clear Studio reason (not generic ledger).
  const { compositionalDepthDropsDeliveredMarkers, formatCompositionalDepthDropReason } = await import('../src/lib/createThinPath.ts');
  const priorNotes = { 'src/sections/NotesSection.jsx': notes };
  const staticClone = {
    'src/sections/NotesSection.jsx': `export default function NotesSection(){return(<section id="notes">${'note '.repeat(200)}</section>);}`,
  };
  const drops = compositionalDepthDropsDeliveredMarkers(priorNotes, staticClone);
  assert.ok(drops.some((d) => /interactive/.test(d)), 'guard detects stripped interactive notes');
  assert.match(formatCompositionalDepthDropReason(drops), /stripped delivered/i, 'Studio reason names the drop');
}

console.log('smoke-thin-create-path: ok');
