/** Local-only failure / update reports — never uploaded. */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function logDir() {
  const dir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function reportPath() {
  return path.join(logDir(), 'ark-local-reports.jsonl');
}

function appendReport(kind, payload) {
  try {
    const line = JSON.stringify({
      at: new Date().toISOString(),
      kind: String(kind || 'note'),
      ...payload,
    });
    fs.appendFileSync(reportPath(), `${line}\n`, 'utf8');
    return { ok: true, path: reportPath() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'write failed' };
  }
}

function listReports(limit = 40) {
  try {
    if (!fs.existsSync(reportPath())) return { ok: true, items: [], path: reportPath() };
    const lines = fs.readFileSync(reportPath(), 'utf8').split(/\r?\n/).filter(Boolean);
    const items = lines.slice(-limit).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    }).reverse();
    return { ok: true, items, path: reportPath() };
  } catch (err) {
    return { ok: false, items: [], error: err instanceof Error ? err.message : 'read failed' };
  }
}

function clearReports() {
  try {
    if (fs.existsSync(reportPath())) fs.unlinkSync(reportPath());
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'clear failed' };
  }
}

module.exports = {
  appendReport,
  listReports,
  clearReports,
  reportPath,
  logDir,
};
