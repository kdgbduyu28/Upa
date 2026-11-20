-- Sanitize counts and sizes during ingest so one bad listing can't fail a page.

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
    select r.source_id, r.url, r.offer, r.kind, r.area, r.building, r.title, r.price_php, r.furnishing,
           -- Out-of-range counts and sizes (typos like 41 bathrooms) become unknown
           -- instead of failing the whole page on the table's CHECK constraints.
           case when r.bedrooms between 0 and 20 then r.bedrooms end as bedrooms,
           case when r.bathrooms between 0 and 20 then r.bathrooms end as bathrooms,
           case when r.floor_sqm > 0 and r.floor_sqm < 100000 then r.floor_sqm end as floor_sqm,
           c.id as city_id
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
