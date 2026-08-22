import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

type Size = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<Size, string> = {
  xs: 'w-3.5 h-3.5 rounded',
  sm: 'w-9 h-9 rounded-xl',
  md: 'w-10 h-10 rounded-xl',
  lg: 'w-11 h-11 rounded-xl',
};

const TEXT_CLASS: Record<Size, string> = {
  xs: 'text-[7px]',
  sm: 'text-[10px]',
  md: 'text-[10px]',
  lg: 'text-sm',
};

type Mark = { bg: string; node: ReactNode };

function Svg({ children, viewBox = '0 0 24 24' }: { children: ReactNode; viewBox?: string }) {
  return (
    <svg viewBox={viewBox} className="w-[62%] h-[62%]" aria-hidden>
      {children}
    </svg>
  );
}

const MARKS: Record<string, Mark> = {
  github: {
    bg: 'bg-[#0D1117]',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#fff" d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.32.1-2.75 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 6.8c.85 0 1.71.12 2.51.35 1.9-1.32 2.74-1.05 2.74-1.05.55 1.43.2 2.49.1 2.75.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .26.18.58.69.48A10.05 10.05 0 0 0 22 12.26C22 6.58 17.52 2 12 2z" />
      </Svg>
    ),
  },
  notion: {
    bg: 'bg-white',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#000" d="M4.4 4.5 16.5 2.7c.55-.09 1.02.25 1.1.7l2.4 15.2c.09.55-.28 1.05-.83 1.14L7.1 21.7c-.55.09-1.05-.25-1.14-.8L3.6 5.5c-.1-.55.25-1 .8-1z" />
        <path fill="#fff" d="M8.5 8.2h1.85l3.7 7.6h.1V8.2H15.9v9.8h-1.9l-3.7-7.6h-.1v7.6H8.5V8.2z" />
      </Svg>
    ),
  },
  gmail: {
    bg: 'bg-white',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#EA4335" d="M20.5 18.2V8.6L12 14.7 3.5 8.6v9.6c0 .9.7 1.6 1.6 1.6h13.8c.9 0 1.6-.7 1.6-1.6z" />
        <path fill="#C5221F" d="M20.5 5.8c0-.9-.7-1.6-1.6-1.6H5.1c-.9 0-1.6.7-1.6 1.6v.4L12 12.8l8.5-6.6v-.4z" />
        <path fill="#4285F4" d="M3.5 6.2v11.2c0 .3.1.6.2.9l5.5-4.4V9.8L3.5 6.2z" />
        <path fill="#34A853" d="M20.5 6.2 15.3 9.8v4.1l5 4.4c.1-.3.2-.6.2-.9V6.2z" />
        <path fill="#FBBC04" d="M12 12.8 3.5 6.2V5.8L12 12.1 20.5 5.8v.4L12 12.8z" />
      </Svg>
    ),
  },
  slack: {
    bg: 'bg-white',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#E01E5A" d="M8.1 13.8a1.7 1.7 0 1 1-1.7-1.7h1.7v1.7zm.9 0a1.7 1.7 0 1 1 3.4 0v4.3a1.7 1.7 0 1 1-3.4 0v-4.3z" />
        <path fill="#36C5F0" d="M10.2 8.1a1.7 1.7 0 1 1 1.7-1.7v1.7h-1.7zm0 .9a1.7 1.7 0 1 1 0 3.4H5.9a1.7 1.7 0 1 1 0-3.4h4.3z" />
        <path fill="#2EB67D" d="M15.9 10.2a1.7 1.7 0 1 1 1.7 1.7h-1.7v-1.7zm-.9 0a1.7 1.7 0 1 1-3.4 0V5.9a1.7 1.7 0 1 1 3.4 0v4.3z" />
        <path fill="#ECB22E" d="M13.8 15.9a1.7 1.7 0 1 1-1.7 1.7v-1.7h1.7zm0-.9a1.7 1.7 0 1 1 0-3.4h4.3a1.7 1.7 0 1 1 0 3.4h-4.3z" />
      </Svg>
    ),
  },
  linear: {
    bg: 'bg-[#5E6AD2]',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#fff" d="M3.2 14.5 14.5 3.2A9 9 0 0 0 3.2 14.5zm2 3.4A9 9 0 0 0 17.9 5.2L5.2 17.9zm3.2 2.4A9 9 0 0 0 20.5 8.6L8.4 20.7z" />
      </Svg>
    ),
  },
  figma: {
    bg: 'bg-[#1E1E1E]',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#F24E1E" d="M8.5 2.5h3.5a3.5 3.5 0 0 1 0 7H8.5v-7z" />
        <path fill="#FF7262" d="M12 9.5h3.5a3.5 3.5 0 1 1 0 7H12v-7z" />
        <path fill="#A259FF" d="M8.5 16.5H12v3.5a3.5 3.5 0 1 1-3.5-3.5z" />
        <path fill="#1ABCFE" d="M12 16.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z" />
        <path fill="#0ACF83" d="M8.5 9.5H12v7H8.5a3.5 3.5 0 0 1 0-7z" />
      </Svg>
    ),
  },
  gdrive: {
    bg: 'bg-white',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#0066DA" d="M8.4 4.5h7.2L12 11.1 8.4 4.5z" />
        <path fill="#00AC47" d="M4.2 16.5 8.4 9l3.6 6.3H4.2z" />
        <path fill="#FFBA00" d="M19.8 16.5H12l3.6-6.3 4.2 7.5z" />
      </Svg>
    ),
  },
  gcal: {
    bg: 'bg-white',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#1A73E8" d="M19.5 4.5h-2.2V3h-1.8v1.5H8.5V3H6.7v1.5H4.5A1.5 1.5 0 0 0 3 6v13.5A1.5 1.5 0 0 0 4.5 21h15a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5zm0 15H4.5V9h15v10.5z" />
        <path fill="#EA4335" d="M6.7 3h1.8v1.5H6.7zm9 0h1.8v1.5h-1.8z" />
        <text x="12" y="17.2" textAnchor="middle" fill="#1A73E8" fontSize="7" fontWeight="700" fontFamily="system-ui,Segoe UI,Arial">31</text>
      </Svg>
    ),
  },
  google: {
    bg: 'bg-white',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09A6.97 6.97 0 0 1 5.5 12c0-.78.13-1.53.34-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.46 3.77 1.18 5.43l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </Svg>
    ),
  },
  vercel: {
    bg: 'bg-black',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#fff" d="M12 3.8 21.2 20.2H2.8L12 3.8z" />
      </Svg>
    ),
  },
  discord: {
    bg: 'bg-[#5865F2]',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#fff" d="M19.27 5.33A16.4 16.4 0 0 0 15.1 4.2l-.2.37a14.6 14.6 0 0 0-5.8 0L8.9 4.2a16.4 16.4 0 0 0-4.17 1.13C2.4 9.1 1.8 12.7 2.1 16.2a16.5 16.5 0 0 0 5 2.45l.72-1.16a10.8 10.8 0 0 1-1.62-.79l.34-.27c3.2 1.48 6.68 1.48 9.84 0l.34.27c-.52.3-1.06.56-1.62.79l.72 1.16a16.5 16.5 0 0 0 5-2.45c.4-4-.6-7.55-2.55-10.87zM9.1 13.7c-.9 0-1.64-.83-1.64-1.85S8.2 10 9.1 10s1.64.83 1.64 1.85S10 13.7 9.1 13.7zm5.8 0c-.9 0-1.64-.83-1.64-1.85S14 10 14.9 10s1.64.83 1.64 1.85-.74 1.85-1.64 1.85z" />
      </Svg>
    ),
  },
  telegram: {
    bg: 'bg-[#229ED9]',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#fff" d="M20.7 4.3 3.4 10.9c-1.2.46-1.18 1.25-.22 1.57l4.4 1.37 1.7 5.35c.21.66.6.81 1.2.5l2.4-1.76 4.55 3.36c.84.46 1.44.22 1.65-.78l3-14.1c.3-1.24-.47-1.8-1.38-1.38zM9.9 14.4l-.3 3.3 1.9-1.8 4.5-4.1c.2-.18.39-.26.22-.07L9.9 14.4z" />
      </Svg>
    ),
  },
  openai: {
    bg: 'bg-[#10a37f]',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#fff" d="M21.4 10.1a5.2 5.2 0 0 0-.4-4.9 5.3 5.3 0 0 0-5.7-2.2A5.3 5.3 0 0 0 6.5 2a5.2 5.2 0 0 0-3.5 3.8A5.2 5.2 0 0 0 .8 12a5.2 5.2 0 0 0 .4 4.9 5.3 5.3 0 0 0 5.7 2.2A5.3 5.3 0 0 0 17.5 22a5.2 5.2 0 0 0 3.5-3.8 5.2 5.2 0 0 0 2.2-5.1 5.3 5.3 0 0 0-1.8-3zM12 19.4a3.8 3.8 0 0 1-2.4-.9l.1-.1 4-2.3a.3.3 0 0 0 .2-.3v-5.5l1.7 1v4.1a3.8 3.8 0 0 1-3.6 3.9zm-5.3-2.4a3.8 3.8 0 0 1-.5-2.5l.1.1 4 2.3a.3.3 0 0 0 .3 0l4.9-2.8v1.9l-4.1 2.4a3.8 3.8 0 0 1-4.7-1.4zM5.6 8a3.8 3.8 0 0 1 2-1.7v4.7a.3.3 0 0 0 .1.3l4.9 2.8-1.7 1-4.1-2.4A3.8 3.8 0 0 1 5.6 8zm10.9 2.6-4.9-2.8 1.7-1 4.1 2.4a3.8 3.8 0 0 1-.6 6.8v-4.7a.3.3 0 0 0-.2-.3zm1.3-2.5-.1-.1-4-2.3a.3.3 0 0 0-.3 0L8.5 8.5V6.6l4.1-2.4a3.8 3.8 0 0 1 5.2 3.9zM8.5 13.1l-1.7-1V8a3.8 3.8 0 0 1 6.2-2.9l-.1.1-4 2.3a.3.3 0 0 0-.2.3v5.6z" />
      </Svg>
    ),
  },
  anthropic: {
    bg: 'bg-[#D4A27F]',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#1a1a1a" d="M16.7 5H13.8L8.1 19h2.9l1.2-3.2h5.6L19 19h2.9L16.7 5zm-3.4 8.4 2-5.3 2 5.3h-4zM7.2 5 4.5 19H1.6L4.3 5h2.9z" />
      </Svg>
    ),
  },
  huggingface: {
    bg: 'bg-[#FFD21E]',
    node: (
      <Svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9.2" fill="#FFD21E" stroke="#0B0B0B" strokeWidth="1.2" />
        <circle cx="9" cy="10.8" r="1.35" fill="#0B0B0B" />
        <circle cx="15" cy="10.8" r="1.35" fill="#0B0B0B" />
        <path fill="none" stroke="#0B0B0B" strokeWidth="1.35" strokeLinecap="round" d="M8.6 14.8c1.4 1.5 5.4 1.5 6.8 0" />
        <path fill="#0B0B0B" d="M7.2 8.6c.7-.9 1.6-1.4 2.5-1.2.2 1.1-.4 2.2-1.3 2.6-.7-.4-1.2-1-1.2-1.4zm9.6 0c-.7-.9-1.6-1.4-2.5-1.2-.2 1.1.4 2.2 1.3 2.6.7-.4 1.2-1 1.2-1.4z" />
      </Svg>
    ),
  },
  groq: {
    bg: 'bg-[#F55036]',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#fff" d="M3.8 6.5h5.2v11H3.8zm6.8 0H15c3.8 0 6.2 2.1 6.2 5.5S18.8 17.5 15 17.5h-4.4v-11zm5.4 8.2c1.7 0 2.8-1 2.8-2.7s-1.1-2.7-2.8-2.7h-2.1v5.4h2.1z" />
      </Svg>
    ),
  },
  nvidia: {
    bg: 'bg-[#76B900]',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#fff" d="M12 4c-4.2 3.4-6.8 7.1-7.5 9.5 2.2-1.2 4.3-1.9 6.4-2.1C9.3 14.2 8 16.6 8 19c2.8-2.4 5.6-3.6 8.2-3.6.5-2.1.4-4.3-.2-6.5C14.3 8.2 13 6 12 4z" />
      </Svg>
    ),
  },
  ollama: {
    bg: 'bg-[#1a1a1a]',
    node: (
      <Svg viewBox="0 0 24 24">
        <ellipse cx="12" cy="13.2" rx="7.2" ry="6.4" fill="#fff" />
        <ellipse cx="12" cy="8.2" rx="4.2" ry="3.6" fill="#fff" />
        <circle cx="10.2" cy="12.4" r="1.15" fill="#1a1a1a" />
        <circle cx="13.8" cy="12.4" r="1.15" fill="#1a1a1a" />
        <ellipse cx="12" cy="15.2" rx="1.6" ry="1" fill="#1a1a1a" opacity=".35" />
      </Svg>
    ),
  },
  openrouter: {
    bg: 'bg-[#6566F1]',
    node: (
      <Svg viewBox="0 0 24 24">
        <path fill="#fff" d="M6.5 5.5h4v13h-4zm7.2 0 6.3 6.5-6.3 6.5h-4.3l6.3-6.5-6.3-6.5h4.3z" />
      </Svg>
    ),
  },
  pollinations: {
    bg: 'bg-[#EC4899]',
    node: (
      <Svg>
        <circle cx="12" cy="12" r="3.2" fill="#fff" />
        <circle cx="12" cy="5.2" r="1.6" fill="#fff" opacity=".9" />
        <circle cx="12" cy="18.8" r="1.6" fill="#fff" opacity=".9" />
        <circle cx="5.2" cy="12" r="1.6" fill="#fff" opacity=".9" />
        <circle cx="18.8" cy="12" r="1.6" fill="#fff" opacity=".9" />
      </Svg>
    ),
  },
  qwen: {
    bg: 'bg-[#6366F1]',
    node: (
      <Svg>
        <path fill="#fff" d="M12 3.5 19.5 8v8L12 20.5 4.5 16V8L12 3.5zm0 3.2L7.8 9.1v5.8L12 17.3l4.2-2.4V9.1L12 6.7z" />
      </Svg>
    ),
  },
  meta: {
    bg: 'bg-[#0668E1]',
    node: (
      <Svg>
        <path fill="#fff" d="M12.2 7.2c-1.3 0-2.4 1.7-3.1 3.5-.6-2-1.7-3.5-3.1-3.5-2.1 0-3.5 3.4-3.5 7.6C2.5 18.6 4 20 5.7 20c1.4 0 2.5-1.2 3.5-3.3.4-.9.8-1.9 1.1-3 .3 1.1.7 2.1 1.1 3 1 2.1 2.1 3.3 3.5 3.3 1.7 0 3.2-1.4 3.2-5.2 0-4.2-1.4-7.6-3.5-7.6-1.3 0-2.4 1.7-3.1 3.5-.6-2-1.7-3.5-3.1-3.5z" />
      </Svg>
    ),
  },
  mistral: {
    bg: 'bg-[#FF7000]',
    node: (
      <Svg>
        <path fill="#fff" d="M4 18V6h3.2v4.2L11.5 6H15l-4.5 5.2L15.2 18h-3.5l-3.3-4.5V18H4zm12.5 0V6H20v12h-3.5z" />
      </Svg>
    ),
  },
  deepseek: {
    bg: 'bg-[#4D6BFE]',
    node: (
      <Svg>
        <path fill="#fff" d="M6 6h5.5c3.2 0 5.5 2.1 5.5 5.2S14.7 16.4 11.5 16.4H9.2V18H6V6zm3.2 7.4h2.1c1.5 0 2.4-.9 2.4-2.2s-.9-2.2-2.4-2.2H9.2v4.4z" />
      </Svg>
    ),
  },
  microsoft: {
    bg: 'bg-[#F3F3F3]',
    node: (
      <Svg>
        <path fill="#F25022" d="M3 3h8.2v8.2H3z" />
        <path fill="#7FBA00" d="M12.8 3H21v8.2h-8.2z" />
        <path fill="#00A4EF" d="M3 12.8h8.2V21H3z" />
        <path fill="#FFB900" d="M12.8 12.8H21V21h-8.2z" />
      </Svg>
    ),
  },
  stripe: {
    bg: 'bg-[#635BFF]',
    node: (
      <Svg>
        <path fill="#fff" d="M12.4 7.2c-1.6-.6-2.5-.9-2.5-1.6 0-.6.6-1 1.6-1 1.3 0 2.6.5 3.7 1.3l1.2-2.7A9 9 0 0 0 11.6 2C8.2 2 5.9 3.8 5.9 6.5c0 3.2 2.7 4.2 4.7 5 1.7.6 2.3 1.1 2.3 1.8 0 .8-.8 1.2-2 1.2-1.5 0-3.2-.6-4.5-1.6L4.9 16a9.5 9.5 0 0 0 5.4 1.7c3.6 0 6.1-1.8 6.1-4.8 0-3.3-2.8-4.4-4-4.7z" />
      </Svg>
    ),
  },
  shopify: {
    bg: 'bg-[#95BF47]',
    node: (
      <Svg>
        <path fill="#fff" d="M16.2 6.2c0-.1-.1-.2-.2-.2-.1 0-1.6-.1-1.6-.1s-1.1-1.1-1.2-1.2c-.1-.1-.3-.1-.4 0 0 0-.1.1-.1.1l-.5-.1c0-.6-.2-1.5-.8-2.1C10.6 1.8 9.7 1.5 8.6 1.7c-1.3.2-2.3 1.1-2.7 2.5-.3 1-.2 2 .1 3.1l-1.3.4c-.3.1-.3.1-.4.4L3.3 18c0 .2.1.3.3.3l12.3 2.4c.2 0 .4-.1.4-.3l1.3-12.4c0-.2-.1-.3-.2-.4-.4-.1-1-.2-1.2-.2zm-6.3-2.5c.2 0 .4.1.5.2-.5.2-.9.6-1.1 1.4-.1.4-.1.7-.1 1L8 6c-.4-.1-.7-.1-.9-.2.1-1.2.8-2.1 1.8-2.1zm1.3 3.8-1.8-.4c0-.5.1-1.2.3-1.7.5-.2.9-.2 1 .4.1.7 0 1.3.5 1.7z" />
      </Svg>
    ),
  },
  whatsapp: {
    bg: 'bg-[#25D366]',
    node: (
      <Svg>
        <path fill="#fff" d="M12 3.2A8.7 8.7 0 0 0 3.4 12c0 1.5.4 3 1.1 4.3L3.2 21l4.7-1.2A8.7 8.7 0 1 0 12 3.2zm4.9 12.3c-.2.6-1.1 1.1-1.8 1.2-.5.1-1.1.1-1.8-.1a14 14 0 0 1-6.1-4.3 7 7 0 0 1-1.5-2.8c-.2-.8.2-1.5.7-1.9.2-.2.5-.2.7-.2h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.5l-.3.4c-.1.1-.2.3-.1.5.3.5.9 1.3 1.7 2 .9.8 1.8 1.2 2.2 1.3.2.1.4.1.5-.1l.6-.7c.1-.2.3-.2.5-.1l1.7.8c.2.1.4.2.4.4 0 .1 0 .4-.2.6z" />
      </Svg>
    ),
  },
  zoom: {
    bg: 'bg-[#2D8CFF]',
    node: (
      <Svg>
        <path fill="#fff" d="M4.5 8.2h8.2a1.6 1.6 0 0 1 1.6 1.6v4.4a1.6 1.6 0 0 1-1.6 1.6H4.5a1.6 1.6 0 0 1-1.6-1.6V9.8a1.6 1.6 0 0 1 1.6-1.6zm10.4 2 4.2-2.2c.5-.3 1.1.1 1.1.7v6.6c0 .6-.6 1-1.1.7l-4.2-2.2v-3.6z" />
      </Svg>
    ),
  },
  teams: {
    bg: 'bg-[#6264A7]',
    node: (
      <Svg>
        <circle cx="16.5" cy="7" r="2.2" fill="#fff" />
        <path fill="#fff" d="M9.2 6.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM4.5 10.5c0-1.7 2.1-3 4.7-3s4.7 1.3 4.7 3v5.2H4.5v-5.2zm9.8 1.2c1.4-.4 3.2-.2 4.4.7v5.3h-4.4v-6z" />
      </Svg>
    ),
  },
  supabase: {
    bg: 'bg-[#3ECF8E]',
    node: (
      <Svg>
        <path fill="#fff" d="M13.2 3.2 6.1 14.6c-.3.5.1 1.1.7 1.1h5.5l-1.1 5.1 7.1-11.4c.3-.5-.1-1.1-.7-1.1h-5.5l1.1-5.1z" />
      </Svg>
    ),
  },
  datadog: {
    bg: 'bg-[#632CA6]',
    node: (
      <Svg>
        <path fill="#fff" d="M7.2 7.5h3.2v9H7.2zm6.4 0H17v9h-3.4zM4 4.5h16v2.2H4z" />
      </Svg>
    ),
  },
  canva: {
    bg: 'bg-[#00C4CC]',
    node: (
      <Svg>
        <path fill="#fff" d="M12 3.5c-4.7 0-8.5 3.8-8.5 8.5S7.3 20.5 12 20.5s8.5-3.8 8.5-8.5S16.7 3.5 12 3.5zm1.8 12.2c-1.1.7-2.6.8-3.8.2-1.6-.8-2.3-2.7-1.6-4.4.6-1.4 2-2.2 3.5-2.2.7 0 1.4.2 2 .5l-.7 1.6c-.3-.2-.7-.3-1.1-.3-.8 0-1.5.5-1.8 1.2-.3.8.1 1.7.9 2.1.5.2 1.1.2 1.5-.1.3-.2.5-.5.5-.9h-1.4V12h3.1c0 1.6-.8 3-2.1 3.7z" />
      </Svg>
    ),
  },
  ark: {
    bg: 'bg-sky-600',
    node: (
      <Svg>
        <path fill="#fff" d="M12 3.5 19 19h-3.2l-1.2-3.1H9.4L8.2 19H5L12 3.5zm0 4.2-2.1 5.4h4.2L12 7.7z" />
      </Svg>
    ),
  },
  together: {
    bg: 'bg-[#0F6FFF]',
    node: (
      <Svg>
        <path fill="#fff" d="M5 7h14v2.4H13.4V17h-2.8V9.4H5V7z" />
      </Svg>
    ),
  },
  fireworks: {
    bg: 'bg-[#5019C5]',
    node: (
      <Svg>
        <path fill="#fff" d="M12 3.5 13.8 9H19l-4.2 3.2 1.6 5.3L12 14.8 7.6 17.5l1.6-5.3L5 9h5.2L12 3.5z" />
      </Svg>
    ),
  },
  xai: {
    bg: 'bg-black',
    node: (
      <Svg>
        <path fill="#fff" d="M6.2 5h3.1l3.2 4.4L16.2 5H19l-5.1 6.4L19.4 19h-3.1l-3.6-4.9L8.4 19H5.6l5.3-6.7L6.2 5z" />
      </Svg>
    ),
  },
  flux: {
    bg: 'bg-[#7C3AED]',
    node: (
      <Svg>
        <path fill="#fff" d="M6 6h12v2.4H10.4v2.8H16V13.6H10.4V18H6V6z" />
      </Svg>
    ),
  },
  stablediffusion: {
    bg: 'bg-[#EAB308]',
    node: (
      <Svg>
        <circle cx="12" cy="12" r="7.5" fill="none" stroke="#111" strokeWidth="2" />
        <path fill="#111" d="M12 7.5c1.8 1.4 2.9 3.2 3.1 5.1-1.1-.4-2.2-.6-3.1-.6-.9 0-2 .2-3.1.6.2-1.9 1.3-3.7 3.1-5.1z" />
      </Svg>
    ),
  },
  gemma: {
    bg: 'bg-[#4285F4]',
    node: (
      <Svg>
        <path fill="#fff" d="M12 4 18.5 8v8L12 20 5.5 16V8L12 4zm0 2.6L7.8 9.1v5.8L12 17.4l4.2-2.5V9.1L12 6.6z" />
      </Svg>
    ),
  },
  phi: {
    bg: 'bg-[#00A4EF]',
    node: (
      <Svg>
        <path fill="#fff" d="M10.2 4.5h2.6c3.4 0 5.6 2.1 5.6 5.3S16.2 15 12.8 15H12v4.5h-2.8V4.5zm2.6 7.7c1.6 0 2.6-.9 2.6-2.4s-1-2.4-2.6-2.4h-.8v4.8h.8z" />
      </Svg>
    ),
  },
  cerebras: {
    bg: 'bg-[#F97316]',
    node: (
      <Svg>
        <path fill="#fff" d="M12 3.5A8.5 8.5 0 1 0 20.5 12 8.5 8.5 0 0 0 12 3.5zm0 13.2A4.7 4.7 0 1 1 16.7 12 4.7 4.7 0 0 1 12 16.7z" />
      </Svg>
    ),
  },
  sambanova: {
    bg: 'bg-[#EE3A8C]',
    node: (
      <Svg>
        <path fill="#fff" d="M7 12a5 5 0 0 1 5-5 5 5 0 0 1 4.6 3.1h-2.7A2.5 2.5 0 0 0 12 9.5 2.5 2.5 0 0 0 9.5 12 2.5 2.5 0 0 0 12 14.5a2.5 2.5 0 0 0 2-1h2.7A5 5 0 0 1 12 17a5 5 0 0 1-5-5z" />
      </Svg>
    ),
  },
  neon: {
    bg: 'bg-[#00E699]',
    node: (
      <Svg>
        <path fill="#0A0A0A" d="M7 5h4.2l5.8 8.2V5H21v14h-4.2L11 10.8V19H7V5z" />
      </Svg>
    ),
  },
  hubspot: {
    bg: 'bg-[#FF7A59]',
    node: (
      <Svg>
        <circle cx="12" cy="14" r="5" fill="#fff" />
        <path fill="#fff" d="M11.2 3.5h1.6v5.2h-1.6z" />
        <circle cx="16.5" cy="8.2" r="1.6" fill="#fff" />
      </Svg>
    ),
  },
  salesforce: {
    bg: 'bg-[#00A1E0]',
    node: (
      <Svg>
        <path fill="#fff" d="M9.2 8.2c.6-.9 1.6-1.5 2.8-1.5 1 0 1.9.4 2.5 1.1.6-.4 1.4-.6 2.2-.6 2 0 3.5 1.5 3.5 3.6 0 .1 0 .2 0 .3 1.3.4 2.2 1.5 2.2 2.9 0 1.7-1.4 3-3.1 3H7.8c-2 0-3.6-1.6-3.6-3.6 0-1.5.9-2.8 2.2-3.3-.1-.3-.1-.6-.1-.9 0-1.8 1.4-3.2 2.9-3z" />
      </Svg>
    ),
  },
  asana: {
    bg: 'bg-[#F06A6A]',
    node: (
      <Svg>
        <circle cx="12" cy="7.5" r="3" fill="#fff" />
        <circle cx="7" cy="16" r="3" fill="#fff" />
        <circle cx="17" cy="16" r="3" fill="#fff" />
      </Svg>
    ),
  },
  atlassian: {
    bg: 'bg-[#0052CC]',
    node: (
      <Svg>
        <path fill="#fff" d="M8.8 18.5 3.5 9.2c-.4-.7.1-1.6.9-1.6h5.1c.5 0 1 .3 1.2.8l4.8 9.3c.4.7-.1 1.6-.9 1.6H9.7c-.5 0-1-.3-1.2-.8zm6.1-7.4 1.7-3.3c.4-.7 1.2-.7 1.6 0l3.8 7.4c.4.7-.1 1.6-.9 1.6h-3.2c-.5 0-1-.3-1.2-.8l-1.8-4.9z" />
      </Svg>
    ),
  },
  monday: {
    bg: 'bg-[#FF3D57]',
    node: (
      <Svg>
        <circle cx="6.5" cy="14" r="2.5" fill="#fff" />
        <circle cx="12" cy="9" r="2.5" fill="#fff" />
        <circle cx="17.5" cy="14" r="2.5" fill="#fff" />
      </Svg>
    ),
  },
  intercom: {
    bg: 'bg-[#1F8DED]',
    node: (
      <Svg>
        <path fill="#fff" d="M6.5 7.5h2.2v7.2c0 1.7.9 2.8 2.6 2.8h1.4v2.2H11c-3 0-4.5-1.8-4.5-4.7V7.5zm9 0H17.7v7.5H15.5V7.5zM10.2 7.5h2.2v7.5h-2.2V7.5z" />
      </Svg>
    ),
  },
  wix: {
    bg: 'bg-black',
    node: (
      <Svg>
        <path fill="#fff" d="M3.5 7.5h2.8l1.8 6.2 1.9-6.2h2.6l1.9 6.2 1.8-6.2H19l-3.1 9H13.2l-1.9-6.1-1.9 6.1H6.6L3.5 7.5z" />
      </Svg>
    ),
  },
  runway: {
    bg: 'bg-[#0B0B0B]',
    node: (
      <Svg>
        <path fill="#fff" d="M6 6h5.2c2.9 0 4.8 1.7 4.8 4.3 0 2.7-1.9 4.4-4.8 4.4H9.2V18H6V6zm3.2 6.2h1.8c1.2 0 1.9-.6 1.9-1.7s-.7-1.7-1.9-1.7H9.2v3.4z" />
      </Svg>
    ),
  },
  outlook: {
    bg: 'bg-[#0078D4]',
    node: (
      <Svg>
        <path fill="#fff" d="M4 7.2h7.5v9.6H4z" />
        <path fill="#28A8EA" d="M11.5 8.5 20 6.8v10.4l-8.5-1.7V8.5z" />
        <ellipse cx="7.8" cy="12" rx="2.2" ry="2.6" fill="#0078D4" />
      </Svg>
    ),
  },
  cohere: {
    bg: 'bg-[#39594D]',
    node: (
      <Svg>
        <path fill="#fff" d="M12 4.5a7.5 7.5 0 1 0 7.3 9.1h-3.1A4.5 4.5 0 1 1 12 7.5c1.4 0 2.6.6 3.4 1.6l2.2-2.2A7.4 7.4 0 0 0 12 4.5z" />
      </Svg>
    ),
  },
};

function resolveBrand(id: string, name?: string): string | null {
  const raw = `${id} ${name || ''}`.toLowerCase();
  const hay = raw.replace(/[^a-z0-9]+/g, ' ');
  const checks: [string, string][] = [
    ['github', 'github'],
    ['notion', 'notion'],
    ['gmail', 'gmail'],
    ['slack', 'slack'],
    ['linear', 'linear'],
    ['figma', 'figma'],
    ['gdrive', 'gdrive'],
    ['google drive', 'gdrive'],
    ['gcal', 'gcal'],
    ['google calendar', 'gcal'],
    ['google ai', 'google'],
    ['google', 'google'],
    ['gemini', 'google'],
    ['imagen', 'google'],
    ['vercel', 'vercel'],
    ['discord', 'discord'],
    ['telegram', 'telegram'],
    ['openai', 'openai'],
    ['gpt', 'openai'],
    ['dall', 'openai'],
    ['anthropic', 'anthropic'],
    ['claude', 'anthropic'],
    ['hugging face', 'huggingface'],
    ['huggingface', 'huggingface'],
    ['hf-', 'huggingface'],
    ['groq', 'groq'],
    ['nvidia', 'nvidia'],
    ['nim', 'nvidia'],
    ['ollama', 'ollama'],
    ['openrouter', 'openrouter'],
    ['pollinations', 'pollinations'],
    ['qwen', 'qwen'],
    ['qwq', 'qwen'],
    ['llama', 'meta'],
    ['meta', 'meta'],
    ['mistral', 'mistral'],
    ['codestral', 'mistral'],
    ['deepseek', 'deepseek'],
    ['microsoft', 'microsoft'],
    ['phi', 'phi'],
    ['outlook', 'outlook'],
    ['teams', 'teams'],
    ['stripe', 'stripe'],
    ['shopify', 'shopify'],
    ['whatsapp', 'whatsapp'],
    ['zoom', 'zoom'],
    ['supabase', 'supabase'],
    ['datadog', 'datadog'],
    ['canva', 'canva'],
    ['ark-', 'ark'],
    ['ark engine', 'ark'],
    ['together', 'together'],
    ['fireworks', 'fireworks'],
    ['xai', 'xai'],
    ['flux', 'flux'],
    ['stable diffusion', 'stablediffusion'],
    ['sdxl', 'stablediffusion'],
    ['sd15', 'stablediffusion'],
    ['gemma', 'gemma'],
    ['cerebras', 'cerebras'],
    ['sambanova', 'sambanova'],
    ['neon', 'neon'],
    ['hubspot', 'hubspot'],
    ['salesforce', 'salesforce'],
    ['asana', 'asana'],
    ['atlassian', 'atlassian'],
    ['jira', 'atlassian'],
    ['monday', 'monday'],
    ['intercom', 'intercom'],
    ['wix', 'wix'],
    ['runway', 'runway'],
    ['cohere', 'cohere'],
    ['command r', 'cohere'],
  ];
  for (const [needle, key] of checks) {
    if (hay.includes(needle) || id.toLowerCase() === needle) return key;
  }
  if (MARKS[id]) return id;
  return null;
}

export function BrandMark({
  id,
  name,
  initial,
  tone,
  size = 'md',
  className = '',
}: {
  id: string;
  name?: string;
  initial?: string;
  tone?: string;
  size?: Size;
  className?: string;
}) {
  const key = resolveBrand(id, name);
  const mark = key ? MARKS[key] : null;
  if (mark) {
    return (
      <span
        className={`${SIZE_CLASS[size]} ${mark.bg} flex items-center justify-center shrink-0 overflow-hidden ${className}`}
        title={name || id}
      >
        {mark.node}
      </span>
    );
  }
  return (
    <span
      className={`${SIZE_CLASS[size]} bg-gradient-to-br ${tone || 'from-zinc-600 to-zinc-900'} flex items-center justify-center ${TEXT_CLASS[size]} font-bold text-white shrink-0 ${className}`}
      title={name || id}
    >
      {(initial || (name || id).slice(0, 2)).slice(0, 2)}
    </span>
  );
}

/** Green check without a circular button chrome (installed / enabled). */
export function StatusCheck({ label }: { label: string }) {
  return (
    <span
      className="w-8 h-8 flex items-center justify-center shrink-0 text-emerald-400"
      title={label}
      aria-label={label}
    >
      <Check className="w-4 h-4" strokeWidth={2.5} />
    </span>
  );
}
