import { useEffect, useRef, useState } from 'react';

type Props = {
  active: boolean;
  onScore?: (score: number) => void;
  /** Compact panel mode: status on top, canvas fills remaining space. */
  compact?: boolean;
};

/**
 * Lightweight endless runner — canvas only, no downloads.
 * Starts slow and ramps up. Space / click / tap to jump.
 */
export function NovaRunnerGame({ active, onScore, compact = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem('ark:runner-best') || 0) || 0;
    } catch {
      return 0;
    }
  });
  const [alive, setAlive] = useState(true);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 640;
    let H = compact ? 300 : 220;
    const syncSize = () => {
      if (compact && wrap) {
        const r = wrap.getBoundingClientRect();
        W = Math.max(320, Math.floor(r.width));
        H = Math.max(200, Math.floor(r.height));
      } else {
        W = 640;
        H = 220;
      }
      canvas.width = W;
      canvas.height = H;
    };
    syncSize();

    let raf = 0;
    let running = true;
    let dead = false;
    let sc = 0;
    /** Start slow — ramps toward max as score grows. */
    const SPEED_START = 2.15;
    const SPEED_MAX = 9.2;
    let speed = SPEED_START;
    let groundY = H - 40;
    let player = { x: 56, y: groundY, vy: 0, w: 22, h: 36, onGround: true };
    let obstacles: { x: number; w: number; h: number }[] = [];
    let spawnAt = 110;
    let frame = 0;

    const resetPlayer = () => {
      groundY = H - 40;
      player = { x: Math.min(64, W * 0.1), y: groundY, vy: 0, w: 22, h: 36, onGround: true };
    };

    const reset = () => {
      dead = false;
      sc = 0;
      speed = SPEED_START;
      obstacles = [];
      spawnAt = 110;
      frame = 0;
      resetPlayer();
      setAlive(true);
      setScore(0);
    };

    const jump = () => {
      if (dead) {
        reset();
        return;
      }
      if (player.onGround) {
        // Softer jump so slow start feels controllable
        player.vy = -9.4;
        player.onGround = false;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        jump();
      }
    };
    const onPointer = () => jump();

    window.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', onPointer);

    const ro =
      compact && wrap && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            const prevW = W;
            const prevH = H;
            syncSize();
            if (W !== prevW || H !== prevH) {
              const dy = groundY;
              groundY = H - 40;
              player.y += groundY - dy;
              if (player.y > groundY) player.y = groundY;
            }
          })
        : null;
    if (ro && wrap) ro.observe(wrap);

    const drawPerson = (x: number, y: number, jumping: boolean) => {
      const cx = x + player.w / 2;
      const top = y;
      const headR = 5.5;
      const torsoTop = top + headR * 2 + 1;
      const hipY = top + player.h - 14;
      const footY = top + player.h;

      ctx.strokeStyle = '#f0f3f8';
      ctx.fillStyle = '#f0f3f8';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.arc(cx, top + headR, headR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx, torsoTop);
      ctx.lineTo(cx, hipY);
      ctx.stroke();

      const swing = jumping ? 0 : Math.sin(frame * 0.22) * 0.55;

      ctx.beginPath();
      if (jumping) {
        ctx.moveTo(cx, torsoTop + 4);
        ctx.lineTo(cx - 10, torsoTop - 2);
        ctx.moveTo(cx, torsoTop + 4);
        ctx.lineTo(cx + 10, torsoTop - 2);
      } else {
        ctx.moveTo(cx, torsoTop + 4);
        ctx.lineTo(cx - 9, torsoTop + 10 + swing * 6);
        ctx.moveTo(cx, torsoTop + 4);
        ctx.lineTo(cx + 9, torsoTop + 10 - swing * 6);
      }
      ctx.stroke();

      ctx.beginPath();
      if (jumping) {
        ctx.moveTo(cx, hipY);
        ctx.lineTo(cx - 7, hipY + 8);
        ctx.lineTo(cx - 4, footY - 2);
        ctx.moveTo(cx, hipY);
        ctx.lineTo(cx + 8, hipY + 6);
        ctx.lineTo(cx + 11, footY - 4);
      } else {
        ctx.moveTo(cx, hipY);
        ctx.lineTo(cx - 6 - swing * 5, footY);
        ctx.moveTo(cx, hipY);
        ctx.lineTo(cx + 6 + swing * 5, footY);
      }
      ctx.stroke();
    };

    const loop = () => {
      if (!running) return;
      frame += 1;
      ctx.fillStyle = '#0a0c12';
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(232,238,247,0.22)';
      ctx.beginPath();
      ctx.moveTo(0, groundY + 1);
      ctx.lineTo(W, groundY + 1);
      ctx.stroke();
      const dash = (frame * speed) % 28;
      ctx.setLineDash([10, 14]);
      ctx.beginPath();
      ctx.moveTo(-dash, groundY + 8);
      ctx.lineTo(W, groundY + 8);
      ctx.stroke();
      ctx.setLineDash([]);

      if (!dead) {
        player.vy += 0.48;
        player.y += player.vy;
        if (player.y >= groundY) {
          player.y = groundY;
          player.vy = 0;
          player.onGround = true;
        }

        spawnAt -= 1;
        if (spawnAt <= 0) {
          const h = 16 + Math.random() * 20;
          obstacles.push({ x: W + 10, w: 12 + Math.random() * 10, h });
          // More gap early; tighter as speed climbs
          const baseGap = 95 - Math.min(40, speed * 4);
          spawnAt = baseGap + Math.random() * 55;
        }

        for (const o of obstacles) o.x -= speed;
        obstacles = obstacles.filter(o => o.x + o.w > -20);

        for (const o of obstacles) {
          const px = player.x + 4;
          const py = player.y - player.h + 6;
          const pw = player.w - 6;
          const ph = player.h - 8;
          const ox = o.x;
          const oy = groundY - o.h;
          if (px < ox + o.w && px + pw > ox && py < oy + o.h && py + ph > oy) {
            dead = true;
            setAlive(false);
            setBest(prev => {
              const next = Math.max(prev, Math.floor(sc));
              try {
                localStorage.setItem('ark:runner-best', String(next));
              } catch {
                /* ignore */
              }
              return next;
            });
          }
        }

        sc += speed * 0.055;
        // Slow → fast curve (gentle early, steeper later)
        speed = Math.min(SPEED_MAX, SPEED_START + (sc / 420) * (SPEED_MAX - SPEED_START) + sc / 900);
        const rounded = Math.floor(sc);
        setScore(rounded);
        onScore?.(rounded);
      }

      for (const o of obstacles) {
        ctx.fillStyle = 'rgba(110, 176, 216, 0.85)';
        ctx.fillRect(o.x, groundY - o.h, o.w, o.h);
      }

      drawPerson(player.x, player.y - player.h, !player.onGround || player.vy < -1);

      if (dead) {
        ctx.fillStyle = 'rgba(10,12,18,0.5)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#e8eef7';
        ctx.font = '600 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Try again', W / 2, H / 2 - 4);
        ctx.font = '500 11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(232,238,247,0.65)';
        ctx.fillText('Space or click', W / 2, H / 2 + 16);
        ctx.textAlign = 'left';
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onPointer);
      ro?.disconnect();
    };
  }, [active, onScore, compact]);

  const statusRight = !alive
    ? 'Space to retry'
    : score > 0
      ? `Score ${score}`
      : 'Space to jump';

  if (compact) {
    return (
      <div className="flex flex-col h-full min-h-0 w-full gap-2">
        <div className="flex items-center justify-between text-[11px] text-content-tertiary shrink-0 px-0.5">
          <span className="tabular-nums">Best {best}</span>
          <span className="tabular-nums">{statusRight}</span>
        </div>
        <div ref={wrapRef} className="flex-1 min-h-0 w-full">
          <canvas
            ref={canvasRef}
            className="w-full h-full rounded-xl border border-white/[0.06] bg-[#0a0c12] touch-none block"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-[11px] text-content-tertiary px-0.5">
        <span className="tabular-nums">Best {best}</span>
        <span className="tabular-nums">{statusRight}</span>
      </div>
      <div ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="w-full max-w-full rounded-xl border border-white/[0.06] bg-[#0a0c12] touch-none"
          style={{ aspectRatio: '640 / 220' }}
        />
      </div>
    </div>
  );
}
