/**
 * Extract sendMessage from AIChat into useAIChatSend.ts (ctx bag).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const aichatPath = path.join(root, 'src/views/AIChat.tsx');
const outPath = path.join(root, 'src/views/aichat/useAIChatSend.ts');

let s = fs.readFileSync(aichatPath, 'utf8');
s = s.replace(/\r\n/g, '\n');
const lines = s.split('\n');

const sendStart = lines.findIndex((l) => l.trim() === 'const sendMessage = async (content: string) => {');
if (sendStart < 0) throw new Error('sendMessage start missing');
const sendEnd = lines.findIndex((l, i) => i > sendStart && l === '  };' && lines[i + 1] === '' && lines[i + 2]?.includes('sendMessageRef.current = sendMessage'));
if (sendEnd < 0) throw new Error('sendMessage end missing');

const bodyLines = lines.slice(sendStart + 1, sendEnd); // inside braces, still indented with 4 spaces
const bodyText = bodyLines.join('\n');

// Top-level declarations before sendMessage
const componentStart = lines.findIndex((l) => l.startsWith('export function AIChat'));
const pre = lines.slice(componentStart, sendStart);
const declared = new Set();
for (const line of pre) {
  let m = line.match(/^  (?:const|let|function|async function)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (m) declared.add(m[1]);
  m = line.match(/^  const\s*\[([^\]]+)\]/);
  if (m) {
    for (const part of m[1].split(',')) {
      const name = part.trim().replace(/\s*=.*/, '');
      if (/^[A-Za-z_]/.test(name)) declared.add(name);
    }
  }
  m = line.match(/^  const\s*\{([^}]+)\}\s*=/);
  if (m) {
    for (const part of m[1].split(',')) {
      const bit = part.trim();
      if (!bit) continue;
      const name = bit.includes(':') ? bit.split(':')[0].trim() : bit.split('=')[0].trim();
      if (/^[A-Za-z_]/.test(name)) declared.add(name);
    }
  }
}

// Also include helpers imported into AIChat that sendMessage uses
const helperExports = [
  'COMPOSER_MODE_PREFIX', 'composerModeFromContent', 'previewFromText',
  'CHAT_MODELS', 'CLOUD_CHAT_WHEN_KEYED', 'kindForMode', 'defaultModelForKind',
  'failoverChipText', 'PLACEHOLDERS', 'GREETINGS', 'resolveStudioFiles',
  'persistModeThread', 'deletePrepareErrorReply', 'focusComposerIfSafe',
];

const used = new Set();
for (const mm of bodyText.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) used.add(mm[1]);

// Locals declared inside sendMessage — not props
const localDecl = new Set();
for (const line of bodyLines) {
  let m = line.match(/^\s+(?:const|let|function|async function|class)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (m) localDecl.add(m[1]);
  m = line.match(/^\s+const\s*\[([^\]]+)\]/);
  if (m) {
    for (const part of m[1].split(',')) {
      const name = part.trim().replace(/\s*=.*/, '');
      if (/^[A-Za-z_]/.test(name)) localDecl.add(name);
    }
  }
  m = line.match(/^\s+const\s*\{([^}]+)\}\s*=/);
  if (m && !line.includes('await import') && !line.includes('= await')) {
    // only simple destructure from known values — still mark as local
    for (const part of m[1].split(',')) {
      const bit = part.trim();
      if (!bit || bit.startsWith('...')) continue;
      const name = bit.includes(':') ? bit.split(':').pop().trim().split('=')[0].trim() : bit.split('=')[0].trim();
      // for `{ foo }` name is foo; for `{ foo: bar }` rename is bar
      if (bit.includes(':')) {
        const rhs = bit.split(':')[1].trim().split('=')[0].trim();
        if (/^[A-Za-z_]/.test(rhs)) localDecl.add(rhs);
      } else if (/^[A-Za-z_]/.test(name)) {
        localDecl.add(name);
      }
    }
  }
}

const ctxKeys = [...used]
  .filter((id) => declared.has(id) || helperExports.includes(id))
  .filter((id) => !localDecl.has(id))
  .filter((id) => id !== 'content') // param
  .sort();

console.log('ctx keys', ctxKeys.length);

// Dedent body by 2 spaces
const dedented = bodyLines.map((l) => (l.startsWith('  ') ? l.slice(2) : l)).join('\n');

// Pull imports from AIChat that sendMessage likely needs — reuse a broad import block from AIChat
const importLines = [];
let i = 0;
while (i < lines.length && (lines[i].startsWith('import ') || lines[i].startsWith('}') || lines[i].startsWith('  ') || lines[i].trim() === '' || lines[i].startsWith('/*') || lines[i].startsWith('*') || lines[i].startsWith('type ') || lines[i].includes(' from '))) {
  if (lines[i].startsWith('import ') || (importLines.length && !lines[i].startsWith('export '))) {
    if (lines[i].startsWith('export ')) break;
    importLines.push(lines[i]);
    if (lines[i].includes("from ") && lines[i].trim().endsWith(';')) {
      // end of import
    } else if (lines[i].includes("from ")) {
      // continued
    }
  } else if (importLines.length && lines[i].trim() === '') {
    importLines.push(lines[i]);
  } else if (importLines.length && !lines[i].startsWith('import') && !lines[i].startsWith(' ') && !lines[i].startsWith('}') && lines[i].trim() !== '') {
    break;
  }
  i++;
  if (i > 400) break;
}

// Simpler: copy all imports from AIChat until export function, excluding react-dom createPortal-only and frame imports
const allImports = [];
for (let j = 0; j < componentStart; j++) {
  const line = lines[j];
  if (line.startsWith('import ') || (allImports.length && !line.startsWith('export ') && (
    line.startsWith(' ') || line.startsWith('}') || line.trim() === '' || line.startsWith('/*') || line.startsWith('*') || line.startsWith('//')
  ))) {
    if (line.includes('AIChatFrame')) continue;
    if (line.includes('createPortal')) continue;
    if (line.includes('RotatingTip') || line.includes('ParkedNotice')) continue;
    if (line.includes('AttachCard') || line.includes('GitHubRepoPicker')) continue;
    if (line.includes('VoiceModeLayout') || line.includes('FreeKeyWizard')) continue;
    if (line.includes('DeleteProjectFolderModal') || line.includes('DeleteFileModal')) continue;
    if (line.includes('DeleteFolderClarifyModal') || line.includes('ComposerPlusMenu')) continue;
    if (line.includes('TokenUsageRing') || line.includes('ArkErrorInline') || line.includes('ArkMark')) continue;
    if (line.includes('MessageContent') || line.includes('GeneratingPlaceholder')) continue;
    if (line.includes('ChatCodeOverlay')) continue;
    if (line.includes("from 'lucide-react'")) continue;
    if (line.includes('lucide-react')) continue;
    allImports.push(line);
  } else if (line.startsWith('export ')) {
    break;
  } else if (allImports.length && line.trim() !== '' && !line.startsWith('import')) {
    // skip non-import helpers that were removed
    if (!line.startsWith('import')) break;
  }
}

const header = `/**
 * AIChat sendMessage — extracted to keep AIChat.tsx under the size budget.
 * Behavior unchanged: one runChatTurn, media via runMediaChatTurn.
 */
// @ts-nocheck — ctx bag mirrors AIChat closures; keep in sync when wiring.
${allImports.join('\n')}

export type AIChatSendCtx = Record<string, any>;

export async function runAIChatSend(content: string, ctx: AIChatSendCtx): Promise<void> {
  const {
${ctxKeys.map((k) => `    ${k},`).join('\n')}
  } = ctx;

`;

const fileOut = header + dedented + '\n}\n';
fs.writeFileSync(outPath, fileOut, 'utf8');
console.log('wrote', outPath, fileOut.split('\n').length);

// Replace sendMessage in AIChat with thin wrapper
const wrapper = [
  '  const sendMessage = async (content: string) => runAIChatSend(content, {',
  ...ctxKeys.map((k) => `    ${k},`),
  '  });',
];

const next = [
  ...lines.slice(0, sendStart),
  ...wrapper,
  ...lines.slice(sendEnd + 1),
];

// Ensure import
const importLine = "import { runAIChatSend } from '@/views/aichat/useAIChatSend';";
const frameImportIdx = next.findIndex((l) => l.includes("from '@/views/aichat/AIChatFrame'"));
if (frameImportIdx >= 0 && !next.some((l) => l.includes('useAIChatSend'))) {
  next.splice(frameImportIdx + 1, 0, importLine);
}

fs.writeFileSync(aichatPath, next.join('\n') + '\n', 'utf8');
console.log('AIChat lines', next.length);
