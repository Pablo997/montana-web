interface Props {
  size?: number;
  className?: string;
}

/**
 * Montana brand mark. Two layered peaks with a snowcap on the front one and
 * a small sun on the right. Rendered as inline SVG so it inherits CSS
 * variables and renders crisply at any size.
 */
export function Logo({ size = 28, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Montana"
      focusable="false"
    >
      <defs>
        <linearGradient id="montana-logo-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6fd0ad" />
          <stop offset="1" stopColor="#1b5a46" />
        </linearGradient>
        <linearGradient id="montana-logo-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3da682" />
          <stop offset="1" stopColor="#0f3b2d" />
        </linearGradient>
        <radialGradient id="montana-logo-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f7d15a" />
          <stop offset="1" stopColor="#f5c518" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="23.5" cy="9" r="4.5" fill="url(#montana-logo-sun)" />
      <circle cx="23.5" cy="9" r="2.1" fill="#f5c518" />

      <path d="M11 28 L20 11 L29 28 Z" fill="url(#montana-logo-back)" />

      <path d="M2 28 L11 12 L16 20 L19 16.5 L26 28 Z" fill="url(#montana-logo-front)" />

      <path
        d="M8.5 18.2 L11 12 L13.6 17.2 L12.3 17 L10.9 18.5 L9.7 17.6 Z"
        fill="#eaf5ef"
        fillOpacity="0.95"
      />

      <rect x="1" y="28" width="30" height="1.2" rx="0.6" fill="#1b5a46" fillOpacity="0.55" />
    </svg>
  );
}
