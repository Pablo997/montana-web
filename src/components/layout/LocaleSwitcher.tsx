'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/config';
import { setLocale } from '@/i18n/actions';

/**
 * Language switcher. Renders as a native `<select>` because it's the
 * one control that screen readers, keyboard users and mobile users
 * all understand without additional ARIA wiring. Looks the same as
 * any other form control we have so BEM lifts the visual style for
 * free.
 *
 * Flow:
 *   1. User picks a locale.
 *   2. Server action writes the `NEXT_LOCALE` cookie and revalidates
 *      the root layout (which owns the message provider).
 *   3. `router.refresh()` re-fetches the current page in the new
 *      locale without a hard reload — in-flight UI state (open
 *      menus, scroll position) survives.
 */
export function LocaleSwitcher({
  className,
  ariaLabel,
}: {
  className?: string;
  ariaLabel?: string;
}) {
  const t = useTranslations('locale');
  const currentLocale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onChange = (next: string) => {
    if (next === currentLocale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  };

  return (
    <select
      className={className ?? 'locale-switcher'}
      aria-label={ariaLabel ?? t('switcher')}
      value={currentLocale}
      disabled={isPending}
      onChange={(e) => onChange(e.target.value)}
    >
      {LOCALES.map((l: Locale) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
