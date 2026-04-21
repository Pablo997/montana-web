import type { IncidentType } from '@/types/incident';

/**
 * One glyph per incident type, authored on a 24x24 canvas. The glyph is
 * rendered small (16x16) inside the circular marker body.
 *
 * Styling strategy: stroke-based shapes use `currentColor`, fills are
 * explicit. We rely on `el.style.color` on the host element to drive the
 * stroke colour so a single CSS variable controls the glyph.
 */
export const INCIDENT_GLYPHS: Record<IncidentType, string> = {
  accident:
    '<path d="M12 3.5 L21.5 20 L2.5 20 Z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><line x1="12" y1="10" x2="12" y2="14.5" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1" fill="currentColor"/>',

  trail_blocked:
    '<path d="M4.5 12 H19.5" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><path d="M7 8 L17 16" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><path d="M17 8 L7 16" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>',

  detour:
    '<path d="M5 18 V13 A4 4 0 0 1 9 9 H16" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 6 L16.5 9 L13 12" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',

  water_source:
    '<path d="M12 3.5 C12 3.5 6 10.5 6 14.5 A6 6 0 0 0 18 14.5 C18 10.5 12 3.5 12 3.5 Z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/>',

  shelter:
    '<path d="M3.5 12 L12 4 L20.5 12" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 11 V20 H18.5 V11" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><path d="M10 20 V14 H14 V20" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/>',

  point_of_interest:
    '<path d="M12 3.2 L14.4 8.9 L20.6 9.45 L15.9 13.55 L17.4 19.6 L12 16.4 L6.6 19.6 L8.1 13.55 L3.4 9.45 L9.6 8.9 Z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>',

  wildlife:
    '<circle cx="7" cy="9" r="1.8" fill="currentColor"/><circle cx="12" cy="6.8" r="1.9" fill="currentColor"/><circle cx="17" cy="9" r="1.8" fill="currentColor"/><ellipse cx="12" cy="17" rx="4.3" ry="3.4" fill="currentColor"/>',

  weather_hazard:
    '<path d="M13 3.5 L7 13 H11 L9 20.5 L17 11 H13 L15 3.5 Z" fill="currentColor"/>',

  other:
    '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.3"/><path d="M12 10.5 V16.5" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><circle cx="12" cy="7.7" r="1" fill="currentColor"/>',
};

export function glyphSvg(type: IncidentType): string {
  return `<svg width="16" height="16" viewBox="0 0 24 24" style="display:block;pointer-events:none">${INCIDENT_GLYPHS[type]}</svg>`;
}
