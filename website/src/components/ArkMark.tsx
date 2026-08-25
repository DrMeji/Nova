/** Robot mark only — no squircle box (matches app icon face). */
export function ArkMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* antenna */}
      <path
        d="M32 8v7M26 8h12"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* head */}
      <rect
        x="14"
        y="16"
        width="36"
        height="36"
        rx="11"
        stroke="currentColor"
        strokeWidth="3.2"
      />
      {/* ears */}
      <path
        d="M14 34c-3.2 0-5 2-5 4.5S10.8 43 14 43M50 34c3.2 0 5 2 5 4.5S53.2 43 50 43"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* eyes */}
      <path
        d="M25 28v12M39 28v12"
        stroke="currentColor"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
