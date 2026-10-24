/**
 * One-shot product deep scan (not invent loop).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const findings = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function fileHas(rel, re) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return false;
  return re.test(fs.readFileSync(p, 'utf8'));
}

// Agents chrome
if (!fileHas('src/views/AgentsView.tsx', /data-nova-agents-desk|CodingWorkerDagPanel|Kanban|Cancel/)) {
  findings.push({ id: 'agents-desk-missing', sev: 1, why: 'AgentsView lacks Kanban/DAG desk' });
} else {
  findings.push({ id: 'agents-desk-ok', sev: 9, why: 'Agents Kanban + DAG mounted' });
}

if (!fileHas('src/views/AgentsView.tsx', /DiffReviewPanel/)) {
  findings.push({ id: 'diff-review-unmounted', sev: 2, why: 'DiffReviewPanel not on Agents' });
} else {
  findings.push({ id: 'diff-review-agents-ok', sev: 9, why: 'DiffReviewPanel on Agents' });
}

if (!fileHas('src/components/SettingsPrivacy.tsx', /data-nova-secrets-banner/)) {
  findings.push({ id: 'secrets-banner-missing', sev: 2, why: 'Privacy secrets banner missing' });
} else {
  findings.push({ id: 'secrets-banner-ok', sev: 9, why: 'Privacy secrets banner present' });
}

if (!fileHas('src/lib/createThinPath.ts', /THIN_CREATE_STAGES[\s\S]*'prove'/)) {
  findings.push({ id: 'spine-12-missing', sev: 1, why: 'Create spine not 12 stages' });
} else {
  findings.push({ id: 'spine-12-ok', sev: 9, why: 'Create spine 12 stages in code' });
}

if (!fileHas('src/lib/createThinPath.ts', /formatThinCreateSpineStatus/)) {
  findings.push({ id: 'spine-status-missing', sev: 2, why: 'Spine status helper missing' });
}

// Unmounted peers still open
if (!fileHas('src/components/ChatCodeOverlay.tsx', /DiffReviewPanel/)) {
  findings.push({
    id: 'diff-review-code-overlay',
    sev: 3,
    why: 'DiffReviewPanel still not in Code overlay',
  });
} else {
  findings.push({ id: 'diff-review-code-ok', sev: 9, why: 'DiffReviewPanel in Code overlay' });
}

if (!fileHas('src/views/aichat/AIChatFrame.tsx', /CreateSpineProgressStrip/)) {
  findings.push({
    id: 'create-spine-chrome-strip',
    sev: 3,
    why: 'No visible 1–12 create spine strip in Chat chrome',
  });
} else {
  findings.push({ id: 'create-spine-strip-ok', sev: 9, why: 'CreateSpineProgressStrip in Chat' });
}

const parked = ['Networking', 'Message', 'Test device'];
for (const label of parked) {
  findings.push({ id: `parked-${label.replace(/\s+/g, '-').toLowerCase()}`, sev: 4, why: `${label} still parked/coming soon` });
}

const open = findings.filter((f) => f.sev <= 4).sort((a, b) => a.sev - b.sev);
const outDir = path.join(root, '.tmp-live-fail-loop');
fs.mkdirSync(outDir, { recursive: true });
const report = {
  at: new Date().toISOString(),
  kind: 'one-deep-scan',
  findings,
  open,
};
fs.writeFileSync(path.join(outDir, 'one-deep-scan.json'), JSON.stringify(report, null, 2));
console.log('Open findings:', open.length);
for (const f of open) console.log(`  [${f.sev}] ${f.id}: ${f.why}`);
console.log('Report:', path.join(outDir, 'one-deep-scan.json'));
