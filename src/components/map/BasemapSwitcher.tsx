'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BASEMAPS, type BasemapId } from '@/lib/mapbox/basemaps';
import { useMapPreferencesStore } from '@/store/useMapPreferencesStore';

/**
 * Floating control that exposes:
 *
 *   1. A picker for the active basemap (Outdoor / Topo / Satellite / …).
 *   2. A toggle for the hillshade overlay.
 *
 * It's intentionally self-contained: `MapView` reads from the same
 * store and reacts to changes via a `useEffect`, so this component
 * only owns its own open/close state and never touches the map
 * instance directly.
 *
 * Accessibility:
 *   * The trigger is labelled (i18n) and `aria-expanded` reflects the
 *     panel's open state.
 *   * Outside-click and Escape close the panel.
 *   * Each basemap option is a real `<button>` with `aria-pressed`
 *     so screen readers announce the active selection without us
 *     needing to fake radio semantics.
 */
export function BasemapSwitcher() {
  const t = useTranslations('map.basemap');
  const basemapId = useMapPreferencesStore((s) => s.basemapId);
  const hillshadeEnabled = useMapPreferencesStore((s) => s.hillshadeEnabled);
  const setBasemap = useMapPreferencesStore((s) => s.setBasemap);
  const toggleHillshade = useMapPreferencesStore((s) => s.toggleHillshade);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Escape. We bind to the document and
  // bail if the event's target is still inside our root.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="basemap-switcher">
      <button
        type="button"
        className="basemap-switcher__trigger"
        aria-label={t('triggerAriaLabel')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polygon points="12 2 22 8.5 12 15 2 8.5 12 2" />
          <polyline points="2 15.5 12 22 22 15.5" />
          <polyline points="2 12 12 18.5 22 12" />
        </svg>
      </button>

      {open ? (
        <div
          className="basemap-switcher__panel"
          role="dialog"
          aria-label={t('panelTitle')}
        >
          <p className="basemap-switcher__heading">{t('basemapsHeading')}</p>
          <ul className="basemap-switcher__grid" role="list">
            {BASEMAPS.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className="basemap-switcher__option"
                  aria-pressed={b.id === basemapId}
                  data-active={b.id === basemapId || undefined}
                  onClick={() => setBasemap(b.id as BasemapId)}
                >
                  <span
                    aria-hidden
                    className="basemap-switcher__swatch"
                    data-variant={b.id}
                  />
                  <span className="basemap-switcher__label">{t(b.id)}</span>
                </button>
              </li>
            ))}
          </ul>

          <p className="basemap-switcher__heading basemap-switcher__heading--secondary">
            {t('overlaysHeading')}
          </p>
          <label className="basemap-switcher__toggle">
            <input
              type="checkbox"
              checked={hillshadeEnabled}
              onChange={toggleHillshade}
            />
            <span className="basemap-switcher__toggle-text">
              <span className="basemap-switcher__toggle-title">
                {t('hillshade')}
              </span>
              <span className="basemap-switcher__toggle-description">
                {t('hillshadeDescription')}
              </span>
            </span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
