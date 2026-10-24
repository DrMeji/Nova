/**
 * Fix #3: invent-floor Acc must clear premium Live visual bar (not block Live).
 */
import assert from 'node:assert/strict';
import {
  seedCompositionalInventFloor,
  thinMeetsLiveVisualFloor,
  thinBlocksLivePreview,
  thinAskMatchDeficits,
  readThinDepthLedger,
  inventFloorClearsLive,
  THIN_LIVE_VISUAL_MIN_CHARS,
  THIN_LIVE_VISUAL_MIN_CSS,
} from '../src/lib/createThinPath.ts';

const brief = [
  'Create Moss Thread Atelier leather-goods website.',
  'Soft parchment, espresso navy, brass.',
  'Full-bleed hero, sticky nav Shop/Story/Contact, 4 product cards, story band.',
  'Skip Plan — get Live.',
].join(' ');

const bare = {
  'src/App.jsx': "import './App.css';\nexport default function App(){return <div className=\"app\" id=\"root-app\"></div>}\n",
  'src/App.css': '.app{min-height:100vh}',
  'public/logo.svg': '<svg viewBox="0 0 64 64" data-nova-invent-logo="1"><text x="32" y="40">M</text></svg>',
};

const f = seedCompositionalInventFloor(bare, brief, 'Moss Thread Atelier');
const led = readThinDepthLedger(f);
assert.ok(led.compact >= THIN_LIVE_VISUAL_MIN_CHARS, `compact ${led.compact}`);
assert.ok(led.cssCompact >= THIN_LIVE_VISUAL_MIN_CSS, `css ${led.cssCompact}`);
assert.equal(thinMeetsLiveVisualFloor(f, brief), true, 'meets visual floor');
assert.equal(thinBlocksLivePreview(f, brief, 'Moss Thread Atelier'), false, 'Live not blocked');
const ask = thinAskMatchDeficits(f, brief, 'Moss Thread Atelier');
assert.equal(ask.length, 0, `askMatch clean: ${ask.join('; ')}`);
assert.equal(
  inventFloorClearsLive(f, brief, 'Moss Thread Atelier'),
  true,
  'inventFloorClearsLive for fast-path',
);
assert.doesNotMatch(JSON.stringify(f), /\bBook\s+One\b|\bBag\s+One\b|\bProduct\s+One\b/);

console.log('smoke-premium-floor-bar: ok');
