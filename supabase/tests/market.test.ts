import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDb } from './pg';

let db: PGlite;
let run: number;

beforeEach(async () => {
  db = await createDb();
  run = Number((await db.query<{ id: number }>(`insert into scrape_runs default values returning id`)).rows[0].id);
});

type Row = Partial<{
  source_id: string; offer: string; kind: string; city: string; title: string; building: string;
  bedrooms: number; floor_sqm: number; price_php: number;
}>;

// Distinct building names, so test listings aren't mistaken for reposts of one unit.
const BUILDINGS = ['Acacia', 'Bougainvillea', 'Camia', 'Dama de Noche', 'Ilang-Ilang', 'Jasmin', 'Kalachuchi', 'Lotus',
  'Mayumi', 'Narra', 'Orchid', 'Pandan', 'Rosal', 'Sampaguita', 'Tindalo', 'Waling-Waling', 'Yakal', 'Zinnia',
  'Agoho', 'Banaba', 'Dao', 'Guijo', 'Lauan', 'Molave', 'Talisay', 'Apitong', 'Kamagong', 'Mangkono', 'Bitaog',
  'Malabayabas', 'Supa', 'Tanguile', 'Almaciga', 'Bagtikan', 'Calantas'];

function row(i: number, o: Row = {}) {
  const b = `${BUILDINGS[i % BUILDINGS.length]} Residences`;
  return {
    source_id: `id-${i}`, url: `https://www.dotproperty.com.ph/ads/x_${i}`, offer: 'rent', kind: 'condo',
    city: 'makati', area: 'Salcedo Village', building: b, title: `1 Bedroom Condo for rent in ${b}`,
    bedrooms: 1, bathrooms: 1, floor_sqm: 40, price_php: 30000 + i * 1000, furnishing: 'furnished', ...o,
  };
}

const ingest = (rows: object[]) =>
  db.query<{ inserted: number; updated: number; price_changes: number }>(
    `select * from ingest_market_page($1, $2::jsonb)`, [run, JSON.stringify(rows)]).then((r) => r.rows[0]);

describe('ingest', () => {
  it('inserts new listings, updates seen ones and records price changes', async () => {
    expect(await ingest([row(1), row(2)])).toEqual({ inserted: 2, updated: 0, price_changes: 0 });
    expect(await ingest([row(1), row(2, { price_php: 99000 })])).toEqual({ inserted: 0, updated: 2, price_changes: 1 });
    const h = await db.query(`select * from market_price_history`);
    // First sightings write a row; the change on the same day overwrites that day's row.
    expect(h.rows).toHaveLength(2);
    const runRow = await db.query<{ seen: number; inserted: number; pages: number }>(`select * from scrape_runs where id = $1`, [run]);
    expect(runRow.rows[0]).toMatchObject({ seen: 4, inserted: 2, pages: 2 });
  });

  it('drops rows with unknown cities or absurd prices', async () => {
    const r = await ingest([row(1, { city: 'atlantis' }), row(2, { price_php: 50 }), row(3)]);
    expect(r.inserted).toBe(1);
  });

  it('stores history in the monthly partition', async () => {
    await ingest([row(1)]);
    const r = await db.query<{ part: string }>(
      `select tableoid::regclass::text as part from market_price_history`);
    expect(r.rows[0].part).toMatch(/^market_price_history_\d{4}_\d{2}$/);
  });
});

describe('dedupe', () => {
  it('groups the same unit reposted by another agent', async () => {
    await ingest([
      row(1, { building: 'Salcedo Skysuites', title: '1 Bedroom Condo for rent in Salcedo Skysuites, Salcedo Village', price_php: 45000 }),
      row(2, { building: 'Salcedo Skysuites', title: '1 Bedroom Condo for rent in Salcedo SkySuites, Salcedo Village', price_php: 45500 }),
      row(3, { building: 'Greenbelt Hamilton', title: '1 Bedroom Condo for rent in Greenbelt Hamilton', price_php: 45000 }),
    ]);
    await db.query(`select dedupe_market_listings()`);
    const r = await db.query<{ source_id: string; dupe: string | null }>(
      `select l.source_id, o.source_id as dupe from market_listings l left join market_listings o on o.id = l.dupe_of order by l.id`);
    expect(r.rows).toEqual([
      { source_id: 'id-1', dupe: null },
      { source_id: 'id-2', dupe: 'id-1' },
      { source_id: 'id-3', dupe: null },
    ]);
  });
});

describe('stats', () => {
  beforeEach(async () => {
    // Ten 1BR condos in Makati at 31k..40k, two 2BR at 60k/70k, and five sale listings.
    await ingest([
      ...Array.from({ length: 10 }, (_, i) => row(i + 1)),
      row(20, { bedrooms: 2, floor_sqm: 70, price_php: 60000 }),
      row(21, { bedrooms: 2, floor_sqm: 75, price_php: 70000 }),
      ...Array.from({ length: 5 }, (_, i) => row(30 + i, { offer: 'sale', price_php: 8000000 + i * 100000 })),
    ]);
    await db.query(`select finish_scrape_run($1, 'ok')`, [run]);
  });

  it('computes medians per bedroom count and for any bedrooms', async () => {
    const [one] = await asUser<{ n: number; median: string; p25: string }>(db, null,
      `select * from market_snapshot('makati', 'rent', 'condo', 1)`);
    expect(one.n).toBe(10);
    expect(Number(one.median)).toBe(35500);
    const [any] = await asUser<{ n: number }>(db, null, `select * from market_snapshot('makati', 'rent', 'condo', -1)`);
    expect(any.n).toBe(12);
  });

  it('ranks a rent among comparables', async () => {
    const [r] = await asUser<{ comparables: number; percentile: number; verdict: string }>(db, null,
      `select * from rent_check('makati', 'condo', 1, 40, 32500)`);
    expect(r.comparables).toBe(10);
    expect(r.percentile).toBe(20);
    expect(r.verdict).toBe('Cheaper than most');
  });

  it('says when there is not enough data', async () => {
    const [r] = await asUser<{ verdict: string }>(db, null, `select * from rent_check('cebu-city', 'condo', 1, 40, 30000)`);
    expect(r.verdict).toMatch(/Not enough/);
  });

  it('computes gross yield from rent and sale price per sqm', async () => {
    const [y] = await asUser<{ yield_pct: string }>(db, null, `select * from gross_yield('makati', 'condo', 1)`);
    // rent 35.5k / 40 sqm × 12 ÷ (8.2M / 40 sqm) ≈ 5.2%
    expect(Number(y.yield_pct)).toBeCloseTo(5.2, 0);
  });

  it('marks listings unseen for 10 days inactive', async () => {
    await db.query(`update market_listings set first_seen = now() - interval '20 days', last_seen = now() - interval '11 days' where source_id = 'id-1'`);
    await db.query(`select finish_scrape_run($1, 'ok')`, [run]);
    const r = await db.query<{ active: boolean }>(`select active from market_listings where source_id = 'id-1'`);
    expect(r.rows[0].active).toBe(false);
  });
});
