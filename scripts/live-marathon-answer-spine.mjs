/**
 * Marathon live CDP tests for Answer Contract + Plan flowchart UI.
 * Requires Open-NOVA-Build.bat (CDP 9229). Fresh chat per scenario.
 *
 *   node scripts/live-marathon-answer-spine.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const OUT = path.join(__dirname, '_marathon-results.json');

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connectPage() {
  const list = await getJson(`http://127.0.0.1:${PORT}/json`);
  const page = (list || []).find((t) => t.type === 'page' && /NOVA/i.test(t.title || ''))
    || (list || []).find((t) => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No NOVA CDP page on ' + PORT);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  let nextId = 1;
  const pending = new Map();
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res?.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || JSON.stringify(res.exceptionDetails));
    }
    return res?.result?.value;
  };
  return { ws, send, evaluate };
}

async function waitForIdle(evaluate, { timeoutMs = 180_000, quietMs = 4000 } = {}) {
  const start = Date.now();
  let lastLen = -1;
  let stableSince = Date.now();
  const baseline = await evaluate(`(document.body?.innerText || '').length`);
  while (Date.now() - start < timeoutMs) {
    const snap = await evaluate(`(() => {
      const gen = document.body?.innerText || '';
      const stop = [...document.querySelectorAll('button')].some(b => /stop/i.test(b.getAttribute('aria-label') || b.textContent || ''));
      const busyText = /Researching…|Reviewing sources|Reading your message|Thinking…|Creating folder|Writing project|Crafting|Plan · deepening/i.test(gen.slice(-1200));
      return { len: gen.length, stop, busyText, tail: gen.slice(-900) };
    })()`);
    if (snap.len !== lastLen) {
      lastLen = snap.len;
      stableSince = Date.now();
    }
    const grew = snap.len >= baseline + 30;
    const quiet = Date.now() - stableSince >= quietMs;
    if (grew && quiet && !snap.stop && !snap.busyText) return snap;
    await sleep(900);
  }
  const tail = await evaluate(`(document.body?.innerText || '').slice(-1000)`);
  return { timeout: true, tail, len: (tail || '').length };
}

async function newChat(evaluate) {
  return evaluate(`(() => {
    // Prefer dedicated new-chat controls in the shell.
    const btns = [...document.querySelectorAll('button,[role="button"],a')];
    const hit = btns.find(b => {
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      const t = (b.textContent || '').trim().toLowerCase();
      const title = (b.getAttribute('title') || '').toLowerCase();
      return a.includes('new chat') || title.includes('new chat') || t === 'new chat'
        || a.includes('new thread') || a === 'new';
    });
    if (hit) { hit.click(); return { ok: true, via: 'button' }; }
    // Pencil / square-pen icons often mean new chat in the left rail
    const iconBtn = btns.find(b => {
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      return a.includes('compose') || a.includes('write') || a.includes('pencil') || a.includes('edit square');
    });
    if (iconBtn) { iconBtn.click(); return { ok: true, via: 'icon' }; }
    // Hard clear: navigate hash to chat and wipe message list via React-friendly event
    try {
      window.dispatchEvent(new CustomEvent('NOVA:new-chat'));
      return { ok: true, via: 'event' };
    } catch (_) {}
    return { ok: false };
  })()`);
}

async function bindFolder(evaluate, folderPath) {
  const payload = JSON.stringify(folderPath);
  return evaluate(`(async () => {
    const p = ${payload};
    try {
      if (window.novaDesktop?.projectsOpen) {
        const r = await window.novaDesktop.projectsOpen(p);
        return { ok: true, via: 'projectsOpen', r };
      }
      if (window.novaDesktop?.setStudioRoot) {
        await window.novaDesktop.setStudioRoot(p);
        return { ok: true, via: 'setStudioRoot' };
      }
      window.dispatchEvent(new CustomEvent('NOVA:bind-folder', { detail: { path: p } }));
      return { ok: true, via: 'event' };
    } catch (e) {
      return { ok: false, err: String(e && e.message || e) };
    }
  })()`);
}

async function armPlanMode(evaluate) {
  return evaluate(`(() => {
    const plus = [...document.querySelectorAll('button')].find(b => {
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      return a === '+' || a.includes('plus') || a.includes('more') || (b.textContent || '').trim() === '+';
    });
    if (plus) plus.click();
    return new Promise((resolve) => {
      setTimeout(() => {
        const plan = [...document.querySelectorAll('button,[role="menuitem"]')].find(b =>
          /\\bplan\\b/i.test(b.textContent || '') || /plan/i.test(b.getAttribute('aria-label') || '')
        );
        if (plan) { plan.click(); resolve({ ok: true }); }
        else resolve({ ok: false, reason: 'no plan item' });
      }, 350);
    });
  })()`);
}

async function sendChat(evaluate, text) {
  const before = await evaluate(`(document.body?.innerText || '').length`);
  const payload = JSON.stringify(text);
  const ok = await evaluate(`(() => {
    const ta = document.querySelector('textarea[aria-label*="Message"], textarea');
    if (!ta) return { ok: false, reason: 'no textarea' };
    const text = ${payload};
    const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    ta.focus();
    desc.set.call(ta, text);
    ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    const sendBtn = [...document.querySelectorAll('button')].find(b => {
      const t = (b.getAttribute('aria-label') || '').toLowerCase();
      return t.includes('send');
    });
    if (sendBtn) { sendBtn.click(); return { ok: true, via: 'button' }; }
    ta.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
    }));
    return { ok: true, via: 'enter' };
  })()`);
  if (!ok?.ok) throw new Error('send failed: ' + (ok?.reason || 'unknown'));
  const start = Date.now();
  while (Date.now() - start < 12000) {
    const now = await evaluate(`({
      len: (document.body?.innerText || '').length,
      ta: document.querySelector('textarea')?.value || '',
    })`);
    if (!now.ta || now.len > before + 15) return ok;
    await sleep(350);
  }
  return ok;
}

async function snapReply(evaluate) {
  return evaluate(`(() => {
    // Prefer the last assistant message bubble only (avoid DOM leftovers from prior chats).
    const bubbles = [...document.querySelectorAll('[class*="animate-fade-in"]')];
    const last = bubbles[bubbles.length - 1];
    const scope = last || document.body;
    const body = scope?.innerText || '';
    const full = document.body?.innerText || '';
    const planFlow = !!document.querySelector('.nova-plan-flow, [aria-label^="Plan:"]');
    const planNodes = document.querySelectorAll('.nova-plan-flow button').length;
    const links = [...scope.querySelectorAll('a[href^="http"]')].slice(-12).map(a => ({
      text: (a.textContent || '').trim().slice(0, 80),
      href: a.href,
    }));
    const imgs = scope.querySelectorAll('img').length;
    const badBooks = /city of ashes|mortal instruments|very big books|american film institute/i.test(body);
    const clinicBleed = /repair all|debug clinic|#\\d+\\s+(critical|high)/i.test(body);
    const githubBad = /GitHub · error Bad credentials/i.test(body);
    return {
      len: full.length,
      tail: body.slice(-2200),
      planFlow: planFlow && /plan|step|tideboard|lantern|open questions/i.test(body),
      planNodes,
      links,
      imgs,
      badBooks,
      clinicBleed,
      githubBad,
    };
  })()`);
}

function scoreScenario(sc, snap, elapsedMs) {
  const reasons = [];
  let score = 100;
  const tail = String(snap?.tail || '');
  if (snap?.timeout) { score -= 40; reasons.push('timeout'); }
  if (sc.expectOnTopic) {
    const hit = sc.expectOnTopic.some((re) => re.test(tail));
    if (!hit) { score -= 25; reasons.push('off-topic'); }
  }
  if (sc.forbid) {
    for (const re of sc.forbid) {
      if (re.test(tail)) { score -= 20; reasons.push('forbid:' + re.source.slice(0, 40)); }
    }
  }
  if (sc.expectMinChars && tail.length < sc.expectMinChars) {
    score -= 15; reasons.push('thin-reply');
  }
  if (sc.expectPlanUi) {
    if (!snap.planFlow) { score -= 30; reasons.push('no-plan-flow-ui'); }
    if ((snap.planNodes || 0) < 3) { score -= 10; reasons.push('few-plan-nodes'); }
  }
  if (sc.expectNoBadBooks && snap.badBooks) { score -= 35; reasons.push('book-link-hijack'); }
  if (sc.expectNoStoreLinks && (snap.links || []).some((l) => /amazon|goodreads|barnes/i.test(l.href || ''))) {
    score -= 25; reasons.push('store-links');
  }
  if (snap.clinicBleed && sc.kind === 'overview') { score -= 25; reasons.push('clinic-bleed'); }
  if (snap.githubBad && sc.kind === 'overview') { score -= 35; reasons.push('github-hijack'); }
  if (elapsedMs > 90_000 && sc.kind !== 'create') { score -= 8; reasons.push('slow'); }
  if (elapsedMs > 150_000 && sc.kind !== 'create') { score -= 12; reasons.push('very-slow'); }
  if (elapsedMs > 360_000 && sc.kind === 'create') { score -= 10; reasons.push('create-timeout-ish'); }
  score = Math.max(0, Math.min(100, score));
  return { score, reasons, elapsedMs };
}

const SCENARIOS = [
  {
    id: 'chat-keyboard',
    kind: 'chat',
    ask: 'Explain how a mechanical keyboard works — switches, matrix scanning, and debounce — in clear detail for a curious beginner.',
    expectOnTopic: [/switch|matrix|debounce|key/i],
    expectMinChars: 280,
    forbid: [/city of ashes|debug clinic|repair all/i],
  },
  {
    id: 'chat-camera',
    kind: 'chat',
    ask: 'How does a digital camera sensor turn light into an image? Cover lens, aperture, shutter, Bayer filter, and processing pipeline.',
    expectOnTopic: [/sensor|aperture|shutter|bayer|pixel/i],
    expectMinChars: 280,
    forbid: [/city of ashes|github · error/i],
  },
  {
    id: 'chat-math',
    kind: 'chat',
    ask: 'Solve step by step: If f(x) = 3x^2 - 2x + 5, find f\'(x) and then evaluate f\'(4). Show the work.',
    expectOnTopic: [/f'|derivative|22|3x|6x/i],
    expectMinChars: 80,
    forbid: [/city of ashes|repair all/i],
  },
  {
    id: 'chat-book',
    kind: 'chat',
    ask: 'Let\'s talk about The Name of the Wind by Patrick Rothfuss — what makes Kvothe\'s storytelling style interesting? Stay on this book; no shopping links.',
    expectOnTopic: [/kvothe|rothfuss|name of the wind|story/i],
    expectMinChars: 200,
    forbid: [/city of ashes|amazon\.com|goodreads\.com|debug clinic|overall:\s*keep the first version tiny/i],
    expectNoBadBooks: true,
    expectNoStoreLinks: true,
  },
  {
    id: 'chat-business',
    kind: 'chat',
    ask: 'How should a solo founder validate a niche SaaS idea in 30 days with almost no budget? Give a concrete week-by-week plan.',
    expectOnTopic: [/week|validate|customer|saas|interview/i],
    expectMinChars: 320,
    forbid: [/city of ashes|repair all|overall:\s*keep the first version tiny/i],
  },
  {
    id: 'chat-construction',
    kind: 'chat',
    ask: 'Explain how to frame a basic interior non-load-bearing wall: studs, plates, spacing, and where electrical boxes usually go. Safety notes included.',
    expectOnTopic: [/stud|plate|16|electrical|wall/i],
    expectMinChars: 280,
    forbid: [/city of ashes|overall:\s*keep the first version tiny/i],
  },
  {
    id: 'chat-monitor',
    kind: 'chat',
    ask: 'How is an LCD computer monitor built and how does it display color? Cover backlight, liquid crystal, polarizers, and subpixels.',
    expectOnTopic: [/lcd|backlight|polar|subpixel|liquid/i],
    expectMinChars: 250,
    forbid: [/city of ashes|github · error/i],
  },
  {
    id: 'plan-tideboard',
    kind: 'plan',
    armPlan: true,
    ask: 'Plan a small Vite React web app called Tideboard — a calm surf forecast board with a map strip and three spot cards. Do not create files yet; outline steps and open questions.',
    expectOnTopic: [/tideboard|surf|spot|vite|react|step/i],
    expectMinChars: 120,
    expectPlanUi: true,
    forbid: [/@@@FILE|```html/i],
  },
  {
    id: 'plan-lantern',
    kind: 'plan',
    armPlan: true,
    ask: 'Plan Lantern Ledger: a tiny personal expense tracker (Vite + React) with monthly total, category chips, and a dark quiet UI. Planning only — no disk writes.',
    expectOnTopic: [/lantern|expense|categor|vite|react/i],
    expectMinChars: 120,
    expectPlanUi: true,
    forbid: [/@@@FILE/i],
  },
  {
    id: 'bind-overview',
    kind: 'overview',
    bindPath: 'C:\\Users\\thoma\\Desktop\\Projects\\NovaClinicGym',
    ask: 'Can you give me more information about this project',
    expectOnTopic: [/project|folder|clinic|vite|react|app|files/i],
    expectMinChars: 80,
    forbid: [/city of ashes|american film|github · error|bad credentials/i],
    expectNoBadBooks: true,
  },
  {
    id: 'bind-full-report',
    kind: 'overview',
    bindPath: 'C:\\Users\\thoma\\Desktop\\Projects\\NovaClinicGym',
    ask: 'Give me a full report on this project',
    expectOnTopic: [/project|folder|clinic|vite|react|source|files/i],
    expectMinChars: 80,
    forbid: [/city of ashes|github · error|bad credentials|american film institute/i],
    expectNoBadBooks: true,
  },
  {
    id: 'create-bristle',
    kind: 'create',
    ask: 'Create a brand new Vite React project called Bristle Board — a tiny habit checklist with three habits and a dark calm UI. Build files on disk I can open in Live.',
    expectOnTopic: [/bristle|habit|vite|react|created|project|done|files/i],
    expectMinChars: 40,
    forbid: [/city of ashes|bad credentials/i],
  },
];

async function waitForCdp(maxMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const list = await getJson(`http://127.0.0.1:${PORT}/json`);
      if (Array.isArray(list) && list.some((t) => t.type === 'page')) return true;
    } catch { /* retry */ }
    await sleep(2000);
  }
  return false;
}

async function main() {
  console.log('Waiting for NOVA CDP on', PORT, '…');
  if (!(await waitForCdp())) {
    console.error('CDP not available. Start Open-NOVA-Build.bat first.');
    process.exit(2);
  }
  const { evaluate, send, ws } = await connectPage();
  await send('Runtime.enable');
  await send('Page.bringToFront').catch(() => undefined);
  await sleep(1500);

  const results = [];
  for (const sc of SCENARIOS) {
    console.log('\n===', sc.id, '===');
    try {
      await newChat(evaluate);
      await sleep(800);
      if (sc.bindPath) {
        const bound = await bindFolder(evaluate, sc.bindPath);
        console.log('bind', bound);
        await sleep(1200);
      }
      if (sc.armPlan) {
        const armed = await armPlanMode(evaluate);
        console.log('armPlan', armed);
        await sleep(500);
      }
      const t0 = Date.now();
      await sendChat(evaluate, sc.ask);
      const idle = await waitForIdle(evaluate, {
        timeoutMs: sc.kind === 'plan' || sc.kind === 'create' ? 300_000 : 160_000,
      });
      const elapsedMs = Date.now() - t0;
      const snap = { ...await snapReply(evaluate), timeout: Boolean(idle?.timeout) };
      const scored = scoreScenario(sc, snap, elapsedMs);
      const row = {
        id: sc.id,
        kind: sc.kind,
        ask: sc.ask,
        ...scored,
        planFlow: snap.planFlow,
        planNodes: snap.planNodes,
        linkCount: (snap.links || []).length,
        links: snap.links,
        githubBad: snap.githubBad,
        badBooks: snap.badBooks,
        clinicBleed: snap.clinicBleed,
        tail: String(snap.tail || '').slice(-700),
      };
      results.push(row);
      console.log(JSON.stringify({
        id: row.id,
        score: row.score,
        reasons: row.reasons,
        elapsedMs: row.elapsedMs,
        planFlow: row.planFlow,
        links: row.linkCount,
      }));
    } catch (err) {
      results.push({
        id: sc.id,
        kind: sc.kind,
        ask: sc.ask,
        score: 0,
        reasons: ['exception:' + String(err?.message || err).slice(0, 160)],
        elapsedMs: 0,
      });
      console.error('ERR', sc.id, err?.message || err);
    }
    await sleep(1200);
  }

  const avg = results.length
    ? Math.round(results.reduce((s, r) => s + (r.score || 0), 0) / results.length)
    : 0;
  const payload = {
    at: new Date().toISOString(),
    port: PORT,
    averageScore: avg,
    results,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
  console.log('\n=== AVERAGE', avg, '% ===');
  console.log('Wrote', OUT);
  ws.close();
  process.exit(avg >= 92 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
