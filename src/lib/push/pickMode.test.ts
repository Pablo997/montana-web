import { describe, expect, test } from 'vitest';
import { requestPick, resolvePick } from './pickMode';

describe('pickMode', () => {
  test('resolvePick returns the coords to the awaiter', async () => {
    const p = requestPick();
    // Resolve on the next microtask so the promise is actually pending
    // when we call resolvePick (mimics the real flow where the click
    // handler fires after paint).
    queueMicrotask(() => resolvePick({ lat: 10, lng: 20 }));
    await expect(p).resolves.toEqual({ lat: 10, lng: 20 });
  });

  test('resolvePick(null) means the user cancelled', async () => {
    const p = requestPick();
    queueMicrotask(() => resolvePick(null));
    await expect(p).resolves.toBeNull();
  });

  test('a second requestPick cancels the first so promises never dangle', async () => {
    const first = requestPick();
    const second = requestPick();
    queueMicrotask(() => resolvePick({ lat: 1, lng: 2 }));
    // First one is cancelled (null); second one gets the coords.
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toEqual({ lat: 1, lng: 2 });
  });

  test('resolvePick without a pending pick is a no-op', () => {
    expect(() => resolvePick({ lat: 0, lng: 0 })).not.toThrow();
  });
});
