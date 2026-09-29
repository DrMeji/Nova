/**
 * Natural-language diagnose → explain → fix for bound projects.
 * Cursor-shaped replies: acknowledge symptom, name cause (file + why), propose fix.
 */

import {
  flattenProjectFiles,
  type ProjectFileMap,
} from '@/lib/projectCodeEdit';
import {
  isBuildArtifactPath,
  scanProjectFindings,
  type InspectFinding,
} from '@/lib/projectInspect';
import { looksLikeProjectDebugAsk } from '@/lib/chatProjectDebug';

/** User wants edits applied now (not just an explanation). */
export function wantsApplyFix(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/^(yes|yep|yeah|ok|okay|sure|please|do it|go ahead|fix it|fix them|apply it)([.!]*)?$/i.test(t)) {
    return true;
  }
  return /\b(?:fix\s+(?:it|this|that|them|the\s+\w+)|please\s+fix|go\s+ahead\s+and\s+fix|apply\s+(?:the\s+)?(?:fix|patch|change)|can\s+you\s+(?:fix|repair|patch)|help\s+me\s+(?:fix|repair)|repair\s+(?:it|this|that)|patch\s+(?:it|this)|make\s+it\s+work)\b/i.test(t);
}

/** Add / remove / change feature asks (mutate existing project). */
export function looksLikeFeatureMutateAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  return /\b(?:add|remove|delete|drop|implement|introduce|wire|rename|replace)\b/i.test(t)
    && /\b(?:button|page|screen|feature|section|component|route|menu|tab|setting|profile|form|field|modal|nav|sidebar|header|footer|link|api|endpoint)\b/i.test(t);
}

/** Bound-folder chat should open a diagnose path (explain or fix). */
export function looksLikeChatDiagnoseAsk(text: string): boolean {
  return looksLikeProjectDebugAsk(text) || looksLikeFeatureMutateAsk(text);
}

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'my', 'me',
  'i', 'im', 'i\'m', 'is', 'are', 'was', 'were', 'be', 'been', 'this', 'that', 'it',
  'can', 'you', 'help', 'please', 'hey', 'hi', 'having', 'problem', 'issue', 'bug',
  'broken', 'wrong', 'not', 'working', 'work', 'doesnt', 'doesn\'t', 'won\'t', 'wont',
]);

function tokensFromAsk(ask: string): string[] {
  return String(ask || '')
    .toLowerCase()
    .replace(/[^a-z0-9_./\\-]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/** Score findings against the user's symptom wording (path + detail overlap). */
export function rankFindingsForAsk(
  findings: InspectFinding[],
  ask: string,
): InspectFinding[] {
  const tokens = tokensFromAsk(ask);
  if (!findings.length) return [];
  if (!tokens.length) return findings.slice();

  const scored = findings.map((f) => {
    const hay = `${f.path} ${f.detail}`.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (hay.includes(tok)) score += tok.length >= 6 ? 3 : 2;
      // Soft path stem match (SettingsPanel ↔ settings)
      const stem = tok.replace(/(ing|ed|s)$/i, '');
      if (stem.length >= 4 && hay.includes(stem)) score += 1;
    }
    return { f, score };
  });
  scored.sort((a, b) => b.score - a.score || a.f.path.localeCompare(b.f.path));
  const matched = scored.filter((s) => s.score > 0).map((s) => s.f);
  return matched.length ? matched : scored.map((s) => s.f);
}

function fixHint(detail: string): string {
  if (/route|navigat|switch|tab|profile|settings|account/i.test(detail)) {
    return 'Align the tab/route state keys with the panels you render (e.g. `settings` ↔ settings panel, `profile` ↔ profile panel) so switching actually shows the right screen.';
  }
  if (/eval|exec/i.test(detail)) {
    return 'Replace `eval`/`exec` with a safe parser, whitelist, or library — never run untrusted strings.';
  }
  if (/secret|password|api[_-]?key|\.env/i.test(detail)) {
    return 'Move secrets to env / keychain, remove them from source, and rotate any leaked keys.';
  }
  if (/TODO|FIXME|HACK|NotImplemented|pass stubs|empty function|unfinished/i.test(detail)) {
    return 'Finish or remove the stub so that path cannot be hit in production.';
  }
  if (/except|silent exception/i.test(detail)) {
    return 'Catch a specific error type and log or surface it — do not swallow with a bare `except`.';
  }
  if (/href="#"|handler|Search UI/i.test(detail)) {
    return 'Wire a real onClick/onSubmit (or real href) so the control actually does something.';
  }
  if (/innerHTML|dangerouslySetInnerHTML/i.test(detail)) {
    return 'Sanitize HTML (DOMPurify or textContent) — never assign unsanitized user HTML.';
  }
  if (/child_process|shell:true|spawn/i.test(detail)) {
    return 'Avoid shell:true; pass args as an array; never concatenate untrusted input into a shell command.';
  }
  if (/webSecurity/i.test(detail)) {
    return 'Keep webSecurity enabled unless you have a documented, reviewed exception.';
  }
  return 'Open the file, fix the flagged line, then re-check the flow you described.';
}

function symptomLabel(ask: string): string {
  const t = String(ask || '').trim().replace(/\s+/g, ' ');
  if (t.length <= 120) return t;
  return `${t.slice(0, 117)}…`;
}

/**
 * Cursor-shaped diagnose reply from a local scan.
 * Lead finding is symptom-ranked when the ask mentions a concrete area.
 */
export function formatDiagnoseExplainReply(opts: {
  ask: string;
  findings: InspectFinding[];
  projectName?: string;
  fileCount: number;
  offerApply?: boolean;
}): string {
  const label = opts.projectName && !/^code$/i.test(opts.projectName)
    ? `**${opts.projectName}**`
    : 'this project';
  const ranked = rankFindingsForAsk(opts.findings, opts.ask);
  const offer = opts.offerApply !== false;

  if (!ranked.length) {
    return [
      `I looked through ${label} (${opts.fileCount} source file${opts.fileCount === 1 ? '' : 's'}) for what you described.`,
      '',
      `**What you asked about:** ${symptomLabel(opts.ask)}`,
      '',
      'I did not find a clear static match for that symptom yet (no TODO/stub/dead-control/secret patterns lined up with those words).',
      '',
      'Point me at a screen, file, or exact click path (e.g. “Settings → Profile switch does nothing”), or say **fix it** after you open the folder in chat so I can dig deeper.',
    ].join('\n');
  }

  const top = ranked[0];
  const extras = ranked.slice(1, 4);
  const bits: string[] = [
    `Okay — I see the problem you’re describing in ${label}.`,
    '',
    `**What’s going wrong:** ${symptomLabel(opts.ask)}`,
    '',
    `**Cause:** \`${top.path}\` — ${top.detail}`,
    '',
    `**How to fix it:** ${fixHint(top.detail)}`,
  ];

  if (extras.length) {
    bits.push('');
    bits.push(`I also spotted **${extras.length}** related issue${extras.length === 1 ? '' : 's'}:`);
    extras.forEach((f, i) => {
      bits.push(`${i + 1}. \`${f.path}\` — ${f.detail}`);
      bits.push(`   Fix: ${fixHint(f.detail)}`);
    });
  }

  bits.push('');
  if (offer) {
    bits.push('Want me to **apply this fix** in the project? Say **fix it** (or name which issue).');
  } else {
    bits.push('I can apply this next — say **fix it** when you’re ready.');
  }
  return bits.join('\n');
}

/** Run a symptom-aware local diagnose pass over project files. */
export function diagnoseProjectAsk(
  files: ProjectFileMap,
  ask: string,
  projectName?: string,
): { text: string; findings: InspectFinding[] } {
  const flat = flattenProjectFiles(files);
  const sourceKeys = Object.keys(flat).filter((k) => !isBuildArtifactPath(k));
  const findings = scanProjectFindings(files, ask || 'find problems debug bugs');
  const ranked = rankFindingsForAsk(findings, ask);
  const text = formatDiagnoseExplainReply({
    ask,
    findings: ranked,
    projectName,
    fileCount: sourceKeys.length || Object.keys(flat).length,
    offerApply: true,
  });
  return { text, findings: ranked };
}
