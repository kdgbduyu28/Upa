#!/usr/bin/env node
// Loads data/airdna.csv and data/bsp_rppi.csv into the database (upserts).
//   DATABASE_URL=... node scripts/load-reference.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL');
  process.exit(2);
}

function csv(name) {
  const [head, ...lines] = readFileSync(join(ROOT, 'data', name), 'utf8').trim().split(/\r?\n/);
  const keys = head.split(',');
  return lines.filter(Boolean).map((l) => {
    const vals = l.split(',');
    return Object.fromEntries(keys.map((k, i) => [k, vals[i] === '' ? null : vals[i]]));
  });
}

const sql = postgres(url, { max: 1, prepare: false });
try {
  const air = csv('airdna.csv');
  for (const r of air) {
    await sql`
      insert into short_stay_markets (city_id, month, active_listings, occupancy, adr_php, annual_revenue_php, source_url)
      select id, ${r.month}, ${r.active_listings}, ${r.occupancy}, ${r.adr_php}, ${r.annual_revenue_php}, ${r.source_url}
      from cities where slug = ${r.city}
      on conflict (city_id, month) do update set
        active_listings = excluded.active_listings, occupancy = excluded.occupancy, adr_php = excluded.adr_php,
        annual_revenue_php = excluded.annual_revenue_php, source_url = excluded.source_url`;
  }
  const bsp = csv('bsp_rppi.csv');
  for (const r of bsp) {
    await sql`
      insert into price_index (quarter, segment, area, value, yoy, source_url)
      values (${r.quarter}, ${r.segment}, ${r.area}, ${r.value}, ${r.yoy}, ${r.source_url})
      on conflict (quarter, segment, area) do update set value = excluded.value, yoy = excluded.yoy, source_url = excluded.source_url`;
  }
  console.log(`loaded ${air.length} short-stay rows and ${bsp.length} price-index rows`);
} finally {
  await sql.end();
}
