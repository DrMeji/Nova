/**
 * Guard: create must never auto-dispatch NOVA:open-code-overlay.
 * Code pill (setChatCodePill) remains for manual open.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const createPath = path.join(root, 'src/lib/chatTurnHandlers/create.ts');
const createV2Path = path.join(root, 'src/lib/createV2.ts');
const src = fs.readFileSync(createPath, 'utf8');
const v2 = fs.readFileSync(createV2Path, 'utf8');

const fails = [];

if (/dispatchEvent\s*\(\s*new CustomEvent\(\s*['"]NOVA:open-code-overlay['"]/.test(src)) {
  fails.push('create.ts still dispatches NOVA:open-code-overlay (auto-open forbidden)');
}
if (!/setChatCodePill/.test(src)) {
  fails.push('create.ts lost setChatCodePill — Code pill must stay for manual open');
}
if (!/CREATE_V2_AUTO_OPEN_CODE\s*=\s*false/.test(v2)) {
  fails.push('createV2 CREATE_V2_AUTO_OPEN_CODE must stay false');
}
if (!/SOFT_BIND_MS\s*=\s*\d+/.test(v2)) {
  fails.push('CREATE_V2_SOFT_BIND_MS missing');
}
const softBindMs = Number(v2.match(/SOFT_BIND_MS\s*=\s*(\d+)/)?.[1] || 0);
if (!(softBindMs >= 250 && softBindMs <= 800)) {
  fails.push(`CREATE_V2_SOFT_BIND_MS=${softBindMs} should stay in 250–800ms coalesce range`);
}
if (!/softBindPending|flushSoftBindCreateStudio/.test(src)) {
  fails.push('create.ts missing trailing soft-bind coalesce');
}
if (!/keepCodePill/.test(src)) {
  fails.push('create.ts missing keepCodePill on unbind');
}
if (!fs.existsSync(path.join(root, 'src/lib/engineSeatSwap.ts'))) {
  fails.push('engineSeatSwap.ts missing');
}

// Stall watch must use lastActivityAt, not 8s file-open.
const stallWatch = fs.readFileSync(path.join(root, 'scripts/live-stall-watch.mjs'), 'utf8');
if (/currentFileMs\s*>=\s*8000/.test(stallWatch)) {
  fails.push('live-stall-watch still uses file-open >= 8000 as stall metric');
}
if (!/lastActivityAt/.test(stallWatch)) {
  fails.push('live-stall-watch must key stall off lastActivityAt');
}

// Share-GPU / specialty prefs present.
const prefs = fs.readFileSync(path.join(root, 'src/lib/localPrefs.ts'), 'utf8');
if (!/shareGpuMode/.test(prefs) || !/specialtyStyleHop/.test(prefs)) {
  fails.push('localPrefs missing shareGpuMode / specialtyStyleHop');
}

const gguf = fs.readFileSync(path.join(root, 'electron/novaGguf.cjs'), 'utf8');
if (/-ngl['"],\s*['"]99['"]/.test(gguf) || /args\.push\('-ngl',\s*'99'\)/.test(gguf)) {
  fails.push('novaGguf still hardcodes -ngl 99');
}
if (!/getGgufNgl/.test(gguf) || !/scheduleIdleUnload/.test(gguf)) {
  fails.push('novaGguf missing adaptive ngl / idle unload');
}
if (!/nglRecoveryLadder|probeFreeVramMb/.test(gguf)) {
  fails.push('novaGguf missing VRAM-aware ngl recovery');
}

if (fails.length) {
  console.error('FAIL check-create-no-auto-open-code:');
  for (const f of fails) console.error(' -', f);
  process.exit(1);
}
console.log('OK check-create-no-auto-open-code — no auto-open, pill kept, containment hooks present');
