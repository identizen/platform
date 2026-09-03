import { describe, expect, it } from 'vitest';
import { browserLabel, parseUserAgent } from '../src/lib/util';

const UA = {
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.120 Safari/537.36',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.2739.67',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/127.0.6533.77 Mobile/15E148 Safari/604.1',
  phone: 'Identizen/1 CFNetwork/1498.700.2 Darwin/23.6.0',
};

describe('parseUserAgent', () => {
  it('names the browser, its major version and the OS', () => {
    expect(parseUserAgent(UA.chromeMac)).toEqual({
      browser: 'Chrome',
      version: '128',
      os: 'macOS',
      osVersion: null,
    });
    expect(parseUserAgent(UA.safariMac)).toMatchObject({ browser: 'Safari', version: '17' });
    expect(parseUserAgent(UA.safariIphone)).toEqual({
      browser: 'Safari',
      version: '17',
      os: 'iOS',
      osVersion: '17.5.1',
    });
    expect(parseUserAgent(UA.edgeWindows)).toMatchObject({
      browser: 'Edge',
      version: '128',
      os: 'Windows',
    });
    expect(parseUserAgent(UA.firefoxLinux)).toMatchObject({
      browser: 'Firefox',
      version: '129',
      os: 'Linux',
    });
    expect(parseUserAgent(UA.chromeAndroid)).toEqual({
      browser: 'Chrome',
      version: '127',
      os: 'Android',
      osVersion: '14',
    });
    expect(parseUserAgent(UA.chromeIos)).toMatchObject({ browser: 'Chrome', os: 'iOS' });
  });

  it('does not mistake the phone app for a browser', () => {
    expect(parseUserAgent(UA.phone)).toEqual({
      browser: null,
      version: null,
      os: null,
      osVersion: null,
    });
    expect(browserLabel(UA.phone)).toBe('Browser');
    expect(browserLabel(null)).toBe('Browser');
  });

  it('labels read naturally', () => {
    expect(browserLabel(UA.chromeMac)).toBe('Chrome 128 on macOS');
    expect(browserLabel(UA.safariIphone)).toBe('Safari 17 on iOS 17.5.1');
    expect(browserLabel(UA.edgeWindows)).toBe('Edge 128 on Windows');
    expect(browserLabel(UA.chromeAndroid)).toBe('Chrome 127 on Android 14');
  });
});
