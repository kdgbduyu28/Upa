-- Neighbourhood medians inside a city ("Salcedo Village", "Bel-Air", "Rockwell"),
-- from listings active now. Areas with fewer than p_min_n listings are left out
-- so a single listing never stands in for a whole neighbourhood.
create or replace function public.market_areas(
  p_city text, p_offer text default 'rent', p_kind text default 'condo', p_beds int default -1, p_min_n int default 5
)
returns table (area text, n int, median numeric, median_per_sqm numeric, vs_city_pct numeric)
language sql stable security definer
set search_path = public
as $$
  with pool as (
    select l.area, l.price_php, l.floor_sqm
    from market_listings l join cities c on c.id = l.city_id
    where c.slug = p_city and l.offer = p_offer and l.kind = p_kind
      and l.active and l.dupe_of is null and nullif(trim(l.area), '') is not null
      and (p_beds < 0 or least(l.bedrooms, 3) = least(p_beds, 3))
  ), city as (
    select percentile_cont(0.5) within group (order by price_php) as med from pool
  )
  select p.area, count(*)::int,
         round(percentile_cont(0.5) within group (order by p.price_php)),
         round(percentile_cont(0.5) within group (order by p.price_php / p.floor_sqm) filter (where p.floor_sqm >= 8)),
         round((100.0 * (percentile_cont(0.5) within group (order by p.price_php) / nullif((select med from city), 0) - 1))::numeric, 1)
  from pool p
  group by p.area
  having count(*) >= greatest(p_min_n, 3)
  order by 3 desc
$$;
