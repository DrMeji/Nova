/**
 * ARK media generation — local SD when installed, free hosts, real MP4 fallbacks.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const arkSd = require('./arkSd.cjs');
const arkFfmpeg = require('./arkFfmpeg.cjs');

function mediaDir() {
  const dir = path.join(app.getPath('userData'), 'ark-engine', 'media');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function hashPrompt(text) {
  let h = 2166136261;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function palette(seed) {
  const h = seed % 360;
  return {
    a: `hsl(${h} 70% 45%)`,
    b: `hsl(${(h + 40) % 360} 65% 35%)`,
    c: `hsl(${(h + 200) % 360} 55% 20%)`,
    ink: '#e8eefc',
    mute: '#9fb0cc',
  };
}

function buildFallbackSvg(prompt, modelName, kind) {
  const seed = hashPrompt(prompt);
  const p = palette(seed);
  const title = escapeXml((prompt || 'ARK media').slice(0, 72));
  const model = escapeXml(modelName || 'ARK Engine');
  if (kind === 'video') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="768" height="432" viewBox="0 0 768 432">
  <defs><linearGradient id="vbg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${p.c}"/><stop offset="100%" stop-color="${p.a}"/>
  </linearGradient></defs>
  <rect width="768" height="432" fill="url(#vbg)"/>
  <circle cx="384" cy="200" r="70" fill="${p.a}" opacity="0.7">
    <animate attributeName="r" values="55;85;55" dur="2.4s" repeatCount="indefinite"/>
  </circle>
  <polygon points="360,190 360,250 415,220" fill="${p.ink}" opacity="0.9"/>
  <text x="48" y="78" fill="${p.ink}" font-family="Segoe UI,sans-serif" font-size="24" font-weight="600">${title}</text>
  <text x="48" y="108" fill="${p.mute}" font-family="Segoe UI,sans-serif" font-size="13">${model} · fallback preview</text>
</svg>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="768" height="512" viewBox="0 0 768 512">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${p.c}"/><stop offset="100%" stop-color="${p.a}"/>
  </linearGradient></defs>
  <rect width="768" height="512" fill="url(#bg)"/>
  <text x="56" y="92" fill="${p.ink}" font-family="Segoe UI,sans-serif" font-size="28" font-weight="600">${title}</text>
  <text x="56" y="128" fill="${p.mute}" font-family="Segoe UI,sans-serif" font-size="14">${model} · offline fallback</text>
</svg>`;
}

function toDataUrl(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function fileToDataUrl(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  if (ext === 'svg') return toDataUrl(buf.toString('utf8'));
  const mime =
    ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
        : ext === 'gif' ? 'image/gif'
          : ext === 'mp4' ? 'video/mp4'
            : ext === 'webm' ? 'video/webm'
              : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** Poll one free image URL via Node https (more reliable than undici in Electron). */
async function fetchImageUrl(url, timeoutMs = 45_000) {
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');
  const fetchOnce = (target, redirectsLeft = 6) => new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    try {
      const parsed = new URL(target);
      const lib = parsed.protocol === 'http:' ? http : https;
      const req = lib.get(
        target,
        {
          headers: {
            'User-Agent': 'ARK-Desktop/0.3',
            Referer: 'https://pollinations.ai/',
            Accept: 'image/jpeg,image/png,image/*,*/*',
          },
          timeout: timeoutMs,
        },
        (res) => {
          const status = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirectsLeft > 0) {
            res.resume();
            const next = new URL(res.headers.location, target).toString();
            fetchOnce(next, redirectsLeft - 1).then(done);
            return;
          }
          if (status === 429) {
            res.resume();
            done({ error: 429 });
            return;
          }
          if (status < 200 || status >= 300) {
            res.resume();
            done({ error: status });
            return;
          }
          const ctype = String(res.headers['content-type'] || '');
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            if (buf.length < 2500) {
              done(null);
              return;
            }
            // Accept image/* or opaque octet-stream bodies that sniff as images.
            const sniff = sniffImageExt(buf);
            if (!ctype.includes('image') && !ctype.includes('octet-stream') && sniff === 'jpg' && buf[0] !== 0xff) {
              done({ error: 415 });
              return;
            }
            const ext = ctype.includes('png') || sniff === 'png'
              ? 'png'
              : ctype.includes('webp') || sniff === 'webp'
                ? 'webp'
                : 'jpg';
            done({ buf, ext });
          });
          res.on('error', () => done(null));
        },
      );
      req.on('timeout', () => {
        try { req.destroy(); } catch { /* ignore */ }
        done(null);
      });
      req.on('error', () => done(null));
    } catch {
      done(null);
    }
  });
  return fetchOnce(url);
}

/** Tiny stubs / error JPEGs are usually under ~12KB; real Flux gens are larger. */
const IMAGE_MIN_BYTES = 12_000;
/** Prefer waiting for a real Flux frame (~20–90s) before falling through. */
const IMAGE_TOTAL_BUDGET_MS = 120_000;
/**
 * Only reject near-instant tiny bodies (true CDN cache stubs) AND soft fast frames.
 * Real Flux at 1536² is rarely under ~8s / ~45KB on free hosts.
 */
const IMAGE_QUALITY_FAST_MS = 8_000;
const IMAGE_QUALITY_MIN_BYTES = 45_000;
const IMAGE_CACHE_HARD_MS = 1_200;
const IMAGE_CACHE_MAX_BYTES = 18_000;

function freshImageSeed(prompt) {
  const a = hashPrompt(`${prompt}|${Date.now()}|${Math.random()}`);
  const b = (Date.now() ^ (Math.floor(Math.random() * 1e9))) >>> 0;
  return (a ^ b) % 999999;
}

function bufFingerprint(buf) {
  if (!buf || !buf.length) return '0';
  // Cheap content fingerprint so identical cache bodies are skipped across seeds.
  let h = buf.length >>> 0;
  const step = Math.max(1, Math.floor(buf.length / 64));
  for (let i = 0; i < buf.length; i += step) h = (Math.imul(h, 31) + buf[i]) >>> 0;
  h = (Math.imul(h, 31) + buf[0]) >>> 0;
  h = (Math.imul(h, 31) + buf[buf.length - 1]) >>> 0;
  return `${buf.length}:${h.toString(16)}`;
}

/**
 * Pollinations Gen Sana 500s on unreleased branded devices (e.g. "iPhone 18").
 * Keep the user's title in chat; send a visual equivalent to the host.
 */
function hostSafeImagePrompt(raw) {
  let t = String(raw || '').trim();
  if (!t) return t;
  if (/\biphone\s*(1[8-9]|[2-9]\d)\b/i.test(t)) {
    t = t.replace(/\biphone\s*(1[8-9]|[2-9]\d)[^\s,]*/gi, 'next-generation titanium flagship smartphone');
  }
  // Common typo when asking for Tesla Model S Plaid
  t = t.replace(/\bplad\b/gi, 'plaid');
  return t;
}

function sourceDisplayName(source, fallback) {
  const s = String(source || '');
  if (/pollinations-flux/i.test(s)) return 'Pollinations Flux';
  if (/pollinations-zimage/i.test(s)) return 'Pollinations';
  if (/pollinations/i.test(s)) return 'Pollinations';
  if (/ai-horde/i.test(s)) return 'AI Horde';
  if (/huggingface/i.test(s)) return 'Hugging Face FLUX';
  if (/local|sd\./i.test(s)) return 'Local SD';
  return fallback || 'ARK Image Core';
}

function sniffJpegSize(buf) {
  if (!buf || buf.length < 24 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (len < 2) break;
    // SOF0 / SOF2
    if (marker === 0xc0 || marker === 0xc2) {
      const height = (buf[i + 5] << 8) | buf[i + 6];
      const width = (buf[i + 7] << 8) | buf[i + 8];
      return { width, height };
    }
    i += 2 + len;
  }
  return null;
}

function sniffPngSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function imagePixelSize(buf) {
  return sniffJpegSize(buf) || sniffPngSize(buf);
}

/** Prefer quality, but never discard the only usable frame when hosts are flaky. */
function isLowQualityHit(tookMs, bytes, buf) {
  if (!bytes || bytes < IMAGE_MIN_BYTES) return true;
  if (tookMs < IMAGE_CACHE_HARD_MS && bytes < IMAGE_CACHE_MAX_BYTES) return true;
  if (tookMs < IMAGE_QUALITY_FAST_MS && bytes < IMAGE_QUALITY_MIN_BYTES) return true;
  const dim = buf ? imagePixelSize(buf) : null;
  // Prefer ≥1024; treat tiny ≤640 frames as soft (keep 768 as usable last resort).
  if (dim && Math.min(dim.width, dim.height) < 640) return true;
  if (dim && Math.min(dim.width, dim.height) < 960 && bytes < 55_000) return true;
  return false;
}

function isUsableImageHit(hit) {
  return Boolean(hit && hit.buf && hit.buf.length >= IMAGE_MIN_BYTES);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveImageDimensions(prompt) {
  const lower = String(prompt || '').toLowerCase();
  // Stick to sizes free Flux hosts honor (multiples of 64; 1024+ class).
  if (/\b(iphone|phone wallpaper|lock screen|portrait|vertical|9:16)\b/.test(lower)) {
    return { width: 768, height: 1344 };
  }
  if (/\b(wallpaper|desktop background|desktop image|16:9|1920|1080|landscape|banner)\b/.test(lower)) {
    return { width: 1344, height: 768 };
  }
  return { width: 1024, height: 1024 };
}

/**
 * Fetch a unique Pollinations JPEG. Quality-first: skip instant soft frames.
 * Avoid retry storms — free hosts queue one request per IP and 429 after spam.
 */
async function fetchRealImage(prompt, opts = {}) {
  const visualFallback = isProductPrompt(prompt)
    ? 'titanium flagship smartphone, large display, studio product photograph, isolated on a seamless gray backdrop, centered, no hands, no people'
    : '';
  const texts = [
    hostSafeImagePrompt(prompt),
    hostSafeImagePrompt(opts.fallbackPrompt),
    visualFallback,
  ]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .filter((p, i, arr) => arr.indexOf(p) === i);
  if (!texts.length) texts.push('abstract art');

  const w = opts.width || 1024;
  const h = opts.height || 1024;
  const started = Date.now();
  // Flux only for quality — zimage is softer / faster and looked blurry to users.
  const tiers = [
    { model: 'flux', source: 'pollinations-flux', ms: 90_000 },
  ];

  const seen = new Set();
  let best = null;
  let rateLimitedStreak = 0;
  let softRejects = 0;

  for (const text of texts) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const encoded = encodeURIComponent(text.slice(0, 480));
      const seed = opts.seed != null && attempt === 0
        ? (Number(opts.seed) % 999999)
        : freshImageSeed(`${text}:q${attempt}`);

      for (const tier of tiers) {
        const left = IMAGE_TOTAL_BUDGET_MS - (Date.now() - started);
        if (left < 3_000) break;

        const timeoutMs = Math.min(tier.ms, left);
        const modelQ = tier.model ? `&model=${encodeURIComponent(tier.model)}` : '';
        // Do NOT use enhance=true — it often injects cinematic soft/shallow-DOF looks.
        const neg = encodeURIComponent('blurry, soft focus, shallow depth of field, bokeh on subject, out of focus, low resolution, mushy, smoothed skin, plastic, overprocessed');
        const url = `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&nologo=true&nofeed=true&negative_prompt=${neg}${modelQ}&seed=${seed}`;
        const t0 = Date.now();
        const hit = await fetchImageUrl(url, timeoutMs);
        const took = Date.now() - t0;

        if (hit && hit.error === 429) {
          rateLimitedStreak += 1;
          try {
            console.log(`[ark-media] rate limited model=${tier.model} streak=${rateLimitedStreak}`);
          } catch { /* ignore */ }
          await sleep(rateLimitedStreak === 1 ? 5000 : 8000);
          if (rateLimitedStreak >= 2) {
            if (best) return best;
            return null;
          }
          continue;
        }

        if (hit && hit.error) {
          try {
            console.log(`[ark-media] image HTTP ${hit.error} model=${tier.model} tookMs=${took}`);
          } catch { /* ignore */ }
          continue;
        }
        if (!hit || !hit.buf || hit.buf.length < IMAGE_MIN_BYTES) continue;

        rateLimitedStreak = 0;
        const fp = bufFingerprint(hit.buf);
        if (seen.has(fp)) {
          try {
            console.log(`[ark-media] duplicate body skipped model=${tier.model} tookMs=${took}`);
          } catch { /* ignore */ }
          continue;
        }
        seen.add(fp);

        const candidate = { ...hit, source: tier.source, model: tier.model, seed, tookMs: took };
        if (isLowQualityHit(took, hit.buf.length, hit.buf)) {
          softRejects += 1;
          if (!best || hit.buf.length > (best.buf?.length || 0)) best = candidate;
          const dim = imagePixelSize(hit.buf);
          try {
            console.log(`[ark-media] soft/fast reject model=${tier.model} tookMs=${took} bytes=${hit.buf.length} dims=${dim ? `${dim.width}x${dim.height}` : '?'} (want quality)`);
          } catch { /* ignore */ }
          // Never accept a soft frame early — keep trying until the budget is nearly gone.
          if (left < 18_000 && softRejects >= 3 && best) {
            return best;
          }
          continue;
        }

        try {
          const dim = imagePixelSize(hit.buf);
          console.log(`[ark-media] image model=${tier.model} seed=${seed} tookMs=${took} bytes=${hit.buf.length} dims=${dim ? `${dim.width}x${dim.height}` : '?'}`);
        } catch { /* ignore */ }
        return candidate;
      }
    }

    if (best && !isLowQualityHit(best.tookMs || 0, best.buf?.length || 0, best.buf)) {
      return best;
    }
  }

  return best;
}

/** Hugging Face FLUX when the user connected a free HF key in Models. */
async function fetchHfImage(prompt) {
  try {
    const arkSecrets = require('./arkSecrets.cjs');
    const keys = arkSecrets.loadMap() || {};
    const token = keys.huggingface;
    if (!token) return null;

    const text = String(prompt || '').slice(0, 450);
    const models = [
      { url: 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-dev', source: 'huggingface-flux-dev' },
      { url: 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', source: 'huggingface-flux-schnell' },
      { url: 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', source: 'huggingface-flux-schnell' },
    ];
    for (const { url, source } of models) {
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 22_000);
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'image/png',
            'User-Agent': 'ARK-Desktop',
          },
          body: JSON.stringify({ inputs: text }),
          signal: ac.signal,
        });
        clearTimeout(timer);
        if (!res.ok) continue;
        const ctype = res.headers.get('content-type') || '';
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < IMAGE_MIN_BYTES) continue;
        const ext = ctype.includes('png') ? 'png' : 'jpg';
        return { buf, ext, source };
      } catch {
        /* try next host */
      }
    }
  } catch {
    /* no HF vault */
  }
  return null;
}

function sniffImageExt(buf) {
  if (!buf || buf.length < 12) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF') return 'webp';
  return 'jpg';
}

/** Free community SD when Pollinations Gen Sana is down (no user key required). */
async function fetchHordeImage(prompt, opts = {}) {
  const positive = hostSafeImagePrompt(String(prompt || 'studio product photograph')).slice(0, 380);
  const negative = 'blurry, soft focus, shallow depth of field, bokeh, out of focus, creamy bokeh, low detail, mushy, smoothed, plastic skin';
  const text = `${positive} ### ${negative}`.slice(0, 480);
  const dim = resolveImageDimensions(positive);
  const width = Math.min(opts.width || dim.width, 512);
  const height = Math.min(opts.height || dim.height, 512);
  const ref = String(opts.referenceImageDataUrl || '').trim();
  const refB64 = ref.replace(/^data:image\/\w+;base64,/, '');
  const allowNsfw = Boolean(opts.allowNsfw);
  const headers = {
    'Content-Type': 'application/json',
    apikey: '0000000000',
    'Client-Agent': 'ARK-Desktop:0.2:https://github.com/DrMeji/Ark',
  };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 38_000);
  try {
    const payload = {
      prompt: text,
      params: {
        width,
        height,
        steps: refB64 ? 26 : 30,
        n: 1,
        denoising_strength: refB64 ? 0.52 : undefined,
      },
      nsfw: allowNsfw,
      censor_nsfw: !allowNsfw,
      r2: true,
      shared: false,
      slow_workers: true,
    };
    if (refB64) {
      payload.source_image = refB64;
      payload.source_processing = 'img2img';
    }
    const submit = await fetch('https://aihorde.net/api/v2/generate/async', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    const job = await submit.json().catch(() => ({}));
    const id = job && job.id;
    if (!id) {
      try { console.log(`[ark-media] horde submit failed ${submit.status}`); } catch { /* ignore */ }
      return null;
    }
    const started = Date.now();
    while (Date.now() - started < 32_000) {
      await sleep(1600);
      const check = await fetch(`https://aihorde.net/api/v2/generate/check/${id}`, {
        headers,
        signal: ac.signal,
      });
      const st = await check.json().catch(() => ({}));
      if (st.faulted) return null;
      if (!st.done) continue;
      const status = await fetch(`https://aihorde.net/api/v2/generate/status/${id}`, {
        headers,
        signal: ac.signal,
      });
      const body = await status.json().catch(() => ({}));
      const img = body.generations && body.generations[0] && body.generations[0].img;
      if (!img) return null;
      let buf;
      if (/^https?:\/\//i.test(img)) {
        const fileRes = await fetch(img, { signal: ac.signal });
        if (!fileRes.ok) return null;
        buf = Buffer.from(await fileRes.arrayBuffer());
      } else {
        buf = Buffer.from(String(img), 'base64');
      }
      if (!buf || buf.length < 8_000) return null;
      const ext = sniffImageExt(buf);
      try {
        console.log(`[ark-media] horde image bytes=${buf.length} ext=${ext} tookMs=${Date.now() - started}`);
      } catch { /* ignore */ }
      return { buf, ext, source: refB64 ? 'ai-horde-img2img' : 'ai-horde' };
    }
  } catch (err) {
    try { console.log(`[ark-media] horde fail: ${err && err.name ? err.name : 'error'}`); } catch { /* ignore */ }
    return null;
  } finally {
    clearTimeout(timer);
  }
  return null;
}

function looksLikeMp4(buf, ctype) {
  if (!buf || buf.length < 8000) return false;
  if (ctype && (ctype.includes('json') || ctype.includes('text/html') || ctype.includes('text/plain'))) {
    return false;
  }
  const head = buf.slice(0, 16).toString('utf8');
  if (head.startsWith('<') || head.startsWith('{') || head.startsWith('[')) return false;
  if (
    ctype
    && !ctype.includes('video')
    && !ctype.includes('mp4')
    && !ctype.includes('octet-stream')
  ) return false;
  return true;
}

async function fetchVideoUrl(url, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'ARK-Desktop' },
      redirect: 'follow',
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const ctype = res.headers.get('content-type') || '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (!looksLikeMp4(buf, ctype)) return null;
    return { buf, ext: 'mp4', source: 'pollinations-mp4' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Sequential video fetch — one host at a time; duration capped at 30s. */
async function fetchRealVideo(prompt, durationSec = 10) {
  const encoded = encodeURIComponent(String(prompt || 'cinematic motion').slice(0, 400));
  // User chips are 10/20/30; clamp hard max 30.
  const duration = Math.max(10, Math.min(30, Number(durationSec) || 10));
  const timeoutMs = Math.min(32_000, duration * 2200 + 12_000);
  const bust = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const urls = [
    `https://gen.pollinations.ai/video/${encoded}?model=wan-fast&duration=${duration}&aspectRatio=16:9&v=${bust}`,
    `https://gen.pollinations.ai/video/${encoded}?model=wan&duration=${duration}&aspectRatio=16:9&v=${bust}`,
    `https://gen.pollinations.ai/video/${encoded}?model=ltx-2&duration=${duration}&aspectRatio=16:9&v=${bust}`,
  ];
  for (const url of urls) {
    const t0 = Date.now();
    const hit = await fetchVideoUrl(url, timeoutMs);
    const took = Date.now() - t0;
    if (!hit) continue;
    // Tiny instant replies are not trustworthy generative video.
    if (took < 3_000 && hit.buf.length < 80_000) {
      try {
        console.log(`[ark-media] cache-suspect video tookMs=${took} bytes=${hit.buf.length}`);
      } catch {
        /* ignore */
      }
      continue;
    }
    try {
      console.log(`[ark-media] real video duration=${duration} tookMs=${took} bytes=${hit.buf.length}`);
    } catch {
      /* ignore */
    }
    return { ...hit, tookMs: took, durationSec: duration };
  }
  return null;
}

/** Second path: Hugging Face text-to-video when a token is present in the vault file. */
async function fetchHfVideo(prompt) {
  try {
    const arkSecrets = require('./arkSecrets.cjs');
    const keys = arkSecrets.loadMap() || {};
    const token = keys.huggingface;
    if (!token) return null;

    const models = [
      'https://router.huggingface.co/hf-inference/models/Wan-AI/Wan2.1-T2V-1.3B',
      'https://api-inference.huggingface.co/models/ali-vilab/text-to-video-ms-1.7b',
    ];
    for (const url of models) {
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 40_000);
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'video/mp4',
            'User-Agent': 'ARK-Desktop',
          },
          body: JSON.stringify({ inputs: String(prompt || '').slice(0, 400) }),
          signal: ac.signal,
        });
        clearTimeout(timer);
        if (!res.ok) continue;
        const ctype = res.headers.get('content-type') || '';
        const buf = Buffer.from(await res.arrayBuffer());
        if (!looksLikeMp4(buf, ctype)) continue;
        return { buf, ext: 'mp4', source: 'huggingface-video' };
      } catch {
        /* try next model */
      }
    }
  } catch {
    /* no HF vault */
  }
  return null;
}

function isProductPrompt(prompt) {
  const lower = String(prompt || '').toLowerCase();
  return /\b(iphone|ipad|macbook|android phone|smartphone|galaxy|pixel|pro max|ultra)\b/.test(lower)
    || (/\b(phone|device|product)\b/.test(lower) && /\b(make|create|design|render|generate)\b/.test(lower));
}

function rewriteImagePrompt(prompt) {
  let raw = hostSafeImagePrompt(String(prompt || '').trim());
  raw = raw.replace(/^(Studio headshot|Create a caricature|Anime style|Underwater)\s*/i, '').trim() || raw;
  raw = raw.replace(/^(Studio headshot|Create a caricature|Anime style|Underwater)/i, '').trim() || raw;
  if (/studio photograph of |isolated product on a seamless/i.test(raw)) {
    return raw;
  }
  const lower = raw.toLowerCase();
  const hints = [
    'tack-sharp focus across the entire subject including face body and paws',
    'deep depth of field f/8 style — entire subject in focus',
    'no soft bokeh blur on the main subject, no shallow DOF, no out-of-focus face',
    'crisp clean detail, high resolution, 1080p or sharper',
    'avoid blurry soft mushy low-detail renders',
  ];
  if (/\b(cat|kitten)\b/.test(lower) && !/\b(human|person|man|woman)\b/.test(lower)) {
    hints.push('subject is a real cat animal, full body and face crisp and clear, whiskers visible, not a human');
  }
  if (/\b(dog|puppy)\b/.test(lower) && !/\b(human|person|man|woman)\b/.test(lower)) {
    hints.push('subject is a real dog animal, full body crisp and clear, not a human');
  }
  if (/\b(wireless|bluetooth)\b/.test(lower) && /\b(mouse|keyboard|headset|earbuds|headphones)\b/.test(lower)) {
    hints.push('wireless device with no cable, no cord, no wire visible');
  }
  if (/\b(logitech|razer|steelseries|corsair)\b/.test(lower)) {
    hints.push('accurate consumer electronics product design, no garbled logos or fake brand text');
  }
  if (/\b(wallpaper|desktop background|lock screen)\b/.test(lower)) {
    hints.push('16:9 landscape desktop wallpaper, no desktop icons, no taskbar, no UI chrome');
  }
  if (/\b(tesla|model\s*s|plaid|cybertruck|model\s*[3xy])\b/.test(lower)) {
    hints.push('accurate modern Tesla EV design, single coherent car body, correct proportions');
    if (/\bplaid\b|\bmodel\s*s\b/.test(lower)) {
      hints.push('2021+ Tesla Model S Plaid refreshed fascia, full-width headlight bar, sleek performance sedan — not the early 2012-2016 Model S');
    }
    if (/\bred\b|\bcrimson\b|\bscarlet\b/.test(lower)) {
      hints.push('vivid red factory paint, studio automotive lighting, sharp reflections');
    }
  }
  if (isProductPrompt(raw)) {
    const concept = hostSafeImagePrompt(raw.replace(/product concept:\s*/i, '')).slice(0, 140);
    return [
      `studio photograph of ${concept}`,
      'isolated product on a seamless gray backdrop',
      'centered, no hands, no people, tack sharp, high resolution',
    ].join(', ');
  }
  return [
    raw,
    ...hints,
    'follow the request exactly',
    'do not invent unrelated subjects',
    'professional quality photography',
  ].join(', ');
}

/** Motion clip: Ken Burns SVG over a real still (clean — no text chrome). */
function buildMotionSvg(prompt, modelName, imageDataUrl) {
  const href = escapeXml(imageDataUrl);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <clipPath id="frame"><rect width="1280" height="720" rx="0"/></clipPath>
  </defs>
  <rect width="1280" height="720" fill="#0b1220"/>
  <g clip-path="url(#frame)">
    <image xlink:href="${href}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice">
      <animateTransform attributeName="transform" type="scale" values="1.04;1.14;1.04" dur="10s" repeatCount="indefinite" additive="sum"/>
      <animateTransform attributeName="transform" type="translate" values="0 0;-36 -16;0 0" dur="10s" repeatCount="indefinite" additive="sum"/>
    </image>
  </g>
</svg>`;
}

function writeLibraryEntry(entry) {
  const libPath = path.join(mediaDir(), 'library.json');
  let list = [];
  try {
    if (fs.existsSync(libPath)) list = JSON.parse(fs.readFileSync(libPath, 'utf8'));
  } catch (err) {
    list = [];
    try {
      const backup = `${libPath}.bak-${Date.now()}`;
      if (fs.existsSync(libPath)) fs.copyFileSync(libPath, backup);
      fs.writeFileSync(libPath, '[]', 'utf8');
      const arkCrashLog = require('./arkCrashLog.cjs');
      arkCrashLog.appendReport('media-library-reset', {
        error: err instanceof Error ? err.message : String(err),
        backup,
      });
    } catch {
      /* ignore */
    }
  }
  // Never persist huge dataUrls in the index
  const { dataUrl: _drop, ...meta } = entry;
  list.unshift(meta);
  list = list.slice(0, 80);
  fs.writeFileSync(libPath, JSON.stringify(list, null, 2), 'utf8');
  return list;
}

function listLibrary(opts = {}) {
  const withData = Boolean(opts.withData);
  const libPath = path.join(mediaDir(), 'library.json');
  let list = [];
  try {
    if (!fs.existsSync(libPath)) return [];
    list = JSON.parse(fs.readFileSync(libPath, 'utf8'));
  } catch (err) {
    try {
      const backup = `${libPath}.bak-${Date.now()}`;
      if (fs.existsSync(libPath)) fs.copyFileSync(libPath, backup);
      fs.writeFileSync(libPath, '[]', 'utf8');
      const arkCrashLog = require('./arkCrashLog.cjs');
      arkCrashLog.appendReport('media-library-reset', {
        error: err instanceof Error ? err.message : String(err),
        backup,
        phase: 'list',
      });
    } catch {
      /* ignore */
    }
    return [];
  }
  return list.map((item) => {
    if (!withData) {
      const { dataUrl: _d, ...meta } = item;
      return meta;
    }
    let dataUrl = item.dataUrl;
    try {
      if (!dataUrl && item.path && fs.existsSync(item.path)) {
        dataUrl = fileToDataUrl(item.path);
      }
    } catch {
      dataUrl = undefined;
    }
    return { ...item, dataUrl };
  });
}

function getLibraryItem(id) {
  const libPath = path.join(mediaDir(), 'library.json');
  let list = [];
  try {
    if (fs.existsSync(libPath)) list = JSON.parse(fs.readFileSync(libPath, 'utf8'));
  } catch {
    return null;
  }
  const item = list.find((i) => i.id === id);
  if (!item) return null;
  let dataUrl = item.dataUrl;
  try {
    if (!dataUrl && item.path && fs.existsSync(item.path)) {
      dataUrl = fileToDataUrl(item.path);
    }
  } catch {
    dataUrl = undefined;
  }
  return { ...item, dataUrl };
}

function shortImageReply(prompt, dataUrl, ok) {
  const alt = String(prompt).slice(0, 80).replace(/[\[\]]/g, '');
  const media = `![${alt}](${dataUrl})`;
  if (ok) return media;
  return [
    'Image preview · offline fallback (not a finished generation)',
    '',
    'Connect Hugging Face / OpenAI in Models, or retry when the free image host is online.',
    '',
    media,
  ].join('\n');
}

function shortVideoReply(prompt, dataUrl, ok, opts = {}) {
  const alt = String(prompt).slice(0, 80).replace(/[\[\]]/g, '');
  const media = `![${alt}](${dataUrl})`;
  if (ok && opts.motionStill) {
    return [
      'Short motion clip · real MP4 from a still (not generative video)',
      '',
      media,
    ].join('\n');
  }
  if (ok) return media;
  return [
    'Video preview · motion still (not a real MP4 yet)',
    '',
    media,
  ].join('\n');
}

async function generateImage(prompt, modelName, opts = {}) {
  const id = `img-${Date.now()}-${hashPrompt(prompt).toString(16)}`;
  const allowNsfw = Boolean(opts.allowNsfw);
  let enhanced = rewriteImagePrompt(prompt);
  if (!allowNsfw) {
    enhanced = `${enhanced}, sfw, safe for work, fully clothed, no nudity, no sexual content, no pornography`;
  }
  const ref = String(opts.referenceImageDataUrl || '').trim();
  if (ref) {
    enhanced = [
      'Recreate and improve this reference image',
      enhanced,
      'preserve composition and subject, higher detail, natural proportions, fix anatomy and artifacts, cleaner render',
    ].join(', ');
  }
  const dim = resolveImageDimensions(ref ? `${enhanced}, square composition` : enhanced);

  const saveWinner = async (winner, label) => {
    let buf = winner.buf;
    let ext = winner.ext || sniffImageExt(buf) || 'jpg';
    const dim = imagePixelSize(buf);
    // Free hosts often return soft ~768 frames — upscale+unsharp to ~1280 for readability.
    if (dim && Math.min(dim.width, dim.height) < 1100) {
      try {
        const tmpIn = path.join(mediaDir(), `${id}-src.${ext}`);
        fs.writeFileSync(tmpIn, buf);
        const refined = await arkFfmpeg.sharpenUpscaleStill(tmpIn, { size: 1280 });
        try { fs.unlinkSync(tmpIn); } catch { /* ignore */ }
        if (refined && refined.length > buf.length * 0.8) {
          buf = refined;
          ext = 'jpg';
          try {
            const outDim = imagePixelSize(buf);
            console.log(`[ark-media] refined ${dim.width}x${dim.height} → ${outDim ? `${outDim.width}x${outDim.height}` : '?'} bytes=${buf.length}`);
          } catch { /* ignore */ }
        }
      } catch {
        /* keep original */
      }
    }
    const file = path.join(mediaDir(), `${id}.${ext}`);
    fs.writeFileSync(file, buf);
    const mime = ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpeg';
    const dataUrl = `data:image/${mime};base64,${buf.toString('base64')}`;
    const niceName = sourceDisplayName(winner.source, label || modelName || 'ARK Image Core');
    const entry = {
      id,
      kind: 'image',
      title: String(prompt).slice(0, 80),
      prompt: String(prompt),
      modelName: niceName,
      path: file,
      createdAt: new Date().toISOString(),
      source: winner.source,
      real: true,
    };
    writeLibraryEntry(entry);
    return {
      ok: true,
      kind: 'image',
      modelName: niceName,
      path: file,
      dataUrl,
      libraryId: id,
      real: true,
      source: winner.source,
      reply: shortImageReply(prompt, dataUrl, true),
    };
  };

  // Quality-first cascade — do NOT race two Pollinations URLs (causes 429 "busy"
  // and lets a soft plain JPEG beat a sharper Flux frame).
  const pickBest = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    const aSoft = isLowQualityHit(a.tookMs || 0, a.buf?.length || 0, a.buf);
    const bSoft = isLowQualityHit(b.tookMs || 0, b.buf?.length || 0, b.buf);
    if (aSoft !== bSoft) return aSoft ? b : a;
    const aDim = imagePixelSize(a.buf);
    const bDim = imagePixelSize(b.buf);
    const aPx = aDim ? aDim.width * aDim.height : 0;
    const bPx = bDim ? bDim.width * bDim.height : 0;
    if (aPx !== bPx) return bPx > aPx ? b : a;
    const aFlux = /flux|huggingface/i.test(String(a.source || ''));
    const bFlux = /flux|huggingface/i.test(String(b.source || ''));
    if (aFlux !== bFlux) return aFlux ? a : b;
    return (b.buf?.length || 0) > (a.buf?.length || 0) ? b : a;
  };

  let best = null;

  // Recreate / img2img: try Horde with the reference first.
  if (ref) {
    try {
      const img2img = await fetchHordeImage(enhanced, {
        width: 512,
        height: 512,
        referenceImageDataUrl: ref,
        allowNsfw,
      });
      if (isUsableImageHit(img2img)) {
        best = pickBest(best, { ...img2img, source: img2img.source || 'ai-horde-img2img' });
        if (best && !isLowQualityHit(best.tookMs || 0, best.buf.length, best.buf)) {
          return await saveWinner(best, modelName);
        }
      }
    } catch {
      /* continue */
    }
  }

  // Primary: Pollinations Flux (enhanced) — wait for quality, not the first soft stub.
  try {
    const flux = await fetchRealImage(enhanced, {
      width: dim.width,
      height: dim.height,
      fallbackPrompt: String(prompt || '').trim(),
    });
    if (isUsableImageHit(flux)) {
      best = pickBest(best, flux);
      if (best && !isLowQualityHit(best.tookMs || 0, best.buf.length, best.buf) && /flux/i.test(String(best.source || ''))) {
        return await saveWinner(best, modelName);
      }
    }
  } catch {
    /* continue */
  }

  // Parallel secondary hosts (different networks — safe to race with each other).
  const secondary = await Promise.all([
    fetchHfImage(enhanced).then((hit) => (isUsableImageHit(hit) ? hit : null)).catch(() => null),
    fetchHordeImage(enhanced, {
      width: 512,
      height: 512,
      referenceImageDataUrl: ref || undefined,
      allowNsfw,
    }).then((hit) => (isUsableImageHit(hit) ? { ...hit, source: hit.source || 'ai-horde' } : null)).catch(() => null),
    (async () => {
      if (!arkSd.isLocalImageReady()) return null;
      try {
        const local = await arkSd.generateLocalImage(enhanced, {
          width: Math.min(dim.width, 1024),
          height: Math.min(dim.height, 1024),
          steps: 22,
          timeoutMs: 28_000,
        });
        if (local && isUsableImageHit(local)) return { ...local, source: local.source || 'local-sd' };
      } catch {
        /* ignore */
      }
      return null;
    })(),
  ]);
  for (const hit of secondary) {
    if (hit) best = pickBest(best, hit);
  }
  if (best && !isLowQualityHit(best.tookMs || 0, best.buf.length, best.buf)) {
    return await saveWinner(best, modelName);
  }

  // Last resort: single plain Pollinations call (never raced with Flux).
  try {
    const plain = hostSafeImagePrompt(String(enhanced || prompt).slice(0, 280));
    const seed = freshImageSeed(plain);
    const neg = encodeURIComponent('blurry, soft focus, shallow depth of field, out of focus, low resolution');
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(plain)}?width=${dim.width}&height=${dim.height}&nologo=true&nofeed=true&model=flux&negative_prompt=${neg}&seed=${seed}`;
    const hit = await fetchImageUrl(url, 55_000);
    if (isUsableImageHit(hit)) best = pickBest(best, { ...hit, source: 'pollinations-flux', tookMs: 55_000 });
  } catch {
    /* ignore */
  }

  if (best) return await saveWinner(best, modelName);

  return {
    ok: false,
    kind: 'image',
    modelName: modelName || 'ARK Image Core',
    libraryId: id,
    real: false,
    source: 'none',
    mediaFailure: 'All image hosts failed',
    reply: [
      'Couldn\'t generate image — try again.',
      '',
      'Free image hosts were rate-limited or empty. Wait about a minute and retry, or add a Hugging Face / OpenAI key in Models → Cloud (same vault as Settings / setup).',
    ].join('\n'),
  };
}

async function generateVideo(prompt, modelName, opts = {}) {
  const id = `vid-${Date.now()}-${hashPrompt(prompt).toString(16)}`;
  // User chips are 10/20/30; hard max 30.
  const rawDur = Number(opts.durationSec) || 10;
  const durationSec = [10, 20, 30].includes(rawDur)
    ? rawDur
    : Math.max(10, Math.min(30, Math.round(rawDur / 10) * 10 || 10));

  try {
    console.log(`[ark-media] generateVideo durationSec=${durationSec}`);
  } catch {
    /* ignore */
  }

  // Prefer real generative MP4 when a free Pollinations / HF route answers.
  const mp4 = (await fetchRealVideo(prompt, durationSec)) || (await fetchHfVideo(prompt));
  if (mp4) {
    const file = path.join(mediaDir(), `${id}.mp4`);
    fs.writeFileSync(file, mp4.buf);
    const dataUrl = `data:video/mp4;base64,${mp4.buf.toString('base64')}`;
    const entry = {
      id,
      kind: 'video',
      title: String(prompt).slice(0, 80),
      prompt: String(prompt),
      modelName: modelName || 'ARK Video Core',
      path: file,
      createdAt: new Date().toISOString(),
      source: mp4.source,
      real: true,
      format: 'mp4',
      durationSec,
    };
    writeLibraryEntry(entry);
    return {
      ok: true,
      kind: 'video',
      modelName: entry.modelName,
      path: file,
      dataUrl,
      libraryId: id,
      real: true,
      source: mp4.source,
      reply: shortVideoReply(prompt, dataUrl, true),
    };
  }

  // Real MP4 fallback: Ken Burns motion from a still (honest label, playable file).
  // Uses the same cache-rejecting fetchRealImage path.
  const stillPrompt = rewriteImagePrompt(
    `${prompt}, cinematic film still for a short motion clip, shallow depth of field, dramatic lighting`,
  );
  let stillBuf = null;
  let stillExt = 'jpg';

  if (arkSd.isLocalImageReady()) {
    try {
      const local = await arkSd.generateLocalImage(stillPrompt, { width: 768, height: 432, steps: 16 });
      if (local) {
        stillBuf = local.buf;
        stillExt = local.ext;
      }
    } catch {
      /* ignore */
    }
  }
  if (!stillBuf) {
    const hfStill = await fetchHfImage(stillPrompt);
    if (hfStill) {
      stillBuf = hfStill.buf;
      stillExt = hfStill.ext;
    }
  }
  if (!stillBuf) {
    const real = await fetchRealImage(stillPrompt, {
      width: 1280,
      height: 720,
      fallbackPrompt: String(prompt || '').trim(),
    });
    if (real) {
      stillBuf = real.buf;
      stillExt = real.ext;
    }
  }
  if (!stillBuf) {
    const hordeStill = await fetchHordeImage(stillPrompt);
    if (hordeStill) {
      stillBuf = hordeStill.buf;
      stillExt = hordeStill.ext;
    }
  }

  if (stillBuf) {
    const stillFile = path.join(mediaDir(), `${id}-still.${stillExt}`);
    fs.writeFileSync(stillFile, stillBuf);
    try {
      const motionBuf = await arkFfmpeg.stillToMp4(stillFile, { duration: durationSec });
      if (motionBuf) {
        const file = path.join(mediaDir(), `${id}.mp4`);
        fs.writeFileSync(file, motionBuf);
        try {
          fs.unlinkSync(stillFile);
        } catch {
          /* ignore */
        }
        const dataUrl = `data:video/mp4;base64,${motionBuf.toString('base64')}`;
        const entry = {
          id,
          kind: 'video',
          title: String(prompt).slice(0, 80),
          prompt: String(prompt),
          modelName: modelName || 'ARK Video Core',
          path: file,
          createdAt: new Date().toISOString(),
          source: 'motion-still-mp4',
          real: false,
          format: 'mp4',
          durationSec,
        };
        writeLibraryEntry(entry);
        return {
          ok: true,
          kind: 'video',
          modelName: entry.modelName,
          path: file,
          dataUrl,
          libraryId: id,
          real: false,
          source: 'motion-still-mp4',
          reply: shortVideoReply(prompt, dataUrl, true, { motionStill: true }),
        };
      }
    } catch {
      /* fall through to honest error */
    }
  }

  // Honest failure — never return SVG/gradient as finished video.
  return {
    ok: false,
    kind: 'video',
    modelName: modelName || 'ARK Video Core',
    libraryId: id,
    real: false,
    source: 'none',
    reply: [
      'Couldn\'t generate video — try again.',
      '',
      'Free video hosts did not return a playable MP4.',
      'Try a shorter clip (10s), retry in a minute, or connect a Hugging Face key in Models → Cloud.',
    ].join('\n'),
  };
}

function clearLibrary() {
  const dir = mediaDir();
  const libPath = path.join(dir, 'library.json');
  try {
    fs.writeFileSync(libPath, '[]', 'utf8');
  } catch {
    /* ignore */
  }
  return { ok: true };
}

function removeLibraryItem(id) {
  const libPath = path.join(mediaDir(), 'library.json');
  let list = [];
  try {
    if (fs.existsSync(libPath)) list = JSON.parse(fs.readFileSync(libPath, 'utf8'));
  } catch {
    list = [];
  }
  const hit = list.find((i) => i.id === id);
  const next = list.filter((i) => i.id !== id);
  try {
    fs.writeFileSync(libPath, JSON.stringify(next, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
  if (hit?.path) {
    try {
      if (fs.existsSync(hit.path)) fs.unlinkSync(hit.path);
    } catch {
      /* ignore */
    }
  }
  return { ok: true, removed: Boolean(hit) };
}

module.exports = {
  generateImage,
  generateVideo,
  mediaDir,
  listLibrary,
  getLibraryItem,
  writeLibraryEntry,
  clearLibrary,
  removeLibraryItem,
};
