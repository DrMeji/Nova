/**
 * Standalone update-splash preview (Electron window, ~5s).
 * node scripts/preview-update-splash.cjs
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const electronBin = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const runner = path.join(root, 'scripts', '_splash-preview-main.cjs');

const main = `
const { app, BrowserWindow } = require('electron');
const path = require('path');
const arkUpdater = require(path.join(__dirname, '..', 'electron', 'arkUpdater.cjs'));

app.whenReady().then(async () => {
  try {
    await arkUpdater.previewSplashDev(5000);
  } catch (err) {
    console.error(err);
  } finally {
    app.quit();
  }
});
app.on('window-all-closed', () => app.quit());
`;

fs.writeFileSync(runner, main, 'utf8');
const child = spawn(electronBin, [runner], {
  cwd: root,
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
  stdio: 'inherit',
  windowsHide: false,
});
child.on('exit', (code) => process.exit(code ?? 0));
