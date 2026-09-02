import { useEffect, useState } from 'react';
import type { VoiceSessionPhase } from '@/lib/voiceMode';

type VoiceArkFaceProps = {
  phase: VoiceSessionPhase;
  className?: string;
};

/** Head box in viewBox space (rounded square only — no ears/antenna). */
const HEAD_X = 36;
const HEAD_Y = 34;
const HEAD_W = 128;
const HEAD_H = 128;
const HEAD_RX = 39;
const HEAD_STROKE = 2.0;
/** Inset for inner shimmer fill (inside the stroke). */
const INNER_PAD = 5;

const HEAD_SCALE = 128 / 36;
function ix(x: number) {
  return HEAD_X + (x - 14) * HEAD_SCALE;
}
function iy(y: number) {
  return HEAD_Y + (y - 16) * HEAD_SCALE;
}

const EYE_HALF_H = 6 * HEAD_SCALE;
const EYE_STROKE = 2.6 * (200 / 64);
const LEFT_EYE_X = ix(25);
const RIGHT_EYE_X = ix(39);
const EYE_Y = iy(34);

const BAR_COUNT = 9;
const BAR_H = 14;
const BAR_SPACING = 4;
const BAR_X0 = 100 - ((BAR_COUNT - 1) / 2) * BAR_SPACING;
const BAR_Y = iy(46);

const INNER_X = HEAD_X + INNER_PAD;
const INNER_Y = HEAD_Y + INNER_PAD;
const INNER_W = HEAD_W - INNER_PAD * 2;
const INNER_H = HEAD_H - INNER_PAD * 2;
const INNER_RX = HEAD_RX - 3;

/** ARK voice face — rounded box, subtle inner shimmer, mouth bars while speaking. */
export function VoiceArkFace({ phase, className = '' }: VoiceArkFaceProps) {
  const [blink, setBlink] = useState(false);
  const speaking = phase === 'speaking';

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      const delay = 2200 + Math.random() * 3000;
      timer = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => {
          setBlink(false);
          schedule();
        }, 140);
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  const eyeScale = phase === 'listening' ? 1.08 : phase === 'error' ? 0.86 : 1;

  return (
    <div className={`select-none ${className}`}>
      <svg viewBox="0 0 200 200" className="w-full h-full" aria-hidden="true">
        <defs>
          <clipPath id="voice-head-inner-clip">
            <rect x={INNER_X} y={INNER_Y} width={INNER_W} height={INNER_H} rx={INNER_RX} />
          </clipPath>
          <linearGradient id="voice-head-shimmer-grad" gradientUnits="userSpaceOnUse" x1="36" y1="34" x2="164" y2="162">
            <stop offset="0%" stopColor="rgb(56 189 248)" stopOpacity="0.14" />
            <stop offset="45%" stopColor="rgb(129 140 248)" stopOpacity="0.11" />
            <stop offset="100%" stopColor="rgb(52 211 153)" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        <g clipPath="url(#voice-head-inner-clip)">
          <rect
            x={HEAD_X - 24}
            y={HEAD_Y - 24}
            width={HEAD_W + 48}
            height={HEAD_H + 48}
            fill="url(#voice-head-shimmer-grad)"
            className="voice-head-shimmer"
          />
        </g>

        <rect
          x={HEAD_X}
          y={HEAD_Y}
          width={HEAD_W}
          height={HEAD_H}
          rx={HEAD_RX}
          fill="none"
          stroke="white"
          strokeWidth={HEAD_STROKE}
        />

        <Eye cx={LEFT_EYE_X} cy={EYE_Y} blink={blink} scale={eyeScale} />
        <Eye cx={RIGHT_EYE_X} cy={EYE_Y} blink={blink} scale={eyeScale} />

        {speaking ? <VoiceMouth /> : null}
      </svg>
    </div>
  );
}

function VoiceMouth() {
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0.6));

  useEffect(() => {
    const flicker = () => {
      setLevels(Array.from({ length: BAR_COUNT }, () => {
        if (Math.random() < 0.22) return 0.18 + Math.random() * 0.2;
        return 0.5 + Math.random() * 0.5;
      }));
    };
    flicker();
    const id = window.setInterval(flicker, 90);
    return () => window.clearInterval(id);
  }, []);

  return (
    <g className="voice-mouth">
      {levels.map((level, i) => {
        const x = BAR_X0 + i * BAR_SPACING;
        const scale = 0.3 + level * 0.7;
        return (
          <g key={i} transform={`translate(${x} ${BAR_Y}) scale(1 ${scale})`}>
            <line
              x1={0}
              y1={-BAR_H / 2}
              x2={0}
              y2={BAR_H / 2}
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="voice-ark-bar"
              opacity={0.55 + level * 0.45}
            />
          </g>
        );
      })}
    </g>
  );
}

function Eye({
  cx,
  cy,
  blink,
  scale,
}: {
  cx: number;
  cy: number;
  blink: boolean;
  scale: number;
}) {
  const blinkScale = blink ? 0.06 : scale;

  return (
    <g transform={`translate(${cx} ${cy})`}>
      <g transform={`scale(1 ${blinkScale})`} className="voice-ark-eye-group">
        <line
          x1={0}
          y1={-EYE_HALF_H}
          x2={0}
          y2={EYE_HALF_H}
          stroke="white"
          strokeWidth={EYE_STROKE}
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}
