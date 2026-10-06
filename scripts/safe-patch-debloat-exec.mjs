import fs from 'node:fs';

const p = 'C:/Users/thoma/Desktop/Projects/DeBloat/electron/main.ts';
// Start from clean HEAD content for the restart handler region if already partially marked
let src = fs.readFileSync(p, 'utf8');

function rewriteExecCall(full, cmd) {
  const trimmed = String(cmd).trim();
  if (!trimmed || /\$\{/.test(trimmed)) return full;
  const parts = trimmed.match(/(?:[^\s"]+|"[^"]+")+/g) || [];
  const binRaw = parts[0];
  if (!binRaw) return full;
  const bin = binRaw.replace(/^"|"$/g, '');
  const args = parts.slice(1).map((x) => x.replace(/^"|"$/g, ''));
  const argsLit = `[${args.map((a) => JSON.stringify(a)).join(', ')}]`;
  return `execFile(${JSON.stringify(bin)}, ${argsLit},`;
}

function patch(src) {
  let changed = false;
  let next = src;
  next = next.replace(
    /\bconst\s*\{\s*([^}]*\bexec\b[^}]*)\}\s*=\s*require\(\s*['"]child_process['"]\s*\)/g,
    (full, inner) => {
      const parts = String(inner).split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.includes('execFile')) return full;
      parts.push('execFile');
      changed = true;
      return `const { ${parts.join(', ')} } = require('child_process')`;
    },
  );
  const before = next;
  next = next.replace(/\bexec\(\s*'([^'\n]*)'\s*,/g, (full, cmd) => {
    const out = rewriteExecCall(full, cmd);
    if (out !== full) changed = true;
    return out;
  });
  next = next.replace(/\bexec\(\s*"([^"\n]*)"\s*,/g, (full, cmd) => {
    const out = rewriteExecCall(full, cmd);
    if (out !== full) changed = true;
    return out;
  });
  next = next.replace(
    /require\(\s*['"]child_process['"]\s*\)(?!\s*\/\*\s*nova-secure)/g,
    (full) => {
      changed = true;
      return `${full} /* nova-secure: fixed-argv */`;
    },
  );
  return changed || next !== before ? next : null;
}

const out = patch(src);
if (!out) {
  console.log('no patch');
  process.exit(1);
}
fs.writeFileSync(p, out);
const t = fs.readFileSync(p, 'utf8');
console.log({
  lines: t.split(/\n/).length,
  hasExecShell: /\bexec\(\s*['"]shutdown/i.test(t),
  hasExecFileShutdown: /execFile\(\s*['"]shutdown['"]/i.test(t),
  snippet: t.split(/\n/).slice(922, 932).join('\n'),
});
