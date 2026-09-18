/**
 * package.json version must match package-lock and (when present) release/latest.yml.
 * Fails the build if someone bumps one without the others.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (m) => console.log('OK:', m);
const fail = (m) => { console.error('FAIL:', m); failed += 1; };

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const pkgVer = String(pkg.version || '').trim();
if (!/^\d+\.\d+\.\d+/.test(pkgVer)) fail(`package.json version invalid: ${pkgVer}`);
else ok(`package.json ${pkgVer}`);

const lockPath = path.join(root, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const lockVer = String(lock.version || lock.packages?.['']?.version || '').trim();
  if (lockVer !== pkgVer) fail(`package-lock version ${lockVer} !== package.json ${pkgVer}`);
  else ok(`package-lock matches ${pkgVer}`);
} else {
  fail('package-lock.json missing');
}

const latestPath = path.join(root, 'release', 'latest.yml');
if (fs.existsSync(latestPath)) {
  const yml = fs.readFileSync(latestPath, 'utf8');
  const m = yml.match(/^\s*version:\s*['"]?([0-9]+\.[0-9]+\.[0-9]+)/m);
  const ymlVer = m?.[1] || '';
  // release/ is gitignored — local leftover builds often lag. Fail hard only when
  // publishing (NOVA_RELEASE_LOCK=1) or when CI uploads the artifact.
  if (ymlVer !== pkgVer) {
    if (process.env.NOVA_RELEASE_LOCK === '1') {
      fail(`release/latest.yml version ${ymlVer} !== package.json ${pkgVer}`);
    } else {
      console.warn(`WARN: local release/latest.yml is ${ymlVer} (package ${pkgVer}) — rebuild before publish`);
      ok(`latest.yml deferred (set NOVA_RELEASE_LOCK=1 to enforce)`);
    }
  } else {
    ok(`latest.yml matches ${pkgVer}`);
  }
} else {
  ok('release/latest.yml absent (ok until release build)');
}

const websitePkg = path.join(root, 'website', 'package.json');
if (fs.existsSync(websitePkg)) {
  const w = JSON.parse(fs.readFileSync(websitePkg, 'utf8'));
  // Website may be independent; only lock when it declares the same product version field.
  if (w.novaDesktopVersion && String(w.novaDesktopVersion) !== pkgVer) {
    fail(`website novaDesktopVersion ${w.novaDesktopVersion} !== ${pkgVer}`);
  } else {
    ok('website version field ok (or unset)');
  }
}

const appId = pkg.build?.appId || pkg.build?.productName;
if (pkg.build?.appId && /ark|other.?product/i.test(String(pkg.build.appId)) && !/nova/i.test(String(pkg.build.appId))) {
  fail(`suspicious appId (updater feed must stay NOVA): ${pkg.build.appId}`);
} else if (pkg.build?.appId) {
  ok(`appId ${pkg.build.appId}`);
}

process.exit(failed ? 1 : 0);
