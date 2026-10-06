/**
 * Brief realization — the stage create was missing.
 * Checkers (Preview Ready, game Ready, verify) only report gaps.
 * Image materialize only saves pictures.
 * This pass writes the layout, asked colors, hero slot, and dead-control
 * behavior the coder skipped, then the Ready gate runs again.
 */

import { looksLikeFpsGame, looksLikePlayableCanvasGame, looksLikeSpatialApp } from '@/lib/freshSpaFromBrief';
import {
  healUnbalancedCssBraces,
  briefLooksLikeAppleStyleHomepage,
  appleHomepageHasProductBands,
  healHiddenProductBands,
} from '@/lib/createBuildQuality';
import { svgPremiumProductStageDataUrl } from '@/lib/createIdentity';

const NAMED_COLORS: Array<[RegExp, string]> = [
  [/dark\s+green|starbucks\s+green|forest\s+green/i, '#1e3932'],
  [/\bgreen\b/i, '#1e3932'],
  [/\bgold\b/i, '#c4a45a'],
  [/\bcream\b|\bparchment\b/i, '#f3eee4'],
  [/\bwhite\b/i, '#ffffff'],
  [/\bnavy\b/i, '#0b1f3a'],
  [/\bblack\b/i, '#14181c'],
  [/\bslate\b|\bcharcoal\b/i, '#2c333a'],
];

function namedColor(phrase: string): string | null {
  for (const [re, hex] of NAMED_COLORS) {
    if (re.test(phrase)) return hex;
  }
  const hex = phrase.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/i);
  return hex ? hex[0] : null;
}

export type BriefColors = {
  header: string | null;
  wordmark: string | null;
  banner: string | null;
  page: string | null;
};

/** Pull header / wordmark / banner / page colors out of the ask. Palette used to ignore these. */
export function colorsFromBrief(brief: string): BriefColors {
  const t = String(brief || '');
  const headerPhrase = t.match(/(?:dark\s+green|starbucks\s+green|forest\s+green|green|navy|black|slate|charcoal|#[0-9a-f]{3,6})\s+header/i)?.[0]
    || t.match(/header[^.]{0,40}?(?:dark\s+green|green|navy|black|#[0-9a-f]{3,6})/i)?.[0]
    || '';
  const wordPhrase = t.match(/(?:white|cream|gold|black|#[0-9a-f]{3,6})\s+wordmark/i)?.[0] || '';
  const bannerPhrase = t.match(/(?:gold|green|cream|#[0-9a-f]{3,6})\s+banner/i)?.[0] || '';
  const pagePhrase = t.match(/(?:cream|parchment|white)\s+(?:and|page|background|atmosphere)/i)?.[0]
    || (/\bcream\b|\bparchment\b/i.test(t) ? 'cream' : '');
  return {
    header: headerPhrase ? namedColor(headerPhrase) : null,
    wordmark: wordPhrase ? namedColor(wordPhrase) : null,
    banner: bannerPhrase ? namedColor(bannerPhrase) : null,
    page: pagePhrase ? namedColor(pagePhrase) : null,
  };
}

function heroHref(files: Record<string, string>, productName: string): string {
  const hit = Object.keys(files)
    .map((p) => p.replace(/\\/g, '/'))
    .find((p) => /public\/heroes\/.+\.(?:jpe?g|png|webp)$/i.test(p));
  if (hit) return '/' + hit.replace(/^public\//i, '');
  const slug = String(productName || 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand';
  return `/heroes/${slug}-hero.jpg`;
}

function displayTitle(productName: string): string {
  return String(productName || 'Brand')
    .replace(/-[a-z0-9]{4,8}$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim() || 'Brand';
}

function playableGameCss(): string {
  return `.app {
  min-height: 100vh;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: #07070c;
  color: #f4f7fb;
  font-family: system-ui, sans-serif;
}
.hud {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.85rem 1.25rem;
  width: min(640px, 94vw);
}
.hud h1 { margin: 0; font-size: 1.35rem; letter-spacing: -0.02em; }
.hud p { margin: 0; color: #a8b0c0; font-size: 0.95rem; }
.hud button {
  border: 1px solid #39ff14;
  background: transparent;
  color: #39ff14;
  padding: 0.35rem 0.85rem;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
}
canvas {
  display: block;
  max-width: 94vw;
  background: #0a0a12;
  border: 1px solid #1c2230;
  border-radius: 8px;
}
.hint { margin: 0; color: #6b7385; font-size: 0.85rem; }
`;
}

function playableBreakoutApp(title: string): string {
  const safe = title.replace(/[<>&'"]/g, '').slice(0, 32);
  return `import { useEffect, useRef, useState } from 'react';
import './App.css';

export default function App() {
  const ref = useRef(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [over, setOver] = useState(false);
  const restartRef = useRef(() => {});
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const keys = {};
    let paddle = { x: W / 2 - 40, y: H - 28, w: 80, h: 12 };
    let ball = { x: W / 2, y: H - 48, vx: 3.2, vy: -3.4, r: 7 };
    let bricks = [];
    let running = true;
    let raf = 0;
    let localScore = 0;
    let localLives = 3;
    const resetBricks = () => {
      bricks = [];
      const cols = 8;
      const rows = 4;
      const bw = (W - 40) / cols;
      const bh = 16;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          bricks.push({ x: 20 + c * bw, y: 48 + r * (bh + 6), w: bw - 4, h: bh, alive: true });
        }
      }
    };
    const resetBall = () => {
      ball = { x: W / 2, y: H - 48, vx: 3.2 * (Math.random() > 0.5 ? 1 : -1), vy: -3.4, r: 7 };
      paddle.x = W / 2 - paddle.w / 2;
    };
    const fullReset = () => {
      localScore = 0;
      localLives = 3;
      setScore(0);
      setLives(3);
      setOver(false);
      running = true;
      resetBricks();
      resetBall();
    };
    restartRef.current = fullReset;
    resetBricks();
    const onKey = (e) => {
      keys[e.code] = e.type === 'keydown';
      if (e.type === 'keydown' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space')) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    const tick = () => {
      if (!running) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (keys.ArrowLeft || keys.KeyA) paddle.x -= 6;
      if (keys.ArrowRight || keys.KeyD) paddle.x += 6;
      paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));
      ball.x += ball.vx;
      ball.y += ball.vy;
      if (ball.x < ball.r || ball.x > W - ball.r) ball.vx *= -1;
      if (ball.y < ball.r) ball.vy *= -1;
      if (
        ball.y + ball.r >= paddle.y
        && ball.x >= paddle.x
        && ball.x <= paddle.x + paddle.w
        && ball.vy > 0
      ) {
        ball.vy *= -1;
        ball.y = paddle.y - ball.r;
        const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
        ball.vx = 3.6 * hit;
      }
      for (const b of bricks) {
        if (!b.alive) continue;
        if (
          ball.x + ball.r > b.x
          && ball.x - ball.r < b.x + b.w
          && ball.y + ball.r > b.y
          && ball.y - ball.r < b.y + b.h
        ) {
          b.alive = false;
          ball.vy *= -1;
          localScore += 10;
          setScore(localScore);
          break;
        }
      }
      if (bricks.every((b) => !b.alive)) resetBricks();
      if (ball.y > H + 20) {
        localLives -= 1;
        setLives(localLives);
        if (localLives <= 0) {
          running = false;
          setOver(true);
        } else {
          resetBall();
        }
      }
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#39ff14';
      ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fillStyle = '#f4f7fb';
      ctx.fill();
      for (const b of bricks) {
        if (!b.alive) continue;
        ctx.fillStyle = '#5b8cff';
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
      ctx.fillStyle = '#a8b0c0';
      ctx.font = '14px system-ui';
      ctx.fillText('Score ' + localScore + '   Lives ' + localLives, 12, 22);
      if (!running) {
        ctx.fillStyle = '#f4f7fb';
        ctx.font = 'bold 22px system-ui';
        ctx.fillText('Game over — press Restart', W / 2 - 120, H / 2);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);
  return (
    <main className="app">
      <header className="hud">
        <h1>${safe}</h1>
        <p>Score {score} · Lives {lives}{over ? ' · Game over' : ''}</p>
        <button type="button" onClick={() => restartRef.current()}>Restart</button>
      </header>
      <canvas ref={ref} width={640} height={400} tabIndex={0} aria-label="${safe} playfield" />
      <p className="hint">← → or A/D to move the paddle</p>
    </main>
  );
}
`;
}

function playableCanvasApp(title: string, fps: boolean, brief = ''): string {
  const safe = title.replace(/[<>&'"]/g, '').slice(0, 32);
  if (!fps && /\b(?:paddle|brick|breakout|arkanoid|bounce\s+a\s+ball)\b/i.test(brief)) {
    return playableBreakoutApp(safe);
  }
  return `import { useEffect, useRef, useState } from 'react';
import './App.css';

export default function App() {
  const ref = useRef(null);
  const [score, setScore] = useState(0);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const keys = {};
    let x = 160;
    let y = 120;
    let look = 0;
    let raf = 0;
    const onKey = (e) => { keys[e.code] = e.type === 'keydown'; };
    const onMouse = (e) => {
      if (e.type === 'mousedown') setScore((n) => n + 1);
      if (${fps ? 'true' : 'false'} && canvas.requestPointerLock) canvas.requestPointerLock();
    };
    const onMove = (e) => { if (document.pointerLockElement === canvas) look += e.movementX || 0; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    canvas.addEventListener('mousedown', onMouse);
    window.addEventListener('mousemove', onMove);
    const tick = () => {
      if (keys.KeyW || keys.ArrowUp) y -= 2;
      if (keys.KeyS || keys.ArrowDown) y += 2;
      if (keys.KeyA || keys.ArrowLeft) x -= 2;
      if (keys.KeyD || keys.ArrowRight) x += 2;
      ctx.fillStyle = '#1e3932';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f3eee4';
      ctx.fillRect(x, y, 28, 28);
      ctx.fillStyle = '#c4a45a';
      ctx.fillRect(200 + (look % 80), 80, 16, 16);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      canvas.removeEventListener('mousedown', onMouse);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);
  return (
    <main className="app">
      <h1>${safe}</h1>
      <p>Score {score}. ${fps ? 'Click to lock the pointer and shoot.' : 'Arrow keys or WASD to move.'}</p>
      <canvas ref={ref} width={480} height={280} />
    </main>
  );
}
`;
}

/**
 * Fill gaps the coder left: stacked sections, brief colors, a hero image,
 * click state on dead buttons, and a canvas loop when the brief is a game.
 */
export function realizeBriefUi(
  files: Record<string, string>,
  productName = 'App',
  brief = '',
): { files: Record<string, string>; changed: boolean; notes: string[] } {
  const next = { ...files };
  const notes: string[] = [];
  const appKey = next['src/App.jsx']
    ? 'src/App.jsx'
    : (next['src/App.tsx'] ? 'src/App.tsx' : '');
  if (!appKey) return { files: next, changed: false, notes };
  let app = String(next[appKey] || '');
  if (app.length < 80) return { files: next, changed: false, notes };

  const title = displayTitle(productName);
  const slug = String(productName || '');
  if (slug && slug !== title && new RegExp(slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(app)) {
    app = app.replace(new RegExp(slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), title);
    notes.push('display-title');
  }

  const href = heroHref(next, productName);
  // Apple.com-style briefs win over game/spatial heuristics (those false-positive on
  // marketing words like "viewport" / "3d transforms" in ensemble plans).
  // Never force Mac/iPad shells onto unrelated brands (vacuum, lamp, cafe, …).
  // Ignore "Forbidden: Apple Mac/iPad clones" mentions in the ask.
  const appleBrand = /\bapple\b/i.test(String(productName || ''))
    || /\b(?:build|create|make|start building)\s+apple\b/i.test(String(brief || ''))
    || /\bexact\s+apple(?:\.com)?[- ]?style\b/i.test(String(brief || ''));
  const appleLike = appleBrand && briefLooksLikeAppleStyleHomepage(brief);
  if (appleLike) {
    const beforeBands = app;
    app = healHiddenProductBands(app);
    if (app !== beforeBands) notes.push('unwrap-product-bands');
    const missingProductBands = !appleHomepageHasProductBands(app);
    const stubCopy = /\bBuilt for general users\b/i.test(app)
      || /\bBand\s*[1-4]\b/i.test(app)
      || /\bGet started\b/i.test(app) && /\bLearn more\b/i.test(app) && app.length < 3200;
    const thinOrHidden = app.length < 1600
      || /selectedProduct\s*===\s*['"]/.test(app)
      || missingProductBands
      || stubCopy
      || !/<nav\b/i.test(app)
      || /\bfrom\s+['"]three['"]/i.test(app);
    // Accept product-band / full-bleed / hero section structure — do NOT require
    // literal className="band" (that nuked rich craft into a repeated-hero floor).
    // Generic "Band 1/2/3" shells still count as missing product bands above.
    const hasLandingStructure = /className=["'][^"']*\b(?:band|product-band|full-?bleed|hero)\b/i.test(app)
      || ((app.match(/<(?:section|main)\b/gi) || []).length >= 3 && /<(?:nav|header)\b/i.test(app));
    if (thinOrHidden || !hasLandingStructure) {
      next[appKey] = appleStyleHomepageApp(title, href);
      next['src/App.css'] = appleStyleHomepageCss();
      notes.push('apple-style-floor');
      return { files: next, changed: true, notes };
    }
  }

  const fps = looksLikeFpsGame(brief);
  const game = fps || looksLikePlayableCanvasGame(brief);
  const spatial = !appleLike && looksLikeSpatialApp(brief);
  if (game && !appleLike && !/<canvas\b|\brequestAnimationFrame\b/i.test(app)) {
    next[appKey] = playableCanvasApp(displayTitle(productName), fps, brief);
    next['src/App.css'] = playableGameCss();
    notes.push(fps ? 'playable-fps-loop' : 'playable-canvas-loop');
    return { files: next, changed: true, notes };
  }
  if (spatial && !/\bfrom\s+['"]three['"]/i.test(app) && !/<canvas\b/i.test(app)) {
    const title = displayTitle(productName).replace(/[<>&'"]/g, '').slice(0, 32);
    next[appKey] = `import { useEffect, useRef } from 'react';
import './App.css';
import * as THREE from 'three';

export default function App() {
  const ref = useRef(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1e3932');
    const camera = new THREE.PerspectiveCamera(60, 480 / 280, 0.1, 100);
    camera.position.set(2.2, 1.4, 3);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(480, 280);
    host.appendChild(renderer.domElement);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: '#c4a45a' }),
    );
    scene.add(mesh);
    scene.add(new THREE.AmbientLight('#ffffff', 0.7));
    const key = new THREE.DirectionalLight('#ffffff', 1);
    key.position.set(3, 4, 2);
    scene.add(key);
    let raf = 0;
    const tick = () => {
      mesh.rotation.y += 0.01;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, []);
  return (
    <main className="app">
      <h1>${title}</h1>
      <div ref={ref} />
    </main>
  );
}
`;
    const withThree = ensureThreeDependency(next);
    Object.assign(next, withThree);
    notes.push('three-scene');
    return { files: next, changed: true, notes };
  }


  app = app.replace(/\bsrc=(["'])\/(?!heroes\/|logo\.svg|icons\/)[^"']+\.(?:svg|png|jpe?g)\1/gi, `src=$1${href}$1`);
  if (/className=["'][^"']*\bhero\b/i.test(app) && !/className=["'][^"']*\bhero\b[^]*?<img\b/i.test(app)) {
    app = app.replace(
      /(<section\b[^>]*className=["'][^"']*\bhero\b[^"']*["'][^>]*>)/i,
      `$1\n          <img className="hero-photo" src="${href}" alt="${title}" />`,
    );
    notes.push('hero-image');
  }

  const deadButtons = /<button\b(?![^>]*\bon(?:Click|Change)\s*=)/i.test(app);
  if (deadButtons && !/\buseState\s*\(/.test(app)) {
    if (/import\s+\{([^}]+)\}\s+from\s+['"]react['"]/.test(app)) {
      app = app.replace(
        /import\s+\{([^}]+)\}\s+from\s+['"]react['"]/,
        (full, inner) => (/\buseState\b/.test(inner) ? full : `import { ${inner.trim()}, useState } from 'react'`),
      );
    } else if (!/from\s+['"]react['"]/.test(app)) {
      app = `import { useState } from 'react';\n${app}`;
    }
    const stateLine = `  const [picked, setPicked] = useState('');\n  const [query, setQuery] = useState('');\n`;
    if (/function\s+App\s*\([^)]*\)\s*\{/.test(app)) {
      app = app.replace(/function\s+App\s*\([^)]*\)\s*\{/, (m) => `${m}\n${stateLine}`);
    } else if (/const\s+App\s*=\s*\([^)]*\)\s*=>\s*\{/.test(app)) {
      app = app.replace(/const\s+App\s*=\s*\([^)]*\)\s*=>\s*\{/, (m) => `${m}\n${stateLine}`);
    }
    app = app.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi, (full, attrs, inner) => {
      if (/\bonClick\s*=/.test(attrs)) return full;
      const label = String(inner).replace(/<[^>]+>/g, '').trim().slice(0, 48) || 'item';
      return `<button${attrs} onClick={() => setPicked(${JSON.stringify(label)})}>${inner}</button>`;
    });
    if (/<input\b/i.test(app) && !/\bonChange\s*=/.test(app)) {
      app = app.replace(/<input\b([^>]*)\/?>/i, (full, attrs) => {
        if (/\bvalue\s*=/.test(attrs)) return full;
        return `<input${attrs} value={query} onChange={(e) => setQuery(e.target.value)} />`;
      });
    }
    if (!/picked-note/.test(app) && /<main\b[^>]*>/i.test(app)) {
      app = app.replace(
        /<main\b[^>]*>/i,
        (m) => `${m}\n        {picked ? <p className="picked-note">{picked}</p> : null}`,
      );
    }
    notes.push('click-state');
  }

  next[appKey] = app;

  const colors = colorsFromBrief(brief);
  const cssKey = 'src/App.css';
  let css = String(next[cssKey] || '');
  if (!/NOVA realize/.test(css)) {
    const header = colors.header || '#0f1419';
    const word = colors.wordmark || '#e8eef4';
    const page = colors.page || '#0f1419';
    const banner = colors.banner || '#5b9fd4';
    css = `:root {
  --primary-color: ${header};
  --page-bg: ${page};
  --cream-color: ${page};
  --secondary-color: ${word};
  --nav-color: ${page};
  --nav-hover-color: ${header};
  --hero-gradient: linear-gradient(160deg, ${page}, color-mix(in srgb, ${header} 40%, ${page}));
}
${css}
/* NOVA realize — define the colors the page already uses, and show the hero photo */
.App-header, header { background: ${header}; color: ${word}; }
.App-menu, .menu-categories { display: flex; flex-wrap: wrap; justify-content: center; gap: 1rem; }
@keyframes novaHeroDrift { from { transform: translateY(0); } to { transform: translateY(-8px); } }
.App-menu img, .hero-photo, .App-hero img { width: min(220px, 70vw); height: 140px; object-fit: cover; border-radius: 12px; animation: novaHeroDrift 4.5s ease-in-out infinite alternate; }
.season-banner { width: 100%; text-align: center; background: ${banner}; color: ${word}; padding: 0.45rem 1rem; font-weight: 600; }
`;
    next[cssKey] = css;
    notes.push('layout-colors');
  }

  const healedCss = healUnbalancedCssBraces(String(next[cssKey] || ''));
  if (healedCss !== String(next[cssKey] || '')) {
    next[cssKey] = healedCss;
    notes.push('css-syntax');
  }

  return { files: next, changed: notes.length > 0, notes };
}

/**
 * Apply the concrete quoted bits of an edit the coder skipped:
 * a headline swap, and a banner line inserted under the header.
 */
export function applyQuotedUiEdits(
  files: Record<string, string>,
  message: string,
): { files: Record<string, string>; changed: boolean } {
  const next = { ...files };
  const appKey = next['src/App.jsx']
    ? 'src/App.jsx'
    : (next['src/App.tsx'] ? 'src/App.tsx' : '');
  if (!appKey) return { files: next, changed: false };
  let app = String(next[appKey] || '');
  const t = String(message || '');
  let changed = false;

  const headline = t.match(/\b(?:headline|title|h1)\s+(?:to|as)\s+["“”']([^"“”']{2,80})["“”']/i)?.[1]
    || t.match(/\bchange\s+(?:the\s+)?(?:hero\s+)?(?:headline|title)\s+to\s+["“”']([^"“”']{2,80})["“”']/i)?.[1];
  if (headline && !app.includes(headline)) {
    if (/<h1\b[^>]*>[^<]*<\/h1>/i.test(app)) {
      app = app.replace(/<h1\b([^>]*)>[^<]*<\/h1>/i, `<h1$1>${headline}</h1>`);
      changed = true;
    }
  }

  const banner = t.match(/\bbanner\b[^.\n]{0,80}?["“”']([^"“”']{2,80})["“”']/i)?.[1]
    || t.match(/\bthat says\s+["“”']([^"“”']{2,80})["“”']/i)?.[1];
    if (banner && !app.includes(banner)) {
    const node = `<div className="season-banner">${banner}</div>`;
    if (/<\/header>/i.test(app)) {
      app = app.replace(/<\/header>/i, `</header>\n      ${node}`);
    } else if (/<main\b/i.test(app)) {
      app = app.replace(/<main\b/i, `${node}\n      <main`);
    } else if (/return\s*\(\s*<div\b[^>]*>/i.test(app)) {
      app = app.replace(/return\s*\(\s*(<div\b[^>]*>)/i, `return (\n      $1\n        ${node}`);
    } else {
      app = app.replace(/return\s*\(\s*/, `return (\n      <>\n      ${node}\n      `);
      app = app.replace(/\n(\s*)\);\s*$/, `\n$1</>\n$1);\n`);
    }
    changed = true;
    const cssKey = 'src/App.css';
    const css = String(next[cssKey] || '');
    if (!/\.season-banner\b/.test(css)) {
      next[cssKey] = `${css}\n.season-banner { width: 100%; text-align: center; background: #c4a45a; color: #1a1f1c; padding: 0.45rem 1rem; font-weight: 600; }\n`;
    }
  }

  if (changed) next[appKey] = app;
  return { files: next, changed };
}

function ensureThreeDependency(files: Record<string, string>): Record<string, string> {
  const next = { ...files };
  let pkg = String(next['package.json'] || '');
  if (!pkg.trim()) return next;
  if (/"three"\s*:/.test(pkg)) return next;
  if (/"dependencies"\s*:\s*\{/.test(pkg)) {
    pkg = pkg.replace(/"dependencies"\s*:\s*\{/, `"dependencies": {\n    "three": "^0.170.0",`);
  }
  next['package.json'] = pkg;
  return next;
}

function appleStyleHomepageApp(title: string, heroSrc: string): string {
  const safe = title.replace(/[<>&'"]/g, '').slice(0, 40) || 'Apple';
  // Prefer premium embedded stages so Live never depends on a missing /heroes/*.jpg
  // or a legacy tablet-bezel SVG still sitting on disk.
  const phone = svgPremiumProductStageDataUrl({ name: safe, tag: 'iPhone', kind: 'phone' });
  const mac = svgPremiumProductStageDataUrl({ name: 'Mac', tag: 'Mac', kind: 'laptop' });
  const ipad = svgPremiumProductStageDataUrl({ name: 'iPad', tag: 'iPad', kind: 'tablet' });
  const watch = svgPremiumProductStageDataUrl({ name: 'Watch', tag: 'Watch', kind: 'watch' });
  const air = svgPremiumProductStageDataUrl({ name: 'AirPods', tag: 'AirPods', kind: 'buds' });
  void heroSrc;
  return `import './App.css';

const bands = [
  { id: 'mac', name: 'Mac', blurb: 'Mind-blowing. Head-turning.', tone: 'mac', src: ${JSON.stringify(mac)} },
  { id: 'ipad', name: 'iPad', blurb: 'Lovable. Drawable. Magical.', tone: 'ipad', src: ${JSON.stringify(ipad)} },
  { id: 'watch', name: 'Watch', blurb: 'Smarter. Brighter. Mightier.', tone: 'watch', src: ${JSON.stringify(watch)} },
  { id: 'airpods', name: 'AirPods', blurb: 'Sound that surrounds you.', tone: 'airpods', src: ${JSON.stringify(air)} },
];

export default function App() {
  return (
    <div className="site">
      <header className="topnav" role="banner">
        <nav className="topnav-inner" aria-label="Global">
          <a className="mark" href="#top">${safe}</a>
          <a href="#mac">Mac</a>
          <a href="#ipad">iPad</a>
          <a href="#iphone">iPhone</a>
          <a href="#watch">Watch</a>
          <a href="#airpods">AirPods</a>
          <a href="#support">Support</a>
        </nav>
      </header>
      <section className="hero product-band full-bleed" id="iphone">
        <p className="eyebrow">New</p>
        <h1>iPhone</h1>
        <p className="sub">Built for what matters most.</p>
        <div className="cta-row">
          <a className="pill pill-primary" href="#mac">Learn more</a>
          <a className="pill pill-ghost" href="#mac">Buy</a>
        </div>
        <img className="hero-stage" src={${JSON.stringify(phone)}} alt="iPhone" />
      </section>
      {bands.map((b) => (
        <section key={b.id} id={b.id} className={\`band product-band band-\${b.tone}\`}>
          <h2>{b.name}</h2>
          <p>{b.blurb}</p>
          <div className="cta-row">
            <a className="pill pill-primary" href={\`#\${b.id}\`}>Learn more</a>
            <a className="pill pill-ghost" href={\`#\${b.id}\`}>Buy</a>
          </div>
          <img src={b.src} alt={b.name} />
        </section>
      ))}
      <footer className="foot" id="support">
        <a href="#top">Store</a>
        <a href="#mac">Mac</a>
        <a href="#ipad">iPad</a>
        <a href="#watch">Watch</a>
        <a href="#airpods">AirPods</a>
        <a href="#support">Support</a>
        <a href="#top">Privacy</a>
        <a href="#top">Contact</a>
      </footer>
    </div>
  );
}
`;
}

function appleStyleHomepageCss(): string {
  return `:root {
  --ink: #1d1d1f;
  --mute: #86868b;
  --blue: #0071e3;
  --nav: #161617;
  --hero: #000000;
  --mac: #f5f5f7;
  --ipad: #e8f2ff;
  --watch: #fbf7f3;
  --airpods: #f5f5f7;
}
* { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; background: #fff; color: var(--ink); }
body { font-family: "SF Pro Display", "Segoe UI", Helvetica, Arial, sans-serif; }
.site { width: 100%; }
.topnav { position: sticky; top: 0; z-index: 40; background: rgba(22,22,23,0.92); backdrop-filter: blur(16px); }
.topnav-inner { max-width: 980px; margin: 0 auto; display: flex; flex-wrap: wrap; justify-content: center; gap: 1.1rem; padding: 0.7rem 1rem; }
.topnav a { color: #f5f5f7; text-decoration: none; font-size: 12px; opacity: 0.88; }
.topnav a:hover { opacity: 1; }
.mark { font-weight: 600; letter-spacing: -0.02em; }
.hero, .band { text-align: center; padding: 4.5rem 1.25rem 3.5rem; }
.hero { background: var(--hero); color: #f5f5f7; min-height: 78vh; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
.eyebrow { margin: 0 0 0.4rem; color: var(--mute); font-size: 0.95rem; letter-spacing: 0.04em; text-transform: uppercase; }
.hero h1, .band h2 { margin: 0; font-size: clamp(2.4rem, 7vw, 4.2rem); font-weight: 650; letter-spacing: -0.03em; }
.sub, .band p { margin: 0.65rem 0 0; font-size: clamp(1.05rem, 2.4vw, 1.35rem); color: inherit; opacity: 0.9; max-width: 34rem; }
.cta-row { display: flex; gap: 1rem; justify-content: center; margin-top: 1.25rem; flex-wrap: wrap; }
.pill { display: inline-flex; align-items: center; justify-content: center; padding: 0.55rem 1.15rem; border-radius: 980px; text-decoration: none; font-size: 0.95rem; }
.pill-primary { background: var(--blue); color: #fff; }
.pill-ghost { color: var(--blue); border: 1px solid var(--blue); background: transparent; }
.hero .pill-ghost { color: #2997ff; border-color: #2997ff; }
.hero-stage, .band img { width: min(720px, 86vw); margin-top: 2.4rem; border-radius: 28px; animation: floaty 7s ease-in-out infinite alternate; }
.band-mac { background: var(--mac); color: var(--ink); }
.band-ipad { background: var(--ipad); color: var(--ink); }
.band-watch { background: var(--watch); color: var(--ink); }
.band-airpods { background: var(--airpods); color: var(--ink); }
.foot { display: flex; flex-wrap: wrap; justify-content: center; gap: 1.25rem; padding: 2.5rem 1rem 3rem; background: #f5f5f7; }
.foot a { color: var(--mute); text-decoration: none; font-size: 0.85rem; }
.foot a:hover { color: var(--ink); }
@keyframes floaty { from { transform: translateY(0); } to { transform: translateY(-10px); } }
@media (prefers-reduced-motion: reduce) { .hero-stage, .band img { animation: none; } }
`;
}