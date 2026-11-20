#!/usr/bin/env -S npx tsx
// npm run scrape                          → full run into DATABASE_URL
// npm run scrape -- --dry-run             → parse and print, write nothing
// npm run scrape -- --city makati --pages 1 --dry-run
import postgres from 'postgres';
import { scrape } from './run';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const dry = flag('dry-run');
  const url = process.env.DATABASE_URL;
  if (!dry && !url) {
    console.error('Set DATABASE_URL (the Supabase pooler connection string) or pass --dry-run.');
    process.exit(2);
  }
  const sql = dry ? null : postgres(url!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const r = await scrape({
      sql,
      cities: value('city')?.split(','),
      politeness: {
        ...(value('pages') ? { maxPages: Number(value('pages')) } : {}),
        ...(value('delay') ? { delayMs: Math.max(2000, Number(value('delay'))) } : {}),
      },
    });
    if (dry) console.table(r.sample.map((l) => ({ kind: l.kind, beds: l.bedrooms, sqm: l.floor_sqm, price: l.price_php, area: l.area, building: l.building })));
    process.exitCode = r.status === 'failed' ? 1 : 0;
  } finally {
    await sql?.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
