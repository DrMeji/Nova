/**
 * After @@@FILE writes, run a quick project check so chat can report pass/fail.
 */

import { isViteProject } from '@/lib/projectPreview';

export type PatchVerifyResult = {
  ran: boolean;
  ok: boolean;
  command?: string;
  output?: string;
  summary: string;
};

export async function verifyProjectAfterPatch(opts: {
  diskRoot?: string | null;
  files: Record<string, string>;
  changedPaths: string[];
}): Promise<PatchVerifyResult> {
  const { diskRoot, files, changedPaths } = opts;
  if (!diskRoot || !changedPaths.length) {
    return { ran: false, ok: true, summary: '' };
  }
  if (!window.arkDesktop?.agentRun) {
    return { ran: false, ok: true, summary: '' };
  }

  const pkg = String(files['package.json'] || '');
  const hasTs = changedPaths.some(p => /\.tsx?$/.test(p)) || /typescript/.test(pkg);
  const hasScripts = /"scripts"\s*:/.test(pkg);

  let command = '';
  if (hasScripts && hasTs && /"typecheck"/.test(pkg)) {
    command = 'npm run typecheck';
  } else if (hasScripts && /"build"/.test(pkg) && isViteProject(files)) {
    command = 'npm run build';
  } else if (hasScripts && /"lint"/.test(pkg)) {
    command = 'npm run lint';
  }

  if (!command) {
    return { ran: false, ok: true, summary: '' };
  }

  try {
    const ran = await window.arkDesktop.agentRun({
      command,
      cwd: diskRoot,
      userConfirmed: true,
      skipConfirm: true,
    });
    const out = String(ran.output || ran.error || '').trim();
    const ok = Boolean(ran.ok);
    const summary = ok
      ? `\n\n**Verify:** \`${command}\` passed.`
      : `\n\n**Verify:** \`${command}\` failed — check the output below.\n\`\`\`\n${out.slice(0, 1200)}\n\`\`\``;
    return { ran: true, ok, command, output: out, summary };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'verify failed';
    return {
      ran: true,
      ok: false,
      command,
      summary: `\n\n**Verify:** could not run \`${command}\` (${msg}).`,
    };
  }
}
