import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hostSafe,
  hostSafeAsync,
  reportHostError,
  setHostErrorSink,
} from '../../../sdk-runtime/src/host-safety';

/**
 * The boundary that keeps a Lodariq bug from reading as a customer's bug
 * (ADR-0027).
 */

afterEach(() => {
  setHostErrorSink(null);
});

describe('host safety boundary', () => {
  it('returns the callback result when nothing goes wrong', () => {
    expect(hostSafe('label', (value: number) => value * 2)(21)).toBe(42);
  });

  it('swallows a throw and reports it instead', () => {
    const sink = vi.fn();
    setHostErrorSink(sink);
    const boom = new Error('boom');

    const result = hostSafe('tour.click', () => {
      throw boom;
    })();

    expect(result).toBeUndefined();
    expect(sink).toHaveBeenCalledWith(boom, { label: 'tour.click' });
  });

  it('swallows an async rejection so it never becomes an unhandled rejection', async () => {
    const sink = vi.fn();
    setHostErrorSink(sink);

    const result = await hostSafeAsync('install', async () => {
      throw new Error('late');
    })();

    expect(result).toBeUndefined();
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it('does not let a failing reporter escalate into the host page', () => {
    setHostErrorSink(() => {
      throw new Error('the reporter is broken too');
    });

    // The whole point of the boundary is that this line cannot throw.
    expect(() =>
      hostSafe('anything', () => {
        throw new Error('original');
      })(),
    ).not.toThrow();
  });

  it('drops errors silently before a runtime installs a sink', () => {
    expect(() => reportHostError(new Error('early'), { label: 'pre-runtime' })).not.toThrow();
  });

  it('lets a later runtime take over reporting', () => {
    const first = vi.fn();
    const second = vi.fn();
    setHostErrorSink(first);
    setHostErrorSink(second);

    reportHostError(new Error('x'), { label: 'y' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
