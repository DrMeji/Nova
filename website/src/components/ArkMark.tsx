/** Voice mark — rounded head + two eye bars. no ears / antenna. */
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
      <rect
        x="6"
        y="6"
        width="52"
        height="52"
        rx="14"
        stroke="currentColor"
        strokeWidth="3.8"
      />
      <path
        d="M24 22v20M40 22v20"
        stroke="currentColor"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
