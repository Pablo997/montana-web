interface Props {
  size?: number;
  className?: string;
}

/**
 * Montana brand mark — a rounded badge with the two-peak silhouette
 * inside. Filled circle (brand green by default) + white outline
 * logo, so the mark reads as a coherent badge even at 16px and keeps
 * enough contrast to survive over any map tile without needing heavy
 * drop-shadows.
 *
 * The logo path is the same organic Bézier sweep as the previous
 * revision — only the circle background is new. Stroke uses `#fff`
 * explicitly (instead of `currentColor`) because the badge colour is
 * fixed; if we ever need a neutral variant for print/contrast we can
 * add a `variant` prop.
 */
export function Logo({ size = 32, className }: Props) {
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
        <linearGradient id="montana-logo-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3aa37f" />
          <stop offset="1" stopColor="#1f6c53" />
        </linearGradient>
      </defs>

      <circle cx="16" cy="16" r="15.5" fill="url(#montana-logo-bg)" />

      {/* The mountain silhouette is kept at the same visual footprint
          as the previous revision (~24×15 units) and re-centered inside
          a slightly larger badge. Wrapping the path in a `<g>` that
          scales 0.75× around the centre achieves this without having
          to re-key every coordinate — so if we ever want to tune the
          badge padding again, we only touch the scale factor here. */}
      <g
        transform="translate(16 16) scale(0.75) translate(-16 -16)"
        fill="none"
        stroke="#fff"
        strokeWidth={2.3}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path
          d="M4 23
             C 6 19, 8 15, 11 8
             C 13 13, 14 16, 16 18
             C 18 15, 19 13, 21 10
             C 24 17, 26 21, 28 23"
        />
      </g>
    </svg>
  );
}
