import { describe, it, expect } from 'vitest';
import { detectPlatform, buildPermissionDeniedMessage } from './permissionMessage';

/**
 * UA strings captured from real devices (trimmed for readability).
 * Source: https://useragents.me and local devtools emulation. We
 * pin the exact strings rather than fuzz them because the whole
 * point of this module is to recognise these specific shapes.
 */
const UA = {
  safariIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1',
  firefoxIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15',
  edgeIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 EdgiOS/125.0.2535.60 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.80 Mobile Safari/537.36',
  firefoxAndroid:
    'Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0',
  chromeDesktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.80 Safari/537.36',
  safariDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
};

describe('detectPlatform', () => {
  it.each([
    ['safariIOS', { os: 'ios', browser: 'safari' }],
    ['chromeIOS', { os: 'ios', browser: 'chrome' }],
    ['firefoxIOS', { os: 'ios', browser: 'firefox' }],
    ['edgeIOS', { os: 'ios', browser: 'edge' }],
    ['chromeAndroid', { os: 'android', browser: 'chrome' }],
    ['firefoxAndroid', { os: 'android', browser: 'firefox' }],
    ['chromeDesktop', { os: 'other', browser: 'chrome' }],
    ['safariDesktop', { os: 'other', browser: 'safari' }],
  ] as const)('classifies %s correctly', (key, expected) => {
    expect(detectPlatform(UA[key])).toEqual(expected);
  });

  it('falls back to "other" for unrecognised user agents', () => {
    expect(detectPlatform('curl/8.1.2')).toEqual({ os: 'other', browser: 'other' });
  });
});

describe('buildPermissionDeniedMessage', () => {
  it('includes Safari-specific "aA" instructions on iOS Safari', () => {
    const msg = buildPermissionDeniedMessage(UA.safariIOS);
    expect(msg).toMatch(/Safari/);
    expect(msg).toMatch(/aA/);
    expect(msg).toMatch(/Location Services/);
  });

  it('does NOT mention "aA" on iOS Chrome (different menu flow)', () => {
    const msg = buildPermissionDeniedMessage(UA.chromeIOS);
    expect(msg).not.toMatch(/aA/);
    expect(msg).toMatch(/Chrome/);
  });

  it('gives Android-specific instructions on Android Chrome', () => {
    const msg = buildPermissionDeniedMessage(UA.chromeAndroid);
    expect(msg).toMatch(/Android/);
    expect(msg).toMatch(/padlock/);
    expect(msg).not.toMatch(/iOS/);
  });

  it('appends the raw permission state when provided', () => {
    const msg = buildPermissionDeniedMessage(UA.chromeDesktop, 'denied');
    expect(msg).toMatch(/\(state=denied\)$/);
  });

  it('omits the state suffix when not provided', () => {
    const msg = buildPermissionDeniedMessage(UA.chromeDesktop);
    expect(msg).not.toMatch(/state=/);
  });

  it('falls back to the generic desktop message for unknown UAs', () => {
    const msg = buildPermissionDeniedMessage('curl/8.1.2');
    expect(msg).toMatch(/padlock/);
  });
});
