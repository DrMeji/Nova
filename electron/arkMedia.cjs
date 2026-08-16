/**
 * ARK media generation — real free images + motion clips, library on disk (paths only).
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

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

/** Prefer Flux-quality free hosts; try several models for fidelity. */
async function fetchRealImage(prompt, opts = {}) {
  const encoded = encodeURIComponent(String(prompt || 'abstract art').slice(0, 450));
  const seed = (opts.seed ?? hashPrompt(prompt)) % 999999;
  const w = opts.width || 1024;
  const h = opts.height || 768;
  const urls = [
    `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&nologo=true&model=flux&enhance=true&seed=${seed}`,
    `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&nologo=true&model=flux-realism&enhance=true&seed=${seed}`,
    `https://gen.pollinations.ai/image/${encoded}?model=flux&width=${w}&height=${h}&nologo=true&seed=${seed}`,
    `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&nologo=true&model=turbo&seed=${seed}`,
    `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&nologo=true&seed=${seed + 1}`,
    `https://pollinations.ai/p/${encoded}?width=${w}&height=${h}&nologo=true&model=flux&seed=${seed}`,
  ];

  for (const url of urls) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 45_000);
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'ARK-Desktop' },
        redirect: 'follow',
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const ctype = res.headers.get('content-type') || '';
      if (!ctype.includes('image') && !ctype.includes('octet-stream')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) continue;
      const ext = ctype.includes('png') ? 'png' : ctype.includes('webp') ? 'webp' : 'jpg';
      return { buf, ext, source: 'flux-pollinations' };
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Try free Pollinations MP4 endpoints; fall back to motion still if blocked/paid. */
async function fetchRealVideo(prompt) {
  const encoded = encodeURIComponent(String(prompt || 'cinematic motion').slice(0, 400));
  const urls = [
    `https://gen.pollinations.ai/video/${encoded}?model=wan-fast&duration=4&aspectRatio=16:9`,
    `https://gen.pollinations.ai/video/${encoded}?model=wan&duration=4&aspectRatio=16:9`,
    `https://gen.pollinations.ai/video/${encoded}?model=ltx-2&duration=4&aspectRatio=16:9`,
    `https://gen.pollinations.ai/video/${encoded}?model=seedance&duration=4&aspectRatio=16:9`,
    `https://gen.pollinations.ai/video/${encoded}?model=p-video-720p&duration=4&aspectRatio=16:9`,
    `https://gen.pollinations.ai/video/${encoded}?model=wan-fast&duration=5&aspectRatio=16:9&audio=false`,
    `https://gen.pollinations.ai/video/${encoded}?model=ltx-2&duration=3&aspectRatio=16:9`,
  ];

  for (const url of urls) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 90_000);
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'ARK-Desktop' },
        redirect: 'follow',
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const ctype = res.headers.get('content-type') || '';
      if (
        !ctype.includes('video')
        && !ctype.includes('mp4')
        && !ctype.includes('octet-stream')
      ) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 8000) continue;
      const head = buf.slice(0, 16).toString('utf8');
      if (head.startsWith('<') || head.startsWith('{') || head.startsWith('[')) continue;
      return { buf, ext: 'mp4', source: 'pollinations-mp4' };
    } catch {
      /* try next */
    }
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
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'video/mp4',
            'User-Agent': 'ARK-Desktop',
          },
          body: JSON.stringify({ inputs: String(prompt || '').slice(0, 400) }),
        });
        if (!res.ok) continue;
        const ctype = res.headers.get('content-type') || '';
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 8000) continue;
        if (ctype.includes('json') || buf.slice(0, 1).toString() === '{') continue;
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
  } catch {
    list = [];
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
  } catch {
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

function shortVideoReply(prompt, dataUrl, ok) {
  const alt = String(prompt).slice(0, 80).replace(/[\[\]]/g, '');
  const media = `![${alt}](${dataUrl})`;
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
  const real = await fetchRealImage(enhanced, { width: 1280, height: 1280 });

  if (real) {
    const file = path.join(mediaDir(), `${id}.${real.ext}`);
    fs.writeFileSync(file, real.buf);
    const dataUrl = `data:image/${real.ext === 'jpg' ? 'jpeg' : real.ext};base64,${real.buf.toString('base64')}`;
    const entry = {
      id,
      kind: 'image',
      title: String(prompt).slice(0, 80),
      prompt: String(prompt),
      modelName: modelName || 'ARK Image Core',
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

  const svg = buildFallbackSvg(prompt, modelName, 'image');
  const file = path.join(mediaDir(), `${id}.svg`);
  fs.writeFileSync(file, svg, 'utf8');
  const dataUrl = toDataUrl(svg);
  const entry = {
    id,
    kind: 'image',
    title: String(prompt).slice(0, 80),
    prompt: String(prompt),
    modelName: modelName || 'ARK Image Core',
    path: file,
    createdAt: new Date().toISOString(),
    source: 'fallback-svg',
    real: false,
  };
  writeLibraryEntry(entry);
  return {
    ok: true,
    kind: 'image',
    modelName: entry.modelName,
    path: file,
    dataUrl,
    libraryId: id,
    real: false,
    source: 'fallback-svg',
    reply: shortImageReply(prompt, dataUrl, false),
  };
}

async function generateVideo(prompt, modelName) {
  const id = `vid-${Date.now()}-${hashPrompt(prompt).toString(16)}`;

  // Prefer real MP4 when a free Pollinations video route answers.
  const mp4 = (await fetchRealVideo(prompt)) || (await fetchHfVideo(prompt));
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

  // Honest fallback: cinematic still + Ken Burns motion SVG (not MP4).
  const stillPrompt = rewriteImagePrompt(
    `${prompt}, cinematic film still for a short motion clip, shallow depth of field, dramatic lighting`,
  );
  const real = await fetchRealImage(stillPrompt, { width: 1280, height: 720 });

  let dataUrl;
  let file;
  let realFlag = false;
  let source = 'fallback-svg';

  if (real) {
    const stillData = `data:image/${real.ext === 'jpg' ? 'jpeg' : real.ext};base64,${real.buf.toString('base64')}`;
    const motion = buildMotionSvg(prompt, modelName || 'ARK Video Core', stillData);
    file = path.join(mediaDir(), `${id}.svg`);
    fs.writeFileSync(file, motion, 'utf8');
    dataUrl = toDataUrl(motion);
    realFlag = false;
    source = 'motion-still-fallback';
  } else {
    const svg = buildFallbackSvg(prompt, modelName, 'video');
    file = path.join(mediaDir(), `${id}.svg`);
    fs.writeFileSync(file, svg, 'utf8');
    dataUrl = toDataUrl(svg);
    realFlag = false;
  }

  const entry = {
    id,
    kind: 'video',
    title: String(prompt).slice(0, 80),
    prompt: String(prompt),
    modelName: modelName || 'ARK Video Core',
    path: file,
    createdAt: new Date().toISOString(),
    source,
    real: realFlag,
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
    real: realFlag,
    source,
    reply: shortVideoReply(prompt, dataUrl, realFlag),
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

module.exports = {
  generateImage,
  generateVideo,
  mediaDir,
  listLibrary,
  getLibraryItem,
  writeLibraryEntry,
  clearLibrary,
};
