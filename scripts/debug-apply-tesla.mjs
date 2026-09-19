import fs from 'fs';
import { applyChatReplyEdits } from '../src/lib/chatAgentApply.ts';
import { finalizeWebEdits } from '../src/lib/webProjectCanon.ts';

const root = 'C:/Users/thoma/Documents/ARK/Projects/word-lab-zxju';
const files = {
  'src/App.tsx': fs.readFileSync(`${root}/src/App.tsx`, 'utf8'),
  'src/App.css': fs.readFileSync(`${root}/src/App.css`, 'utf8'),
};
const rawUser = 'Change the name to Tesla';
console.log('finalize alone', finalizeWebEdits(files, rawUser, []).map((e) => e.path));

const memOnly = await applyChatReplyEdits({
  reply: '',
  projectId: null,
  projectName: 'word-lab-zxju',
  files,
  userMessage: rawUser,
  diskRoot: null,
});
console.log('memOnly', { ok: memOnly.ok, updated: memOnly.updated, error: memOnly.error, label: (memOnly.files['src/App.tsx'] || '').match(/center-word[^>]*>([^<]+)/)?.[1] });

const withDisk = await applyChatReplyEdits({
  reply: '',
  projectId: null,
  projectName: 'word-lab-zxju',
  files,
  userMessage: rawUser,
  diskRoot: root,
});
console.log('withDisk', { ok: withDisk.ok, updated: withDisk.updated, error: withDisk.error, label: (withDisk.files['src/App.tsx'] || '').match(/center-word[^>]*>([^<]+)/)?.[1] });
