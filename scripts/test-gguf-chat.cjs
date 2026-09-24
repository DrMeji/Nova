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
          if (name === 'userData') return path.join(os.homedir(), 'AppData/Roaming/NOVA');
          return os.tmpdir();
        },
      },
    };
  }
  return origLoad(request, parent, isMain);
};

const { stripLlamaCliNoise, ensureLlamaBinary, findLlamaBinary } = require('../electron/novaGguf.cjs');

const sample = [
  'available commands',
  '  /exit or Ctrl+C     stop or exit',
  '',
  '> <|im_start|>user',
  'You are NOVA, the assistant in the NOVA desktop creation studio',
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
if (/You are NOVA/.test(cleaned) || /<\|im_start\|>/.test(cleaned)) {
  console.error('FAIL: cleaner kept prompt echo');
  process.exit(1);
}

(async () => {
  // CI runs on Linux; the llama binary is not named `llama-cli.exe` there.
  await ensureLlamaBinary();
  const exe = findLlamaBinary();
  if (!exe) throw new Error('llama-cli binary not found after ensureLlamaBinary()');

  const model = path.join(os.homedir(), 'AppData/Roaming/NOVA/nova-engine/models/qwen25-7b.gguf');
  if (!fs.existsSync(model)) {
    console.log(JSON.stringify({
      skip: true,
      reason: 'gguf missing (smoke test)',
      model,
    }, null, 2));
    process.exit(0);
  }
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
})().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
