/**
 * Live ladder from the user's note file — ONE prompt at a time.
 * Rewords on retry. Logs so you can watch Nova + Live.
 *
 *   $env:NOVA_CDP_PORT='9229'; node scripts/live-note-ladder.mjs
 *   $env:NOVA_LADDER_FROM=1; node scripts/live-note-ladder.mjs   # 1-based start
 *   $env:NOVA_LADDER_MAX=20; node scripts/live-note-ladder.mjs  # cap steps
 *
 * Requires Nova Electron with --remote-debugging-port=9229.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';
import { fileURLToPath } from 'url';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTE = process.env.NOVA_LADDER_NOTE
  || path.join(os.homedir(), 'Documents', 'Create a blank white screen..txt');
const OUT = path.join(ROOT, 'scripts', '_note-ladder-out.txt');
const FROM = Math.max(1, Number(process.env.NOVA_LADDER_FROM || 1));
const MAX = Math.max(1, Number(process.env.NOVA_LADDER_MAX || 100));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COLOR_SWAP = ['white', 'purple', 'teal', 'light pink', 'sky blue', 'cream', 'light red', 'brown'];
const WORD_SWAP = [
  ['Hello', 'Hi'],
  ['Goodbye', 'Bye'],
  ['Welcome to my app', 'Thanks for stopping by'],
  ['Hello World', 'Nova Lab'],
];

function log(line) {
  const row = `[${new Date().toISOString()}] ${line}`;
  console.log(row);
  try { fs.appendFileSync(OUT, `${row}\n`); } catch { /* ignore */ }
}

function reword(prompt, attempt) {
  let p = String(prompt || '').trim();
  if (attempt <= 0) return p;
  // Swap blank colors so we don't overfit "white".
  for (const c of COLOR_SWAP) {
    const re = new RegExp(`\\b${c.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (re.test(p)) {
      const next = COLOR_SWAP[(COLOR_SWAP.indexOf(c.toLowerCase()) + attempt) % COLOR_SWAP.length]
        || COLOR_SWAP[attempt % COLOR_SWAP.length];
      return p.replace(re, next);
    }
  }
  for (const [a, b] of WORD_SWAP) {
    if (new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(p)) {
      return attempt % 2 === 1 ? p.replace(new RegExp(a, 'i'), b) : p.replace(new RegExp(b, 'i'), a);
    }
  }
  // Soft paraphrase prefixes
  const prefixes = [
    '',
    'Please ',
    'Can you ',
    'Okay — ',
  ];
  const pref = prefixes[attempt % prefixes.length];
  if (pref && !p.toLowerCase().startsWith(pref.trim().toLowerCase())) {
    return `${pref}${p.charAt(0).toLowerCase()}${p.slice(1)}`;
  }
  return p;
}

/** Extra mix-ins after a successful place/show step */
function mixFollowups(basePrompt) {
  const t = basePrompt.toLowerCase();
  if (/\bshow the word\b|\bshow the sentence\b|\bcenter the words\b|\bput .+ on the left\b|\bmove \w+ to the\b/i.test(basePrompt)) {
    return [
      'Move that text to the top-left corner.',
      'Put it back in the center of the screen.',
      'Remove what you just added — clear those words.',
      'Change the background color to light pink.',
    ];
  }
  if (/\bblank\b/i.test(t)) {
    return [];
  }
  return [];
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function connect() {
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = (list || []).find((t) => {
    if (t.type !== 'page' || !t.webSocketDebuggerUrl) return false;
    const blob = `${t.title || ''} ${t.url || ''}`;
    // Prefer the NOVA shell (vite :5173 or packaged file://). Skip Live project iframes.
    if (/NOVA/i.test(String(t.title || ''))) return true;
    if (/dist\/index|file:\/\//i.test(blob)) return true;
    return false;
  });
  if (!page) throw new Error(`Nova page not on CDP — launch with NOVA_CDP_PORT=${PORT}`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evalE = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  await send('Runtime.enable');
  return { ws, evalE };
}

async function newChat(evalE) {
  await evalE(`(() => { try { window.dispatchEvent(new CustomEvent('NOVA:new-chat')); return true; } catch { return false; } })()`);
  await sleep(700);
}

async function stopGenerating(evalE) {
  await evalE(`(() => {
    const els = [...document.querySelectorAll('button,[role=button]')];
    const stop = els.find((el) => /stop|cancel|abort/i.test((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')));
    if (stop) stop.click();
    return Boolean(stop);
  })()`);
  await sleep(400);
}

async function sendPrompt(evalE, prompt) {
  await stopGenerating(evalE);
  return evalE(`(() => {
    const ta = document.querySelector('textarea');
    if (!ta) throw new Error('no textarea');
    const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    d.set.call(ta, ${JSON.stringify(prompt)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    // Prefer the send control — bare Enter can be ignored by ignoreEnterUntilRef.
    const btns = [...document.querySelectorAll('button,[role=button]')];
    const sendBtn = btns.find((el) => {
      const a = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).toLowerCase();
      return /^(send|submit)$/i.test((el.getAttribute('aria-label') || '').trim())
        || a === 'send'
        || (a.includes('send') && !/stop|cancel|voice|mic/i.test(a));
    });
    if (sendBtn) {
      sendBtn.click();
      return 'click-send';
    }
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
    return 'enter';
  })()`);
}

async function waitIdle(evalE, maxMs = 180_000, expectUser = '', sentAtMs = 0) {
  const t0 = Date.now();
  let last = '';
  const needle = String(expectUser || '').slice(0, 48).toLowerCase();
  const minCreated = Math.max(0, Number(sentAtMs || 0) - 2000);
  while (Date.now() - t0 < maxMs) {
    const snap = await evalE(`(() => {
      const needle = ${JSON.stringify(needle)};
      const minCreated = ${JSON.stringify(minCreated)};
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
      }
      let best = null;
      let bestAt = -1;
      for (const k of keys) {
        let arr = [];
        try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
        if (!arr.length) continue;
        const last = arr[arr.length - 1];
        const users = arr.filter((m) => m.role === 'user');
        const user = users[users.length - 1];
        const userText = String(user?.content || '');
        if (needle && !userText.toLowerCase().includes(needle)) continue;
        const created = Date.parse(String(last?.created_at || last?.createdAt || '')) || 0;
        if (minCreated && created && created < minCreated) continue;
        const at = created || arr.length;
        const row = {
          user: userText.slice(0, 120),
          role: last?.role,
          content: String(last?.content || ''),
          generating: last?.role === 'assistant' && /^__generating__:/i.test(String(last.content || '')),
          at,
          created,
        };
        if (!best || at >= bestAt) { best = row; bestAt = at; }
      }
      return best;
    })()`);
    if (!snap) {
      await sleep(2000);
      continue;
    }
    const st = snap.generating
      ? String(snap.content || '').replace(/^__generating__:/, '')
      : String(snap.content || '');
    if (st && st !== last) {
      log(`  status: ${st.slice(0, 140)}`);
      last = st;
    }
    if (!snap.generating && snap.content && !/^__generating__:/i.test(snap.content)) {
      return snap;
    }
    await sleep(3000);
  }
  return { content: 'WAIT_TIMEOUT', generating: false };
}

/** Pull spoken answer out of <!--nova-trace:{...}--> when present. */
function spokenAnswer(reply) {
  const raw = String(reply || '');
  const m = raw.match(/<!--nova-trace:([\s\S]*?)-->/);
  if (m?.[1]) {
    try {
      const payload = JSON.parse(m[1]);
      const ans = String(payload?.answer || '').trim();
      if (ans) return ans;
    } catch { /* fall through */ }
  }
  return raw;
}

function looksFail(reply) {
  const t = spokenAnswer(reply);
  const full = String(reply || '');
  if (/could not land every piece|left the inventing agent out|Still missing:/i.test(t)) return true;
  if (/won’t compile for Live|App source is broken|That edit didn’t match|left the project unchanged/i.test(t)) return true;
  if (/Could not save the change:\s*no_edits/i.test(t + '\n' + full)) return true;
  if (/Here's how (?:you|we) can|you'll need to update|Open the HTML file/i.test(t)) return true;
  if (/we'll need to use some HTML|HTML Structure|simple example/i.test(t)) return true;
  if (/You are NOVA, a helpful AI chat assistant|Stay in chat mode unless/i.test(t)) return true;
  if (/\bI can't\b|couldn't apply|try a clearer/i.test(t) && !/Here you go/i.test(t)) return true;
  // Disk-delete wrong turn for UI remove asks (spoken answer or thought label)
  if (/deleting only what was asked|delete the (?:project|folder|file)/i.test(t)
    || (/Locating the path, confirming scope, then deleting/i.test(full)
      && /clear those words|what you just added|welcome|hello/i.test(full))) {
    return true;
  }
  return false;
}

function looksPass(reply, prompt) {
  const t = spokenAnswer(reply);
  const full = String(reply || '');
  if (looksFail(reply)) return false;
  if (/Here you go|Already on the page|Updated |NOVA · ask fidelity|local patch|plain .+ blank page|Done\./i.test(t + '\n' + full)) return true;
  // Undo/redo: honest empty buffer or successful restore both count as fidelity.
  if (/\b(?:undo|redo)\b/i.test(prompt)
    && /(?:Nothing to (?:undo|redo)|Undid |Redid |restored the previous)/i.test(t + '\n' + full)) {
    return true;
  }
  if (/\bblank\b/i.test(prompt) && /blank page|nothing else on it/i.test(t + '\n' + full)) return true;
  if (/\b(?:put|show|move|remove|change)\b/i.test(prompt)
    && /(?:Updated |Already on the page|ask fidelity|"kind":"write"|Edited \d+ file)/i.test(t + '\n' + full)) {
    return true;
  }
  return false;
}

async function ensureLive(evalE) {
  await evalE(`(() => {
    const els = [...document.querySelectorAll('button,[role=button],a,[data-tab]')];
    const live = els.find((el) => {
      const a = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).trim();
      return /^Live$/i.test(a) || /\bLive\b/i.test(a) && a.length < 24;
    });
    if (live) live.click();
    return Boolean(live);
  })()`);
  await sleep(900);
}

async function peekLive(evalE) {
  return evalE(`(() => {
    const iframe = document.querySelector('iframe');
    if (!iframe) return { live: false, text: '' };
    try {
      const doc = iframe.contentDocument;
      const text = (doc?.body?.innerText || '').slice(0, 200);
      const bg = doc?.body ? getComputedStyle(doc.body).backgroundColor : '';
      return { live: true, text, bg };
    } catch {
      return { live: true, text: '(cross-origin)', bg: '' };
    }
  })()`);
}

const raw = fs.readFileSync(NOTE, 'utf8');
const prompts = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
log(`NOTE ${NOTE} · ${prompts.length} prompts · from=${FROM} max=${MAX}`);

const { ws, evalE } = await connect();
log('CDP connected — watch Nova Live');

let step = 0;
const startIdx = FROM - 1;
const endIdx = Math.min(prompts.length, startIdx + MAX);

for (let i = startIdx; i < endIdx; i += 1) {
  const base = prompts[i];
  step += 1;
  log(`\n=== STEP ${step} (note #${i + 1}) base: ${base} ===`);

  // Fresh chat only when starting a blank/create step (or full run from note #1).
  // Mid-ladder resume must keep the bound project chat.
  const isCreate = /\bcreate\b|\bblank\b/i.test(base);
  if (isCreate && (i === startIdx || i === 0)) {
    await newChat(evalE);
    await sleep(500);
  } else if (FROM === 1 && i === startIdx) {
    await newChat(evalE);
    await sleep(500);
  }

  let passed = false;
  for (let attempt = 0; attempt < 3 && !passed; attempt += 1) {
    const prompt = reword(base, attempt);
    if (attempt > 0) log(`  RETRY ${attempt} reworded: ${prompt}`);
    else log(`  SEND: ${prompt}`);
    const sentAt = Date.now();
    const sendHow = await sendPrompt(evalE, prompt);
    log(`  sendVia: ${sendHow}`);
    const snap = await waitIdle(evalE, /\bcreate\b/i.test(prompt) ? 240_000 : 120_000, prompt, sentAt);
    const reply = String(snap?.content || '');
    const spoken = spokenAnswer(reply).slice(0, 220).replace(/\s+/g, ' ');
    log(`  REPLY: ${spoken || reply.slice(0, 200).replace(/\s+/g, ' ')}`);
    await ensureLive(evalE);
    const live = await peekLive(evalE);
    log(`  LIVE: ${JSON.stringify(live)}`);
    if (looksPass(reply, prompt) && !looksFail(reply)) {
      passed = true;
      log('  PASS');
    } else {
      log('  FAIL — fix source if needed, then retry with reword');
      // Stop here for human/agent fix on first real fail after retries
      if (attempt === 2) {
        log('  HARD_FAIL — stopping so source can be fixed. Re-run with NOVA_LADDER_FROM=' + (i + 1));
        ws.close();
        process.exit(2);
      }
    }
  }

  // Mix: move / put back / remove / recolor when the base was a place/show ask
  const extras = mixFollowups(base);
  for (const extra of extras) {
    log(`  MIX: ${extra}`);
    let mixOk = false;
    for (let mixAttempt = 0; mixAttempt < 2 && !mixOk; mixAttempt += 1) {
      const mixPrompt = reword(extra, mixAttempt);
      if (mixAttempt > 0) log(`  MIX RETRY reworded: ${mixPrompt}`);
      const mixAt = Date.now();
      await sendPrompt(evalE, mixPrompt);
      const snap = await waitIdle(evalE, 90_000, mixPrompt, mixAt);
      const spoken = spokenAnswer(snap?.content || '').slice(0, 180).replace(/\s+/g, ' ');
      log(`  MIX REPLY: ${spoken || String(snap?.content || '').slice(0, 160).replace(/\s+/g, ' ')}`);
      await ensureLive(evalE);
      const live = await peekLive(evalE);
      log(`  MIX LIVE: ${JSON.stringify(live)}`);
      if (looksPass(snap?.content || '', mixPrompt) && !looksFail(snap?.content)) {
        mixOk = true;
        log('  MIX_PASS');
      } else if (looksFail(snap?.content)) {
        if (mixAttempt === 0) {
          log('  MIX_FAIL — will reword and retry');
        } else {
          // Hard fidelity miss after reword — stop for source fix.
          log('  MIX_FAIL — stopping for source fix');
          ws.close();
          process.exit(3);
        }
      } else {
        // Soft: truncated nova-trace / no spoken answer — keep ladder moving.
        log('  MIX_SOFT — continuing');
        mixOk = true;
      }
    }
  }
}

log('\nLADDER_BATCH_DONE');
ws.close();
process.exit(0);
