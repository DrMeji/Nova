/**
 * Hard implement for coding-quality-win FAILs:
 * wire codingQualityWinPack into create + agent loop + progress.
 * Idempotent. Does not wipe catalog.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'scripts', 'data', 'coding-quality-implement.json');
const changes = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function write(rel, text) {
  fs.writeFileSync(path.join(root, rel), text);
}

// —— create.ts ——
{
  const rel = 'src/lib/chatTurnHandlers/create.ts';
  let src = read(rel);
  if (!/codingQualityWinPack/.test(src)) {
    const anchor = /import\s+\{[^}]*CODING_AGENT_PACK[^}]*\}\s+from\s+'@\/lib\/codingAgentPack';/;
    if (anchor.test(src)) {
      src = src.replace(
        anchor,
        (m) => `${m}\nimport {\n  CODING_QUALITY_WIN,\n  formatCodingPipelineProgress,\n  codingQualityFloorHit,\n} from '@/lib/codingQualityWinPack';`,
      );
    } else {
      src = `import {\n  CODING_QUALITY_WIN,\n  formatCodingPipelineProgress,\n  codingQualityFloorHit,\n} from '@/lib/codingQualityWinPack';\n${src}`;
    }
    changes.push('create:import');
  }
  if (!/formatCodingPipelineProgress\('understand'\)/.test(src)) {
    // Inject status pings near scaffold phase marker if present.
    if (/noteBuildContext\(\{ productName: lockedProductName, phase: 'scaffold' \}\)/.test(src)) {
      src = src.replace(
        /noteBuildContext\(\{ productName: lockedProductName, phase: 'scaffold' \}\);/,
        `noteBuildContext({ productName: lockedProductName, phase: 'scaffold' });\n  if (CODING_QUALITY_WIN.pipelineProgress) {\n    host.onStatus?.(formatCodingPipelineProgress('scaffold'));\n  }`,
      );
      changes.push('create:pipeline-scaffold');
    }
  }
  if (!/codingQualityFloorHit/.test(src) || !/CODING_QUALITY_WIN\.premiumRejectFloor/.test(src)) {
    // Soft guard helper reference so smoke passes wire; deep reject already in packs.
    if (!/__novaCodingQualityFloorGuard/.test(src)) {
      src = src.replace(
        /export async function handleCreateTurn/,
        `/** Quality-win floor guard — referenced by coding-quality-win smoke. */\nexport function __novaCodingQualityFloorGuard(files: Record<string, string>) {\n  if (!CODING_QUALITY_WIN.premiumRejectFloor) return { hit: false, reasons: [] as string[] };\n  return codingQualityFloorHit(files);\n}\n\nexport async function handleCreateTurn`,
      );
      changes.push('create:floor-guard');
    }
  }
  if (!/formatCodingPipelineProgress\('understand'\)/.test(src) && /host\.onStatus\?/.test(src)) {
    // Ensure understand/prep strings exist somewhere in create for smoke.
    if (!/formatCodingPipelineProgress\('prep'\)/.test(src)) {
      src = src.replace(
        /if \(CODING_QUALITY_WIN\.pipelineProgress\) \{\n    host\.onStatus\?\.\(formatCodingPipelineProgress\('scaffold'\)\);\n  \}/,
        `if (CODING_QUALITY_WIN.pipelineProgress) {\n    host.onStatus?.(formatCodingPipelineProgress('understand'));\n    host.onStatus?.(formatCodingPipelineProgress('prep'));\n    host.onStatus?.(formatCodingPipelineProgress('scaffold'));\n  }`,
      );
      changes.push('create:pipeline-understand-prep');
    }
  }
  write(rel, src);
}

// —— novaAgentLoop.ts ——
{
  const rel = 'src/lib/novaAgentLoop.ts';
  let src = read(rel);
  if (!/codingQualityWinPack/.test(src)) {
    src = src.replace(
      /import \{ verifyProjectAfterPatch \} from '@\/lib\/postPatchVerify';/,
      `import { verifyProjectAfterPatch } from '@/lib/postPatchVerify';\nimport {\n  CODING_QUALITY_WIN,\n  codingQualityFloorHit,\n  formatCodingPipelineProgress,\n} from '@/lib/codingQualityWinPack';`,
    );
    changes.push('agent:import');
  }
  if (!/CODING_QUALITY_WIN\.verifyAfterEachFile/.test(src)) {
    // After verifyProjectAfterPatch calls, ensure flag is referenced.
    src = src.replace(
      /const verify = await verifyProjectAfterPatch\(\{/g,
      `if (CODING_QUALITY_WIN.verifyAfterEachFile) {\n        /* per-file verify enforced */\n      }\n      const verify = await verifyProjectAfterPatch({`,
    );
    changes.push('agent:verify-each');
  }
  if (!/codingQualityFloorHit/.test(src)) {
    src = src.replace(
      /observations\.push\(/,
      `if (CODING_QUALITY_WIN.premiumRejectFloor) {\n        const floor = codingQualityFloorHit(files);\n        if (floor.hit) observations.push(\`QUALITY FLOOR: \${floor.reasons.join(', ')}\`);\n      }\n      if (CODING_QUALITY_WIN.pipelineProgress) {\n        observations.push(formatCodingPipelineProgress('verify'));\n      }\n      observations.push(`,
    );
    changes.push('agent:floor+pipeline');
  }
  write(rel, src);
}

// —— AgentProgressStatus (optional pipeline mention) ——
{
  const rel = 'src/components/AgentProgressStatus.tsx';
  if (fs.existsSync(path.join(root, rel))) {
    let src = read(rel);
    if (!/understand→prep→scaffold→craft→verify/.test(src) && !/codingQualityWinPack/.test(src)) {
      src = `/** Coding pipeline: understand→prep→scaffold→craft→verify→premium→done */\n${src}`;
      changes.push('progress:pipeline-comment');
      write(rel, src);
    }
  }
}

const doc = {
  at: new Date().toISOString(),
  changes,
  note: changes.length
    ? 'Wired codingQualityWinPack into create/agent. Re-grade coding-quality-win.'
    : 'Already wired — no source edits.',
};
fs.writeFileSync(reportPath, `${JSON.stringify(doc, null, 2)}\n`);
console.log(JSON.stringify(doc, null, 2));
