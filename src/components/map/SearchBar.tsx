'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { geocodePlaces, type SearchResult } from '@/lib/mapbox/geocoding';
import {
  useSearchHistoryStore,
  type RecentSearch,
} from '@/store/useSearchHistoryStore';
import { track } from '@/lib/analytics/track';

interface Props {
  /**
   * Called when the user selects a place. The bbox (when present)
   * should drive `fitBounds`; otherwise `flyTo(center, suggestedZoom)`.
   * The component is otherwise unaware of MapLibre — keeps it
   * mockable in unit tests.
   */
  onSelect: (result: PickedPlace) => void;
  /**
   * Reads the current viewport + centre at request time. Passed as a
   * function (rather than two state props) so the component doesn't
   * re-render on every `moveend` — viewport drift while the user is
   * mid-keystroke would otherwise dirty the effect and abort the
   * in-flight request.
   */
  getMapContext?: () => MapContext;
}

export interface MapContext {
  /** `[lng, lat]` — `proximity` ranking bias. */
  center: [number, number] | null;
}

/** Subset of `SearchResult` the consumer cares about. Avoids
 * leaking the full API shape into the map layer. */
export interface PickedPlace {
  title: string;
  subtitle: string;
  center: [number, number];
  bbox: [number, number, number, number] | null;
  suggestedZoom: number;
}

const DEBOUNCE_MS = 220;
const MIN_QUERY_LENGTH = 2;

/**
 * Floating search bar pinned next to the filter panel on the map.
 *
 * Behaviour:
 *   * Empty query → shows recent searches (if any).
 *   * 1 character → no request (avoids hammering the API on noise).
 *   * 2+ characters → debounced geocoding request with bbox /
 *     proximity bias against the current viewport.
 *   * In-flight requests cancel via `AbortController` whenever the
 *     query changes again, so stale responses never repaint the
 *     dropdown.
 *
 * Keyboard:
 *   * ↑ / ↓ move the highlight through results.
 *   * Enter picks the highlighted row.
 *   * Escape closes the dropdown.
 */
export function SearchBar({ onSelect, getMapContext }: Props) {
  // Mirror the getter in a ref so the debounced effect picks it up
  // without re-running on every render.
  const getContextRef = useRef(getMapContext);
  useEffect(() => {
    getContextRef.current = getMapContext;
  }, [getMapContext]);
  const t = useTranslations('map.search');
  const locale = useLocale();
  const recents = useSearchHistoryStore((s) => s.recents);
  const addRecent = useSearchHistoryStore((s) => s.addRecent);
  const clearRecents = useSearchHistoryStore((s) => s.clearRecents);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Expanded vs. icon-only state. On phones the bar lives behind a
  // magnifying-glass button so it doesn't dominate the map; on
  // desktop it sits inline because the screen has the room and
  // showing the input upfront is more discoverable.
  //
  // The default visibility is delegated to CSS (`@media` rules in
  // globals.css) — that way the very first paint on mobile already
  // shows the icon-only trigger, with no JS round-trip needed. If we
  // gated the layout on a React `useState` boolean instead, the
  // server would render the bar expanded by default and the mobile
  // viewport would briefly see the full bar overlap the brand
  // header until hydration kicked in. The flash was the bug.
  //
  // `userMode` is null until the user explicitly toggles. When set,
  // it overrides the media-query default in both directions:
  // expanding on mobile (after tapping the icon) and collapsing on
  // desktop (rare but possible after dismissing the dropdown).
  const [isMobile, setIsMobile] = useState(false);
  const [userMode, setUserMode] = useState<'expanded' | 'collapsed' | null>(
    null,
  );
  /** Effective expanded state, used by JS-driven concerns
   * (focus management, mobile overlay class). For visibility of the
   * trigger vs. input wrap, CSS does the work via `data-mode`. */
  const expanded = userMode === null ? !isMobile : userMode === 'expanded';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 720px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    // Listen so rotating a tablet from portrait→landscape (or a
    // resizable window in Chrome devtools) flips the layout
    // correctly. We don't auto-touch userMode on resize — once the
    // user has explicitly toggled, their choice sticks.
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const inputId = useId();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // The dropdown shows different content depending on query state.
  // Memoise the displayed rows so keyboard navigation has a single
  // source of truth.
  const displayedRows = useMemo<DisplayedRow[]>(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return recents.map((r) => ({ kind: 'recent', value: r }));
    }
    return results.map((r) => ({ kind: 'result', value: r }));
  }, [query, results, recents]);

  // Debounced search effect. Re-runs on every keystroke; the
  // AbortController in the cleanup cancels any in-flight request so
  // late responses can't overwrite fresh results.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const ctx = getContextRef.current?.() ?? { center: null };
      try {
        const fetched = await geocodePlaces(trimmed, {
          signal: controller.signal,
          proximity: ctx.center ?? undefined,
          language: locale,
        });
        if (!controller.signal.aborted) {
          setResults(fetched);
          setActiveIndex(0);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(t('error'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, locale, t]);

  // Close (and collapse on mobile) on outside click + Escape.
  //
  // The listener has to be installed whenever the search is in ANY
  // active state — dropdown open OR mobile bar still expanded. The
  // previous version only listened while `open` was true, so after
  // the user picked a result (which sets `open=false` while leaving
  // the mobile bar expanded), tapping outside did nothing. The fix
  // unions the two states.
  useEffect(() => {
    const active = open || (isMobile && expanded);
    if (!active) return;

    const collapseIfMobile = () => {
      if (isMobile) setUserMode('collapsed');
    };
    const onPointer = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setOpen(false);
      collapseIfMobile();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
        collapseIfMobile();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, expanded, isMobile]);

  const pick = (row: DisplayedRow) => {
    const picked: PickedPlace =
      row.kind === 'result'
        ? {
            title: row.value.title,
            subtitle: row.value.subtitle,
            center: row.value.center,
            bbox: row.value.bbox,
            suggestedZoom: row.value.suggestedZoom,
          }
        : {
            title: row.value.title,
            subtitle: row.value.subtitle,
            center: row.value.center,
            bbox: row.value.bbox,
            suggestedZoom: row.value.suggestedZoom,
          };

    onSelect(picked);
    if (row.kind === 'result') addRecent(row.value);
    track('search_used', {
      // Tells us whether the user accepted a fresh geocoder result
      // or replayed something from their local history — useful for
      // sizing the geocoding API spend vs. the value of the recents
      // feature.
      source: row.kind,
    });
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
    // On mobile the search overlay covers the map and the floating
    // header; collapsing right after a pick lets the user see the
    // flyTo / fitBounds animation they just triggered without an
    // extra tap on the back arrow.
    if (isMobile) setUserMode('collapsed');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || displayedRows.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % displayedRows.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + displayedRows.length) % displayedRows.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = displayedRows[activeIndex];
      if (row) pick(row);
    }
  };

  const showEmptyState =
    open &&
    !loading &&
    !error &&
    query.trim().length >= MIN_QUERY_LENGTH &&
    results.length === 0;

  const showRecentsHeader = open && query.trim().length === 0 && recents.length > 0;
  const showHint = open && query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH;

  // On mobile, expanded mode uses a higher z-index + solid background
  // so it visually replaces the floating header brand + bell + user
  // menu (all at `z-index: 6`). On desktop we keep the regular
  // stacking because there's room for everything to coexist.
  const mobileActive = isMobile && expanded;
  const containerClass = `map-search${mobileActive ? ' map-search--mobile-active' : ''}`;

  // `data-mode` is the override switch: while `null`, CSS media
  // queries decide trigger-vs-input visibility (mobile sees icon,
  // desktop sees bar). Once the user toggles, the explicit mode
  // overrides the media default in both directions.
  const dataMode =
    userMode === null ? undefined : userMode === 'expanded' ? 'expanded' : 'collapsed';

  return (
    <div ref={rootRef} className={containerClass} data-mode={dataMode}>
      {/* Icon-only trigger. CSS hides it on desktop by default and
          re-shows it on mobile, OR whenever `data-mode="collapsed"`. */}
      <button
        type="button"
        className="map-search__trigger"
        aria-label={t('triggerAriaLabel')}
        onClick={() => {
          setUserMode('expanded');
          setOpen(true);
          queueMicrotask(() => inputRef.current?.focus());
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      {/* WAI-ARIA 1.2 combobox pattern: the role goes on the wrapper,
          not the input. Placing `aria-expanded` / `aria-controls` on
          the input itself trips `jsx-a11y/role-supports-aria-props`
          because `<input>` already implies `role="textbox"`. */}
      <div
        className="map-search__inputWrap"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-owns={listboxId}
      >
        {/* Mobile back-arrow: only painted when the bar is in mobile
            overlay mode (`map-search--mobile-active`). CSS hides it
            otherwise so the desktop layout shows the static lupa. */}
        <button
          type="button"
          className="map-search__back"
          aria-label={t('backAriaLabel')}
          onClick={() => {
            setQuery('');
            setResults([]);
            setOpen(false);
            setUserMode('collapsed');
          }}
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
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <svg
          className="map-search__icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          id={inputId}
          className="map-search__input"
          type="search"
          inputMode="search"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('placeholder')}
          aria-label={t('inputAriaLabel')}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {query !== '' ? (
          <button
            type="button"
            className="map-search__clear"
            aria-label={t('clearAriaLabel')}
            onClick={() => {
              setQuery('');
              setResults([]);
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="map-search__panel" role="presentation">
          {loading ? (
            <p className="map-search__status">{t('loading')}</p>
          ) : null}
          {error ? <p className="map-search__status map-search__status--error">{error}</p> : null}
          {showHint ? (
            <p className="map-search__status">
              {t('minChars', { min: MIN_QUERY_LENGTH })}
            </p>
          ) : null}
          {showEmptyState ? <p className="map-search__status">{t('empty')}</p> : null}

          {showRecentsHeader ? (
            <div className="map-search__sectionHeader">
              <span>{t('recents')}</span>
              <button
                type="button"
                className="map-search__textButton"
                onClick={() => clearRecents()}
              >
                {t('clear')}
              </button>
            </div>
          ) : null}

          {displayedRows.length > 0 ? (
            <ul
              id={listboxId}
              className="map-search__list"
              role="listbox"
              aria-label={t('listAriaLabel')}
            >
              {displayedRows.map((row, i) => (
                <li
                  key={row.value.id}
                  role="option"
                  aria-selected={i === activeIndex}
                  className="map-search__item"
                  data-active={i === activeIndex || undefined}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => {
                    // Use mousedown so the click registers before
                    // the input's blur handler closes the panel.
                    e.preventDefault();
                    pick(row);
                  }}
                >
                  <span className="map-search__itemTitle">{row.value.title}</span>
                  {row.value.subtitle ? (
                    <span className="map-search__itemSubtitle">
                      {row.value.subtitle}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {/* Anchored footer with a one-liner explaining the ranking
              model. Users were confused that the dropdown only
              "found" places they had on screen — making the
              proximity bias explicit prevents that. */}
          <p className="map-search__footer">{t('hint')}</p>
        </div>
      ) : null}
    </div>
  );
}

type DisplayedRow =
  | { kind: 'result'; value: SearchResult }
  | { kind: 'recent'; value: RecentSearch };
