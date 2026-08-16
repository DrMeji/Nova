/**
 * Accurate machine probe for ARK (Electron main).
 * Avoids browser caps like navigator.deviceMemory (often wrong / capped).
 */

const os = require('os');
const { execFile } = require('child_process');

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
    "(Get-CimInstance Win32_VideoController | Where-Object { $_.AdapterRAM -and $_.AdapterRAM -gt 0 } | Sort-Object AdapterRAM -Descending | Select-Object -First 1 -ExpandProperty AdapterRAM)",
  ]);
  const bytes = parseInt(raw, 10);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  // Some drivers report AdapterRAM capped; still useful when present
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
  // Round to nearest common DIMM total when within ~6% (handles ~63.9 → 64)
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
  if (process.platform === 'win32') osLabel = await windowsOsCaption() || `Windows ${os.release()}`;
  else if (process.platform === 'darwin') osLabel = `macOS ${os.release()}`;
  else if (process.platform === 'linux') osLabel = `Linux ${os.release()}`;

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

/**
 * Measure download + upload via Cloudflare Speed endpoints (warmup + median of 3 downs).
 * Same public measurement approach many tools use — Ookla Speedtest.net is proprietary
 * and cannot be embedded; this is the accurate open alternative.
 * @returns {{ ok: boolean, MBps: number, downMBps?: number, upMBps?: number, source: string, samples?: number, error?: string }}
 */
async function probeSpeedTest() {
  const https = require('https');

  function downloadOnce(bytes, timeoutMs = 90_000) {
    const url = `https://speed.cloudflare.com/__down?bytes=${bytes}&measId=${Date.now()}-${Math.random()}`;
    return new Promise((resolve) => {
      const t0 = Date.now();
      let received = 0;
      const req = https.get(url, { headers: { 'User-Agent': 'ARK-Engine/0.4' } }, (res) => {
        if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
          res.resume();
          resolve({ ok: false, MBps: 0 });
          return;
        }
        res.on('data', (chunk) => { received += chunk.length; });
        res.on('end', () => {
          const ms = Math.max(Date.now() - t0, 1);
          resolve({ ok: true, MBps: received / (1024 * 1024) / (ms / 1000) });
        });
        res.on('error', () => resolve({ ok: false, MBps: 0 }));
      });
      req.on('error', () => resolve({ ok: false, MBps: 0 }));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        resolve({ ok: false, MBps: 0 });
      });
    });
  }

  function uploadOnce(bytes, timeoutMs = 90_000) {
    const payload = Buffer.alloc(bytes, 0x61);
    return new Promise((resolve) => {
      const t0 = Date.now();
      const req = https.request(
        {
          hostname: 'speed.cloudflare.com',
          path: `/__up?measId=${Date.now()}`,
          method: 'POST',
          headers: {
            'User-Agent': 'ARK-Engine/0.4',
            'Content-Type': 'application/octet-stream',
            'Content-Length': payload.length,
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => {
            const ms = Math.max(Date.now() - t0, 1);
            if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
              resolve({ ok: false, MBps: 0 });
              return;
            }
            resolve({ ok: true, MBps: bytes / (1024 * 1024) / (ms / 1000) });
          });
          res.on('error', () => resolve({ ok: false, MBps: 0 }));
        },
      );
      req.on('error', () => resolve({ ok: false, MBps: 0 }));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        resolve({ ok: false, MBps: 0 });
      });
      req.write(payload);
      req.end();
    });
  }

  function median(values) {
    const sorted = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  await downloadOnce(2_000_000, 30_000);

  const downSamples = [];
  for (let i = 0; i < 3; i++) {
    const sample = await downloadOnce(40_000_000, 90_000);
    if (sample.ok) downSamples.push(sample.MBps);
  }

  const upSample = await uploadOnce(15_000_000, 90_000);
  const downMBps = median(downSamples);
  const upMBps = upSample.ok ? upSample.MBps : 0;

  if (downMBps <= 0 && upMBps <= 0) {
    return { ok: false, MBps: 0, downMBps: 0, upMBps: 0, source: 'failed', error: 'Speed test failed' };
  }

  return {
    ok: true,
    MBps: Math.round(downMBps * 100) / 100,
    downMBps: Math.round(downMBps * 100) / 100,
    upMBps: Math.round(upMBps * 100) / 100,
    source: 'measured',
    samples: downSamples.length,
  };
}

module.exports = {
  probeSystemInfo,
  probeSpeedTest,
};
