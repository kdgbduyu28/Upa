-- The app's API: SQL functions PostgREST serves as /rpc/<name>.
--
-- Stays functions run as the caller (row-level security applies) except where
-- they must look at other people's bookings to answer "is it free?"; those are
-- SECURITY DEFINER and return only yes/no style answers, never who booked.

create or replace function public.manila_today() returns date
language sql stable
as $$ select (now() at time zone 'Asia/Manila')::date $$;

-- ===========================================================================
-- Stays
-- ===========================================================================

/** True when nothing (booking or host block) holds any night of `p_dates`. */
create or replace function public.stay_is_free(p_stay bigint, p_dates daterange) returns boolean
language sql stable security definer
set search_path = public
as $$
  select not exists (
    select 1 from bookings b
    where b.stay_id = p_stay and b.status <> 'cancelled' and b.during && p_dates
  )
$$;

/**
 * Night-by-night price for a stay: seasonal rates where they apply, the base
 * rate elsewhere, pro-rata monthly pricing for 28+ nights, plus fees.
 */
create or replace function public.quote_stay(p_stay bigint, p_check_in date, p_check_out date)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  s stays;
  n int := p_check_out - p_check_in;
  per_night jsonb;
  subtotal numeric;
  monthly boolean;
  service numeric;
begin
  select * into s from stays where id = p_stay;
  if not found then
    raise exception 'Stay not found' using errcode = 'P0002';
  end if;
  if n < 1 then
    raise exception 'Check-out must be after check-in' using errcode = '22023';
  end if;
  if n > 180 then
    raise exception 'Stays are limited to 180 nights' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object('night', night, 'price', price, 'label', label) order by night),
         sum(price)
    into per_night, subtotal
  from (
    select d::date as night,
           coalesce(r.nightly_php, s.nightly_php) as price,
           coalesce(r.label, '') as label
    from generate_series(p_check_in, p_check_out - 1, interval '1 day') d
    left join stay_rates r on r.stay_id = s.id and r.during @> d::date
  ) nights;

  monthly := s.monthly_php is not null and n >= 28;
  if monthly then
    subtotal := round(s.monthly_php * n / 30.0);
  end if;
  service := round(subtotal * 0.05);

  return jsonb_build_object(
    'stay_id', s.id,
    'check_in', p_check_in,
    'check_out', p_check_out,
    'nights', n,
    'per_night', per_night,
    'monthly_rate_applied', monthly,
    'subtotal', subtotal,
    'cleaning_fee', s.cleaning_fee_php,
    'service_fee', service,
    'total', subtotal + s.cleaning_fee_php + service,
    'min_nights', s.min_nights,
    'meets_min_nights', n >= s.min_nights,
    'available', stay_is_free(s.id, daterange(p_check_in, p_check_out))
  );
end $$;

/** Day-by-day availability for a calendar. Says booked/blocked, never by whom. */
create or replace function public.stay_calendar(p_stay bigint, p_from date, p_to date)
returns table (day date, status text, nightly_php numeric, label text)
language plpgsql stable security definer
set search_path = public
as $$
declare s stays;
begin
  select * into s from stays
  where id = p_stay and (published or host_id = auth.uid());
  if not found then
    raise exception 'Stay not found' using errcode = 'P0002';
  end if;
  if p_to - p_from > 400 then
    raise exception 'Ask for at most 400 days at a time' using errcode = '22023';
  end if;

  return query
  select d::date,
         case
           when d::date < manila_today() then 'past'
           when b.kind = 'blackout' then 'blocked'
           when b.id is not null then 'booked'
           else 'free'
         end,
         coalesce(r.nightly_php, s.nightly_php),
         coalesce(r.label, '')
  from generate_series(p_from, p_to - 1, interval '1 day') d
  left join bookings b
    on b.stay_id = s.id and b.status <> 'cancelled' and b.during @> d::date
  left join stay_rates r
    on r.stay_id = s.id and r.during @> d::date
  order by 1;
end $$;

/**
 * Search: typo-tolerant text (full-text + trigram word similarity), distance
 * from a pin, map bounds, dates (only stays free for every night), guests,
 * price, bedrooms, amenities (JSONB containment) and kind.
 */
create or replace function public.search_stays(
  p_q            text default null,
  p_city         text default null,
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_radius_km    double precision default 10,
  p_west         double precision default null,
  p_south        double precision default null,
  p_east         double precision default null,
  p_north        double precision default null,
  p_check_in     date default null,
  p_check_out    date default null,
  p_guests       int default 1,
  p_min_price    numeric default null,
  p_max_price    numeric default null,
  p_min_bedrooms int default 0,
  p_amenities    jsonb default '[]'::jsonb,
  p_kinds        text[] default null,
  p_sort         text default 'best',
  p_limit        int default 24,
  p_offset       int default 0
)
returns table (
  id bigint, title text, kind text, city_slug text, city_name text, area text,
  nightly_php numeric, bedrooms smallint, max_guests smallint,
  rating_avg numeric, rating_count int, art_seed int, photo text, instant_book boolean,
  lat double precision, lng double precision, distance_m double precision,
  score real, total bigint
)
language sql stable
set search_path = public, extensions
-- Measured: one-letter typos ("baguoi", "boracy", "tagaytya") score 0.57–0.75,
-- while unrelated short words ("pool" vs "power") score 0.40. Default is 0.6.
set pg_trgm.word_similarity_threshold = 0.5
as $$
  with params as (
    select
      nullif(trim(fold(p_q)), '') as fq,
      case when nullif(trim(p_q), '') is not null
           then websearch_to_tsquery('simple', fold(p_q)) end as tsq,
      case when p_lat is not null and p_lng is not null
           then ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography end as pin,
      case when p_check_in is not null and p_check_out > p_check_in
           then daterange(p_check_in, p_check_out) end as dates
  ), hits as (
    select
      s.id as s_id, s.title as s_title, s.kind as s_kind, c.slug as c_slug, c.name as c_name,
      s.area as s_area, s.nightly_php as s_price, s.bedrooms as s_beds, s.max_guests as s_guests,
      s.rating_avg as s_rating, s.rating_count as s_reviews, s.art_seed as s_art,
      s.photos[1] as s_photo, s.instant_book as s_instant, s.location as s_loc,
      case when p.pin is not null then ST_Distance(s.location, p.pin) end as dist,
      case when p.fq is null then 0
           else coalesce(ts_rank_cd(s.search, p.tsq), 0)
                + word_similarity(p.fq, fold(s.title || ' ' || s.area || ' ' || c.name))
      end as rel
    from stays s
    join cities c on c.id = s.city_id
    cross join params p
    where s.published
      and (p_city is null or c.slug = p_city)
      -- Full-text match, or every query word close to some word in the title,
      -- area, city, kind or amenities ("baguoi garden" finds "Garden house in Baguio").
      and (p.fq is null
           or s.search @@ p.tsq
           or not exists (
                select 1 from regexp_split_to_table(p.fq, '\s+') w
                where length(w) > 1
                  and not (w <% fold(s.title || ' ' || s.area || ' ' || c.name || ' ' || s.kind || ' ' || s.amenities::text))))
      and (p.pin is null or ST_DWithin(s.location, p.pin, p_radius_km * 1000))
      and (p_west is null
           or s.location && ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)::geography)
      and s.max_guests >= coalesce(p_guests, 1)
      and s.bedrooms >= coalesce(p_min_bedrooms, 0)
      and (p_min_price is null or s.nightly_php >= p_min_price)
      and (p_max_price is null or s.nightly_php <= p_max_price)
      and s.amenities @> coalesce(p_amenities, '[]'::jsonb)
      and (p_kinds is null or s.kind = any (p_kinds))
      and (p.dates is null
           or (upper(p.dates) - lower(p.dates) >= s.min_nights and stay_is_free(s.id, p.dates)))
  )
  select
    h.s_id, h.s_title, h.s_kind, h.c_slug, h.c_name, h.s_area, h.s_price, h.s_beds, h.s_guests,
    h.s_rating, h.s_reviews, h.s_art, h.s_photo, h.s_instant,
    ST_Y(h.s_loc::geometry), ST_X(h.s_loc::geometry), h.dist, h.rel::real,
    count(*) over ()
  from hits h
  order by
    case when p_sort = 'price'      then h.s_price end asc,
    case when p_sort = 'price_desc' then h.s_price end desc,
    case when p_sort = 'distance'   then h.dist end asc nulls last,
    case when p_sort = 'rating'     then h.s_rating end desc nulls last,
    h.rel desc, h.s_reviews desc, h.s_id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;

/** Books a stay for the signed-in guest. Pending until the host confirms, unless instant book. */
create or replace function public.book_stay(
  p_stay bigint, p_check_in date, p_check_out date, p_guests int default 1, p_note text default ''
)
returns public.bookings
language plpgsql security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  s stays;
  q jsonb;
  b bookings;
begin
  if me is null then
    raise exception 'Sign in to book' using errcode = '28000';
  end if;
  select * into s from stays where id = p_stay and published;
  if not found then
    raise exception 'Stay not found' using errcode = 'P0002';
  end if;
  if s.host_id = me then
    raise exception 'You can''t book your own stay' using errcode = 'P0001';
  end if;
  if p_check_in < manila_today() then
    raise exception 'Check-in can''t be in the past' using errcode = '22023';
  end if;
  if p_check_out - p_check_in < s.min_nights then
    raise exception 'This stay needs at least % nights', s.min_nights using errcode = '22023';
  end if;
  if p_guests > s.max_guests then
    raise exception 'This stay fits up to % guests', s.max_guests using errcode = '22023';
  end if;

  q := quote_stay(p_stay, p_check_in, p_check_out);

  begin
    insert into bookings (stay_id, guest_id, during, guests, status, total_php, note)
    values (s.id, me, daterange(p_check_in, p_check_out), greatest(p_guests, 1),
            case when s.instant_book then 'confirmed' else 'pending' end,
            (q ->> 'total')::numeric, left(coalesce(p_note, ''), 500))
    returning * into b;
  exception when exclusion_violation then
    -- The EXCLUDE constraint is the real guard: two guests racing for the same
    -- nights can't both get them, whatever the app checked beforehand.
    raise exception 'Those dates are no longer available' using errcode = 'P0001', hint = 'dates_taken';
  end;
  return b;
end $$;

/**
 * Moves a booking along. Hosts confirm or decline pending requests and can
 * cancel; guests cancel before check-in; hosts unblock their own blocked dates.
 */
create or replace function public.set_booking_status(p_booking bigint, p_status text)
returns public.bookings
language plpgsql security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  b bookings;
  host uuid;
  ok boolean := false;
begin
  select * into b from bookings where id = p_booking for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  select s.host_id into host from stays s where s.id = b.stay_id;

  if me = host then
    ok := (b.status = 'pending'   and p_status in ('confirmed', 'cancelled'))
       or (b.status = 'confirmed' and p_status = 'cancelled');
  elsif me = b.guest_id and b.kind = 'booking' then
    ok := b.status in ('pending', 'confirmed') and p_status = 'cancelled'
          and lower(b.during) > manila_today();
  end if;

  if not ok then
    raise exception 'You can''t change this booking to %', p_status using errcode = '42501';
  end if;

  update bookings set status = p_status where id = p_booking returning * into b;
  return b;
end $$;

/** Hosts block dates on their own stay (maintenance, personal use). */
create or replace function public.block_dates(p_stay bigint, p_from date, p_to date, p_note text default '')
returns public.bookings
language plpgsql security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  b bookings;
begin
  if not exists (select 1 from stays where id = p_stay and host_id = me) then
    raise exception 'Not your stay' using errcode = '42501';
  end if;
  begin
    insert into bookings (stay_id, guest_id, kind, during, status, note)
    values (p_stay, me, 'blackout', daterange(p_from, p_to), 'confirmed', left(coalesce(p_note, ''), 500))
    returning * into b;
  exception when exclusion_violation then
    raise exception 'Those dates overlap a booking or another block' using errcode = 'P0001', hint = 'dates_taken';
  end;
  return b;
end $$;

/** Nightly job: confirmed bookings whose check-out has passed become completed (and reviewable). */
create or replace function public.complete_past_bookings() returns int
language sql
set search_path = public
as $$
  with done as (
    update bookings set status = 'completed'
    where status = 'confirmed' and kind = 'booking' and upper(during) <= manila_today()
    returning 1
  )
  select count(*)::int from done
$$;

revoke execute on function public.complete_past_bookings() from public, anon, authenticated;
-- Functions are executable by PUBLIC by default, so revoking anon alone isn't enough.
revoke execute on function public.book_stay(bigint, date, date, int, text) from public, anon;
revoke execute on function public.set_booking_status(bigint, text) from public, anon;
revoke execute on function public.block_dates(bigint, date, date, text) from public, anon;
grant execute on function public.book_stay(bigint, date, date, int, text) to authenticated;
grant execute on function public.set_booking_status(bigint, text) to authenticated;
grant execute on function public.block_dates(bigint, date, date, text) to authenticated;

-- ===========================================================================
-- Market
-- ===========================================================================

/** Cities with market data, with how many active listings each has. */
create or replace function public.market_cities()
returns table (slug text, name text, province text, is_metro_manila boolean, rent_listings int, sale_listings int)
language sql stable security definer
set search_path = public
as $$
  select c.slug, c.name, c.province, c.is_metro_manila,
         count(*) filter (where l.offer = 'rent')::int,
         count(*) filter (where l.offer = 'sale')::int
  from cities c
  left join market_listings l on l.city_id = c.id and l.active and l.dupe_of is null
  where c.dotproperty_path is not null
  group by c.id
  order by c.sort, c.name
$$;

/** The latest month for one city/offer/kind/bedrooms (beds -1 = any), with change from the month before. */
create or replace function public.market_snapshot(
  p_city text, p_offer text default 'rent', p_kind text default 'condo', p_beds int default -1
)
returns table (
  month date, n int, p25 numeric, median numeric, p75 numeric, median_per_sqm numeric, avg_sqm numeric,
  prev_median numeric, change_pct numeric, last_scraped timestamptz, source_url text
)
language sql stable
set search_path = public
as $$
  with series as (
    select st.*, lag(st.median) over (order by st.month) as prev
    from market_stats st
    join cities c on c.id = st.city_id
    where c.slug = p_city and st.offer = p_offer and st.kind = p_kind and st.beds = least(p_beds, 3)
  )
  select s.month, s.n, s.p25, s.median, s.p75, s.median_per_sqm, s.avg_sqm, s.prev,
         round(100.0 * (s.median - s.prev) / nullif(s.prev, 0), 1),
         (select max(finished_at) from scrape_runs where status in ('ok', 'partial')),
         (select format('https://www.dotproperty.com.ph/%ss-for-%s/%s', p_kind, p_offer, c.dotproperty_path)
            from cities c where c.slug = p_city)
  from series s
  order by s.month desc
  limit 1
$$;

/** Monthly medians with month-over-month change and a 3-month moving average. */
create or replace function public.market_trend(
  p_city text, p_offer text default 'rent', p_kind text default 'condo', p_beds int default -1,
  p_months int default 12
)
returns table (month date, n int, p25 numeric, median numeric, p75 numeric, median_per_sqm numeric,
               change_pct numeric, moving_avg_3 numeric)
language sql stable
set search_path = public
as $$
  select * from (
    select st.month, st.n, st.p25, st.median, st.p75, st.median_per_sqm,
           round(100.0 * (st.median - lag(st.median) over w) / nullif(lag(st.median) over w, 0), 1),
           round(avg(st.median) over (w rows between 2 preceding and current row))
    from market_stats st
    join cities c on c.id = st.city_id
    where c.slug = p_city and st.offer = p_offer and st.kind = p_kind and st.beds = least(p_beds, 3)
    window w as (order by st.month)
  ) t
  where t.month >= date_trunc('month', now()) - make_interval(months => greatest(p_months, 1) - 1)
  order by t.month
$$;

/** Every city's latest median for the same kind of place, ranked, vs the all-city average. */
create or replace function public.market_compare(
  p_offer text default 'rent', p_kind text default 'condo', p_beds int default -1, p_min_n int default 5
)
returns table (city_slug text, city_name text, n int, median numeric, median_per_sqm numeric,
               rank bigint, vs_average_pct numeric)
language sql stable
set search_path = public
as $$
  with latest as (
    select distinct on (st.city_id) st.*
    from market_stats st
    where st.offer = p_offer and st.kind = p_kind and st.beds = least(p_beds, 3) and st.n >= p_min_n
    order by st.city_id, st.month desc
  )
  select c.slug, c.name, l.n, l.median, l.median_per_sqm,
         rank() over (order by l.median desc),
         round(100.0 * (l.median / avg(l.median) over () - 1), 1)
  from latest l join cities c on c.id = l.city_id
  order by l.median desc
$$;

/**
 * "Is this rent fair?" Ranks a price among active comparable listings with the
 * hypothetical-set aggregate percent_rank(x) WITHIN GROUP. Comparables are the
 * same city, kind and bedrooms, sized within ±30% when a size is given (falls
 * back to any size when that leaves fewer than 8).
 */
create or replace function public.rent_check(
  p_city text, p_kind text, p_beds int, p_sqm numeric, p_price numeric
)
returns table (comparables int, percentile int, p25 numeric, median numeric, p75 numeric,
               median_per_sqm numeric, your_per_sqm numeric, widened boolean, verdict text)
language sql stable security definer
set search_path = public
as $$
  with base as (
    select l.price_php, l.floor_sqm
    from market_listings l join cities c on c.id = l.city_id
    where c.slug = p_city and l.offer = 'rent' and l.kind = p_kind
      and l.active and l.dupe_of is null
      and least(l.bedrooms, 3) = least(p_beds, 3)
  ), near as (
    select * from base
    where p_sqm is null or floor_sqm between p_sqm * 0.7 and p_sqm * 1.3
  ), pool as (
    select *, false as widened from near where (select count(*) from near) >= 8
    union all
    select *, true from base where (select count(*) from near) < 8 and p_sqm is not null
  ), stats as (
    select count(*)::int as n,
           round(100 * percent_rank(p_price) within group (order by price_php))::int as pct,
           round(percentile_cont(0.25) within group (order by price_php)) as p25,
           round(percentile_cont(0.50) within group (order by price_php)) as med,
           round(percentile_cont(0.75) within group (order by price_php)) as p75,
           round(percentile_cont(0.50) within group (order by price_php / floor_sqm)
                 filter (where floor_sqm >= 8)) as ppsqm,
           bool_or(widened) as widened
    from pool
  )
  select n, case when n > 0 then pct end, p25, med, p75, ppsqm,
         case when p_sqm >= 8 then round(p_price / p_sqm) end,
         coalesce(widened, false),
         case
           when n < 5    then 'Not enough listings to compare yet'
           when pct <= 25 then 'Cheaper than most'
           when pct <= 60 then 'About typical'
           when pct <= 85 then 'On the high side'
           else 'Well above typical'
         end
  from stats
$$;

/** Gross rental yield: 12 × median rent per sqm ÷ median sale price per sqm. */
create or replace function public.gross_yield(p_city text, p_kind text default 'condo', p_beds int default -1)
returns table (rent_per_sqm numeric, sale_per_sqm numeric, yield_pct numeric, month date)
language sql stable
set search_path = public
as $$
  with latest as (
    select distinct on (st.offer) st.offer, st.median_per_sqm, st.month
    from market_stats st join cities c on c.id = st.city_id
    where c.slug = p_city and st.kind = p_kind and st.beds = least(p_beds, 3) and st.n >= 5
    order by st.offer, st.month desc
  )
  select r.median_per_sqm, s.median_per_sqm,
         round(100.0 * 12 * r.median_per_sqm / nullif(s.median_per_sqm, 0), 2),
         greatest(r.month, s.month)
  from latest r join latest s on r.offer = 'rent' and s.offer = 'sale'
$$;

/**
 * Short stay vs long lease for a city: what a typical short-stay listing earns
 * in a month (nightly rate × occupancy × 30) next to the median monthly rent.
 */
create or replace function public.stay_vs_lease(p_city text)
returns table (month date, adr_php numeric, occupancy numeric, short_stay_monthly numeric,
               lease_median numeric, active_listings int, source_url text)
language sql stable
set search_path = public
as $$
  select ss.month, ss.adr_php, ss.occupancy,
         round(ss.adr_php * ss.occupancy * 30),
         (select m.median from market_snapshot(p_city, 'rent', 'condo', 1) m),
         ss.active_listings, ss.source_url
  from short_stay_markets ss join cities c on c.id = ss.city_id
  where c.slug = p_city
  order by ss.month desc
  limit 1
$$;
