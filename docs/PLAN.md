# Upa: plan

Upa ("rent" in Filipino) is a Philippine rental site where **PostgreSQL does the hard
parts**. It has two halves:

1. **Merkado (market):** what rent really costs. A free, polite scraper of Dot Property
   rental and sale listings builds up price history twice a day. Postgres turns it into
   medians, ₱/sqm, percentiles, trends, gross yields and an "Is this rent fair?" checker.
   AirDNA short-stay headline figures and the BSP Residential Property Price Index sit
   beside it as reference data.
2. **Stays (booking):** demo hosts list condos, rooms and houses; guests search and book.
   The database itself makes double-booking impossible, decides who sees what, and finds
   stays by typo-tolerant text and distance.

It's a portfolio piece, so every feature has a matching card on an **Under the hood** page
showing the SQL that powers it.

Website first (Expo web on Cloudflare Pages), then Android/iOS from the same code.

## Calls made (no input needed, change any of them)

| Decision | Call | Why |
|---|---|---|
| App stack | Expo SDK 57 + expo-router + react-native-web, TypeScript | Same as Pabili/Gawain; the website *is* the mobile app later |
| Database | Supabase (Postgres 17) project `upa`, ap-southeast-1 | Auth, RLS, Realtime, pg_cron, PostGIS all included; free tier has a slot since Gawain's project is paused |
| SQL tests | Vitest + PGlite (+ PostGIS, btree_gist, pg_trgm, unaccent), no Docker | Gawain's harness, extended |
| Scraper | Node 22 + TypeScript + cheerio, in `scraper/`, run by GitHub Actions twice daily | Same shape as Presyo's ingest; Dot Property serves listings as plain HTML |
| Scraper → DB | Direct Postgres connection (`DATABASE_URL` secret, Supabase pooler) | Bulk upserts in one transaction; no API keys in the scraper |
| Maps | Leaflet + OpenStreetMap tiles on web (`.web.tsx`); react-native-maps on mobile later | Free, no API key |
| Photos | Seeded stays use generated SVG art per property kind; hosts can upload to Supabase Storage | No copyright issues, no image hosting cost |
| Charts | Hand-written SVG (react-native-svg) | Small, works on web and native |
| Hosting | Cloudflare Pages project `upa-ph` via `scripts/release.sh` | Same flow as every other app |
| Language | English UI with Filipino section names (Merkado, Biyahe…); full Filipino later | Matches Pabili/Gawain approach |
| Scraped data display | Aggregates + counts only; individual scraped listings are never shown or copied, each stat links to the source search | Respects the source; avoids republishing their content |

## Data sources

| Source | What | How | Refresh |
|---|---|---|---|
| Dot Property PH (dotproperty.com.ph) | Rent + sale listings: kind, city, area, bedrooms, bathrooms, sqm, price, building | Scraper, 1 request / 3 s, identifies itself, robots.txt allows `*` on these paths | 2× daily |
| AirDNA free market pages | Per-city short-stay ADR, occupancy, active listings, revenue | Entered by hand into a CSV in `data/airdna.csv`, loaded by a script | Monthly |
| BSP RPPI | Quarterly residential price index: condo/house, NCR / areas outside NCR | Typed from the quarterly PDF into `data/bsp_rppi.csv` | Quarterly |

Lamudi, MyProperty and Rentpad block bots; Airbnb forbids scraping. Not used.

## PostgreSQL features shown (the point of the project)

| Feature | Where it shows up |
|---|---|
| `daterange` + `EXCLUDE USING gist` (btree_gist) | Bookings can't overlap; host blackout dates live in the same table, so they block too; seasonal rates can't overlap |
| Row-level security | Guests see their own bookings, hosts see bookings on their stays, drafts are private, reviews only from guests who stayed |
| PostGIS `geography`, `ST_DWithin`, KNN `<->` | "Within 2 km of this pin", sort by distance, map bounds search |
| Full-text search (`tsvector` generated column) + `pg_trgm` + `unaccent` | Typo-tolerant search ("makatii", "bonifacio glbal"), ranked by `ts_rank` blended with trigram similarity |
| `percentile_cont`, window functions (`lag`, moving averages) | Market medians, p25/p75, month-over-month change |
| Materialized views + `pg_cron` | `market_stats` refreshed after each scrape and nightly |
| Declarative partitioning | `market_price_history` partitioned by month; pg_cron creates next month's partition |
| `INSERT … ON CONFLICT` + history rows | Scraper upserts; a price change writes a history row |
| `pg_trgm` similarity for dedup | Same unit reposted by several agents is grouped (`dupe_group`) so medians aren't skewed |
| `generate_series` | Availability calendar and night-by-night price quotes |
| Generated columns, `CHECK` constraints | `price_per_sqm`, sane prices/sizes, rating 1–5 |
| JSONB + GIN | Amenities filter (`amenities @> '["pool"]'`) |
| SQL functions as API (RPC) | `search_stays`, `quote_stay`, `book_stay`, `rent_check`, `market_snapshot` |
| Logical replication → Supabase Realtime | Host dashboard updates live when a booking arrives |
| Triggers | `updated_at`, booking status history, guarding status transitions |

## Data model

```
cities            id, slug, name, province, region, center geography(Point), dotproperty_slug
market_listings   id, source, source_id (unique pair), url, offer rent|sale, kind condo|house|apartment|townhouse|room,
                  city_id, area, building, bedrooms, bathrooms, floor_sqm, price_php,
                  price_per_sqm (generated), furnished, title, fingerprint, dupe_group,
                  first_seen, last_seen, active
market_price_history  (listing_id, seen_on, price_php)  PARTITION BY RANGE (seen_on), monthly
scrape_runs       id, started_at, finished_at, status, pages, seen, inserted, price_changes, errors jsonb
market_stats      MATERIALIZED VIEW: city × offer × kind × bedrooms × month → n, p25, median, p75, median_ppsqm
short_stay_markets  city_id, month, adr_php, occupancy, active_listings, annual_revenue_php, source_url
price_index       quarter, segment condo|house|all, area NCR|AONCR|PH, value, yoy

profiles          id → auth.users, display_name, avatar_url, is_host, created_at
stays             id, host_id, title, description, kind, city_id, area, location geography(Point),
                  bedrooms, bathrooms, max_guests, floor_sqm, nightly_php, min_nights,
                  amenities jsonb, photos text[], art_seed int, published, search tsvector (generated)
stay_rates        stay_id, during daterange, nightly_php      EXCLUDE (stay_id =, during &&)
bookings          id, stay_id, guest_id, during daterange, guests, kind booking|blackout,
                  status pending|confirmed|cancelled|completed, total_php, note
                  EXCLUDE (stay_id =, during &&) WHERE status <> 'cancelled'
booking_events    booking_id, at, from_status, to_status, by        (trigger-written history)
reviews           booking_id (unique), rating 1–5, body, created_at
favorites         user_id, stay_id
```

RPCs: `search_stays(q, city, lat, lng, radius_km, check_in, check_out, guests, max_price, amenities, sort, limit, offset)`,
`quote_stay(stay_id, check_in, check_out)`, `book_stay(stay_id, check_in, check_out, guests, note)`,
`set_booking_status(id, status)`, `stay_calendar(stay_id, from, to)`,
`market_snapshot(city, offer, kind, bedrooms)`, `market_trend(...)`, `rent_check(city, kind, bedrooms, sqm, price)`,
`gross_yield(city, kind, bedrooms)`.

## Screens (web first)

| Route | What |
|---|---|
| `/` | Search box for stays, market snapshot tiles (median 1BR rent in Makati, BGC, QC, Cebu…), "Built on Postgres" strip |
| `/market` | City + type + bedrooms pickers → median, p25–p75 band, ₱/sqm, trend chart, listing count, gross yield, short-stay comparison, BSP index |
| `/market/check` | "Is this rent fair?": enter city, type, bedrooms, sqm, price → percentile + verdict + comparable count |
| `/stays` | Results list + map, filters (dates, guests, price, amenities, radius), sort (best match / price / distance) |
| `/stays/[id]` | Photos/art, details, map, availability calendar, night-by-night quote, book |
| `/trips` | Guest's bookings, cancel, review after stay |
| `/host` | Host dashboard: stays, incoming bookings (live), confirm/decline |
| `/host/stays/[id]` | Edit stay, pin on map, blackout dates, seasonal rates |
| `/sign-in`, `/account` | Email + password, demo host/guest buttons |
| `/under-the-hood` | One card per Postgres feature: what it does, the SQL, a live result |
| `/about` | Data sources, attribution, disclaimer |

Layout: mobile-first, two-column on desktop (list + map on `/stays`, sidebar on `/market`).

## Phases

- [ ] **0. Repo scaffold:** Expo app, theme, folder layout, AGENTS.md, ESLint, Vitest, `.env.example`
- [ ] **1. Schema:** migrations for everything above, seed data (cities, demo hosts, ~150 stays across 12 cities, bookings, reviews, sample market data), PGlite test harness, SQL tests for every constraint/policy/RPC
- [ ] **2. Scraper:** Dot Property list-page parser (fixture-tested), city × kind × offer crawl plan, polite fetcher, upsert + history + dedup + mark-stale, run log, `refresh market_stats`, CLI (`npm run scrape -- --dry-run`), GitHub Actions workflow
- [ ] **3. Market pages:** `/market`, `/market/check`, home tiles, SVG charts
- [ ] **4. Stays:** search + map, stay page, calendar, quote, booking flow, trips, reviews
- [ ] **5. Host:** dashboard with Realtime, stay editor, blackouts, rates, photo upload
- [ ] **6. Under the hood + about**, portfolio entry for timothy-borja.pages.dev
- [ ] **7. Ship web:** create Supabase project, push migrations, set GitHub secrets, first scrape, deploy to Cloudflare Pages, verify in browser
- [ ] **8. Mobile:** react-native-maps, native polish, APK through the existing tag → GitHub Releases workflow

Per the house rule, phases 0–6 are written without builds, typechecks or test runs;
everything gets verified together at phase 7 (or earlier when asked).

## What needs you

- **Phase 7:** OK to create the Supabase project `upa` (and maybe pause/delete nothing); OK to create the GitHub repo `kdgbduyu28/Upa` and push; Cloudflare deploy uses the existing token.
- Read Dot Property's terms of service once before the site goes public.

## Out of scope (for now)

Real payments, messaging between host and guest, scraping any site besides Dot Property,
showing individual scraped listings, admin moderation tools.
