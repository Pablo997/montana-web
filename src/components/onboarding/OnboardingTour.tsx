'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslations } from 'next-intl';
import { useOnboardingStore } from '@/store/useOnboardingStore';

type Placement = 'top' | 'bottom' | 'left' | 'right' | 'center';

interface Step {
  /** Unique key — also drives the i18n lookup `onboarding.<id>.{title,body}`. */
  id: string;
  /** CSS selector for the element the tooltip should point at. `null`
   * renders a centred dialog (used for welcome / wrap-up steps). */
  target: string | null;
  /** Where to place the tooltip relative to the target. Ignored when
   * `target` is null. */
  placement?: Exclude<Placement, 'center'>;
}

/**
 * Tour script. Order matters — we walk the user from "what is this"
 * (welcome) through every primary control on the map, ending with
 * notifications which is the recurring touchpoint they'll come back
 * to. Each id maps to `messages/{locale}.json → onboarding.<id>`.
 */
const STEPS: ReadonlyArray<Step> = [
  { id: 'welcome', target: null },
  { id: 'search', target: '.map-search', placement: 'bottom' },
  { id: 'basemap', target: '.basemap-switcher', placement: 'top' },
  { id: 'filters', target: '.filter-panel', placement: 'top' },
  { id: 'report', target: '.report-button', placement: 'top' },
  { id: 'notifications', target: '.notification-bell', placement: 'bottom' },
  { id: 'wrap', target: null },
];

interface Props {
  /** Only run the tour for signed-in users. */
  enabled: boolean;
}

interface TooltipPosition {
  top: number;
  left: number;
  placement: Placement;
}

const PANEL_OFFSET = 14; // px between target and tooltip
const PANEL_WIDTH = 320;
const VIEWPORT_GUTTER = 12;

export function OnboardingTour({ enabled }: Props) {
  const t = useTranslations('onboarding');
  const hasSeenTour = useOnboardingStore((s) => s.hasSeenTour);
  const markSeen = useOnboardingStore((s) => s.markSeen);

  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const [targetReady, setTargetReady] = useState(false);

  const step = STEPS[index];
  const isFirst = index === 0;
  const isLast = index === STEPS.length - 1;

  // Boot the tour ~1.6s after mount so the map, header and overlays
  // have a chance to layout. Querying `.map-search` before MapView
  // mounts its overlays would always return null and the first step
  // would have nothing to anchor to.
  useEffect(() => {
    if (!enabled || hasSeenTour) return;
    const id = setTimeout(() => setActive(true), 1600);
    return () => clearTimeout(id);
  }, [enabled, hasSeenTour]);

  // Lock body scroll while the overlay is visible — otherwise the
  // backdrop scrolls with the page and the tooltip drifts off the
  // target.
  useEffect(() => {
    if (!active) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [active]);

  const computePosition = useCallback(() => {
    if (!step.target) {
      setPosition({ top: 0, left: 0, placement: 'center' });
      setTargetReady(true);
      return true;
    }
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) {
      setTargetReady(false);
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      // Element exists but is collapsed (e.g. closed dropdown). Skip
      // for now and let the polling re-evaluate next tick.
      setTargetReady(false);
      return false;
    }
    const placement = step.placement ?? 'bottom';
    const centerX = rect.left + rect.width / 2;
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    let top = 0;
    let left = 0;

    switch (placement) {
      case 'top':
        top = rect.top - PANEL_OFFSET;
        left = centerX;
        break;
      case 'bottom':
        top = rect.bottom + PANEL_OFFSET;
        left = centerX;
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - PANEL_OFFSET;
        break;
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + PANEL_OFFSET;
        break;
    }

    // Clamp horizontally so the tooltip never sticks past the
    // viewport edges (especially on mobile where the target is
    // already near a corner).
    const halfPanel = Math.min(PANEL_WIDTH, vpW - VIEWPORT_GUTTER * 2) / 2;
    const minLeft = VIEWPORT_GUTTER + halfPanel;
    const maxLeft = vpW - VIEWPORT_GUTTER - halfPanel;
    if (placement === 'top' || placement === 'bottom') {
      left = Math.min(maxLeft, Math.max(minLeft, left));
    }
    // Vertical clamp too — keep at least the gutter from top/bottom.
    top = Math.min(vpH - VIEWPORT_GUTTER, Math.max(VIEWPORT_GUTTER, top));

    setPosition({ top, left, placement });
    setTargetReady(true);
    return true;
  }, [step]);

  // Polls every 200ms (up to ~4s) until the step's target appears in
  // the DOM. Covers slow map loads and elements that mount after
  // some user interaction (e.g. the basemap panel is collapsed when
  // the tour starts — but its TRIGGER `.basemap-switcher` is always
  // present, so the selector resolves immediately).
  useLayoutEffect(() => {
    if (!active) return;
    let cancelled = false;
    let attempts = 0;
    const tick = () => {
      if (cancelled) return;
      if (computePosition()) return;
      attempts += 1;
      if (attempts > 20) {
        // Give up after 4s and centre the tooltip — better than
        // disappearing on the user.
        setPosition({ top: 0, left: 0, placement: 'center' });
        setTargetReady(true);
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [active, computePosition]);

  // Reposition on viewport resize / scroll so the tooltip keeps
  // tracking its target on phones with rotating viewports.
  useEffect(() => {
    if (!active) return;
    const onResize = () => computePosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [active, computePosition]);

  // Escape to skip, ←/→ to navigate.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index]);

  const finish = () => {
    markSeen();
    setActive(false);
  };

  const next = () => {
    if (isLast) {
      finish();
      return;
    }
    setIndex((i) => i + 1);
  };

  const back = () => {
    if (isFirst) return;
    setIndex((i) => i - 1);
  };

  const skip = () => finish();

  // The "spotlight" — a 4-sided cutout around the target so the user
  // sees both the chrome they're being taught AND the map behind it,
  // while everything ELSE is dimmed. Cheaper than a real SVG mask: we
  // just render four backdrop strips around the target rect.
  const spotlight = useMemo(() => {
    if (!step.target || !targetReady) return null;
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    return {
      top: Math.max(0, rect.top - pad),
      left: Math.max(0, rect.left - pad),
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    };
    // `position` is intentionally in the dep list: any time the
    // tooltip position recomputes we also want the spotlight to
    // re-query its target's box. The body doesn't read `position`
    // directly but its presence here is what couples both effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, targetReady, position]);

  if (!active || !targetReady) return null;

  const tooltipStyle = (() => {
    if (!position || position.placement === 'center') {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      } as const;
    }
    const transforms: Record<Exclude<Placement, 'center'>, string> = {
      top: 'translate(-50%, -100%)',
      bottom: 'translate(-50%, 0)',
      left: 'translate(-100%, -50%)',
      right: 'translate(0, -50%)',
    };
    return {
      top: position.top,
      left: position.left,
      transform: transforms[position.placement as Exclude<Placement, 'center'>],
    } as const;
  })();

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-label={t('regionAria')}>
      {/* Backdrop. Click to dismiss the tour.
          When a spotlight is present the dim is generated by the
          spotlight's own outsize box-shadow, so this element stays
          fully transparent and only captures clicks. When there's
          no target (welcome / wrap steps) we add `--full` so the
          backdrop itself draws the dim + blur. */}
      <div
        className={`onboarding__backdrop${spotlight ? '' : ' onboarding__backdrop--full'}`}
        onClick={skip}
      />

      {/* Spotlight ring — non-interactive halo around the target so
          the user's eye is drawn to the element being explained. */}
      {spotlight ? (
        <div
          className="onboarding__spotlight"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
          aria-hidden="true"
        />
      ) : null}

      {/* Tooltip / dialog card */}
      <div
        className={`onboarding__tooltip onboarding__tooltip--${position?.placement ?? 'center'}`}
        style={tooltipStyle}
      >
        <p className="onboarding__counter" aria-live="polite">
          {t('progress', { current: index + 1, total: STEPS.length })}
        </p>
        <h2 className="onboarding__title">{t(`${step.id}.title`)}</h2>
        <p className="onboarding__body">{t(`${step.id}.body`)}</p>

        <div className="onboarding__actions">
          <button
            type="button"
            className="onboarding__skip"
            onClick={skip}
          >
            {t('skip')}
          </button>
          <div className="onboarding__nav">
            {!isFirst ? (
              <button
                type="button"
                className="button button--ghost"
                onClick={back}
              >
                {t('back')}
              </button>
            ) : null}
            <button
              type="button"
              className="button button--primary"
              onClick={next}
            >
              {isLast ? t('finish') : t('next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
