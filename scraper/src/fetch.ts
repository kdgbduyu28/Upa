// A one-at-a-time fetcher that waits between requests, honours Retry-After,
// backs off on errors and gives up on a host that starts refusing us.
import type { Politeness } from './crawl';

export class Blocked extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createFetcher(p: Politeness, fetchImpl: typeof fetch = fetch, wait = sleep) {
  let last = 0;
  let requests = 0;

  async function get(url: string): Promise<string> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (requests >= p.maxRequests) throw new Blocked(`request budget of ${p.maxRequests} used up`);
      const since = Date.now() - last;
      if (since < p.delayMs) await wait(p.delayMs - since);
      last = Date.now();
      requests++;

      let res: Response;
      try {
        res = await fetchImpl(url, {
          headers: { 'user-agent': p.userAgent, accept: 'text/html', 'accept-language': 'en' },
          redirect: 'follow',
          signal: AbortSignal.timeout(30_000),
        });
      } catch (e) {
        if (attempt === 3) throw e;
        await wait(p.delayMs * attempt * 2);
        continue;
      }

      if (res.ok) return res.text();
      // 403/429 mean "stop": the site doesn't want us right now. Don't push.
      if (res.status === 403 || res.status === 429) {
        const after = Number(res.headers.get('retry-after'));
        if (res.status === 429 && attempt < 3 && after > 0 && after <= 120) {
          await wait(after * 1000);
          continue;
        }
        throw new Blocked(`${res.status} from ${new URL(url).host}`);
      }
      if (res.status >= 500 && attempt < 3) {
        await wait(p.delayMs * attempt * 2);
        continue;
      }
      throw new Error(`${res.status} for ${url}`);
    }
    throw new Error(`gave up on ${url}`);
  }

  return { get, count: () => requests };
}
