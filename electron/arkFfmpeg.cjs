/**
 * Optional ffmpeg bootstrap for ARK — turns stills into short real MP4 clips
 * when generative video hosts fail.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { URL } = require('url');
const arkFetch = require('./arkFetch.cjs');
const arkPaths = require('./arkPaths.cjs');

/** Pinned BtbN Windows GPL build (full, not shared). */
const FFMPEG_URL_WIN =
  'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';

function binDir() {
  return arkPaths.binDir();
}

function ensureDirs() {
  fs.mkdirSync(binDir(), { recursive: true });
}

function findFileRecursive(root, names) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (names.includes(e.name)) return full;
    }
  }
  return null;
}

function extractArchive(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    if (process.platform === 'win32' && archivePath.toLowerCase().endsWith('.zip')) {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
        ],
        { windowsHide: true },
        (err) => (err ? reject(err) : resolve()),
      );
      return;
    }
    execFile('tar', ['-xf', archivePath, '-C', destDir], (err) => (err ? reject(err) : resolve()));
  });
}

function findFfmpeg() {
  ensureDirs();
  const names = process.platform === 'win32' ? ['ffmpeg.exe'] : ['ffmpeg'];
  for (const name of names) {
    const full = path.join(binDir(), name);
    if (fs.existsSync(full)) return full;
  }
  try {
    for (const entry of fs.readdirSync(binDir(), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const name of names) {
        const full = path.join(binDir(), entry.name, name);
        if (fs.existsSync(full)) return full;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function ffmpegReleaseUrl() {
  if (process.platform === 'win32') return FFMPEG_URL_WIN;
  // macOS / Linux: rely on PATH ffmpeg when present; skip large auto-download.
  return null;
}

/**
 * @param {(pct: number) => void} [onProgress]
 */
async function ensureFfmpeg(onProgress) {
  const existing = findFfmpeg();
  if (existing) return existing;

  const url = ffmpegReleaseUrl();
  if (!url) {
    // Try system PATH
    return new Promise((resolve) => {
      execFile('ffmpeg', ['-version'], { windowsHide: true }, (err) => {
        resolve(err ? null : 'ffmpeg');
      });
    });
  }

  ensureDirs();
  const archiveName = path.basename(new URL(url).pathname);
  const archivePath = path.join(binDir(), archiveName);
  const extractDir = path.join(binDir(), '_extract_ffmpeg');

  if (onProgress) onProgress(2);
  await arkFetch.downloadToFile(url, archivePath, (pct) => {
    if (onProgress) onProgress(Math.min(85, Math.round(pct * 0.85)));
  });

  try {
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  if (onProgress) onProgress(88);
  await extractArchive(archivePath, extractDir);

  const names = process.platform === 'win32' ? ['ffmpeg.exe'] : ['ffmpeg'];
  const found = findFileRecursive(extractDir, names);
  if (!found) throw new Error('ffmpeg not found inside archive');

  const destName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const dest = path.join(binDir(), destName);
  fs.copyFileSync(found, dest);

  try {
    fs.unlinkSync(archivePath);
  } catch {
    /* ignore */
  }

  if (onProgress) onProgress(100);
  return dest;
}

/**
 * Build a short Ken Burns-style MP4 from a still image.
 * @returns {Promise<Buffer|null>}
 */
async function stillToMp4(stillPath, opts = {}) {
  let bin;
  try {
    bin = await ensureFfmpeg();
  } catch {
    return null;
  }
  if (!bin || !stillPath || !fs.existsSync(stillPath)) return null;

  const duration = opts.duration || 4;
  const outPath = path.join(
    path.dirname(stillPath),
    `motion-${Date.now()}.mp4`,
  );

  const vf =
    `scale=1280:720:force_original_aspect_ratio=increase,` +
    `crop=1280:720,` +
    `zoompan=z='min(zoom+0.0012,1.12)':d=${Math.round(duration * 25)}:` +
    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=25`;

  await new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-loop', '1',
      '-i', stillPath,
      '-vf', vf,
      '-t', String(duration),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outPath,
    ];
    const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      reject(new Error('ffmpeg timed out'));
    }, 120_000);
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || !fs.existsSync(outPath)) {
        reject(new Error(stderr.trim().slice(-400) || `ffmpeg exited ${code}`));
        return;
      }
      resolve();
    });
  });

  try {
    const buf = fs.readFileSync(outPath);
    try {
      fs.unlinkSync(outPath);
    } catch {
      /* ignore */
    }
    if (buf.length < 8000) return null;
    return buf;
  } catch {
    return null;
  }
}

/**
 * Upscale + mild unsharp for free-host frames that arrive soft at ~768.
 * Does not invent detail, but makes the subject read cleaner at 1080p-class size.
 */
async function sharpenUpscaleStill(inputPath, opts = {}) {
  let bin;
  try {
    bin = await ensureFfmpeg();
  } catch {
    return null;
  }
  if (!bin || !inputPath || !fs.existsSync(inputPath)) return null;

  const target = Math.max(1024, Number(opts.size) || 1280);
  const outPath = path.join(
    path.dirname(inputPath),
    `sharp-${Date.now()}.jpg`,
  );

  const vf =
    `scale=${target}:${target}:force_original_aspect_ratio=increase:flags=lanczos,` +
    `crop=${target}:${target},` +
    `unsharp=5:5:0.9:5:5:0.0`;

  try {
    await new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-i', inputPath,
        '-vf', vf,
        '-q:v', '2',
        outPath,
      ];
      const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      const timer = setTimeout(() => {
        try { child.kill(); } catch { /* ignore */ }
        reject(new Error('ffmpeg sharpen timed out'));
      }, 45_000);
      child.stderr?.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (err) => { clearTimeout(timer); reject(err); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0 || !fs.existsSync(outPath)) {
          reject(new Error(stderr.trim().slice(-300) || `ffmpeg exited ${code}`));
          return;
        }
        resolve();
      });
    });
    const buf = fs.readFileSync(outPath);
    try { fs.unlinkSync(outPath); } catch { /* ignore */ }
    if (!buf || buf.length < 8_000) return null;
    return buf;
  } catch {
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch { /* ignore */ }
    return null;
  }
}

module.exports = {
  findFfmpeg,
  ensureFfmpeg,
  stillToMp4,
  sharpenUpscaleStill,
  ffmpegInstallHint() {
    if (process.platform === 'win32') return null;
    if (findFfmpeg()) return null;
    return 'Install ffmpeg for motion clips (e.g. brew install ffmpeg or apt install ffmpeg).';
  },
};
