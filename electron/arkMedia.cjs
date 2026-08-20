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

/** Poll one free image URL; returns buffer or null. */
async function fetchImageUrl(url, timeoutMs = 45_000) {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'ARK-Desktop' },
      redirect: 'follow',
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('image') && !ctype.includes('octet-stream')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2500) return null;
    const ext = ctype.includes('png') ? 'png' : ctype.includes('webp') ? 'webp' : 'jpg';
    return { buf, ext };
  } catch {
    return null;
  }
}

const IMAGE_MIN_BYTES = 18_000;
/** Hard budget so Image mode finishes around ~30s, not minutes of sequential timeouts. */
const IMAGE_TOTAL_BUDGET_MS = 28_000;

/** Quality-first sequential fetch — never race turbo; stay under ~30s total. */
async function fetchRealImage(prompt, opts = {}) {
  const encoded = encodeURIComponent(String(prompt || 'abstract art').slice(0, 450));
  const baseSeed = (opts.seed ?? hashPrompt(prompt)) % 999999;
  const w = opts.width || 1024;
  const h = opts.height || 1024;
  const started = Date.now();
  const tiers = [
    { model: 'flux', source: 'pollinations-flux', ms: 16_000 },
    { model: 'flux-realism', source: 'pollinations-flux-realism', ms: 12_000 },
    { model: 'turbo', source: 'pollinations-turbo', ms: 8_000 },
  ];

  for (const tier of tiers) {
    const left = IMAGE_TOTAL_BUDGET_MS - (Date.now() - started);
    if (left < 2_500) break;
    const timeoutMs = Math.min(tier.ms, left);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&nologo=true&model=${tier.model}&enhance=true&seed=${baseSeed}`;
    const hit = await fetchImageUrl(url, timeoutMs);
    if (hit && hit.buf.length >= IMAGE_MIN_BYTES) {
      return { ...hit, source: tier.source, model: tier.model };
    }
  }
  return null;
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
  const duration = Math.max(4, Math.min(30, Number(durationSec) || 10));
  const timeoutMs = Math.min(32_000, duration * 2200 + 12_000);
  const urls = [
    `https://gen.pollinations.ai/video/${encoded}?model=ltx-2&duration=${duration}&aspectRatio=16:9`,
    `https://gen.pollinations.ai/video/${encoded}?model=wan-fast&duration=${duration}&aspectRatio=16:9`,
  ];
  for (const url of urls) {
    const hit = await fetchVideoUrl(url, timeoutMs);
    if (hit) return hit;
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

function rewriteImagePrompt(prompt) {
  const raw = String(prompt || '').trim();
  const lower = raw.toLowerCase();
  const hints = [];
  if (/\b(cat|kitten)\b/.test(lower) && !/\b(human|person|man|woman)\b/.test(lower)) {
    hints.push('subject is a real cat animal, not a human');
  }
  if (/\b(dog|puppy)\b/.test(lower) && !/\b(human|person|man|woman)\b/.test(lower)) {
    hints.push('subject is a real dog animal, not a human');
  }
  if (/\bwallpaper|desktop\b/.test(lower)) {
    hints.push('desktop wallpaper, no text, no UI');
  }
  if (/\btesla\b/.test(lower)) {
    hints.push('accurate single Tesla car, coherent body');
  }
  if (/\b(iphone|ipad|macbook|android phone|smartphone|galaxy|pixel|pro max|ultra)\b/.test(lower)
    || (/\b(phone|device|product)\b/.test(lower) && /\b(make|create|design|render|generate)\b/.test(lower))) {
    return [
      'isolated product hero photograph on a clean studio backdrop',
      'single smartphone device only, front three-quarter view, sharp focus',
      'no hands, no people, no fingers holding the phone, no lifestyle scene',
      raw,
      'accurate industrial design, realistic materials, commercial product render',
      'no watermarks, no UI chrome, no captions',
    ].join(', ');
  }
  return [
    raw,
    ...hints,
    'follow the request exactly',
    'do not invent unrelated subjects',
    'highly detailed, sharp focus, professional quality, high resolution',
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

async function generateImage(prompt, modelName) {
  const id = `img-${Date.now()}-${hashPrompt(prompt).toString(16)}`;
  const enhanced = rewriteImagePrompt(prompt);

  // Prefer on-device SD when the user installed local image weights.
  if (arkSd.isLocalImageReady()) {
    try {
      const local = await arkSd.generateLocalImage(enhanced, { width: 768, height: 768, steps: 28 });
      if (local) {
        const file = path.join(mediaDir(), `${id}.${local.ext}`);
        fs.writeFileSync(file, local.buf);
        const dataUrl = `data:image/${local.ext};base64,${local.buf.toString('base64')}`;
        const entry = {
          id,
          kind: 'image',
          title: String(prompt).slice(0, 80),
          prompt: String(prompt),
          modelName: modelName || 'Stable Diffusion (Local)',
          path: file,
          createdAt: new Date().toISOString(),
          source: local.source,
          real: true,
        };
        writeLibraryEntry(entry);
        return {
          ok: true,
          kind: 'image',
          modelName: entry.modelName,
          path: file,
          dataUrl,
          libraryId: id,
          real: true,
          source: local.source,
          reply: shortImageReply(prompt, dataUrl, true),
        };
      }
    } catch {
      /* fall through to cloud */
    }
  }

  const real = await fetchRealImage(enhanced, { width: 1024, height: 1024 });

  if (real) {
    const file = path.join(mediaDir(), `${id}.${real.ext}`);
    fs.writeFileSync(file, real.buf);
    const dataUrl = `data:image/${real.ext === 'jpg' ? 'jpeg' : real.ext};base64,${real.buf.toString('base64')}`;
    const entry = {
      id,
      kind: 'image',
      title: String(prompt).slice(0, 80),
      prompt: String(prompt),
      modelName: modelName || real.model || 'ARK Image Core',
      path: file,
      createdAt: new Date().toISOString(),
      source: real.source,
      real: true,
    };
    writeLibraryEntry(entry);
    return {
      ok: true,
      kind: 'image',
      modelName: entry.modelName,
      path: file,
      dataUrl,
      libraryId: id,
      real: true,
      source: real.source,
      reply: shortImageReply(prompt, dataUrl, true),
    };
  }

  const hf = await fetchHfImage(enhanced);
  if (hf) {
    const file = path.join(mediaDir(), `${id}.${hf.ext}`);
    fs.writeFileSync(file, hf.buf);
    const dataUrl = `data:image/${hf.ext === 'jpg' ? 'jpeg' : hf.ext};base64,${hf.buf.toString('base64')}`;
    const entry = {
      id,
      kind: 'image',
      title: String(prompt).slice(0, 80),
      prompt: String(prompt),
      modelName: modelName || 'Hugging Face FLUX',
      path: file,
      createdAt: new Date().toISOString(),
      source: hf.source,
      real: true,
    };
    writeLibraryEntry(entry);
    return {
      ok: true,
      kind: 'image',
      modelName: entry.modelName,
      path: file,
      dataUrl,
      libraryId: id,
      real: true,
      source: hf.source,
      reply: shortImageReply(prompt, dataUrl, true),
    };
  }

  const svg = buildFallbackSvg(prompt, modelName, 'image');
  const file = path.join(mediaDir(), `${id}.svg`);
  fs.writeFileSync(file, svg, 'utf8');
  const dataUrl = toDataUrl(svg);
  return {
    ok: false,
    kind: 'image',
    modelName: modelName || 'ARK Image Core',
    path: file,
    dataUrl,
    libraryId: id,
    real: false,
    source: 'fallback-svg',
    mediaFailure: 'Free image hosts were unavailable — no real image was generated',
    reply: [
      'Could not generate a real image right now.',
      '',
      'Try again in a minute, connect a Hugging Face key in Models → Cloud, or install local SD weights in Local AI.',
    ].join('\n'),
  };
}

async function generateVideo(prompt, modelName, opts = {}) {
  const id = `vid-${Date.now()}-${hashPrompt(prompt).toString(16)}`;
  const durationSec = Math.max(4, Math.min(30, Number(opts.durationSec) || 10));

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
    const real = await fetchRealImage(stillPrompt, { width: 1280, height: 720 });
    if (real) {
      stillBuf = real.buf;
      stillExt = real.ext;
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
      /* SVG fallback below */
    }

    const stillData = `data:image/${stillExt === 'jpg' ? 'jpeg' : stillExt};base64,${stillBuf.toString('base64')}`;
    const motion = buildMotionSvg(prompt, modelName || 'ARK Video Core', stillData);
    const file = path.join(mediaDir(), `${id}.svg`);
    fs.writeFileSync(file, motion, 'utf8');
    const dataUrl = toDataUrl(motion);
    const entry = {
      id,
      kind: 'video',
      title: String(prompt).slice(0, 80),
      prompt: String(prompt),
      modelName: modelName || 'ARK Video Core',
      path: file,
      createdAt: new Date().toISOString(),
      source: 'motion-still-fallback',
      real: false,
      format: 'svg-motion',
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
      source: 'motion-still-fallback',
      reply: shortVideoReply(prompt, dataUrl, false),
    };
  }

  const svg = buildFallbackSvg(prompt, modelName, 'video');
  const file = path.join(mediaDir(), `${id}.svg`);
  fs.writeFileSync(file, svg, 'utf8');
  const dataUrl = toDataUrl(svg);
  const entry = {
    id,
    kind: 'video',
    title: String(prompt).slice(0, 80),
    prompt: String(prompt),
    modelName: modelName || 'ARK Video Core',
    path: file,
    createdAt: new Date().toISOString(),
    source: 'fallback-svg',
    real: false,
    format: 'svg-motion',
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
    source: 'fallback-svg',
    reply: shortVideoReply(prompt, dataUrl, false),
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
