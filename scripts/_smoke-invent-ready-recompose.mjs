/**
 * Evidence: anti-stored-twin must force invent-demo recompose and block Ready
 * when brief mismatches layout (AntiStore "force invent-demo… block Ready").
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  inventBriefLayoutFidelity,
  inventFidelityBlocksReady,
  detectInventGenre,
} from '../src/lib/inventBriefFidelity.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;

function check(ok, name, detail = '') {
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
  if (!ok) fail += 1;
}

const twinApp = `<div data-nova-invent-demo="1" data-nova-layout="speakers" class="spk-bay">Audio showroom Woofer Soundbar</div>`;
const knifeBrief = 'Create a website for Obsidian Cutlery — Japanese knife atelier. Do NOT reuse speaker demo structure.';

const fid = inventBriefLayoutFidelity({ brief: knifeBrief, app: twinApp });
check(!fid.ok, 'fidelity rejects speakers twin for knife brief', fid.reasons.join('; '));
check(inventFidelityBlocksReady(fid) === true, 'blocks Ready when fidelity fails');
check(detectInventGenre(knifeBrief) === 'cutlery', 'genre cutlery despite anti-twin wording');

const createSrc = fs.readFileSync(path.join(root, 'src/lib/chatTurnHandlers/create.ts'), 'utf8');
check(
  /inventBriefLayoutFidelity/.test(createSrc) && /force:\s*true/.test(createSrc),
  'create.ts wires fidelity + force recompose',
);
check(
  /inventFidelityBlocksReady/.test(createSrc),
  'create.ts calls inventFidelityBlocksReady before Ready',
);

const demoSrc = fs.readFileSync(path.join(root, 'src/lib/createInventDemo.ts'), 'utf8');
check(
  /inventBriefLayoutFidelity/.test(demoSrc) && /detectInventGenre/.test(demoSrc),
  'createInventDemo uses fidelity helpers',
);

if (fail) {
  console.error('smoke-invent-ready-recompose failed', fail);
  process.exit(1);
}
console.log('ALL PASS invent-ready-recompose');
