'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/config';
import { setLocale } from '@/i18n/actions';

/**
 * Short ISO-639-1 codes shown on the collapsed pill. The trigger
 * stays narrow on mobile while the expanded panel still shows the
 * full native name so the user knows what they're picking.
 */
const LOCALE_CODES: Record<Locale, string> = {
  es: 'ES',
  en: 'EN',
};

interface Props {
  className?: string;
  ariaLabel?: string;
  /**
   * Choose the visual variant:
   *   * `pill` (default) — custom glass dropdown that matches the
   *     rest of the app's floating controls. Used everywhere the
   *     switcher lives on its own (headers, sign-in card).
   *   * `native` — a real `<select>`. Used INSIDE the user menu so
   *     we don't nest two dropdowns inside each other (the outer
   *     menu would close on outside-click the moment the user
   *     interacted with our custom panel).
   */
  variant?: 'pill' | 'native';
}

/**
 * Language switcher. Server action writes the `NEXT_LOCALE` cookie
 * and `router.refresh()` re-renders without a hard reload, so any
 * in-flight UI state (open menus, scroll position) survives.
 */
export function LocaleSwitcher({
  className,
  ariaLabel,
  variant = 'pill',
}: Props) {
  if (variant === 'native') return <NativeSwitcher className={className} ariaLabel={ariaLabel} />;
  return <PillSwitcher className={className} ariaLabel={ariaLabel} />;
}

/* -------------------------------------------------------------------------- */
/*  Native variant — used inside the user menu (dropdown-in-dropdown safety).  */
/* -------------------------------------------------------------------------- */

function NativeSwitcher({ className, ariaLabel }: { className?: string; ariaLabel?: string }) {
  const t = useTranslations('locale');
  const currentLocale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <select
      className={className ?? 'locale-switcher'}
      aria-label={ariaLabel ?? t('switcher')}
      value={currentLocale}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value;
        if (next === currentLocale) return;
        startTransition(async () => {
          await setLocale(next);
          router.refresh();
        });
      }}
    >
      {LOCALES.map((l: Locale) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pill variant — custom glass dropdown.                                      */
/* -------------------------------------------------------------------------- */

function PillSwitcher({ className, ariaLabel }: { className?: string; ariaLabel?: string }) {
  const t = useTranslations('locale');
  const currentLocale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, LOCALES.indexOf(currentLocale)),
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const listboxId = useId();
  const labelText = ariaLabel ?? t('switcher');

  // Close on outside-click & Escape. Identical to the pattern used in
  // BasemapSwitcher / UserMenu so behaviour stays predictable.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Move focus into the listbox when it opens so the user can start
  // hitting arrow keys immediately. Without this, screen readers and
  // keyboard users have to tab through the panel.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  const pick = (next: Locale) => {
    setOpen(false);
    triggerRef.current?.focus();
    if (next === currentLocale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  };

  const handleTriggerKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex(Math.max(0, LOCALES.indexOf(currentLocale)));
    }
  };

  const handleListKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % LOCALES.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + LOCALES.length) % LOCALES.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(LOCALES.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(LOCALES[activeIndex]);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`locale-picker${className ? ` ${className}` : ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className="locale-picker__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={labelText}
        disabled={isPending}
        onClick={() => {
          setOpen((v) => !v);
          setActiveIndex(Math.max(0, LOCALES.indexOf(currentLocale)));
        }}
        onKeyDown={handleTriggerKey}
      >
        <GlobeIcon />
        <span className="locale-picker__code">{LOCALE_CODES[currentLocale]}</span>
        <CaretIcon open={open} />
      </button>

      {open ? (
        <ul
          ref={listRef}
          id={listboxId}
          className="locale-picker__panel"
          role="listbox"
          aria-label={labelText}
          tabIndex={-1}
          onKeyDown={handleListKey}
        >
          {LOCALES.map((l, i) => {
            const isActive = i === activeIndex;
            const isSelected = l === currentLocale;
            return (
              <li
                key={l}
                role="option"
                aria-selected={isSelected}
                data-active={isActive || undefined}
                className="locale-picker__option"
                onClick={() => pick(l)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className="locale-picker__optionCode">
                  {LOCALE_CODES[l]}
                </span>
                <span className="locale-picker__optionLabel">
                  {LOCALE_LABELS[l]}
                </span>
                {isSelected ? <CheckIcon /> : <span className="locale-picker__checkSlot" aria-hidden />}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

function GlobeIcon() {
  return (
    <svg
      aria-hidden="true"
      className="locale-picker__icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a13.5 13.5 0 0 1 0 18" />
      <path d="M12 3a13.5 13.5 0 0 0 0 18" />
    </svg>
  );
}

function CaretIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="locale-picker__caret"
      data-open={open || undefined}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3.5 L5 6.5 L8 3.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="locale-picker__check"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4 12 5 5L20 6" />
    </svg>
  );
}
