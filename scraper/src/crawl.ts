// What to crawl and how politely.
import type { Offer } from './parse';

export const BASE = 'https://www.dotproperty.com.ph';
export const PER_PAGE = 25;

/** One search: e.g. condos for rent in Makati. */
export type Target = { city: string; path: string; offer: Offer; segment: string };

// The search URL segment for each kind of place; houses include house-and-lot.
const RENT_SEGMENTS = ['condos', 'houses', 'apartments', 'townhouses'];
const SALE_SEGMENTS = ['condos', 'houses'];

/**
 * Every (city × kind × offer) search, in a stable order. `cities` are
 * { slug, dotproperty_path } rows from the database.
 */
export function plan(cities: { slug: string; dotproperty_path: string | null }[]): Target[] {
  const out: Target[] = [];
  for (const c of cities) {
    if (!c.dotproperty_path) continue;
    for (const segment of RENT_SEGMENTS) out.push({ city: c.slug, path: c.dotproperty_path, offer: 'rent', segment });
    for (const segment of SALE_SEGMENTS) out.push({ city: c.slug, path: c.dotproperty_path, offer: 'sale', segment });
  }
  return out;
}

/**
 * Newest first: the default "Relevance" order puts paid, featured listings on
 * top, which skews a small sample toward pricier units.
 */
export function pageUrl(t: Target, page: number): string {
  const url = `${BASE}/${t.segment}-for-${t.offer}/${t.path}?sort=newest`;
  return page > 1 ? `${url}&page=${page}` : url;
}

/** Deepest page the rotation reaches (25 per page → the newest 500 listings). */
export const MAX_DEPTH = 20;

/**
 * Which pages to read today. The first two (the newest listings) every day,
 * the rest rotate through pages 3..MAX_DEPTH by date, so over about nine days
 * the sample covers far more than the same four pages would, at the same
 * number of requests per day.
 */
export function pagesToVisit(totalListings: number | null, day: number, maxPages: number): number[] {
  const lastPage = Math.max(1, Math.min(MAX_DEPTH, Math.ceil((totalListings ?? PER_PAGE) / PER_PAGE)));
  const pages = [1, 2].filter((p) => p <= lastPage && p <= maxPages);
  const deep = lastPage - 2;
  for (let i = 0; pages.length < maxPages && deep > 0 && i < deep; i++) {
    const p = 3 + ((day * (maxPages - 2) + i) % deep);
    if (!pages.includes(p)) pages.push(p);
  }
  return pages.sort((a, b) => a - b);
}

/** Days since 2026-01-01, for the page rotation. */
export const dayNumber = (d = new Date()) => Math.floor((d.getTime() - Date.UTC(2026, 0, 1)) / 86_400_000);

export type Politeness = {
  /** Milliseconds between requests (one at a time, never in parallel). */
  delayMs: number;
  /** Pages per search. A sample is enough for medians; we don't need every listing. */
  maxPages: number;
  /** Stop the whole run after this many requests. */
  maxRequests: number;
  userAgent: string;
};

export const DEFAULT_POLITENESS: Politeness = {
  delayMs: 3000,
  maxPages: 4,
  maxRequests: 400,
  userAgent: 'UpaBot/0.1 (+https://github.com/kdgbduyu28/Upa; rental price statistics, one request every 3s)',
};
