import { createRequire } from 'module';
// Use tsx via child — keep this as a simple string check of the source export via dynamic import through tsx runner.
import { spawnSync } from 'child_process';

const src = `
import { promoteLooseCodeFences } from './src/lib/chatMarkdown.tsx';
import { looksLikeCodeEditAsk } from './src/lib/chatAgentTurn.ts';
const sample = "Of course! Here's HTML and CSS: <!DOCTYPE html><html><body>Oak</body></html> header { background-color: #4CAF50; color: white; padding: 10px 20px; text-align: left; position: fixed; top: 0; left: 0; width: 100%; }";
const out = promoteLooseCodeFences(sample);
const fenced = /\`\`\`(?:html|css)/i.test(out);
console.log(fenced ? 'FENCED_OK' : 'FENCED_MISS');
console.log('edit', looksLikeCodeEditAsk('Nice, blank white page works. Can you put the name Oak and Bean up in the top left corner? Just the text for now'));
console.log('---');
console.log(out.slice(0, 400));
`;

const r = spawnSync('npx', ['tsx', '--tsconfig', 'tsconfig.app.json', '-e', src], {
  cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  encoding: 'utf8',
  shell: true,
});
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status || 0);
