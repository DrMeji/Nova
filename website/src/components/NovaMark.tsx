/** NOVA radial mark — clean vector, optional draw/pulse animation for the website hero. */
export function NovaMark({
  size = 32,
  className = '',
  animated = false,
}: {
  size?: number;
  className?: string;
  animated?: boolean;
}) {
  const cls = animated ? `nova-mark nova-mark-animated ${className}`.trim() : className;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cls}
      aria-hidden
    >
      <g
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <circle cx="64" cy="64" r="8.5" className="nova-hub" />
        <path d="M64 55.5 V24" className="nova-ray" />
        <path d="M64 72.5 V104" className="nova-ray" />
        <path d="M72.5 64 H104" className="nova-ray" />
        <path d="M55.5 64 H24" className="nova-ray" />
        <path d="M70.2 57.8 L78 50 L96 50" className="nova-ray" />
        <path d="M70.2 57.8 L78 50 L78 32" className="nova-ray" />
        <path d="M57.8 57.8 L50 50 L32 50" className="nova-ray" />
        <path d="M57.8 57.8 L50 50 L50 32" className="nova-ray" />
        <path d="M70.2 70.2 L78 78 L96 78" className="nova-ray" />
        <path d="M70.2 70.2 L78 78 L78 96" className="nova-ray" />
        <path d="M57.8 70.2 L50 78 L32 78" className="nova-ray" />
        <path d="M57.8 70.2 L50 78 L50 96" className="nova-ray" />
      </g>
      <g fill="currentColor">
        <circle cx="64" cy="24" r="3.6" className="nova-node nova-node-hollow" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <circle cx="64" cy="104" r="3.6" className="nova-node nova-node-hollow" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <circle cx="104" cy="64" r="3.6" className="nova-node nova-node-hollow" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <circle cx="24" cy="64" r="3.6" className="nova-node nova-node-hollow" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <circle cx="96" cy="50" r="3.4" className="nova-node" />
        <circle cx="78" cy="32" r="3.4" className="nova-node" />
        <circle cx="32" cy="50" r="3.4" className="nova-node" />
        <circle cx="50" cy="32" r="3.4" className="nova-node" />
        <circle cx="96" cy="78" r="3.4" className="nova-node" />
        <circle cx="78" cy="96" r="3.4" className="nova-node" />
        <circle cx="32" cy="78" r="3.4" className="nova-node" />
        <circle cx="50" cy="96" r="3.4" className="nova-node" />
      </g>
    </svg>
  );
}
