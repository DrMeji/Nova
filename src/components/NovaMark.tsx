/** NOVA radial mark for the desktop app (SVG) — upgraded circuit/starburst. */
export function NovaMark({
  className = 'w-7 h-7',
  title = 'NOVA',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`object-contain shrink-0 ${className}`}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <g
        stroke="currentColor"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <circle cx="64" cy="64" r="8.5" />
        {/* cardinals → hollow nodes */}
        <path d="M64 55.5 V24" />
        <path d="M64 72.5 V104" />
        <path d="M72.5 64 H104" />
        <path d="M55.5 64 H24" />
        {/* quadrant bent traces → solid nodes */}
        <path d="M70.2 57.8 L78 50 L96 50" />
        <path d="M70.2 57.8 L78 50 L78 32" />
        <path d="M57.8 57.8 L50 50 L32 50" />
        <path d="M57.8 57.8 L50 50 L50 32" />
        <path d="M70.2 70.2 L78 78 L96 78" />
        <path d="M70.2 70.2 L78 78 L78 96" />
        <path d="M57.8 70.2 L50 78 L32 78" />
        <path d="M57.8 70.2 L50 78 L50 96" />
      </g>
      <g fill="currentColor">
        <circle cx="64" cy="24" r="3.6" fill="none" stroke="currentColor" strokeWidth="3.2" />
        <circle cx="64" cy="104" r="3.6" fill="none" stroke="currentColor" strokeWidth="3.2" />
        <circle cx="104" cy="64" r="3.6" fill="none" stroke="currentColor" strokeWidth="3.2" />
        <circle cx="24" cy="64" r="3.6" fill="none" stroke="currentColor" strokeWidth="3.2" />
        <circle cx="96" cy="50" r="3.6" />
        <circle cx="78" cy="32" r="3.6" />
        <circle cx="32" cy="50" r="3.6" />
        <circle cx="50" cy="32" r="3.6" />
        <circle cx="96" cy="78" r="3.6" />
        <circle cx="78" cy="96" r="3.6" />
        <circle cx="32" cy="78" r="3.6" />
        <circle cx="50" cy="96" r="3.6" />
      </g>
    </svg>
  );
}
