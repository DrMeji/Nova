import { useEffect, useRef, useState } from 'react';

type Props = {
  active: boolean;
  onScore?: (score: number) => void;
};

/**
 * Lightweight endless runner (Chrome dino vibe) — canvas only, no downloads.
 * Space / click / tap to jump.
 */
export function ArkRunnerGame({ active, onScore }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 640;
    const H = 220;
    canvas.width = W;
    canvas.height = H;

    let raf = 0;
    let running = true;
    let dead = false;
    let sc = 0;
    let speed = 5.2;
    const groundY = H - 36;
    let player = { x: 56, y: groundY, vy: 0, w: 28, h: 32, onGround: true };
    let obstacles: { x: number; w: number; h: number }[] = [];
    let spawnAt = 90;
    let frame = 0;

    const reset = () => {
      dead = false;
      sc = 0;
      speed = 5.2;
      player = { x: 56, y: groundY, vy: 0, w: 28, h: 32, onGround: true };
      obstacles = [];
      spawnAt = 90;
      frame = 0;
      setAlive(true);
      setScore(0);
    };

    const jump = () => {
      if (dead) {
        reset();
        return;
      }
      if (player.onGround) {
        player.vy = -11.2;
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

    const drawBot = (x: number, y: number) => {
      ctx.strokeStyle = '#e8eef7';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      // body
      ctx.strokeRect(x + 4, y + 6, 20, 20);
      // eyes
      ctx.beginPath();
      ctx.moveTo(x + 10, y + 12);
      ctx.lineTo(x + 10, y + 20);
      ctx.moveTo(x + 18, y + 12);
      ctx.lineTo(x + 18, y + 20);
      ctx.stroke();
      // antenna
      ctx.beginPath();
      ctx.moveTo(x + 14, y + 6);
      ctx.lineTo(x + 14, y);
      ctx.moveTo(x + 10, y);
      ctx.lineTo(x + 18, y);
      ctx.stroke();
    };

    const loop = () => {
      if (!running) return;
      frame += 1;
      ctx.fillStyle = '#0a0c12';
      ctx.fillRect(0, 0, W, H);

      // ground
      ctx.strokeStyle = 'rgba(232,238,247,0.22)';
      ctx.beginPath();
      ctx.moveTo(0, groundY + 1);
      ctx.lineTo(W, groundY + 1);
      ctx.stroke();
      // dashed ground motion
      const dash = (frame * speed) % 28;
      ctx.setLineDash([10, 14]);
      ctx.beginPath();
      ctx.moveTo(-dash, groundY + 8);
      ctx.lineTo(W, groundY + 8);
      ctx.stroke();
      ctx.setLineDash([]);

      if (!dead) {
        player.vy += 0.55;
        player.y += player.vy;
        if (player.y >= groundY) {
          player.y = groundY;
          player.vy = 0;
          player.onGround = true;
        }

        spawnAt -= 1;
        if (spawnAt <= 0) {
          const h = 18 + Math.random() * 22;
          obstacles.push({ x: W + 10, w: 14 + Math.random() * 10, h });
          spawnAt = 55 + Math.random() * 70 - Math.min(30, speed * 2);
        }

        for (const o of obstacles) o.x -= speed;
        obstacles = obstacles.filter(o => o.x + o.w > -20);

        for (const o of obstacles) {
          const px = player.x + 4;
          const py = player.y - player.h + 6;
          const pw = player.w - 8;
          const ph = player.h - 6;
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

        sc += speed * 0.08;
        speed = Math.min(11, 5.2 + sc / 180);
        const rounded = Math.floor(sc);
        setScore(rounded);
        onScore?.(rounded);
      }

      for (const o of obstacles) {
        ctx.fillStyle = 'rgba(110, 176, 216, 0.85)';
        ctx.fillRect(o.x, groundY - o.h, o.w, o.h);
      }

      drawBot(player.x, player.y - player.h);

      ctx.fillStyle = 'rgba(232,238,247,0.7)';
      ctx.font = '600 13px Sora, system-ui, sans-serif';
      ctx.fillText(`Score ${Math.floor(sc)}`, 16, 24);

      if (dead) {
        ctx.fillStyle = 'rgba(10,12,18,0.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#e8eef7';
        ctx.font = '600 18px Fraunces, Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('Ouch!', W / 2, H / 2 - 10);
        ctx.font = '500 12px Sora, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(232,238,247,0.7)';
        ctx.fillText('Space or click to try again', W / 2, H / 2 + 16);
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
    };
  }, [active, onScore]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-content-tertiary px-0.5">
        <span>Space / click to jump</span>
        <span>
          Best {best}
          {!alive ? ' · tap to retry' : ` · ${score}`}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full max-w-full rounded-xl border border-surface-border bg-[#0a0c12] touch-none"
        style={{ aspectRatio: '640 / 220' }}
      />
    </div>
  );
}
