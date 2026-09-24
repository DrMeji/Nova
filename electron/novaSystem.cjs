/**
 * Accurate machine probe for NOVA (Electron main).
 * Avoids browser caps like navigator.deviceMemory (often wrong / capped).
 */

const os = require('os');
const { execFile } = require('child_process');
const novaHostPick = require('./novaHostPick.cjs');

function execText(cmd, args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        resolve('');
        return;
      }
      resolve(String(stdout || '').trim());
    });
  });
}

async function windowsGpu() {
  const raw = await execText('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join ' | '",
  ]);
  return raw || '';
}

async function windowsBoard() {
  const raw = await execText('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "$b = Get-CimInstance Win32_BaseBoard; if ($b) { ($b.Manufacturer + ' ' + $b.Product).Trim() } else { '' }",
  ]);
  return raw || '';
}

async function windowsOsCaption() {
  const raw = await execText('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '(Get-CimInstance Win32_OperatingSystem).Caption',
  ]);
  return raw || '';
}

async function windowsCpuCounts() {
  const raw = await execText('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "$p = Get-CimInstance Win32_Processor; $c = ($p | Measure-Object -Property NumberOfCores -Sum).Sum; $l = ($p | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum; \"$c|$l\"",
  ]);
  const [c, l] = String(raw).split('|').map((n) => parseInt(n, 10));
  return {
    physical: Number.isFinite(c) && c > 0 ? c : 0,
    logical: Number.isFinite(l) && l > 0 ? l : 0,
  };
}

async function windowsVramGb() {
  const raw = await execText('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '(Get-CimInstance Win32_VideoController | Where-Object { $_.AdapterRAM -and $_.AdapterRAM -gt 0 } | Sort-Object AdapterRAM -Descending | Select-Object -First 1 -ExpandProperty AdapterRAM)',
  ]);
  const bytes = parseInt(raw, 10);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  return Math.round((bytes / (1024 ** 3)) * 10) / 10;
}

function accelerationFromGpu(gpu) {
  const g = (gpu || '').toLowerCase();
  if (g.includes('nvidia') || g.includes('rtx') || g.includes('gtx') || g.includes('quadro')) return 'CUDA';
  if (g.includes('apple') || g.includes('m1') || g.includes('m2') || g.includes('m3') || g.includes('m4')) return 'Metal';
  if (g.includes('amd') || g.includes('radeon')) return 'Vulkan';
  if (g.includes('intel')) return 'CPU+iGPU';
  return 'CPU';
}

function snapRamGb(ramGb) {
  const common = [4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256];
  for (const n of common) {
    if (Math.abs(ramGb - n) / n <= 0.06) return n;
  }
  return Math.round(ramGb);
}

async function probeSystemInfo() {
  const cpus = os.cpus() || [];
  const totalMemGb = os.totalmem() / (1024 ** 3);
  const freeMemGb = os.freemem() / (1024 ** 3);
  const cpuModel = cpus[0]?.model?.trim() || 'Unknown CPU';
  let logicalCores = cpus.length;
  let physicalCores = 0;

  let osLabel = os.platform();
  if (process.platform === 'win32') {
    osLabel = await windowsOsCaption();
    if (!osLabel) {
      const parts = String(os.release() || '').split('.');
      const build = parseInt(parts[2] || '0', 10);
      osLabel = Number.isFinite(build) && build >= 22000 ? 'Windows 11' : 'Windows 10';
    }
  } else if (process.platform === 'darwin') {
    osLabel = `macOS ${os.release()}`;
  } else if (process.platform === 'linux') {
    osLabel = `Linux ${os.release()}`;
  }

  let gpu = '';
  let motherboard = '';
  let vramGb = null;
  if (process.platform === 'win32') {
    gpu = await windowsGpu();
    motherboard = await windowsBoard();
    const counts = await windowsCpuCounts();
    if (counts.logical) logicalCores = counts.logical;
    if (counts.physical) physicalCores = counts.physical;
    vramGb = await windowsVramGb();
  }

  const acceleration = accelerationFromGpu(gpu);
  const ramInstalled = snapRamGb(totalMemGb);

  return {
    ok: true,
    os: osLabel,
    platform: process.platform,
    arch: os.arch(),
    cpu: cpuModel,
    cpuCores: logicalCores,
    cpuPhysicalCores: physicalCores || undefined,
    ramGb: ramInstalled,
    ramRawGb: Math.round(totalMemGb * 100) / 100,
    ramFreeGb: Math.round(freeMemGb * 10) / 10,
    gpu: gpu || 'Unknown GPU',
    vramGb,
    motherboard: motherboard || '',
    acceleration,
    hostname: os.hostname(),
  };
}

const SPEED_HOSTS = [
  {
    id: 'huggingface',
    name: 'Hugging Face',
    url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'hf-mirror',
    name: 'HF Mirror',
    url: 'https://hf-mirror.com/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'modelscope',
    name: 'ModelScope',
    url: 'https://www.modelscope.cn/models/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/master/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  },
];

/**
 * Measure PC ↔ each GGUF host: handshake RTT, then Range-download throughput.
 * Sequential so hosts do not steal bandwidth from each other.
 */
async function probeSpeedTest() {
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');

  const WARM_BYTES = 2 * 1024 * 1024;
  const MEASURE_BYTES = 16 * 1024 * 1024;

  function openRange(url, start, end, redirectsLeft = 8) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const lib = parsed.protocol === 'http:' ? http : https;
      const req = lib.get(url, {
        headers: {
          'User-Agent': 'NOVA-Engine/0.4',
          Accept: '*/*',
          Range: `bytes=${start}-${end}`,
        },
      }, (res) => {
        const status = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject(new Error('Too many redirects'));
            return;
          }
          const next = new URL(res.headers.location, url).toString();
          resolve(openRange(next, start, end, redirectsLeft - 1));
          return;
        }
        if (status !== 200 && status !== 206) {
          res.resume();
          reject(new Error(`Speed probe failed (${status})`));
          return;
        }
        resolve(res);
      });
      req.on('error', reject);
      req.setTimeout(45_000, () => {
        req.destroy();
        reject(new Error('Speed probe timed out'));
      });
    });
  }

  function sampleHost(url) {
    const total = WARM_BYTES + MEASURE_BYTES;
    const tOpen = Date.now();
    return openRange(url, 0, total - 1).then((res) => new Promise((resolve) => {
      const rttMs = Math.max(1, Date.now() - tOpen);
      let received = 0;
      let timed = 0;
      let t0 = 0;
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        try { res.destroy(); } catch { /* ignore */ }
        const ms = Math.max(Date.now() - t0, 1);
        if (!ok || !t0 || timed < 1024 * 1024) {
          resolve({ ok: false, MBps: 0, rttMs });
          return;
        }
        resolve({ ok: true, MBps: timed / (1024 * 1024) / (ms / 1000), rttMs });
      };
      res.on('data', (chunk) => {
        received += chunk.length;
        if (received <= WARM_BYTES) return;
        if (!t0) t0 = Date.now();
        timed = received - WARM_BYTES;
        if (received >= total) finish(true);
      });
      res.on('end', () => finish(timed >= 1024 * 1024));
      res.on('error', () => finish(false));
    })).catch((err) => ({
      ok: false,
      MBps: 0,
      rttMs: Math.max(1, Date.now() - tOpen),
      error: err instanceof Error ? err.message : String(err),
    }));
  }

  const hosts = [];
  for (const host of SPEED_HOSTS) {
    const sample = await sampleHost(host.url);
    hosts.push({
      id: host.id,
      name: host.name,
      ok: Boolean(sample.ok && sample.MBps > 0),
      MBps: sample.ok ? Math.round(sample.MBps * 100) / 100 : 0,
      rttMs: sample.rttMs || undefined,
      error: sample.ok ? undefined : (sample.error || 'Unreachable'),
    });
  }

  const winners = hosts.filter((h) => h.ok).sort((a, b) => b.MBps - a.MBps);
  const best = winners[0] || null;

  if (!best) {
    return {
      ok: false,
      MBps: 0,
      downMBps: 0,
      source: 'failed',
      host: 'multi',
      hosts,
      error: 'Could not measure download speed from any model host',
    };
  }

  novaHostPick.save({
    preferredId: best.id,
    MBps: best.MBps,
    hosts,
  });

  return {
    ok: true,
    MBps: best.MBps,
    downMBps: best.MBps,
    source: 'multi',
    host: best.id,
    preferredHost: best.id,
    preferredHostName: best.name,
    hosts,
    samples: 1,
  };
}

module.exports = {
  probeSystemInfo,
  probeSpeedTest,
};
