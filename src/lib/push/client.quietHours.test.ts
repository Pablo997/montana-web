import { describe, expect, it } from 'vitest';
import { isValidTimeString, parseQuietHoursRow } from './client';

/**
 * Pure-helper tests for quiet-hours parsing. The SQL window-membership
 * function (`is_in_quiet_window`) is tested at the DB level via a
 * future SQL integration suite — here we only exercise the JS bits
 * that have to defend against malformed RPC payloads and partial
 * column values (stale clients, migration drift, etc.).
 */

describe('isValidTimeString', () => {
  it('accepts valid 24h HH:MM strings', () => {
    expect(isValidTimeString('00:00')).toBe(true);
    expect(isValidTimeString('07:30')).toBe(true);
    expect(isValidTimeString('23:59')).toBe(true);
  });

  it('rejects out-of-range hours and minutes', () => {
    expect(isValidTimeString('24:00')).toBe(false);
    expect(isValidTimeString('12:60')).toBe(false);
    expect(isValidTimeString('25:30')).toBe(false);
  });

  it('rejects non-string and malformed inputs', () => {
    expect(isValidTimeString(undefined)).toBe(false);
    expect(isValidTimeString(null)).toBe(false);
    expect(isValidTimeString(123)).toBe(false);
    expect(isValidTimeString('7:30')).toBe(false); // missing leading zero
    expect(isValidTimeString('07:30:00')).toBe(false); // too many parts
    expect(isValidTimeString('')).toBe(false);
  });
});

describe('parseQuietHoursRow', () => {
  it('returns null when DnD is disabled (all bounds null)', () => {
    expect(
      parseQuietHoursRow({
        quiet_hours_start: null,
        quiet_hours_end: null,
        quiet_hours_timezone: null,
        quiet_hours_critical_override: false,
      }),
    ).toBeNull();
  });

  it('parses a complete DnD row, stripping seconds from PG TIME', () => {
    // Postgres ships TIME as HH:MM:SS — the UI only wants HH:MM. The
    // server only stores wall-clock minutes (no seconds), but defensive
    // truncation makes the parser robust against either format.
    const parsed = parseQuietHoursRow({
      quiet_hours_start: '23:00:00',
      quiet_hours_end: '07:00:00',
      quiet_hours_timezone: 'Europe/Madrid',
      quiet_hours_critical_override: true,
    });
    expect(parsed).toEqual({
      start: '23:00',
      end: '07:00',
      timezone: 'Europe/Madrid',
      criticalOverride: true,
    });
  });

  it('treats a partial DnD row as disabled (defensive)', () => {
    // Missing timezone — would violate the DB CHECK if it ever landed
    // there, but if a stale client somehow writes one column we choose
    // to surface "DnD off" rather than silently silence the user with
    // a UTC-default tz they never picked.
    expect(
      parseQuietHoursRow({
        quiet_hours_start: '23:00:00',
        quiet_hours_end: '07:00:00',
        quiet_hours_timezone: null,
        quiet_hours_critical_override: false,
      }),
    ).toBeNull();
  });

  it('treats malformed HH:MM strings as disabled', () => {
    expect(
      parseQuietHoursRow({
        quiet_hours_start: 'banana',
        quiet_hours_end: '07:00:00',
        quiet_hours_timezone: 'Europe/Madrid',
        quiet_hours_critical_override: false,
      }),
    ).toBeNull();
  });

  it('coerces a missing override flag to false', () => {
    const parsed = parseQuietHoursRow({
      quiet_hours_start: '23:00',
      quiet_hours_end: '07:00',
      quiet_hours_timezone: 'Europe/Madrid',
      quiet_hours_critical_override: null,
    });
    expect(parsed?.criticalOverride).toBe(false);
  });
});
