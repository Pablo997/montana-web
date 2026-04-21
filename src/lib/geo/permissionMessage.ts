/**
 * Builds a human-readable explanation of how to re-enable geolocation
 * for the current site, tailored to the user's browser/OS combo.
 *
 * The UA sniffing here is intentionally narrow: we only need to tell
 * the four or five combinations apart that present genuinely
 * different UI flows for the per-site permission. Anything we don't
 * recognise falls back to a generic instruction that works on most
 * desktop browsers (click the padlock, toggle the setting).
 *
 * iOS note: every browser on iOS is really WebKit under the hood, but
 * the wrappers (CriOS = Chrome, FxiOS = Firefox, EdgiOS = Edge) have
 * their own chrome and therefore their own per-site location UI.
 * Using `isIOS` alone would ship a message about Safari's "aA" button
 * to a Chrome-iOS user, who sees a completely different menu.
 */
type Os = 'ios' | 'android' | 'other';
type Browser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'other';

export function detectPlatform(ua: string): { os: Os; browser: Browser } {
  const os: Os = /iP(hone|ad|od)/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'other';

  // Order matters: iOS variants advertise "CriOS", "FxiOS", "EdgiOS"
  // *alongside* "Safari" in the UA, so we must check the wrapper
  // tokens before the generic Safari fallback.
  const browser: Browser =
    /EdgiOS|Edg\//.test(ua)
      ? 'edge'
      : /CriOS|Chrome\//.test(ua)
        ? 'chrome'
        : /FxiOS|Firefox\//.test(ua)
          ? 'firefox'
          : /Safari\//.test(ua)
            ? 'safari'
            : 'other';

  return { os, browser };
}

export function buildPermissionDeniedMessage(ua: string, rawState?: string): string {
  const { os, browser } = detectPlatform(ua);
  // Hint only rendered when we *know* the Permissions API reported
  // denied (as opposed to `getCurrentPosition` erroring with code 1).
  // Helps during remote debugging without cluttering the common path.
  const suffix = rawState ? ` (state=${rawState})` : '';

  // iOS first — all browsers share a single system-wide gate
  // (Settings → Privacy → Location Services → Safari Websites) on top
  // of the per-browser, per-site toggle. We surface both.
  if (os === 'ios') {
    switch (browser) {
      case 'safari':
        return (
          'Safari blocked location for this site. Open iOS Settings → Privacy → Location Services → "Safari Websites" → Ask. Then in Safari tap "aA" on the URL bar → Website Settings → Location → Ask. Reload.' +
          suffix
        );
      case 'chrome':
        return (
          'Chrome blocked location for this site. Tap the ••• menu → Settings → Content Settings → Location → Ask, then reload. If that fails, open iOS Settings → Privacy → Location Services → Chrome → "While Using".' +
          suffix
        );
      case 'firefox':
        return (
          'Firefox blocked location for this site. Tap the padlock on the URL bar → Clear Cookies and Site Data, then reload and allow when prompted. Also check iOS Settings → Privacy → Location Services → Firefox → "While Using".' +
          suffix
        );
      case 'edge':
        return (
          'Edge blocked location for this site. Tap the ••• menu → Settings → Site permissions → Location, then reload. Also check iOS Settings → Privacy → Location Services → Edge → "While Using".' +
          suffix
        );
      default:
        return (
          'Your browser blocked location for this site. Open its settings and re-enable location, and make sure iOS Settings → Privacy → Location Services is on.' +
          suffix
        );
    }
  }

  if (os === 'android') {
    switch (browser) {
      case 'chrome':
        return (
          'Chrome blocked location for this site. Tap the padlock on the URL bar → Permissions → Location → Allow. Also check Android Settings → Location is on.' +
          suffix
        );
      case 'firefox':
        return (
          'Firefox blocked location for this site. Tap the padlock on the URL bar → Edit Site Permissions → Location → Allow, then reload.' +
          suffix
        );
      case 'edge':
        return (
          'Edge blocked location for this site. Tap the padlock on the URL bar → Permissions → Location → Allow.' +
          suffix
        );
      default:
        return (
          'Your browser blocked location for this site. Open its site settings and allow location. Also check Android Settings → Location is on.' +
          suffix
        );
    }
  }

  // Desktop / unknown: the padlock flow is nearly universal.
  return (
    'Your browser blocked location for this site. Click the padlock icon next to the URL → Site settings → Location → Allow, then reload.' +
    suffix
  );
}
