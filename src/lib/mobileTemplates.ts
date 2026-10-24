/**
 * Real Xcode (SwiftUI) and Android Studio (Kotlin/Compose) starters.
 * NOVA authors the project; a Mac / Android Studio ships it.
 */

import { classifyMobileTarget, type MobileTarget } from '@/lib/mobileTarget';
import {
  classifyMobileDevice,
  deviceLine,
  isLayoutLockAsk,
  resolveDevices,
  type PhoneDevice,
} from '@/lib/mobileDevices';

type ParsedFileEdit = { path: string; content: string };

















function ideaFromMessage(message: string, name: string) {
  if (/\bcalculator\b/i.test(message)) return 'Basic calculator';
  return name;
}

function wantsCalculator(message: string, name: string) {
  return /\bcalculator\b/i.test(message) || /^calculator$/i.test(name);
}



function htmlEscape(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function previewHtml(name: string, idea: string, device: PhoneDevice): string {
  if (wantsCalculator('', name) || /calculator/i.test(idea)) {
    return calculatorPreviewHtml(name, device);
  }
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${htmlEscape(name)}</title>
<style>
  html,body{margin:0;height:100%;background:#070b14;color:#e8eef8;font-family:ui-sans-serif,system-ui,sans-serif}
  .wrap{min-height:100%;padding:28px 22px;display:flex;flex-direction:column;box-sizing:border-box}
  .kicker{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7dd3fc;opacity:.9}
  h1{font-size:22px;margin:14px 0 8px;font-weight:650}
  p{color:#94a3b8;line-height:1.45;font-size:14px;margin:0}
  .cta{margin-top:auto;background:#38bdf8;color:#0b1220;border:0;border-radius:999px;padding:12px 18px;font-weight:650;font-size:14px}
</style>
</head>
<body>
  <div class="wrap">
    <div class="kicker">${htmlEscape(deviceLine(device))}</div>
    <h1>${htmlEscape(name)}</h1>
    <p>${htmlEscape(idea)}</p>
    <button class="cta" type="button">Continue</button>
  </div>
</body>
</html>
`;
}

function calculatorPreviewHtml(name: string, device: PhoneDevice): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${htmlEscape(name)}</title>
<style>
  html,body{margin:0;height:100%;background:#050608;color:#f8fafc;font-family:ui-sans-serif,system-ui,sans-serif}
  .shell{min-height:100%;display:flex;flex-direction:column;padding:18px 14px 22px;box-sizing:border-box}
  .kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8}
  .screen{margin:18px 4px 16px;font-size:42px;font-weight:650;text-align:right;min-height:52px;word-break:break-all}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:auto}
  button{border:0;border-radius:999px;height:58px;font-size:22px;font-weight:600;cursor:pointer;color:#f8fafc;background:#27272a}
  button.op{background:#f59e0b;color:#111}
  button.eq{background:#38bdf8;color:#082f49}
  button.wide{grid-column:span 2}
</style>
</head>
<body>
  <div class="shell">
    <div class="kicker">${htmlEscape(deviceLine(device))}</div>
    <div class="screen" id="out">0</div>
    <div class="grid">
      ${['C','÷','×','-','7','8','9','+','4','5','6','=','1','2','3','0'].map(key => {
        const cls = key === '=' ? 'eq' : /[÷×+-]/.test(key) ? 'op' : key === '0' ? 'wide' : '';
        return `<button class="${cls}" data-k="${key}">${key === '0' ? '0' : key}</button>`;
      }).join('')}
    </div>
  </div>
  <script>
    const out = document.getElementById('out');
    let cur = '0';
    document.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-k');
      if (k === 'C') { cur = '0'; }
      else if (k === '=') {
        try { cur = String(eval(cur.replace(/÷/g,'/').replace(/×/g,'*'))); }
        catch { cur = 'Error'; }
      } else {
        cur = (cur === '0' || cur === 'Error') ? k : cur + k;
      }
      out.textContent = cur;
    }));
  </script>
</body>
</html>
`;
}

export function planMobileFiles(target: MobileTarget, message: string, projectName?: string): string[] {
  return mobileTemplateEdits(target, message, projectName).map(e => e.path);
}

export function mobileTemplateEdits(
  _target: MobileTarget,
  _message: string,
  _projectName?: string,
  _files?: Record<string, string>,
): ParsedFileEdit[] {
  // Never invent a full iOS/Android app from a canned template.
  // Model must write native files; layoutLockEdits can still patch an existing tree.
  return [];
}

function iosAppDir(files: Record<string, string>) {
  const hit = Object.keys(files).find(p => /ios\/[^/]+\/ContentView\.swift$/i.test(p));
  return hit ? hit.replace(/\/ContentView\.swift$/i, '') : null;
}

function androidMainActivity(files: Record<string, string>) {
  return Object.keys(files).find(p => /MainActivity\.kt$/i.test(p)) || null;
}

/** Patch canvas size without regenerating the whole app. */
export function layoutLockEdits(
  files: Record<string, string>,
  message: string,
  target: MobileTarget,
): ParsedFileEdit[] {
  const devices = resolveDevices(target, message);
  const out: ParsedFileEdit[] = [];
  const iosDir = iosAppDir(files);
  if (devices.ios && iosDir && files[`${iosDir}/Devices.swift`]) {
    const d = devices.ios;
    out.push({
      path: `${iosDir}/Devices.swift`,
      content: `import CoreGraphics

enum Devices {
    static let design = CGSize(width: ${d.width}, height: ${d.height})
    static let iPhoneSE = CGSize(width: 375, height: 667)
    static let iPhone16 = CGSize(width: 393, height: 852)
    static let iPhone16ProMax = CGSize(width: 440, height: 956)
    static let iPadMini = CGSize(width: 744, height: 1133)
    static let iPadPro11 = CGSize(width: 834, height: 1194)
    static let iPadPro13 = CGSize(width: 1024, height: 1366)
    static let mac14 = CGSize(width: 1440, height: 900)
}
`,
    });
    const view = files[`${iosDir}/ContentView.swift`] || '';
    if (view) {
      out.push({
        path: `${iosDir}/ContentView.swift`,
        content: view
          .replace(/Text\("[^"]*·[^"]*"\)/, `Text(${JSON.stringify(deviceLine(d))})`)
          .replace(/Text\("(iPhone|iPad|Mac|Pixel|Galaxy)[^"]*"\)/, `Text(${JSON.stringify(d.label)})`)
          .replace(/#Preview\("[^"]*"\)/, `#Preview(${JSON.stringify(d.label)})`)
          .replace(
            /PreviewDevice\(rawValue: "[^"]*"\)/,
            `PreviewDevice(rawValue: ${JSON.stringify(d.xcodePreview || d.label)})`,
          ),
      });
    }
    const previewName = iosDir.split('/')[1] || 'App';
    const existingPreview = files['nova-preview.html'];
    if (existingPreview) {
      const kicker = htmlEscape(deviceLine(d));
      const next = existingPreview
        .replace(/<div class="kicker">[^<]*<\/div>/, `<div class="kicker">${kicker}</div>`)
        .replace(/IPHONE\s*1[0-9](?:\s+PRO\s+MAX)?[^<]*/i, kicker);
      out.push({ path: 'nova-preview.html', content: next });
    } else {
      out.push({
        path: 'nova-preview.html',
        content: previewHtml(previewName, ideaFromMessage(message, previewName), d),
      });
    }
  }
  const activity = androidMainActivity(files);
  if (devices.android && activity && files[activity]) {
    const d = devices.android;
    out.push({
      path: activity,
      content: files[activity]
        .replace(/widthDp\s*=\s*\d+/g, `widthDp = ${d.width}`)
        .replace(/heightDp\s*=\s*\d+/g, `heightDp = ${d.height}`)
        .replace(/name\s*=\s*"[^"]*"/, `name = ${JSON.stringify(d.label)}`),
    });
    if (files['android/app/src/main/res/values/dimens.xml']) {
      out.push({
        path: 'android/app/src/main/res/values/dimens.xml',
        content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <dimen name="design_width">${d.width}dp</dimen>
    <dimen name="design_height">${d.height}dp</dimen>
    <dimen name="phone_width">360dp</dimen>
    <dimen name="phone_height">800dp</dimen>
    <dimen name="tablet_width">800dp</dimen>
    <dimen name="tablet_height">1280dp</dimen>
</resources>
`,
      });
    }
  }
  return out;
}

export function formatNativeBuildReply(label: string, message: string, files: Record<string, string>): string {
  const target = classifyMobileTarget(message)
    || (Object.keys(files).some(p => p.endsWith('.swift')) && Object.keys(files).some(p => p.endsWith('.kt'))
      ? 'both'
      : Object.keys(files).some(p => p.endsWith('.swift'))
        ? 'ios'
        : 'android');
  const devices = resolveDevices(target, message);
  const size = devices.ios ? deviceLine(devices.ios) : devices.android ? deviceLine(devices.android) : '';
  const ios = target === 'ios' || target === 'both';
  const android = target === 'android' || target === 'both';
  return [
    `I wrote a native **${label}**${size ? ` for ${size}` : ''}.`,
    '',
    'This is not a website in a browser. Start shows a device-sized preview in NOVA.',
    ios ? 'On a Mac: clone from GitHub and open `ios/*.xcodeproj` in Xcode, then Archive for the App Store.' : '',
    android ? 'Anywhere: open the `android` folder in Android Studio, then ship an AAB to Play Console.' : '',
    '',
    'Tap **Push to GitHub** when you want the repo on the other machine. Use the size chips if you want a different phone or tablet canvas.',
  ].filter(Boolean).join('\n');
}

export function formatNativePushReply(remote: string, files: Record<string, string>): string {
  const https = remote.replace(/git@github\.com:/, 'https://github.com/').replace(/\.git$/, '');
  const ios = Object.keys(files).some(p => /\.swift$|\.pbxproj$/i.test(p));
  const android = Object.keys(files).some(p => /\.kt$|androidmanifest/i.test(p));
  return [
    `Pushed to GitHub.`,
    https ? `Repo: ${https}` : '',
    '',
    ios ? `Mac: git clone ${https || 'the repo'} && open ios/*.xcodeproj` : '',
    android ? `Android Studio: File → Open → android/` : '',
  ].filter(Boolean).join('\n');
}

function isWebOnly(edits: ParsedFileEdit[]) {
  if (!edits.length) return true;
  return edits.every(e =>
    /\.(html?|css|js|mjs)$/i.test(e.path) || /^(index\.html|css\/|js\/)/i.test(e.path),
  );
}

function hasNative(edits: ParsedFileEdit[]) {
  return edits.some(e =>
    /\.(swift|pbxproj|kt|kts)$/i.test(e.path) || /androidmanifest\.xml$/i.test(e.path),
  );
}

function remapNativeEdits(edits: ParsedFileEdit[], files: Record<string, string>): ParsedFileEdit[] {
  const iosDir = iosAppDir(files);
  if (!iosDir) return edits;
  const prefix = iosDir; // ios/ExistingName
  return edits.map(e => {
    const path = e.path.replace(/\\/g, '/');
    if (/^ios\/[^/]+\//.test(path) && !path.includes('.xcodeproj')) {
      return { ...e, path: path.replace(/^ios\/[^/]+/, prefix) };
    }
    return e;
  });
}

function swiftColor(name: string): string | null {
  if (/black|dark/i.test(name)) return 'Color.black';
  if (/white/i.test(name)) return 'Color.white';
  if (/blue/i.test(name)) return 'Color.blue';
  if (/red/i.test(name)) return 'Color.red';
  if (/green/i.test(name)) return 'Color.green';
  return null;
}

function cssColor(name: string): string | null {
  if (/black|dark/i.test(name)) return '#000000';
  if (/white/i.test(name)) return '#ffffff';
  if (/blue/i.test(name)) return '#2563eb';
  if (/red/i.test(name)) return '#dc2626';
  if (/green/i.test(name)) return '#16a34a';
  return null;
}

function contrastTextForBg(bg: string): string {
  const dark = /#0|#1|#2|black|dark/i.test(bg);
  const light = /#f|#e|white/i.test(bg);
  if (dark) return '#f5f7fb';
  if (light) return '#111827';
  return '#e8eefc';
}

function patchWebBodyColors(css: string, bg: string, fg: string): string {
  let next = css;
  if (/body\s*\{[^}]*background(?:-color)?\s*:/i.test(next)) {
    next = next.replace(/(body\s*\{[^}]*?)background(?:-color)?\s*:\s*[^;]+/i, `$1background: ${bg}`);
  } else if (/body\s*\{/i.test(next)) {
    next = next.replace(/body\s*\{/i, `body {\n  background: ${bg};`);
  } else {
    next = `body { background: ${bg}; color: ${fg}; }\n${next}`;
  }
  if (/body\s*\{[^}]*\bcolor\s*:/i.test(next)) {
    next = next.replace(/(body\s*\{[^}]*?)\bcolor\s*:\s*[^;]+/i, `$1color: ${fg}`);
  } else if (/body\s*\{/i.test(next)) {
    next = next.replace(/body\s*\{/i, `body {\n  color: ${fg};`);
  }
  if (/h1\s*\{[^}]*\bcolor\s*:/i.test(next)) {
    next = next.replace(/(h1\s*\{[^}]*?)\bcolor\s*:\s*[^;]+/i, `$1color: ${fg}`);
  }
  return next;
}

/** Cheap local patches so “change the background” doesn’t spawn a new app folder. */
export function simpleVisualPatchEdits(files: Record<string, string>, message: string): ParsedFileEdit[] {
  const out: ParsedFileEdit[] = [];
  const t = String(message || '');
  const iosDir = iosAppDir(files);
  const viewPath = iosDir ? `${iosDir}/ContentView.swift` : null;
  const colorWord = t.match(/\b(black|white|blue|dark|red|green)\b/i)?.[1];
  const wantsBg = /\bbackground\b/i.test(t) && Boolean(colorWord);
  const wantsTextColor = /\b(text|words?|title|heading|hello\s*world)\b.{0,40}\b(white|black|color)\b|\b(white|black)\s+(color|text)\b/i.test(t);
  const renameTo = t.match(/(?:change|rename|set|into).{0,48}(?:to|into)\s+["']?([A-Za-z0-9][A-Za-z0-9 .+-]{1,40})/i)?.[1]?.trim()
    || t.match(/(?:saying|say)\s+["']?([A-Za-z0-9][A-Za-z0-9 .+-]{1,40})/i)?.[1]?.trim();

  if (wantsBg && colorWord && viewPath && files[viewPath]) {
    const color = swiftColor(colorWord);
    if (color) {
      let view = files[viewPath];
      if (/\.background\(Color\.(black|white|clear)\)/.test(view)) {
        view = view.replace(/\.background\(Color\.(black|white|clear)\)/, `.background(${color})`);
      } else if (/\.background\(Color\(red:[^)]*\)\)/.test(view)) {
        view = view.replace(/\.background\(Color\(red:[^)]*\)\)/, `.background(${color})`);
      } else {
        view = view.replace(
          /(\.frame\(maxWidth: \.infinity, maxHeight: \.infinity\))/,
          `$1\n            .background(${color})`,
        );
      }
      out.push({ path: viewPath, content: view });
    }
  }

  const htmlColor = colorWord ? cssColor(colorWord) : null;
  if ((wantsBg || wantsTextColor) && htmlColor) {
    const fg = wantsTextColor && /\bwhite\b/i.test(t)
      ? '#ffffff'
      : wantsTextColor && /\bblack\b/i.test(t) && !wantsBg
        ? '#111827'
        : contrastTextForBg(htmlColor);
    if (files['nova-preview.html']) {
      out.push({
        path: 'nova-preview.html',
        content: files['nova-preview.html']
          .replace(/background(?:-color)?:\s*#[0-9a-fA-F]{3,8}/gi, `background:${htmlColor}`)
          .replace(/\bcolor\s*:\s*#[0-9a-fA-F]{3,8}/gi, `color:${fg}`),
      });
    }
    if (files['index.html']) {
      const html = files['index.html'].replace(/background(?:-color)?:\s*[^;]+/gi, `background: ${htmlColor}`);
      out.push({ path: 'index.html', content: html });
    }
    const cssPath = Object.keys(files).find(p => /styles?\.css$/i.test(p) || /index\.css$/i.test(p));
    if (cssPath && files[cssPath]) {
      out.push({ path: cssPath, content: patchWebBodyColors(files[cssPath], htmlColor, fg) });
    }
  }

  if (renameTo && viewPath && files[viewPath] && !classifyMobileDevice(t)) {
    const view = files[viewPath].replace(/Text\("[^"]+"\)/, `Text(${JSON.stringify(renameTo)})`);
    out.push({ path: viewPath, content: view });
  }

  if (renameTo && !classifyMobileDevice(t)) {
    const safe = renameTo.replace(/</g, '');
    for (const path of Object.keys(files)) {
      if (!/\.html?$/i.test(path)) continue;
      const html = files[path];
      if (!/<h1[\s>]/i.test(html)) continue;
      out.push({
        path,
        content: html.replace(/(<h1[^>]*>)([\s\S]*?)(<\/h1>)/i, `$1${safe}$3`),
      });
    }
  }

  const namedDevice = classifyMobileDevice(t);
  if (namedDevice && files && (iosDir || androidMainActivity(files))) {
    const target = iosDir ? 'ios' : 'android';
    const locked = layoutLockEdits(files, t, target);
    for (const edit of locked) {
      if (!out.some(e => e.path === edit.path)) out.push(edit);
    }
  }

  return out;
}

function hasExistingNative(files?: Record<string, string>) {
  if (!files) return false;
  return Boolean(iosAppDir(files) || androidMainActivity(files));
}

/** If chat asked for a store app but the brain returned a website, use the native template. */
export function finalizeMobileEdits(
  message: string,
  edits: ParsedFileEdit[],
  files?: Record<string, string>,
): ParsedFileEdit[] {
  const target = classifyMobileTarget(message);
  const existing = hasExistingNative(files);
  if (existing && files) {
    if (isLayoutLockAsk(message) || classifyMobileDevice(message)) {
      const lockTarget = target || (iosAppDir(files) ? 'ios' : 'android');
      const locked = layoutLockEdits(files, message, lockTarget);
      const visual = simpleVisualPatchEdits(files, message);
      const merged = [...locked];
      for (const edit of visual) {
        if (!merged.some(e => e.path === edit.path)) merged.push(edit);
      }
      if (merged.length) return merged;
    }
    const visual = simpleVisualPatchEdits(files, message);
    if (visual.length && (!edits.length || isWebOnly(edits))) return visual;
    if (edits.length && hasNative(edits)) return remapNativeEdits(edits, files);
    if (visual.length) return visual;
    return edits;
  }
  return edits;
}

export function preferredMobileFocus(paths: string[]): string | undefined {
  return paths.find(p => p.endsWith('ContentView.swift'))
    || paths.find(p => p.endsWith('MainActivity.kt'))
    || paths.find(p => p.endsWith('.swift') || p.endsWith('.kt'))
    || paths[0];
}
