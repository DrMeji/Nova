const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const origLoad = Module._load;
Module._load = function mockElectron(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        getPath: (name) => {
          if (name === 'userData') return path.join(os.homedir(), 'AppData/Roaming/ARK');
          return os.tmpdir();
        },
      },
    };
  }
  return origLoad(request, parent, isMain);
};

const { stripLlamaCliNoise } = require('../electron/arkGguf.cjs');

const sample = [
  'available commands',
  '  /exit or Ctrl+C     stop or exit',
  '',
  '> <|im_start|>user',
  'You are ARK, the assistant in the ARK desktop creation studio',
  'User: Who is Albert Einstein?<|im_end|>',
  '<|im_start|>assistant',
  '',
  'Albert Einstein was a theoretical physicist who is best known for his theory of relativity.',
  '',
  '[ Prompt: 63.8 t/s | Generation: 8.8 t/s ]',
  '',
  'Exiting...',
].join('\n');

const cleaned = stripLlamaCliNoise(sample);
console.log('clean-test', JSON.stringify(cleaned));
if (!/Albert Einstein/.test(cleaned)) {
  console.error('FAIL: cleaner still drops the answer');
  process.exit(1);
}
if (/You are ARK/.test(cleaned) || /<\|im_start\|>/.test(cleaned)) {
  console.error('FAIL: cleaner kept prompt echo');
  process.exit(1);
}

const exe = path.join(os.homedir(), 'AppData/Roaming/ARK/ark-engine/bin/llama-cli.exe');
const model = path.join(os.homedir(), 'AppData/Roaming/ARK/ark-engine/models/qwen25-7b.gguf');
const imEnd = '<' + '|im_end|>';
const prompt = [
  '<|im_start|>user',
  'Answer in one short sentence. Who is Albert Einstein?',
  imEnd,
  '<|im_start|>assistant',
  '',
].join('\n');
const promptFile = path.join(os.tmpdir(), `ark-gguf-selftest-${Date.now()}.txt`);
fs.writeFileSync(promptFile, prompt, 'utf8');

const t0 = Date.now();
const child = spawn(exe, [
  '-m', model,
  '-f', promptFile,
  '-n', '80',
  '-c', '2048',
  '--temp', '0.2',
  '--no-conversation',
  '--single-turn',
  '--no-display-prompt',
  '--simple-io',
], { windowsHide: true });
let out = '';
child.stdout.on('data', (d) => { out += d.toString(); });
child.on('close', (code) => {
  try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
  const reply = stripLlamaCliNoise(out);
  console.log(JSON.stringify({
    ms: Date.now() - t0,
    code,
    outLen: out.length,
    reply,
  }, null, 2));
  if (!reply || !/Einstein/i.test(reply)) {
    console.error('FAIL: live llama-cli did not yield an Einstein answer');
    process.exit(1);
  }
});
child.stdin.end();
