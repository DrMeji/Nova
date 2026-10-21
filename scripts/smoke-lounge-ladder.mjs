/**
 * Lounge ladder-lite: rebuild/edit asks get the surgical twin; brand-new creates do not.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-lounge-ladder.mjs
 */
import assert from 'node:assert/strict';
import { briefWantsLoungeLadder, runLoungeCreateLadder } from '@/lib/createLoungeLadder';
import { extractBrandLabel } from '@/lib/brandLabel';
import { finalizeWebEdits } from '@/lib/webProjectCanon';

const blank = {
  'src/App.jsx': `import './App.css'\nexport default function App() {\n  return <div className="app"><h1>Hello</h1></div>\n}\n`,
  'src/App.css': `.app { min-height: 100vh; background: #fff; }\n`,
  'src/index.css': `html, body, #root { margin: 0; min-height: 100%; }\n`,
  'index.html': `<!doctype html><html><body><div id="root"></div></body></html>\n`,
};

const createBrief = [
  'Create a new website project called Velvet Hour ab12 on disk now.',
  'Brand-new project — do not edit any open folder.',
  'Late-dusk cocktail lounge / listening room vibe page (not SaaS, not dashboard).',
  'Full-bleed hero: brand name "Velvet Hour ab12" large, line "Stay for the last song.", button "Reserve a seat".',
].join(' ');

assert.equal(briefWantsLoungeLadder(createBrief), false, 'brand-new create skips lounge paste ladder');

const rebuildBrief = [
  'Rebuild Velvet Hour as a late-dusk cocktail lounge / listening room vibe page (not SaaS, not dashboard).',
  'Full-bleed hero: brand name "Velvet Hour" large, line "Stay for the last song.", button "Reserve a seat".',
  'Tonight strip: Vinyl Hour, Low Lights, Quiet Corner. Footer Tue–Sun 6pm–2am + email.',
].join(' ');

assert.equal(briefWantsLoungeLadder(rebuildBrief), true, 'rebuild wants ladder');
assert.equal(extractBrandLabel(rebuildBrief), 'Velvet Hour', `brand parse → ${extractBrandLabel(rebuildBrief)}`);

const createSurgical = finalizeWebEdits(blank, createBrief, [], { projectName: 'Velvet Hour' });
const createApp = createSurgical.find((e) => /App\.(jsx|tsx)$/i.test(e.path))?.content || '';
assert.ok(!/className=["'][^"']*\bapp\s+vibe\b/i.test(createApp), 'no lounge twin on brand-new create');

const statuses = [];
const res = await runLoungeCreateLadder({
  brief: rebuildBrief,
  productName: 'Velvet Hour',
  files: blank,
  host: {
    pushStatus: (label) => { statuses.push(label); },
  },
});

assert.equal(res.ok, true, `ladder ok: ${res.reason || ''}`);
assert.ok(res.beatsDone.includes('canvas'), 'canvas beat');
assert.ok(res.beatsDone.includes('brand'), 'brand beat');
assert.ok(res.beatsDone.includes('cards'), 'cards beat');
assert.ok(res.beatsDone.includes('footer'), 'footer beat');
const app = res.files['src/App.jsx'] || '';
const css = res.files['src/App.css'] || '';
assert.ok(/Reserve a seat/i.test(app), 'CTA');
assert.ok(/Stay for the last song/i.test(app), 'tag');
assert.ok(!/>\s*["“]Velvet Hour/i.test(app), 'no quote-wrapped H1');
assert.ok(!/\.hero\s*\{[^}]*min-height:\s*78vh/i.test(css), 'no 78vh hero');
assert.ok(statuses.some((s) => /Ladder ·/i.test(s)), 'status beats pushed');

console.log(`OK smoke-lounge-ladder (rebuild only · ${res.beatsDone.join(' → ')}, ${res.elapsedMs}ms)`);
