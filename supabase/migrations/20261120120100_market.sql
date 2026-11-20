-- Merkado: scraped listings, their price history, and the statistics built on them.
--
-- Individual scraped listings are never exposed through the API (no select
-- policy for anon/authenticated). Only aggregates are, through market_stats
-- and the market_* functions.

create table public.market_listings (
  id             bigint generated always as identity primary key,
  source         text not null default 'dotproperty',
  source_id      text not null,
  url            text not null,
  offer          text not null check (offer in ('rent', 'sale')),
  kind           text not null check (kind in ('condo', 'house', 'apartment', 'townhouse', 'room', 'other')),
  city_id        smallint not null references public.cities (id),
  area           text,
  building       text,
  title          text not null,
  bedrooms       smallint check (bedrooms between 0 and 20),   -- 0 = studio
  bathrooms      smallint check (bathrooms between 0 and 20),
  floor_sqm      numeric(8, 1) check (floor_sqm > 0 and floor_sqm < 100000),
  price_php      numeric(14, 0) not null check (price_php > 0),
  price_per_sqm  numeric(12, 0) generated always as
                   (case when floor_sqm >= 8 then round(price_php / floor_sqm) end) stored,
  furnishing     text check (furnishing in ('furnished', 'semi', 'bare')),
  -- Same unit posted by several agents: every copy points at the oldest one.
  dupe_of        bigint references public.market_listings (id) on delete set null,
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  price_changed_at timestamptz,
  active         boolean not null default true,
  unique (source, source_id),
  -- A monthly-rent listing over ₱5M or a sale under ₱200k is almost always a typo
  -- (rent posted as sale or the other way round). Keep them out of the stats.
  constraint sane_price check (
    (offer = 'rent' and price_php between 1000 and 5000000) or
    (offer = 'sale' and price_php between 200000 and 2000000000)
  )
);

comment on table public.market_listings is
  'Listings seen by the scraper. Private: the API only serves aggregates of these.';

create index market_listings_stats_idx on public.market_listings (city_id, offer, kind, bedrooms)
  where active and dupe_of is null;
-- Trigram index on the folded title + building, for duplicate detection.
create index market_listings_trgm_idx on public.market_listings
  using gin ((public.fold(coalesce(building, '') || ' ' || title)) extensions.gin_trgm_ops);
create index market_listings_last_seen_idx on public.market_listings (last_seen);

alter table public.market_listings enable row level security;
-- No policies: nothing for anon/authenticated. The scraper connects as the owner.

-- ---------------------------------------------------------------------------
-- Price history, one row each time a listing's price is first seen or changes.
-- Partitioned by month so old months can be detached or dropped cheaply.
-- ---------------------------------------------------------------------------
create table public.market_price_history (
  listing_id bigint not null references public.market_listings (id) on delete cascade,
  seen_on    date not null,
  price_php  numeric(14, 0) not null,
  primary key (listing_id, seen_on)
) partition by range (seen_on);

create table public.market_price_history_default
  partition of public.market_price_history default;

alter table public.market_price_history enable row level security;

/** Makes sure monthly partitions exist from this month to `months_ahead` months out. */
create or replace function public.ensure_price_history_partitions(months_ahead int default 2)
returns int language plpgsql
set search_path = public
as $$
declare
  m date;
  made int := 0;
  part text;
begin
  for m in
    select generate_series(date_trunc('month', current_date),
                           date_trunc('month', current_date) + make_interval(months => months_ahead),
                           interval '1 month')::date
  loop
    part := format('market_price_history_%s', to_char(m, 'YYYY_MM'));
    if to_regclass('public.' || part) is null then
      execute format(
        'create table public.%I partition of public.market_price_history for values from (%L) to (%L)',
        part, m, (m + interval '1 month')::date);
      made := made + 1;
    end if;
  end loop;
  return made;
end $$;

select public.ensure_price_history_partitions(2);

-- ---------------------------------------------------------------------------
-- Scrape runs: a log, and the "last updated" line on the market page.
-- ---------------------------------------------------------------------------
create table public.scrape_runs (
  id            bigint generated always as identity primary key,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running' check (status in ('running', 'ok', 'partial', 'failed')),
  pages         int not null default 0,
  seen          int not null default 0,
  inserted      int not null default 0,
  price_changes int not null default 0,
  deactivated   int not null default 0,
  errors        jsonb not null default '[]'::jsonb
);

alter table public.scrape_runs enable row level security;
create policy "scrape runs are public" on public.scrape_runs for select using (true);

-- ---------------------------------------------------------------------------
-- Ingest: the scraper sends one page of parsed cards as JSON. One MERGE inserts
-- new listings and updates seen ones; RETURNING merge_action() tells us which,
-- and the price-history rows are written from that same statement.
-- ---------------------------------------------------------------------------
create or replace function public.ingest_market_page(p_run bigint, p_rows jsonb)
returns table (inserted int, updated int, price_changes int)
language plpgsql
set search_path = public, extensions
as $$
declare
  ins int; upd int; chg int;
begin
  create temp table if not exists _ingest (
    listing_id bigint, action text, price_changed boolean, price numeric
  ) on commit drop;
  truncate _ingest;

  with incoming as (
    select r.*, c.id as city_id
    from jsonb_to_recordset(p_rows) as r(
      source_id text, url text, offer text, kind text, city text, area text, building text,
      title text, bedrooms smallint, bathrooms smallint, floor_sqm numeric, price_php numeric,
      furnishing text)
    join cities c on c.slug = r.city
    where r.price_php is not null
      and ((r.offer = 'rent' and r.price_php between 1000 and 5000000) or
           (r.offer = 'sale' and r.price_php between 200000 and 2000000000))
  ), merged as (
    merge into market_listings m
    using incoming i on m.source = 'dotproperty' and m.source_id = i.source_id
    when matched then update set
      url = i.url, area = i.area, building = i.building, title = i.title,
      bedrooms = i.bedrooms, bathrooms = i.bathrooms, floor_sqm = i.floor_sqm,
      furnishing = i.furnishing, last_seen = now(), active = true,
      price_changed_at = case when m.price_php <> i.price_php then now() else m.price_changed_at end,
      price_php = i.price_php
    when not matched then insert
      (source_id, url, offer, kind, city_id, area, building, title, bedrooms, bathrooms,
       floor_sqm, price_php, furnishing)
      values (i.source_id, i.url, i.offer, i.kind, i.city_id, i.area, i.building, i.title,
              i.bedrooms, i.bathrooms, i.floor_sqm, i.price_php, i.furnishing)
    returning m.id, merge_action() as action,
              (merge_action() = 'UPDATE' and m.price_changed_at >= now()) as price_changed,
              m.price_php
  )
  insert into _ingest select * from merged;

  insert into market_price_history (listing_id, seen_on, price_php)
  select listing_id, current_date, price from _ingest
  where action = 'INSERT' or price_changed
  on conflict (listing_id, seen_on) do update set price_php = excluded.price_php;

  select count(*) filter (where action = 'INSERT'),
         count(*) filter (where action = 'UPDATE'),
         count(*) filter (where price_changed)
    into ins, upd, chg from _ingest;

  update scrape_runs set
    pages = pages + 1, seen = seen + ins + upd, inserted = scrape_runs.inserted + ins,
    price_changes = scrape_runs.price_changes + chg
  where id = p_run;

  return query select ins, upd, chg;
end $$;

/**
 * Groups reposts of the same unit: same city, offer, kind and bedrooms, floor area
 * within 2 sqm, price within 3%, and similar building + title text. Each copy
 * points at the oldest listing in its group.
 */
create or replace function public.dedupe_market_listings() returns int
language plpgsql
set search_path = public, extensions
as $$
declare n int;
begin
  perform set_config('pg_trgm.similarity_threshold', '0.55', true);
  with pairs as (
    select b.id, min(a.id) as original
    from market_listings a
    join market_listings b
      on a.id < b.id
     and a.city_id = b.city_id and a.offer = b.offer and a.kind = b.kind
     and a.bedrooms is not distinct from b.bedrooms
     and abs(coalesce(a.floor_sqm, 0) - coalesce(b.floor_sqm, 0)) <= 2
     and abs(a.price_php - b.price_php) <= 0.03 * a.price_php
     and fold(coalesce(a.building, '') || ' ' || a.title) % fold(coalesce(b.building, '') || ' ' || b.title)
    where a.active and b.active and a.dupe_of is null
    group by b.id
  )
  update market_listings m set dupe_of = p.original
  from pairs p
  where m.id = p.id and m.dupe_of is distinct from p.original;
  get diagnostics n = row_count;
  return n;
end $$;

/** Ends a run: marks listings unseen for 10 days inactive, dedupes, refreshes stats. */
create or replace function public.finish_scrape_run(p_run bigint, p_status text, p_errors jsonb default '[]')
returns void
language plpgsql
set search_path = public
as $$
declare gone int;
begin
  update market_listings set active = false
  where active and last_seen < now() - interval '10 days';
  get diagnostics gone = row_count;

  perform dedupe_market_listings();
  refresh materialized view concurrently market_stats;

  update scrape_runs set
    finished_at = now(), status = p_status, errors = coalesce(p_errors, '[]'), deactivated = gone
  where id = p_run;
end $$;

-- ---------------------------------------------------------------------------
-- Monthly statistics.
--
-- A listing counts toward every month it was on the market (its first_seen to
-- last_seen range overlaps the month), at the price it had at the end of that
-- month (the latest history row on or before then). GROUPING SETS adds an
-- "any bedrooms" row (beds = -1) to every group.
-- ---------------------------------------------------------------------------
create materialized view public.market_stats as
with months as (
  select generate_series(
           date_trunc('month', (select coalesce(min(first_seen), now()) from public.market_listings)),
           date_trunc('month', now()),
           interval '1 month')::date as month
), observed as (
  select l.id, l.city_id, l.offer, l.kind, least(l.bedrooms, 3) as beds, l.floor_sqm, m.month,
         p.price_php
  from public.market_listings l
  join months m
    on tstzrange(l.first_seen, l.last_seen, '[]')
       && tstzrange(m.month::timestamptz, (m.month + interval '1 month')::timestamptz)
  cross join lateral (
    select h.price_php from public.market_price_history h
    where h.listing_id = l.id and h.seen_on < m.month + interval '1 month'
    order by h.seen_on desc limit 1
  ) p
  where l.dupe_of is null and l.bedrooms is not null
)
select
  city_id, offer, kind,
  case when grouping(beds) = 1 then -1 else beds end::smallint as beds,
  month,
  count(*)::int as n,
  round(percentile_cont(0.25) within group (order by price_php))::numeric as p25,
  round(percentile_cont(0.50) within group (order by price_php))::numeric as median,
  round(percentile_cont(0.75) within group (order by price_php))::numeric as p75,
  round(percentile_cont(0.50) within group (order by price_php / floor_sqm)
        filter (where floor_sqm >= 8))::numeric as median_per_sqm,
  round(avg(floor_sqm) filter (where floor_sqm >= 8), 1) as avg_sqm
from observed
group by grouping sets ((city_id, offer, kind, beds, month), (city_id, offer, kind, month));

-- Needed for REFRESH ... CONCURRENTLY (readers never see an empty view).
create unique index market_stats_key on public.market_stats (city_id, offer, kind, beds, month);

grant select on public.market_stats to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reference data typed in from public sources.
-- ---------------------------------------------------------------------------
create table public.short_stay_markets (
  city_id            smallint not null references public.cities (id),
  month              date not null check (extract(day from month) = 1),
  active_listings    int check (active_listings >= 0),
  occupancy          numeric(4, 3) check (occupancy between 0 and 1),
  adr_php            numeric(10, 0) check (adr_php > 0),         -- average daily rate
  annual_revenue_php numeric(12, 0) check (annual_revenue_php >= 0),
  source_url         text not null,
  primary key (city_id, month)
);

create table public.price_index (
  quarter  date not null check (extract(day from quarter) = 1 and extract(month from quarter) in (1, 4, 7, 10)),
  segment  text not null check (segment in ('all', 'condo', 'house')),
  area     text not null check (area in ('PH', 'NCR', 'AONCR')),
  value    numeric(7, 1) not null,
  yoy      numeric(5, 1),
  source_url text not null,
  primary key (quarter, segment, area)
);

alter table public.short_stay_markets enable row level security;
alter table public.price_index enable row level security;
create policy "short-stay figures are public" on public.short_stay_markets for select using (true);
create policy "price index is public" on public.price_index for select using (true);

-- The scraper's functions are for the owner only.
revoke execute on function public.ingest_market_page(bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.dedupe_market_listings() from public, anon, authenticated;
revoke execute on function public.finish_scrape_run(bigint, text, jsonb) from public, anon, authenticated;
revoke execute on function public.ensure_price_history_partitions(int) from public, anon, authenticated;
