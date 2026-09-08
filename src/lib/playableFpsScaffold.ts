/**
 * Last-resort playable FPS scaffold when the model fails the playable-game gate.
 * Used only after create/rebuild retries — never as the first-pass UI.
 */

export function buildPlayableFpsScaffold(productName = 'FPS Arena'): {
  'src/App.jsx': string;
  'src/App.css': string;
} {
  const title = String(productName || 'FPS Arena').replace(/[\\`]/g, '');
  return {
    'src/App.jsx': `import { useEffect, useRef, useState } from 'react';
import './App.css';

const MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,2,0,0,0,0,0,2,0,0,1],
  [1,0,0,0,0,1,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,2,0,1],
  [1,0,0,1,0,0,0,1,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,2,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,1,0,0,2,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1],
];
const FOV = Math.PI / 3;

function blocked(x, y, map) {
  const mx = Math.floor(x);
  const my = Math.floor(y);
  if (my < 0 || mx < 0 || my >= map.length || mx >= map[0].length) return true;
  return map[my][mx] === 1;
}

function hitscan(px, py, ang, map, range = 8) {
  const step = 0.08;
  let x = px;
  let y = py;
  for (let i = 0; i < range / step; i++) {
    x += Math.cos(ang) * step;
    y += Math.sin(ang) * step;
    const mx = Math.floor(x);
    const my = Math.floor(y);
    if (my < 0 || mx < 0 || my >= map.length || mx >= map[0].length) return { kind: 'wall' };
    const cell = map[my][mx];
    if (cell === 1) return { kind: 'wall', mx, my };
    if (cell === 2) return { kind: 'crate', mx, my };
  }
  return { kind: 'none' };
}

export default function App() {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    map: MAP.map((row) => row.slice()),
    x: 2.5,
    y: 2.5,
    ang: 0,
    keys: Object.create(null),
    enemy: { x: 9.5, y: 9.5, alive: true },
    hp: 3,
    flash: 0,
    win: false,
    lose: false,
    paused: false,
  });
  const [hud, setHud] = useState({ hp: 3, win: false, lose: false, paused: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let lastHurt = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const onKeyDown = (e) => {
      const s = stateRef.current;
      s.keys[e.code] = true;
      if (e.code === 'Escape') {
        s.paused = !s.paused;
        setHud((h) => ({ ...h, paused: s.paused }));
      }
      if (e.code === 'KeyR') {
        Object.assign(s, {
          map: MAP.map((row) => row.slice()),
          x: 2.5,
          y: 2.5,
          ang: 0,
          enemy: { x: 9.5, y: 9.5, alive: true },
          hp: 3,
          flash: 0,
          win: false,
          lose: false,
          paused: false,
        });
        setHud({ hp: 3, win: false, lose: false, paused: false });
      }
    };
    const onKeyUp = (e) => { stateRef.current.keys[e.code] = false; };

    const onMouseMove = (e) => {
      if (document.pointerLockElement !== canvas) return;
      stateRef.current.ang += e.movementX * 0.0025;
    };

    const shoot = () => {
      const s = stateRef.current;
      if (s.paused || s.win || s.lose) return;
      s.flash = 8;
      const hit = hitscan(s.x, s.y, s.ang, s.map);
      if (hit.kind === 'crate') s.map[hit.my][hit.mx] = 0;
      if (s.enemy.alive) {
        const dx = s.enemy.x - s.x;
        const dy = s.enemy.y - s.y;
        const dist = Math.hypot(dx, dy);
        const toEnemy = Math.atan2(dy, dx);
        let diff = Math.abs(toEnemy - s.ang) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (dist < 7 && diff < 0.12) {
          const blockedRay = hitscan(s.x, s.y, s.ang, s.map, dist);
          if (blockedRay.kind !== 'wall' && blockedRay.kind !== 'crate') {
            s.enemy.alive = false;
            s.win = true;
            setHud((h) => ({ ...h, win: true }));
          }
        }
      }
    };

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
        return;
      }
      shoot();
    };

    const tick = () => {
      const s = stateRef.current;
      const w = canvas.width;
      const h = canvas.height;
      if (!s.paused && !s.win && !s.lose) {
        const speed = 0.045;
        let mx = 0;
        let my = 0;
        if (s.keys.KeyW) { mx += Math.cos(s.ang); my += Math.sin(s.ang); }
        if (s.keys.KeyS) { mx -= Math.cos(s.ang); my -= Math.sin(s.ang); }
        if (s.keys.KeyA) { mx += Math.cos(s.ang - Math.PI / 2); my += Math.sin(s.ang - Math.PI / 2); }
        if (s.keys.KeyD) { mx += Math.cos(s.ang + Math.PI / 2); my += Math.sin(s.ang + Math.PI / 2); }
        const len = Math.hypot(mx, my) || 1;
        const nx = s.x + (mx / len) * speed;
        const ny = s.y + (my / len) * speed;
        if (!blocked(nx, s.y, s.map)) s.x = nx;
        if (!blocked(s.x, ny, s.map)) s.y = ny;

        if (s.enemy.alive) {
          const dx = s.x - s.enemy.x;
          const dy = s.y - s.enemy.y;
          const d = Math.hypot(dx, dy) || 1;
          const ex = s.enemy.x + (dx / d) * 0.02;
          const ey = s.enemy.y + (dy / d) * 0.02;
          if (!blocked(ex, s.enemy.y, s.map)) s.enemy.x = ex;
          if (!blocked(s.enemy.x, ey, s.map)) s.enemy.y = ey;
          if (d < 0.55) {
            const now = performance.now();
            if (now - lastHurt > 700) {
              lastHurt = now;
              s.hp -= 1;
              setHud((prev) => ({ ...prev, hp: s.hp }));
              if (s.hp <= 0) {
                s.lose = true;
                setHud((prev) => ({ ...prev, lose: true, hp: 0 }));
              }
            }
          }
        }
        if (s.flash > 0) s.flash -= 1;
      }

      // ceiling / floor
      ctx.fillStyle = '#1a1a22';
      ctx.fillRect(0, 0, w, h / 2);
      ctx.fillStyle = '#2a2a32';
      ctx.fillRect(0, h / 2, w, h / 2);

      const cols = Math.floor(w / 2);
      for (let col = 0; col < cols; col++) {
        const rayAng = s.ang - FOV / 2 + (col / cols) * FOV;
        let dist = 0;
        let hit = 0;
        let hitX = 0;
        let hitY = 0;
        while (dist < 16) {
          dist += 0.05;
          hitX = s.x + Math.cos(rayAng) * dist;
          hitY = s.y + Math.sin(rayAng) * dist;
          const mx = Math.floor(hitX);
          const my = Math.floor(hitY);
          if (my < 0 || mx < 0 || my >= s.map.length || mx >= s.map[0].length) { hit = 1; break; }
          const cell = s.map[my][mx];
          if (cell === 1) { hit = 1; break; }
          if (cell === 2) { hit = 2; break; }
        }
        const corr = dist * Math.cos(rayAng - s.ang);
        const wallH = Math.min(h, (h * 0.75) / Math.max(0.1, corr));
        const shade = Math.max(40, 220 - corr * 28);
        if (hit === 2) ctx.fillStyle = \`rgb(\${shade},\${Math.floor(shade * 0.55)},40)\`;
        else ctx.fillStyle = \`rgb(\${shade},\${shade},\${shade})\`;
        const x0 = (col / cols) * w;
        ctx.fillRect(x0, (h - wallH) / 2, w / cols + 1, wallH);
      }

      // enemy billboard
      if (s.enemy.alive) {
        const dx = s.enemy.x - s.x;
        const dy = s.enemy.y - s.y;
        const dist = Math.hypot(dx, dy);
        let rel = Math.atan2(dy, dx) - s.ang;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        if (Math.abs(rel) < FOV / 2 && dist > 0.2) {
          const size = Math.min(h * 0.6, (h * 0.45) / dist);
          const sx = w / 2 + (rel / (FOV / 2)) * (w / 2) - size / 2;
          const sy = h / 2 - size / 2;
          ctx.fillStyle = '#c62828';
          ctx.fillRect(sx, sy, size, size);
        }
      }

      // crosshair
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 10, h / 2);
      ctx.lineTo(w / 2 + 10, h / 2);
      ctx.moveTo(w / 2, h / 2 - 10);
      ctx.lineTo(w / 2, h / 2 + 10);
      ctx.stroke();

      if (s.flash > 0) {
        ctx.fillStyle = 'rgba(255,200,80,0.35)';
        ctx.fillRect(w / 2 - 40, h - 90, 80, 50);
      }

      ctx.fillStyle = '#fff';
      ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('HP ' + s.hp, 16, 28);
      ctx.fillText('${title}', 16, 50);
      if (!document.pointerLockElement) {
        ctx.fillText('Click to lock mouse · WASD move · LMB shoot · R restart · Esc pause', 16, h - 24);
      }
      if (s.paused) ctx.fillText('PAUSED', w / 2 - 40, 40);
      if (s.win) ctx.fillText('YOU WIN — press R', w / 2 - 70, 40);
      if (s.lose) ctx.fillText('GAME OVER — press R', w / 2 - 80, 40);

      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }, []);

  return (
    <div className="fps-root">
      <canvas ref={canvasRef} className="fps-canvas" />
      <div className="fps-hud" aria-hidden>
        HP {hud.hp}{hud.paused ? ' · PAUSED' : ''}{hud.win ? ' · WIN' : ''}{hud.lose ? ' · LOSE' : ''}
      </div>
    </div>
  );
}
`,
    'src/App.css': `html, body, #root {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}
.fps-root {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: #000;
}
.fps-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}
.fps-hud {
  position: absolute;
  left: 12px;
  top: 8px;
  color: #fff;
  font: 14px ui-monospace, monospace;
  pointer-events: none;
  opacity: 0.85;
}
`,
  };
}
