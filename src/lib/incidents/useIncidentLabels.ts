'use client';

import { useTranslations } from 'next-intl';
import type {
  IncidentType,
  SeverityLevel,
  IncidentStatus,
} from '@/types/incident';

/**
 * Convenience hook that returns label resolvers for the three incident
 * enums. The enum *values* (`accident`, `moderate`, …) are stable and
 * serialised over the wire / stored in the DB; only the human-readable
 * labels change with locale, so this hook is a thin wrapper around
 * `useTranslations('incident')` that type-checks the enum lookup.
 *
 * Why a hook and not a plain function: `useTranslations` must be
 * called during render, and keeping the hook colocated with the type
 * module means callers don't have to remember which namespace to pass
 * in at each site.
 */
export function useIncidentLabels() {
  const t = useTranslations('incident');
  return {
    type: (value: IncidentType) => t(`type.${value}`),
    severity: (value: SeverityLevel) => t(`severity.${value}`),
    status: (value: IncidentStatus) => t(`status.${value}`),
  };
}
