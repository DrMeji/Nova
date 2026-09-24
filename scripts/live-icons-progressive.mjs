/**
 * Progressive live: blank → color → brand icons → move icons.
 * Isolates where coder stalls (full create vs color vs icons vs motion).
 * Env: NOVA_CDP_PORT (default 9340)
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = process.env.NOVA_CDP_PORT || '9340';

const turns = [
  {
    newChat: true,
    ask: 'build a basic website with just a solid black background. nothing else — no text, no nav, no buttons. create the project on disk and make Preview Ready.',
    label: 'TURN 1 — black background create',
    timeoutMs: '600000',
    mustNot: [/@@@FILE/i, /I scanned\s+\*\*0/i],
    mustHave: [/black|Preview|Ready|project|folder|Live|created/i],
  },
  {
    newChat: false,
    ask: 'change the background color from black to deep navy blue',
    label: 'TURN 2 — black → navy (color)',
    timeoutMs: '300000',
    mustNot: [/@@@FILE\s+src/i, /I applied that in your project files/i],
    mustHave: [/navy|blue|updated|changed|background|App\.|Preview|Ready|done/i],
  },
  {
    newChat: false,
    ask: 'add four brand icons on the page: Netflix, YouTube, Hulu, and Discord. any simple icon style is fine — just make them clearly visible. no other UI.',
    label: 'TURN 3 — add brand icons',
    timeoutMs: '420000',
    mustNot: [/@@@FILE\s+src/i, /I applied that in your project files/i],
    mustHave: [/icon|Netflix|YouTube|Hulu|Discord|updated|added|done|Preview|Ready/i],
  },
  {
    newChat: false,
    ask: 'make those four icons slowly move around the screen — gentle floating / drifting motion. keep the navy background.',
    label: 'TURN 4 — move icons around',
    timeoutMs: '420000',
    mustNot: [/@@@FILE\s+src/i, /I applied that in your project files/i],
    mustHave: [/move|float|animat|drift|motion|updated|changed|done|Preview|Ready/i],
  },
];

function runTurn(t) {
  console.log(`\n======== ${t.label} ========\n`);
  console.log(`ASK: ${t.ask}\n`);
  const env = {
    ...process.env,
    NOVA_CDP_PORT: PORT,
    NOVA_NEW_CHAT: t.newChat ? '1' : '0',
    NOVA_ASK: t.ask,
    NOVA_TIMEOUT_MS: t.timeoutMs || '180000',
  };
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'live-one-turn.mjs')], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const code = r.status ?? 1;

  let parsed = null;
  try {
    const start = r.stdout.indexOf('{');
    const end = r.stdout.lastIndexOf('}');
    if (start >= 0 && end > start) parsed = JSON.parse(r.stdout.slice(start, end + 1));
  } catch { /* ignore */ }
  const text = String(parsed?.text || '');
  const meta = String(parsed?.meta || '');

  if (code === 3 || code === 4 || /timeout/i.test(meta)) {
    console.error(`\nGATE FAIL: no usable reply (exit ${code}, meta=${meta})`);
    return 3;
  }
  for (const re of t.mustNot || []) {
    if (re.test(text) || re.test(meta)) {
      console.error(`\nGATE FAIL: forbidden ${re}`);
      return 5;
    }
  }
  for (const re of t.mustHave || []) {
    if (!re.test(text) && !re.test(meta)) {
      console.error(`\nGATE FAIL: missing ${re}`);
      return 5;
    }
  }
  console.log(`\nGATE OK (exit ${code})\n`);
  return code === 0 || code === 2 ? 0 : code;
}

let failed = 0;
for (let i = 0; i < turns.length; i++) {
  const code = runTurn(turns[i]);
  if (code !== 0) {
    failed = 1;
    console.error(`Stopped after turn ${i + 1}.`);
    break;
  }
  spawnSync(process.execPath, ['-e', 'setTimeout(()=>{}, 3000)'], { stdio: 'ignore' });
}

console.log(`\n======== icons progressive live ${failed ? 'STOPPED' : 'done'} ========`);
process.exit(failed ? 1 : 0);
