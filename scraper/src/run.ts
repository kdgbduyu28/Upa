// One scrape run: robots.txt check, then every planned search a few pages deep,
// each page ingested as soon as it's parsed so a crash keeps what it got.
import type { Sql } from 'postgres';
import { BASE, DEFAULT_POLITENESS, dayNumber, pageUrl, pagesToVisit, plan, type Politeness, type Target } from './crawl';
import { Blocked, createFetcher } from './fetch';
import { parsePage, type Listing } from './parse';
import { isAllowed, parseRobots } from './robots';

export type RunOptions = {
  sql: Sql | null;              // null = dry run: parse and report, write nothing
  cities?: string[];            // limit to these city slugs
  offer?: 'rent' | 'sale';      // limit to rent or sale searches
  politeness?: Partial<Politeness>;
  log?: (line: string) => void;
  fetchImpl?: typeof fetch;
};

export type RunResult = {
  status: 'ok' | 'partial' | 'failed';
  pages: number;
  listings: number;
  skipped: number;
  errors: { url: string; error: string }[];
  sample: Listing[];
};

const FALLBACK_CITIES: { slug: string; dotproperty_path: string | null }[] = [
  { slug: 'makati', dotproperty_path: 'metro-manila/makati' },
  { slug: 'taguig', dotproperty_path: 'metro-manila/taguig' },
];

export async function scrape(o: RunOptions): Promise<RunResult> {
  const p: Politeness = { ...DEFAULT_POLITENESS, ...o.politeness };
  const log = o.log ?? console.log;
  const http = createFetcher(p, o.fetchImpl);
  const day = dayNumber();
  const result: RunResult = { status: 'ok', pages: 0, listings: 0, skipped: 0, errors: [], sample: [] };

  const rules = parseRobots(await http.get(`${BASE}/robots.txt`).catch(() => ''));

  let cities = o.sql
    ? await o.sql<{ slug: string; dotproperty_path: string | null }[]>`
        select slug, dotproperty_path from cities where dotproperty_path is not null order by sort`
    : FALLBACK_CITIES;
  if (o.cities?.length) cities = cities.filter((c) => o.cities!.includes(c.slug));
  const targets = plan(cities).filter((t) => !o.offer || t.offer === o.offer);

  const run = o.sql
    ? Number((await o.sql<{ id: string }[]>`insert into scrape_runs default values returning id`)[0].id)
    : 0;
  log(`run ${run || '(dry)'}: ${targets.length} searches, up to ${p.maxPages} pages each, ${p.delayMs} ms apart`);

  let stopped = false;
  for (const t of targets) {
    if (stopped) break;
    stopped = await crawlTarget(t);
  }

  if (result.errors.length) result.status = result.pages > 0 ? 'partial' : 'failed';
  if (o.sql) {
    await o.sql`select finish_scrape_run(${run}, ${result.status}, ${o.sql.json(result.errors.slice(0, 50))})`;
  }
  log(`done: ${result.status}, ${result.pages} pages, ${result.listings} listings, ${result.skipped} skipped, ${result.errors.length} errors`);
  return result;

  /** Returns true when the whole run must stop (blocked or out of budget). */
  async function crawlTarget(t: Target): Promise<boolean> {
    // Page 1 always comes first; its result count decides which other pages to read.
    let queue = [1];
    for (let qi = 0; qi < queue.length; qi++) {
      const page = queue[qi];
      const url = pageUrl(t, page);
      const u = new URL(url);
      if (!isAllowed(rules, u.pathname + u.search)) {
        result.errors.push({ url, error: 'disallowed by robots.txt' });
        return false;
      }
      let html: string;
      try {
        html = await http.get(url);
      } catch (e) {
        result.errors.push({ url, error: (e as Error).message });
        if (e instanceof Blocked) {
          log(`stopping: ${(e as Error).message}`);
          return true;
        }
        return false;
      }

      const parsed = parsePage(html, t.city, t.offer);
      result.pages++;
      result.listings += parsed.listings.length;
      result.skipped += parsed.skipped.length;
      if (result.sample.length < 10) result.sample.push(...parsed.listings.slice(0, 10 - result.sample.length));

      if (o.sql && parsed.listings.length) {
        try {
          const [r] = await o.sql<{ inserted: number; updated: number; price_changes: number }[]>`
            select * from ingest_market_page(${run}, ${o.sql.json(parsed.listings)})`;
          log(`${url}: ${parsed.listings.length} parsed, ${r.inserted} new, ${r.price_changes} price changes`);
        } catch (e) {
          // One bad page shouldn't lose the rest of the run.
          result.errors.push({ url, error: `ingest: ${(e as Error).message}` });
          log(`${url}: ingest failed: ${(e as Error).message}`);
        }
      } else {
        log(`${url}: ${parsed.listings.length} parsed, ${parsed.skipped.length} skipped (total ${parsed.total ?? '?'})`);
      }

      if (parsed.listings.length + parsed.skipped.length === 0) break;
      if (page === 1) queue = pagesToVisit(parsed.total, day, p.maxPages);
    }
    return false;
  }
}
