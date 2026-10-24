import fs from 'node:fs';

const file = 'src/views/aichat/aiChatSendPreamble.ts';
const source = fs.readFileSync(file, 'utf8');
const next = source.replace(/\bany\b/g, 'unknown');
fs.writeFileSync(file, next);
console.log(`Replaced ${((source.match(/\bany\b/g) || []).length)} explicit any types with unknown.`);
