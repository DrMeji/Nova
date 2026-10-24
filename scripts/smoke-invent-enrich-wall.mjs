/**
 * Fix #2: after invent floor lands, enrich wall expires → stop invent thrash.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inventFloorEnrichExhausted,
  seedCompositionalInventFloor,
  THIN_INVENT_ENRICH_AFTER_FLOOR_MS,
} from '../src/lib/createThinPath.ts';

const brief = 'Create Moss Thread Atelier leather-goods website with hero, shop grid, story. Skip Plan.';
const bare = {
  'src/App.jsx': `import './App.css';\nexport default function App(){return <div className="app" id="root-app"></div>}\n`,
  'src/App.css': '.app{min-height:100vh}',
  'public/logo.svg': '<svg viewBox="0 0 64 64"/>',
};
const floored = seedCompositionalInventFloor(bare, brief, 'Moss Thread Atelier');
const seededAt = Date.now() - THIN_INVENT_ENRICH_AFTER_FLOOR_MS - 1_000;

assert.equal(
  inventFloorEnrichExhausted({
    floorSeededAt: seededAt,
    files: floored,
    brief,
    productName: 'Moss Thread Atelier',
  }),
  true,
  'exhausted after wall + ≥3 landed',
);
assert.equal(
  inventFloorEnrichExhausted({
    floorSeededAt: Date.now(),
    files: floored,
    brief,
    productName: 'Moss Thread Atelier',
  }),
  false,
  'not exhausted while wall still open',
);
assert.equal(
  inventFloorEnrichExhausted({
    floorSeededAt: seededAt,
    files: bare,
    brief,
    productName: 'Moss Thread Atelier',
  }),
  false,
  'not exhausted without landed sections',
);

const createSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/chatTurnHandlers/create.ts'),
  'utf8',
);
assert.match(createSrc, /inventFloorEnrichExhausted/, 'depth loop checks enrich wall');
assert.match(createSrc, /Invent enrich wall · floor Acc is enough/, 'status when wall fires');

console.log('smoke-invent-enrich-wall: ok');
