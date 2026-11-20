// The portfolio page: each Postgres feature Upa relies on, the SQL behind it,
// and (where it's safe to) a button that runs it against the live database.
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { Button, Card, Notice, Page, Pill, Row, T } from '../components/ui';
import { marketCompare, rentCheck, searchStays } from '../lib/api';
import { distance, php } from '../lib/format';
import { useLayout } from '../lib/hooks';
import { C, RADIUS } from '../theme';

type Demo = { label: string; run: () => Promise<string[]> };
type Feature = {
  id: string; icon: React.ComponentProps<typeof Ionicons>['name']; title: string; tags: string[];
  body: string; sql: string; demo?: Demo; tryIt?: { label: string; href: string };
};

const FEATURES: Feature[] = [
  {
    id: 'bookings', icon: 'calendar-outline', title: 'Double bookings are impossible', tags: ['daterange', 'EXCLUDE', 'btree_gist'],
    body: 'A booking holds a date range. The exclusion constraint makes Postgres reject any row whose range overlaps another live booking for the same stay, even if two guests press "Book" at the same moment. Host-blocked dates are rows in the same table, so they block guests too. The app only turns the error into a friendly message.',
    sql: `create table bookings (
  stay_id bigint references stays,
  during  daterange not null,          -- [check-in, check-out)
  status  text not null default 'pending',
  constraint bookings_no_overlap
    exclude using gist (stay_id with =, during with &&)
    where (status <> 'cancelled')
);

-- inside book_stay():
exception when exclusion_violation then
  raise exception 'Those dates are no longer available'
    using hint = 'dates_taken';`,
    tryIt: { label: 'Try booking a stay', href: '/stays' },
  },
  {
    id: 'rls', icon: 'lock-closed-outline', title: 'Row-level security', tags: ['RLS', 'auth.uid()'],
    body: 'The browser talks to the database directly through Supabase, so permissions live in the database. Guests see their own trips, hosts see bookings on their own stays, drafts are private, and only a guest whose stay is completed may review it. Realtime uses the same policies, so a host only hears about their own bookings.',
    sql: `create policy "guests see their bookings, hosts see bookings on their stays"
  on bookings for select using (
    guest_id = (select auth.uid())
    or stay_id in (select id from stays where host_id = (select auth.uid()))
  );

create policy "guests review stays they completed" on reviews for insert
  with check (exists (
    select 1 from bookings b
    where b.id = booking_id and b.guest_id = (select auth.uid())
      and b.status = 'completed'));`,
    tryIt: { label: 'Sign in as the demo host', href: '/sign-in' },
  },
  {
    id: 'search', icon: 'search-outline', title: 'Search that forgives typos', tags: ['tsvector', 'pg_trgm', 'unaccent'],
    body: 'A generated tsvector column weights the title above the area, amenities and description. Trigram word similarity catches what full-text search misses: misspellings, partial words and missing accents. Results are ranked by both together.',
    sql: `search tsvector generated always as (
  setweight(to_tsvector('simple', fold(title)), 'A') ||
  setweight(to_tsvector('simple', fold(area || ' ' || kind)), 'B') ||
  setweight(to_tsvector('simple', fold(amenities::text)), 'C')
) stored

where s.search @@ websearch_to_tsquery('simple', fold(:q))
   or fold(:q) <% fold(s.title || ' ' || s.area || ' ' || c.name)
order by ts_rank_cd(s.search, tsq)
       + word_similarity(fold(:q), fold(s.title || ' ' || s.area)) desc`,
    demo: {
      label: 'Search "bonifacio glbal pool"',
      run: async () => (await searchStays({ q: 'bonifacio glbal pool', limit: 5 })).map((s) => `${s.title} · ${s.city_name} (score ${s.score.toFixed(2)})`),
    },
  },
  {
    id: 'geo', icon: 'location-outline', title: 'Distance with PostGIS', tags: ['geography', 'ST_DWithin', 'KNN <->'],
    body: 'Each stay has a geography point with a GiST index. ST_DWithin filters to a radius in metres, the <-> operator sorts nearest first using the index, and the map\'s "search this area" uses a bounding box.',
    sql: `create index on stays using gist (location);

select id, ST_Distance(location, :pin) as metres
from stays
where ST_DWithin(location, :pin, 2000)      -- 2 km
order by location <-> :pin                  -- index-assisted
limit 24;`,
    demo: {
      label: 'Stays within 2 km of Ayala Triangle',
      run: async () => (await searchStays({ lat: 14.5571, lng: 121.0233, radiusKm: 2, sort: 'distance', limit: 6 })).map((s) => `${s.title} · ${distance(s.distance_m)}`),
    },
  },
  {
    id: 'market', icon: 'stats-chart-outline', title: 'Market statistics', tags: ['percentile_cont', 'GROUPING SETS', 'window functions', 'materialized view'],
    body: 'A materialized view computes each month\'s 25th, 50th and 75th percentile per city, type and bedroom count. GROUPING SETS adds an "any bedrooms" row in the same pass. A listing counts in every month its first-seen to last-seen range overlaps, at the price it had then. Functions on top use lag() for month-over-month change and rank() to compare cities.',
    sql: `create materialized view market_stats as
select city_id, offer, kind,
       case when grouping(beds) = 1 then -1 else beds end as beds, month,
       count(*) as n,
       percentile_cont(0.5) within group (order by price_php) as median
from observed
group by grouping sets ((city_id, offer, kind, beds, month),
                        (city_id, offer, kind, month));

refresh materialized view concurrently market_stats;  -- readers never wait`,
    demo: {
      label: 'Rank cities by 1BR condo rent',
      run: async () => (await marketCompare('rent', 'condo', 1)).map((r) => `${r.rank}. ${r.city_name}: ${php(r.median)} (${r.n} listings)`),
    },
  },
  {
    id: 'rentcheck', icon: 'pricetag-outline', title: 'Hypothetical-set aggregates', tags: ['percent_rank() within group'],
    body: '"Is this rent fair?" asks where a price would rank if it were one of the listings, without inserting it. That\'s a hypothetical-set aggregate.',
    sql: `select percent_rank(:your_rent) within group (order by price_php)
from market_listings
where city_id = :city and kind = 'condo' and bedrooms = 1
  and floor_sqm between :sqm * 0.7 and :sqm * 1.3
  and active and dupe_of is null;`,
    demo: {
      label: 'Rank ₱35,000 for a 40 m² 1BR in Makati',
      run: async () => {
        const r = await rentCheck('makati', 'condo', 1, 40, 35000);
        return r ? [`${r.verdict}: higher than ${r.percentile ?? '—'}% of ${r.comparables} listings`, `Median ${php(r.median)}`] : ['No data yet'];
      },
    },
    tryIt: { label: 'Check your own rent', href: '/market/check' },
  },
  {
    id: 'ingest', icon: 'cloud-download-outline', title: 'Ingest in one statement', tags: ['MERGE … RETURNING', 'jsonb_to_recordset', 'partitioning'],
    body: 'The scraper sends a page of listings as JSON. One MERGE inserts new listings and updates seen ones; RETURNING merge_action() says which, so the same statement feeds price-history rows. History is partitioned by month, and pg_cron creates the next partitions ahead of time.',
    sql: `merge into market_listings m
using jsonb_to_recordset(:page) as i(source_id text, price_php numeric, …)
   on m.source_id = i.source_id
when matched then update set price_php = i.price_php, last_seen = now()
when not matched then insert (source_id, price_php, …) values (…)
returning m.id, merge_action();

create table market_price_history (…) partition by range (seen_on);`,
  },
  {
    id: 'dedupe', icon: 'copy-outline', title: 'Finding reposts', tags: ['pg_trgm %', 'self-join'],
    body: 'Several agents often post the same unit. Listings in the same city with the same bedrooms, size within 2 m², price within 3% and similar building names are grouped, so they count once in the medians.',
    sql: `update market_listings m set dupe_of = p.original
from (select b.id, min(a.id) as original
      from market_listings a join market_listings b on a.id < b.id
       and a.city_id = b.city_id and a.bedrooms = b.bedrooms
       and abs(a.floor_sqm - b.floor_sqm) <= 2
       and abs(a.price_php - b.price_php) <= 0.03 * a.price_php
       and fold(a.building || a.title) % fold(b.building || b.title)
      group by b.id) p
where m.id = p.id;`,
  },
  {
    id: 'quotes', icon: 'receipt-outline', title: 'Night-by-night quotes', tags: ['generate_series', 'range @>'],
    body: 'A quote is one row per night: generate_series over the stay, joined to any seasonal rate whose range contains that night. Seasonal rates have their own exclusion constraint, so a night can never have two prices.',
    sql: `select d::date as night,
       coalesce(r.nightly_php, s.nightly_php) as price
from generate_series(:check_in, :check_out - 1, interval '1 day') d
left join stay_rates r
  on r.stay_id = s.id and r.during @> d::date;`,
  },
  {
    id: 'jobs', icon: 'time-outline', title: 'Jobs inside the database', tags: ['pg_cron'],
    body: 'Nightly, confirmed stays whose check-out has passed become completed (which unlocks reviews). Monthly, new history partitions are created. The market stats refresh after every scrape and again as a nightly safety net.',
    sql: `select cron.schedule('upa-complete-bookings', '5 16 * * *',
  $$ update bookings set status = 'completed'
     where status = 'confirmed'
       and upper(during) <= (now() at time zone 'Asia/Manila')::date $$);`,
  },
];

export default function UnderTheHood() {
  const { desktop } = useLayout();
  return (
    <Page max={1000}>
      <Stack.Screen options={{ title: 'Under the hood · Upa' }} />
      <T v="h1">Under the hood</T>
      <T color={C.muted} style={{ marginTop: 4, maxWidth: 720 }}>
        Upa is a PostgreSQL showcase. The rules that matter (who sees what, what can be booked, what the market looks like) live
        in the database, not in this app. Here is the SQL behind each feature. Some cards can run their query live.
      </T>
      <Row gap={8} wrap style={{ marginTop: 12 }}>
        <Pill tone="teal" label="Postgres 17" />
        <Pill tone="teal" label="Supabase" />
        <Pill tone="teal" label="PostGIS" />
        <Pill tone="teal" label="Expo + React Native Web" />
        <Button small kind="ghost" icon="logo-github" title="Source on GitHub" onPress={() => Linking.openURL('https://github.com/kdgbduyu28/Upa')} />
      </Row>
      <View style={{ gap: 16, marginTop: 24 }}>
        {FEATURES.map((f) => <FeatureCard key={f.id} f={f} wide={desktop} />)}
      </View>
    </Page>
  );
}

function FeatureCard({ f, wide }: { f: Feature; wide: boolean }) {
  const [out, setOut] = useState<string[] | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!f.demo) return;
    setBusy(true);
    setErr(null);
    const t0 = Date.now();
    try {
      const r = await f.demo.run();
      setOut(r.length ? r : ['(no rows)']);
      setMs(Date.now() - t0);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 12 }}>
      <View nativeID={f.id} style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <Row gap={10}>
            <Ionicons name={f.icon} size={22} color={C.primary} />
            <T v="h2" style={{ flexShrink: 1 }}>{f.title}</T>
          </Row>
          <Row gap={6} wrap>{f.tags.map((t) => <Pill key={t} label={t} />)}</Row>
          <T color={C.muted}>{f.body}</T>
          <Row gap={8} wrap>
            {f.demo ? <Button small kind="teal" icon="play" title={f.demo.label} onPress={run} loading={busy} /> : null}
            {f.tryIt ? <Button small kind="ghost" icon="arrow-forward" title={f.tryIt.label} onPress={() => router.push(f.tryIt!.href as never)} /> : null}
          </Row>
          {out ? (
            <View style={{ gap: 2, backgroundColor: C.surface, borderRadius: RADIUS.md, padding: 10 }}>
              {out.map((line, i) => <T key={i} v="small">{line}</T>)}
              {ms != null ? <T v="small" color={C.muted}>Round trip {ms} ms</T> : null}
            </View>
          ) : null}
          {err ? <Notice tone="error">{err}</Notice> : null}
        </View>
        <ScrollView horizontal style={{ flex: wide ? 1.2 : undefined, backgroundColor: C.code, borderRadius: RADIUS.md }}
          contentContainerStyle={{ padding: 14 }}>
          <T v="mono" selectable>{f.sql}</T>
        </ScrollView>
      </View>
    </Card>
  );
}
