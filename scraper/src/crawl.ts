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

export function pageUrl(t: Target, page: number): string {
  const url = `${BASE}/${t.segment}-for-${t.offer}/${t.path}`;
  return page > 1 ? `${url}?page=${page}` : url;
}

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
