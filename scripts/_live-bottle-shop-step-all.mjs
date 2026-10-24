/**
 * Run bottle shop step prompts 1→4 with one brand.
 *   $env:NOVA_CDP_PORT='9230'; $env:NOVA_CREATE_BRAND='ValeBottle 123'; node scripts/_live-bottle-shop-step-all.mjs
 */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brand = process.env.NOVA_CREATE_BRAND || `ValeBottle ${Date.now().toString(36).slice(-4)}`;
const port = process.env.NOVA_CDP_PORT || '9230';
const script = path.join(__dirname, '_live-bottle-shop-create.mjs');
const PROJECTS = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const brandCore = brand.replace(/\s+[a-z0-9]{3,5}$/i, '').trim() || brand;

function latestBrandFolder() {
  try {
    return fs.readdirSync(PROJECTS, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const p = path.join(PROJECTS, d.name);
        let m = 0;
        try { m = fs.statSync(p).mtimeMs; } catch { /* ignore */ }
        return { name: d.name, path: p, m };
      })
      .filter((d) => new RegExp(brandCore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(d.name))
      .sort((a, b) => b.m - a.m)[0] || null;
  } catch {
    return null;
  }
}

function runStep(step) {
  return new Promise((resolve, reject) => {
    console.log(`\n######## STEP ${step} · ${brand} ########\n`);
    const child = spawn(process.execPath, [script], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        NOVA_CDP_PORT: port,
        NOVA_BOTTLE_MODE: 'step',
        NOVA_BOTTLE_STEP: String(step),
        NOVA_CREATE_BRAND: brand,
      },
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`step ${step} exited ${code}`));
    });
  });
}

function runGoBuildNudge() {
  return new Promise((resolve, reject) => {
    console.log(`\n######## GO-BUILD NUDGE · ${brand} ########\n`);
    const child = spawn(process.execPath, [script], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        NOVA_CDP_PORT: port,
        NOVA_BOTTLE_MODE: 'step',
        NOVA_BOTTLE_STEP: 'go',
        NOVA_CREATE_BRAND: brand,
      },
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`go-build nudge exited ${code}`));
    });
  });
}

console.log('Step-all brand:', brand);
for (const step of [1, 2, 3, 4]) {
  await runStep(step);
  let disk = latestBrandFolder();
  console.log(`after step ${step}:`, disk || 'no folder');
  if (step === 1 && !disk) {
    console.log('Step 1 left greenfield/plan — sending Create project / go build…');
    await runGoBuildNudge();
    disk = latestBrandFolder();
    console.log('after go-build:', disk || 'no folder');
  }
  if (step === 1 && !disk) {
    throw new Error('Step 1 produced no project folder — aborting step ladder');
  }
}
console.log('\n=== ALL STEPS DONE ===', brand);
