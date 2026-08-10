interface LogoProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
}

export function ArkLogo({ size = 32, className = '', showWordmark = false }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Ark hull - geometric boat shape */}
        <path
          d="M8 28 L12 36 L36 36 L40 28 Z"
          fill="currentColor"
          className="text-ark-blue-400"
        />
        {/* Ark cabin/deck */}
        <path
          d="M16 28 L18 18 L30 18 L32 28 Z"
          fill="currentColor"
          className="text-ark-blue-500"
          opacity="0.8"
        />
        {/* Mast / abstract arc */}
        <path
          d="M24 18 L24 8"
          stroke="currentColor"
          className="text-ark-blue-300"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M24 10 Q30 12 28 18"
          stroke="currentColor"
          className="text-ark-blue-300"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
        {/* Wave lines */}
        <path
          d="M6 40 Q12 38 18 40 T30 40 T42 40"
          stroke="currentColor"
          className="text-ark-blue-400"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.6"
        />
        <path
          d="M8 43 Q14 41 20 43 T32 43 T40 43"
          stroke="currentColor"
          className="text-ark-blue-400"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.3"
        />
      </svg>
      {showWordmark && (
        <span className="text-lg font-bold tracking-tight text-content-primary">
          ARK
        </span>
      )}
    </div>
  );
}
