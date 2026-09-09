/**
 * After @@@FILE writes, run a quick project check so chat can report pass/fail.
 * If verify fails due to missing modules, auto npm install once and retry.
 */

import { isViteProject } from '@/lib/projectPreview';

export type PatchVerifyResult = {
  ran: boolean;
  ok: boolean;
  command?: string;
  output?: string;
  summary: string;
  installedDeps?: boolean;
};

function looksLikeMissingModules(out: string): boolean {
  return /cannot find module|module not found|err_module_not_found|could not resolve|enoent.*node_modules/i.test(out);
}

async function runCmd(command: string, cwd: string): Promise<{ ok: boolean; output: string }> {
  const ran = await window.arkDesktop!.agentRun!({
    command,
    cwd,
    userConfirmed: true,
    skipConfirm: true,
  });
  return {
    ok: Boolean(ran.ok),
    output: String(ran.output || ran.error || '').trim(),
  };
}

export async function verifyProjectAfterPatch(opts: {
  diskRoot?: string | null;
  files: Record<string, string>;
  changedPaths: string[];
  /** When true (default), npm install once if verify fails on missing modules. */
  autoInstall?: boolean;
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
  } else if (hasScripts && /"lint"/.test(pkg) && !isViteProject(files)) {
    command = 'npm run lint';
  }
  // Never auto-run `npm run build` here — Vite build on every chat edit hangs Generating for minutes.
  // Preview/Localhost already proves the tree; build stays a user/Build action.

  if (!command) {
    // Static HTML sites: light structure check instead of silent skip.
    const htmlPath = changedPaths.find((p) => /\.html?$/i.test(p))
      || Object.keys(files).find((p) => /(^|\/)index\.html$/i.test(p));
    if (htmlPath && files[htmlPath]) {
      const html = String(files[htmlPath]);
      const ok = /<html[\s>]/i.test(html) && /<\/html>/i.test(html);
      return {
        ran: true,
        ok,
        command: 'html-structure',
        output: ok ? 'index.html has html root' : 'Missing <html>…</html> in changed HTML',
        summary: ok
          ? '\n\n**Verify:** HTML structure looks ok.'
          : '\n\n**Verify:** HTML structure check failed — missing html root tags.',
      };
    }
    return { ran: false, ok: true, summary: '' };
  }

  try {
    let ran = await runCmd(command, diskRoot);
    let installedDeps = false;

    if (
      !ran.ok
      && opts.autoInstall !== false
      && pkg
      && looksLikeMissingModules(ran.output)
    ) {
      const install = await runCmd('npm install', diskRoot);
      installedDeps = true;
      if (install.ok) {
        ran = await runCmd(command, diskRoot);
      } else {
        const summary = `\n\n**Verify:** missing modules; \`npm install\` failed.\n\`\`\`\n${install.output.slice(0, 1200)}\n\`\`\``;
        return {
          ran: true,
          ok: false,
          command: 'npm install',
          output: install.output,
          summary,
          installedDeps: true,
        };
      }
    }

    const summary = ran.ok
      ? `\n\n**Verify:** \`${command}\` passed.${installedDeps ? ' (after npm install)' : ''}`
      : `\n\n**Verify:** \`${command}\` failed — check the output below.\n\`\`\`\n${ran.output.slice(0, 1200)}\n\`\`\``;
    return {
      ran: true,
      ok: ran.ok,
      command,
      output: ran.output,
      summary,
      installedDeps,
    };
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
