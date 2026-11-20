import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pageUrl, pagesToVisit, plan } from '../src/crawl';
import { Blocked, createFetcher } from '../src/fetch';
import { furnishingOf, parseArea, parsePage, parsePrice, splitPlace } from '../src/parse';
import { isAllowed, parseRobots } from '../src/robots';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', `${name}.html`), 'utf8');

describe('parsePage on saved Dot Property pages', () => {
  it('reads Makati condo rentals', () => {
    const p = parsePage(fixture('condos-for-rent-makati'), 'makati', 'rent');
    expect(p.total).toBe(5764);
    expect(p.listings.length + p.skipped.length).toBe(25);
    expect(p.listings.length).toBeGreaterThanOrEqual(20);
    const first = p.listings.find((l) => l.source_id === '01a1c3fd-291f-7533-b384-d3e7f2ad051a');
    expect(first).toMatchObject({
      offer: 'rent', kind: 'condo', city: 'makati', bedrooms: 1, bathrooms: 1, floor_sqm: 80,
      price_php: 90000, building: 'The Residences at Greenbelt', area: 'San Lorenzo', furnishing: 'furnished',
    });
    expect(first!.url).toMatch(/^https:\/\/www\.dotproperty\.com\.ph\/ads\//);
    for (const l of p.listings) {
      expect(l.price_php).toBeGreaterThan(1000);
      expect(l.price_php).toBeLessThan(5_000_000);
    }
  });

  it('reads sale pages and skips developer project cards', () => {
    const p = parsePage(fixture('condos-for-sale-makati'), 'makati', 'sale');
    expect(p.listings.length).toBeGreaterThan(15);
    for (const l of p.listings) expect(l.price_php).toBeGreaterThan(500_000);
  });

  it('reads houses', () => {
    const p = parsePage(fixture('houses-for-rent-quezon-city'), 'quezon-city', 'rent');
    expect(p.listings.length).toBeGreaterThan(15);
    expect(p.listings.every((l) => l.kind === 'house')).toBe(true);
  });

  it('keeps only the side of "for Sale or Rent" cards that matches the page', () => {
    const rent = parsePage(fixture('condos-for-rent-pasig'), 'pasig', 'rent');
    for (const l of rent.listings) expect(l.price_php).toBeLessThan(5_000_000);
  });

  it('drops a sale price typed in as monthly rent', () => {
    const rent = parsePage(fixture('condos-for-rent-pasig'), 'pasig', 'rent');
    expect(rent.skipped).toContainEqual({ id: '019fd7e4-e8c7-71ba-9d51-9ae6c7d3ad18', reason: 'implausible price' });
  });

  it('skips developer project cards (price "From", size ranges)', () => {
    const html = `<article class="listing-snippet" data-uuid="p1">
      <a href="https://www.dotproperty.com.ph/ads/the-linear_1"></a>
      <div class="text-2xl font-semibold" title="The Linear">The Linear</div>
      <div><div class="text-secondary-base font-bold">From ₱ 4,252,740</div></div>
      <ul><li><img src="//x/resize-1.svg">22-27 m2</li></ul></article>`;
    const p = parsePage(html, 'makati', 'sale');
    expect(p.listings).toHaveLength(0);
    expect(p.skipped[0].reason).toMatch(/project/);
  });
});

describe('field parsers', () => {
  it('prices', () => {
    expect(parsePrice('₱ 90,000')).toBe(90000);
    expect(parsePrice('  ₱ 16,216,900 ')).toBe(16216900);
    expect(parsePrice('From ₱ 4,252,740')).toBeNull();
    expect(parsePrice('Price on request')).toBeNull();
  });

  it('areas', () => {
    expect(parseArea('80 m2')).toBe(80);
    expect(parseArea('1,200 m2')).toBe(1200);
    expect(parseArea('22-27 m2')).toBeNull();
  });

  it('places', () => {
    expect(splitPlace('The Residences at Greenbelt, San Lorenzo, Metro Manila')).toEqual({ building: 'The Residences at Greenbelt', area: 'San Lorenzo' });
    expect(splitPlace('Bel-Air, Metro Manila')).toEqual({ building: null, area: 'Bel-Air' });
  });

  it('furnishing', () => {
    expect(furnishingOf('Semi-furnished 2BR')).toBe('semi');
    expect(furnishingOf('LUXURIOUS FULLY FURNISHED 1-BR')).toBe('furnished');
    expect(furnishingOf('Unfurnished unit')).toBe('bare');
    expect(furnishingOf('Nice unit')).toBeNull();
  });
});

describe('crawl plan', () => {
  it('covers rent and sale searches for crawled cities only', () => {
    const t = plan([{ slug: 'makati', dotproperty_path: 'metro-manila/makati' }, { slug: 'boracay', dotproperty_path: null }]);
    expect(t).toHaveLength(6);
    expect(pageUrl(t[0], 1)).toBe('https://www.dotproperty.com.ph/condos-for-rent/metro-manila/makati?sort=newest');
    expect(pageUrl(t[0], 3)).toBe('https://www.dotproperty.com.ph/condos-for-rent/metro-manila/makati?sort=newest&page=3');
  });

  it('reads the two newest pages daily and rotates deeper ones', () => {
    expect(pagesToVisit(5764, 0, 4)).toEqual([1, 2, 3, 4]);
    expect(pagesToVisit(5764, 1, 4)).toEqual([1, 2, 5, 6]);
    expect(pagesToVisit(5764, 8, 4)).toEqual([1, 2, 19, 20]);
    expect(pagesToVisit(5764, 9, 4)).toEqual([1, 2, 3, 4]);
    // Small markets: only the pages that exist.
    expect(pagesToVisit(9, 5, 4)).toEqual([1]);
    expect(pagesToVisit(60, 5, 4)).toEqual([1, 2, 3]);
    // Every page 1..20 is visited within nine days.
    const seen = new Set<number>();
    for (let d = 0; d < 9; d++) pagesToVisit(5764, d, 4).forEach((p) => seen.add(p));
    expect(seen.size).toBe(20);
  });
});

describe('robots.txt', () => {
  const rules = parseRobots(`
User-agent: AhrefsBot
User-agent: MJ12bot
Disallow: /

User-agent:*
Disallow: /dashboard/*
Disallow: /*enquire/
Allow: /dashboard/public$
`);
  it('applies only the * group to us', () => {
    expect(isAllowed(rules, '/condos-for-rent/metro-manila/makati?page=2')).toBe(true);
    expect(isAllowed(rules, '/dashboard/me')).toBe(false);
    expect(isAllowed(rules, '/ads/x/enquire/')).toBe(false);
    expect(isAllowed(rules, '/dashboard/public')).toBe(true);
  });
});

describe('fetcher', () => {
  const fast = { delayMs: 3000, maxPages: 1, maxRequests: 5, userAgent: 'test' };

  it('waits between requests and sends our user agent', async () => {
    const waits: number[] = [];
    const agents: string[] = [];
    const f = createFetcher(fast, (async (_: string, init: RequestInit) => {
      agents.push((init.headers as Record<string, string>)['user-agent']);
      return new Response('ok');
    }) as unknown as typeof fetch, async (ms) => { waits.push(ms); });
    await f.get('https://example.test/a');
    await f.get('https://example.test/b');
    expect(waits.length).toBe(1);
    expect(waits[0]).toBeGreaterThan(2500);
    expect(agents).toEqual(['test', 'test']);
  });

  it('stops on 403', async () => {
    const f = createFetcher(fast, (async () => new Response('no', { status: 403 })) as unknown as typeof fetch, async () => {});
    await expect(f.get('https://example.test/')).rejects.toBeInstanceOf(Blocked);
  });

  it('enforces the request budget', async () => {
    const f = createFetcher({ ...fast, maxRequests: 1 }, (async () => new Response('ok')) as unknown as typeof fetch, async () => {});
    await f.get('https://example.test/1');
    await expect(f.get('https://example.test/2')).rejects.toThrow(/budget/);
  });
});
