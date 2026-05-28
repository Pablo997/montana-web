/**
 * Compact, hiker-friendly distance formatter for UI labels.
 *
 *   * Sub-kilometre values use metres with no decimals — at the scale
 *     a card label needs to be glanceable, "354.2 m" reads as visual
 *     noise; "354 m" is exact enough.
 *   * 1-9.99 km uses one decimal so we can distinguish "2.1 km" from
 *     "2.7 km" — the difference between adjacent ridges or villages.
 *   * Above 10 km we round to integers since the user no longer cares
 *     about a 100 m delta at that scale.
 *
 * The intent of these breakpoints is to keep the label predictable in
 * width (3-5 chars + unit), which makes flex layouts behave.
 *
 * Negative inputs are not expected (PostGIS returns non-negative
 * distances) but we clamp to 0 anyway so a faulty fixture or a UI
 * sentinel doesn't render "-2 km".
 */
export function formatDistance(distanceM: number): string {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return '0 m';
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  const km = distanceM / 1000;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
