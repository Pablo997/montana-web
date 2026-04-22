import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * User-facing report reasons. The string values are the ones persisted
 * in Postgres and enforced by the CHECK constraint in
 * `00019_reports_and_auto_expire.sql`, so don't change them without a
 * matching migration. Labels are translation-ready.
 */
export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'harassment', label: 'Harassment or hate speech' },
  { value: 'false_info', label: 'False or dangerously misleading information' },
  { value: 'inappropriate', label: 'Inappropriate or NSFW content' },
  { value: 'personal_data', label: 'Contains personal data of third parties' },
  { value: 'other', label: 'Other' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

/**
 * Friendly translation of the Postgres exceptions raised by the
 * `report_incident` RPC. Every branch maps to a user-readable message
 * so the dialog never surfaces a raw SQLSTATE.
 */
export class ReportError extends Error {
  constructor(
    public readonly code:
      | 'not_authenticated'
      | 'incident_not_found'
      | 'cannot_report_own'
      | 'rate_limit'
      | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'ReportError';
  }
}

export async function reportIncident(
  incidentId: string,
  reason: ReportReason,
  details?: string,
): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('report_incident', {
    p_incident_id: incidentId,
    p_reason: reason,
    p_details: details && details.trim().length > 0 ? details.trim() : null,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('NOT_AUTHENTICATED')) {
      throw new ReportError('not_authenticated', 'Sign in to report incidents.');
    }
    if (msg.includes('INCIDENT_NOT_FOUND')) {
      throw new ReportError('incident_not_found', 'This incident no longer exists.');
    }
    if (msg.includes('CANNOT_REPORT_OWN')) {
      throw new ReportError('cannot_report_own', 'You cannot report your own incident.');
    }
    if (msg.includes('REPORT_RATE_LIMIT')) {
      throw new ReportError(
        'rate_limit',
        'You have submitted too many reports recently. Try again in 24 hours.',
      );
    }
    throw new ReportError('unknown', 'Could not submit the report. Please try again.');
  }

  return data as string;
}
