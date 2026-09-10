/**
 * Playable Pong scaffold when free models leave a todo/marketing shell on a game brief.
 */
export function buildPongGameScaffold(projectName: string): Record<string, string> {
  const title = String(projectName || 'EmberPong').replace(/[`$\\]/g, '').trim() || 'EmberPong';

  const app = `import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';

const W = 960;
const H = 540;
const PADDLE_H = 108;
const PADDLE_W = 16;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function App() {
  const canvasRef = useRef(null);
  const keys = useRef({});
  const game = useRef({
    left: 216,
    right: 216,
    ball: { x: W / 2, y: H / 2, vx: 6.4, vy: 3.2 },
    score: [0, 0],
    flash: 0,
    playing: true,
  });
  const [score, setScore] = useState([0, 0]);
  const [paused, setPaused] = useState(false);

  const serve = useCallback((to = Math.random() > 0.5 ? 1 : -1) => {
    const g = game.current;
    g.ball = {
      x: W / 2,
      y: H / 2,
      vx: to * 6.2,
      vy: (Math.random() * 5 - 2.5) || 2,
    };
    g.flash = 26;
  }, []);

  const reset = () => {
    game.current.score = [0, 0];
    game.current.left = game.current.right = 216;
    setScore([0, 0]);
    serve();
  };

  useEffect(() => {
    const down = (e) => {
      keys.current[e.key.toLowerCase()] = true;
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
      if (e.key.toLowerCase() === 'r') reset();
    };
    const up = (e) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    const draw = () => {
      const g = game.current;
      const b = g.ball;
      if (!paused) {
        const k = keys.current;
        if (k.w || k.arrowup) g.left = clamp(g.left - 8, 12, H - PADDLE_H - 12);
        if (k.s || k.arrowdown) g.left = clamp(g.left + 8, 12, H - PADDLE_H - 12);
        const target = clamp(b.y - PADDLE_H / 2, 12, H - PADDLE_H - 12);
        g.right += (target - g.right) * 0.085;
        b.x += b.vx;
        b.y += b.vy;
        if (b.y < 14 || b.y > H - 14) b.vy *= -1;
        if (b.x < 54 && b.y > g.left && b.y < g.left + PADDLE_H) {
          b.x = 54;
          b.vx = Math.abs(b.vx) * 1.04;
          b.vy += (b.y - (g.left + PADDLE_H / 2)) * 0.12;
        }
        if (b.x > W - 54 && b.y > g.right && b.y < g.right + PADDLE_H) {
          b.x = W - 54;
          b.vx = -Math.abs(b.vx) * 1.04;
          b.vy += (b.y - (g.right + PADDLE_H / 2)) * 0.12;
        }
        if (b.x < -20) {
          g.score[1] += 1;
          setScore([...g.score]);
          serve(1);
        }
        if (b.x > W + 20) {
          g.score[0] += 1;
          setScore([...g.score]);
          serve(-1);
        }
        if (g.flash > 0) g.flash -= 1;
      }

      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, 620);
      bg.addColorStop(0, '#32131a');
      bg.addColorStop(0.6, '#180d12');
      bg.addColorStop(1, '#09080d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,154,61,.16)';
      ctx.setLineDash([10, 17]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W / 2, 22);
      ctx.lineTo(W / 2, H - 22);
      ctx.stroke();
      ctx.setLineDash([]);
      const paddle = (x, y, flip) => {
        const gr = ctx.createLinearGradient(x, y, x + PADDLE_W, y);
        gr.addColorStop(0, flip ? '#ffcf76' : '#d64a2b');
        gr.addColorStop(1, flip ? '#ed6b36' : '#ffb04c');
        ctx.shadowColor = '#ff6635';
        ctx.shadowBlur = 18;
        ctx.fillStyle = gr;
        ctx.fillRect(x, y, PADDLE_W, PADDLE_H);
        ctx.shadowBlur = 0;
      };
      paddle(38, g.left, false);
      paddle(W - 54, g.right, true);
      ctx.shadowColor = '#ffd589';
      ctx.shadowBlur = 26;
      ctx.fillStyle = '#fff3c9';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffe0a8';
      ctx.font = '700 42px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(g.score[0]), W * 0.25, 64);
      ctx.fillText(String(g.score[1]), W * 0.75, 64);
      if (paused) {
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ffe7c2';
        ctx.font = '700 28px "Segoe UI", sans-serif';
        ctx.fillText('Paused — space to resume', W / 2, H / 2);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [paused, serve]);

  return (
    <main className="app">
      <header className="top">
        <div>
          <p className="eyebrow">Court glow</p>
          <h1>${title}</h1>
        </div>
        <div className="hud">
          <span>{score[0]} — {score[1]}</span>
          <button type="button" onClick={() => setPaused((p) => !p)}>{paused ? 'Resume' : 'Pause'}</button>
          <button type="button" onClick={reset}>Reset</button>
        </div>
      </header>
      <canvas ref={canvasRef} width={W} height={H} aria-label="${title} playfield" />
      <p className="hint">W/S or ↑/↓ move · Space pause · R reset · AI holds the right paddle</p>
    </main>
  );
}
`;

  const css = `:root {
  --bg: #09080d;
  --ink: #ffe7c2;
  --muted: #c9a88a;
  --panel: #140e12;
  --accent: #ff9a3d;
}
* { box-sizing: border-box; }
.app {
  min-height: 100vh;
  margin: 0;
  padding: 1.2rem 1.2rem 2rem;
  background:
    radial-gradient(900px 420px at 50% -10%, #4a1d24 0%, transparent 55%),
    var(--bg);
  color: var(--ink);
  font-family: "Segoe UI", "Helvetica Neue", sans-serif;
  display: grid;
  justify-items: center;
  gap: 0.85rem;
}
.top {
  width: min(960px, 100%);
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 1rem;
}
.eyebrow {
  margin: 0 0 0.35rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
  font-size: 0.72rem;
}
h1 {
  margin: 0;
  font-size: clamp(1.8rem, 4vw, 2.6rem);
}
.hud {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}
.hud button {
  border: 0;
  border-radius: 999px;
  padding: 0.55rem 0.9rem;
  background: var(--accent);
  color: #2a1208;
  font-weight: 700;
  cursor: pointer;
}
canvas {
  width: min(960px, 100%);
  height: auto;
  border-radius: 1rem;
  border: 1px solid rgba(255, 154, 61, 0.25);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  background: #120b0f;
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
}
`;

  const indexCss = `* { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; }
body {
  font-family: "Segoe UI", "Helvetica Neue", sans-serif;
  background: #09080d;
  color: #ffe7c2;
}
`;

  return {
    'src/App.jsx': app,
    'src/App.css': css,
    'src/index.css': indexCss,
  };
}

export function briefLooksLikePongGame(brief: string, title = ''): boolean {
  const t = `${brief} ${title}`.toLowerCase();
  return /\bpong\b/.test(t)
    || (/\bpaddle\b/.test(t) && /\bball\b/.test(t))
    || /\bemberpong\b/.test(t);
}
