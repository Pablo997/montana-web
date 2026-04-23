import { afterEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();
const setUser = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
  setUser: (...args: unknown[]) => setUser(...args),
}));

import {
  captureServerError,
  clearSentryUser,
  setSentryUser,
  toError,
} from './sentry';

afterEach(() => {
  captureException.mockReset();
  setUser.mockReset();
});

describe('toError', () => {
  it('passes Error instances through unchanged', () => {
    const e = new Error('boom');
    expect(toError(e)).toBe(e);
  });

  it('wraps a plain string', () => {
    const err = toError('oops');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('oops');
  });

  it('stringifies plain objects', () => {
    const err = toError({ code: 'E123' });
    expect(err.message).toContain('E123');
  });

  it('falls back when value is not JSON-serialisable', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const err = toError(circular);
    expect(err.message).toBe('Unknown error');
  });
});

describe('captureServerError', () => {
  it('forwards the coerced error and returns the Sentry id', () => {
    captureException.mockReturnValue('evt_123');
    const id = captureServerError('boom', { tag: 'admin.dismissReport' });
    expect(id).toBe('evt_123');
    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, scopeFn] = captureException.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('boom');
    expect(typeof scopeFn).toBe('function');
  });

  it('never throws even if Sentry.captureException blows up', () => {
    captureException.mockImplementation(() => {
      throw new Error('sdk exploded');
    });
    // Must not propagate.
    expect(() => captureServerError(new Error('x'))).not.toThrow();
  });

  it('applies tag / level / extras to the scope', () => {
    let tagCalls: Array<[string, string]> = [];
    let levelCalls: string[] = [];
    let extraCalls: Array<[string, unknown]> = [];
    const scope = {
      setTag: (k: string, v: string) => {
        tagCalls.push([k, v]);
        return scope;
      },
      setLevel: (v: string) => {
        levelCalls.push(v);
        return scope;
      },
      setExtra: (k: string, v: unknown) => {
        extraCalls.push([k, v]);
        return scope;
      },
    };
    captureException.mockImplementation(
      (_err: Error, cfg: (s: typeof scope) => typeof scope) => {
        cfg(scope);
        return 'evt_42';
      },
    );

    captureServerError('fail', {
      tag: 'op.x',
      level: 'warning',
      extras: { foo: 1, bar: 'two' },
    });

    expect(tagCalls).toEqual([['op', 'op.x']]);
    expect(levelCalls).toEqual(['warning']);
    expect(extraCalls).toEqual([
      ['foo', 1],
      ['bar', 'two'],
    ]);
  });
});

describe('setSentryUser / clearSentryUser', () => {
  it('sets an anonymised id', () => {
    setSentryUser('uuid-1');
    expect(setUser).toHaveBeenCalledWith({ id: 'uuid-1' });
  });

  it('clears the scope when given null / undefined / empty', () => {
    setSentryUser(null);
    setSentryUser(undefined);
    setSentryUser('');
    expect(setUser).toHaveBeenCalledTimes(3);
    for (const call of setUser.mock.calls) {
      expect(call[0]).toBeNull();
    }
  });

  it('clearSentryUser delegates to setUser(null)', () => {
    clearSentryUser();
    expect(setUser).toHaveBeenCalledWith(null);
  });
});
