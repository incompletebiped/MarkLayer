import { describe, expect, test } from 'bun:test';
import { cleanPageUrl } from './pageUrl';

describe('cleanPageUrl', () => {
  test('drops the tracking tags a click adds, so one page stays one page', () => {
    const gl = '_gl=1*1sywdim*_ga*MTEzNjgyOTUxNi4xNzkyMjk4MTI4';
    expect(cleanPageUrl(`https://critandclattergames.com/?${gl}`)).toBe('https://critandclattergames.com/');
    expect(cleanPageUrl('https://site.example/about/?utm_source=x&utm_medium=y&fbclid=z')).toBe(
      'https://site.example/about',
    );
  });

  test('keeps the parameters that pick what the page shows', () => {
    expect(cleanPageUrl('https://shop.example/search?q=dice&page=2&gclid=abc')).toBe(
      'https://shop.example/search?q=dice&page=2',
    );
  });

  test('treats a trailing slash and a fragment as the same page', () => {
    expect(cleanPageUrl('https://site.example/about/#team')).toBe(cleanPageUrl('https://site.example/about'));
  });

  test('leaves the site root alone', () => {
    expect(cleanPageUrl('https://site.example/')).toBe('https://site.example/');
  });

  test('passes through anything that is not a URL', () => {
    expect(cleanPageUrl('not a url')).toBe('not a url');
  });
});
