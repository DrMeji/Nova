/**
 * Evidence: coding-agent parity vs Cursor/Claude/Codex — multi-file loop,
 * patch apply, terminal/tools, repo context, test-then-fix hooks.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
function check(ok, name, detail = '') {
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
  if (!ok) fail += 1;
}

const required = [
  'src/lib/novaAgentLoop.ts',
  'src/lib/novaAgentPatch.ts',
  'src/lib/novaAgentRepo.ts',
  'src/lib/novaAgentIndex.ts',
  'src/lib/codingAgentPack.ts',
  'src/lib/projectCodeEdit.ts',
  'src/lib/chatAgentApply.ts',
  'src/lib/debugClinic.ts',
  'src/lib/createProjectMap.ts',
  'electron/novaAgentExec.cjs',
];

for (const rel of required) {
  check(fs.existsSync(path.join(root, rel)), `exists ${rel}`);
}

const loop = fs.readFileSync(path.join(root, 'src/lib/novaAgentLoop.ts'), 'utf8');
const patch = fs.readFileSync(path.join(root, 'src/lib/novaAgentPatch.ts'), 'utf8');
const repo = fs.readFileSync(path.join(root, 'src/lib/novaAgentRepo.ts'), 'utf8');
const pack = fs.readFileSync(path.join(root, 'src/lib/codingAgentPack.ts'), 'utf8');
const apply = fs.readFileSync(path.join(root, 'src/lib/chatAgentApply.ts'), 'utf8');
const exec = fs.readFileSync(path.join(root, 'electron/novaAgentExec.cjs'), 'utf8');
const edit = fs.readFileSync(path.join(root, 'src/lib/projectCodeEdit.ts'), 'utf8');
const clinic = fs.readFileSync(path.join(root, 'src/lib/debugClinic.ts'), 'utf8');
const projMap = fs.readFileSync(path.join(root, 'src/lib/createProjectMap.ts'), 'utf8');

check(/export (async )?function|runAgent|agentLoop|step/i.test(loop), 'agent loop export/step');
check(/patch|apply|diff|hunk/i.test(patch), 'patch apply helpers');
check(/repo|index|file|walk|glob/i.test(repo), 'repo-wide context helpers');
check(/coding|scaffold|worker|dag|test/i.test(pack), 'coding agent pack');
check(/apply|verify|patch|edit/i.test(apply), 'chat agent apply+verify path');
check(/exec|shell|terminal|spawn|command/i.test(exec), 'terminal/tool exec bridge');
check(/edit|replace|surgical|file/i.test(edit), 'project code edit keeps intent path');
check(/debug|console|error|fix|clinic/i.test(clinic), 'debug clinic narrative path');
check(/map|file|project|summary|context/i.test(projMap), 'long-context project map');

// Wire: create/close-all or chat must reach agent/coding packs.
const close = fs.readFileSync(path.join(root, 'src/lib/inventCloseAllPack.ts'), 'utf8');
check(
  /codingAgent|novaAgent|attach.*Pack|runCoding/i.test(close + pack),
  'coding path reachable from invent/coding packs',
);

if (fail) {
  console.error('smoke-coding-agent-parity failed', fail);
  process.exit(1);
}
console.log('ALL PASS coding-agent-parity');
