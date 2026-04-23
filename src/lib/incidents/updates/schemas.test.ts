import { describe, it, expect } from 'vitest';
import { CreateIncidentUpdateSchema } from './schemas';

describe('CreateIncidentUpdateSchema', () => {
  it('accepts a reasonable body', () => {
    const parsed = CreateIncidentUpdateSchema.parse({
      body: 'Passed by at 10:00, the path is cleared.',
    });
    expect(parsed.body).toBe('Passed by at 10:00, the path is cleared.');
  });

  it('trims whitespace before enforcing minLength', () => {
    // Users typing accidental trailing spaces shouldn't bypass the
    // "write something" rule.
    const r = CreateIncidentUpdateSchema.safeParse({ body: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/write something/i);
    }
  });

  it('rejects empty strings', () => {
    expect(CreateIncidentUpdateSchema.safeParse({ body: '' }).success).toBe(false);
  });

  it('rejects bodies longer than 500 chars', () => {
    const r = CreateIncidentUpdateSchema.safeParse({ body: 'x'.repeat(501) });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/500/);
    }
  });

  it('accepts exactly 500 chars (boundary)', () => {
    expect(
      CreateIncidentUpdateSchema.safeParse({ body: 'x'.repeat(500) }).success,
    ).toBe(true);
  });
});
