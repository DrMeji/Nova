/**
 * Item 1: product invent Ready + inventFloorClearsLive require Premium.
 * No “premium” wording in the brief — genre detection only.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventFloorClearsLive } from '@/lib/createThinPath';
import {
  briefWantsProductLadder,
  gradeProductQuality,
  productMeetsPremiumLock,
} from '@/lib/createProductLadder';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const brief = 'Build a website for La Strado — a gaming mouse brand.';
assert.equal(/premium/i.test(brief), false, 'brief has no premium wording');
assert.equal(briefWantsProductLadder(brief), true, 'mouse brand enters ladder');

// Source contracts
const spine = fs.readFileSync(path.join(root, 'src/lib/createPassSpine.ts'), 'utf8');
const thin = fs.readFileSync(path.join(root, 'src/lib/createThinPath.ts'), 'utf8');
const ladder = fs.readFileSync(path.join(root, 'src/lib/createProductLadder.ts'), 'utf8');
assert.match(spine, /briefWantsProductLadder/);
assert.match(spine, /okPremium/);
assert.match(spine, /product invent below Premium/);
assert.match(thin, /productMeetsPremiumLock/);
assert.match(ladder, /Premium \(Ready lock\)/);

const thinFiles = {
  'src/App.jsx': `export default function App() {
  return (
    <div className="app">
      <nav className="top"><span className="mark">La Strado</span></nav>
      <h1>La Strado</h1>
      <p>Built for claw, tip, or palm.</p>
      <button type="button">Shop mice</button>
      <section className="who" aria-label="Who it is for"><p>Players</p></section>
      <article className="band"><h3>Optical first</h3></article>
      <article className="band"><h3>Light shells</h3></article>
      <article className="band"><h3>USD on card</h3></article>
      <section className="spec-strip" aria-label="Spec strip"><h3>Weight</h3></section>
      <footer><a href="#shop">Shop</a></footer>
    </div>
  );
}`,
  'src/App.css': `${'a'.repeat(600)}`,
  'public/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6"/></svg>',
};

assert.equal(
  gradeProductQuality(thinFiles, brief, 'La Strado').okPremium,
  false,
  'thin Acc is not Premium',
);
assert.equal(productMeetsPremiumLock(thinFiles, brief, 'La Strado'), false);
assert.equal(
  inventFloorClearsLive(thinFiles, brief, 'La Strado'),
  false,
  'non-Premium product Acc must not clear invent Live fast-path',
);

console.log('PASS: product Ready spine + invent fast-path require Premium');
