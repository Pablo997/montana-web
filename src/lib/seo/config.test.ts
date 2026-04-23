import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { absoluteUrl, resolveSiteUrl } from './config';

const ORIGINAL = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  VERCEL_URL: process.env.VERCEL_URL,
};

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.VERCEL_URL;
});

afterEach(() => {
  if (ORIGINAL.NEXT_PUBLIC_SITE_URL !== undefined) {
    process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL.NEXT_PUBLIC_SITE_URL;
  }
  if (ORIGINAL.VERCEL_URL !== undefined) {
    process.env.VERCEL_URL = ORIGINAL.VERCEL_URL;
  }
});

describe('resolveSiteUrl', () => {
  it('prefers NEXT_PUBLIC_SITE_URL over every other signal', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://montana.app';
    process.env.VERCEL_URL = 'foo.vercel.app';
    expect(resolveSiteUrl()).toBe('https://montana.app');
  });

  it('strips trailing slashes from the override', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://montana.app///';
    expect(resolveSiteUrl()).toBe('https://montana.app');
  });

  it('falls back to VERCEL_URL with https://', () => {
    process.env.VERCEL_URL = 'foo.vercel.app';
    expect(resolveSiteUrl()).toBe('https://foo.vercel.app');
  });

  it('final fallback is localhost', () => {
    expect(resolveSiteUrl()).toBe('http://localhost:3000');
  });
});

// `absoluteUrl` uses the module-level SITE_URL constant which was
// resolved when config.ts was imported. For these tests we verify
// shape/behaviour instead of the exact host, so the order of module
// load doesn't matter.
describe('absoluteUrl', () => {
  it('passes through absolute http / https URLs unchanged', () => {
    expect(absoluteUrl('https://cdn.example/og.png')).toBe(
      'https://cdn.example/og.png',
    );
    expect(absoluteUrl('http://example.com/x')).toBe('http://example.com/x');
  });

  it('returns an https or http absolute URL when given a relative path', () => {
    const out = absoluteUrl('/incidents/abc');
    expect(out).toMatch(/^https?:\/\/[^/]+\/incidents\/abc$/);
  });

  it('normalises a path without a leading slash', () => {
    const a = absoluteUrl('/x/y');
    const b = absoluteUrl('x/y');
    expect(a).toBe(b);
  });
});
