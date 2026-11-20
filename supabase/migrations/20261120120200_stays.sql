-- Stays: places hosts list, their seasonal rates, bookings, reviews, favorites.
--
-- The rules that matter live in the database, not the app:
--   * two bookings (or a booking and a host's blocked dates) can't overlap
--     — an EXCLUDE constraint on daterange;
--   * seasonal rates for one stay can't overlap either;
--   * row-level security decides who sees which bookings and drafts;
--   * only a guest who completed a stay can review it.

create table public.stays (
  id              bigint generated always as identity primary key,
  host_id         uuid not null references public.profiles (id) on delete cascade,
  title           text not null check (length(title) between 5 and 90),
  description     text not null default '' check (length(description) <= 3000),
  kind            text not null check (kind in ('condo', 'house', 'apartment', 'townhouse', 'room', 'villa', 'cabin')),
  city_id         smallint not null references public.cities (id),
  area            text not null default '' check (length(area) <= 80),
  location        extensions.geography(Point, 4326) not null,
  bedrooms        smallint not null default 1 check (bedrooms between 0 and 20),
  bathrooms       smallint not null default 1 check (bathrooms between 0 and 20),
  max_guests      smallint not null default 2 check (max_guests between 1 and 30),
  floor_sqm       numeric(7, 1) check (floor_sqm > 0),
  nightly_php     numeric(10, 0) not null check (nightly_php between 300 and 200000),
  -- If set, stays of 28+ nights are charged pro rata from this instead of nightly.
  monthly_php     numeric(11, 0) check (monthly_php between 5000 and 3000000),
  cleaning_fee_php numeric(8, 0) not null default 0 check (cleaning_fee_php between 0 and 20000),
  min_nights      smallint not null default 1 check (min_nights between 1 and 90),
  instant_book    boolean not null default false,
  amenities       jsonb not null default '[]'::jsonb check (jsonb_typeof(amenities) = 'array'),
  photos          text[] not null default '{}' check (cardinality(photos) <= 20),
  art_seed        int not null default (floor(random() * 1000000))::int,
  published       boolean not null default false,
  rating_avg      numeric(3, 2),
  rating_count    int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Search document: title weighs most, then area, then description and amenities.
  -- Folded (lower-case, no accents) so "Paranaque" finds "Parañaque".
  search          tsvector generated always as (
                    setweight(to_tsvector('simple', public.fold(title)), 'A') ||
                    setweight(to_tsvector('simple', public.fold(area || ' ' || kind)), 'B') ||
                    setweight(to_tsvector('simple', public.fold(amenities::text)), 'C') ||
                    setweight(to_tsvector('simple', public.fold(description)), 'D')
                  ) stored
);

create index stays_location_idx on public.stays using gist (location);
create index stays_search_idx   on public.stays using gin (search);
create index stays_trgm_idx     on public.stays using gin ((public.fold(title || ' ' || area)) extensions.gin_trgm_ops);
create index stays_amenities_idx on public.stays using gin (amenities jsonb_path_ops);
create index stays_city_idx     on public.stays (city_id, nightly_php) where published;
create index stays_host_idx     on public.stays (host_id);

create trigger stays_touch before update on public.stays
  for each row execute function public.touch_updated_at();

alter table public.stays enable row level security;
create policy "published stays are public, drafts are the host's" on public.stays for select
  using (published or host_id = (select auth.uid()));
create policy "hosts add their own stays" on public.stays for insert
  with check (host_id = (select auth.uid()));
create policy "hosts edit their own stays" on public.stays for update
  using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
create policy "hosts remove their own stays" on public.stays for delete
  using (host_id = (select auth.uid()));
-- Ratings are kept by a trigger and the owner can't change hands, so hosts may
-- update every column except those. (A column REVOKE wouldn't undo Supabase's
-- table-wide grant; granting the allowed columns does.)
revoke update on public.stays from anon, authenticated;
grant update (title, description, kind, city_id, area, location, bedrooms, bathrooms, max_guests,
              floor_sqm, nightly_php, monthly_php, cleaning_fee_php, min_nights, instant_book,
              amenities, photos, art_seed, published)
  on public.stays to authenticated;

-- ---------------------------------------------------------------------------
-- Seasonal rates: "Holy Week ₱4,500/night". Overlapping rates are rejected.
-- ---------------------------------------------------------------------------
create table public.stay_rates (
  id          bigint generated always as identity primary key,
  stay_id     bigint not null references public.stays (id) on delete cascade,
  during      daterange not null check (not isempty(during) and upper(during) - lower(during) <= 366),
  nightly_php numeric(10, 0) not null check (nightly_php between 300 and 200000),
  label       text not null default '' check (length(label) <= 40),
  constraint stay_rates_no_overlap exclude using gist (stay_id with =, during with &&)
);

alter table public.stay_rates enable row level security;
create policy "rates of visible stays are public" on public.stay_rates for select
  using (exists (select 1 from public.stays s where s.id = stay_id));   -- stays' own policy applies
create policy "hosts manage their stays' rates" on public.stay_rates for all
  using (exists (select 1 from public.stays s where s.id = stay_id and s.host_id = (select auth.uid())))
  with check (exists (select 1 from public.stays s where s.id = stay_id and s.host_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Bookings. A host's blocked dates are rows here too (kind = 'blackout'), so
-- the same constraint stops a guest booking over them.
-- ---------------------------------------------------------------------------
create table public.bookings (
  id          bigint generated always as identity primary key,
  stay_id     bigint not null references public.stays (id) on delete cascade,
  guest_id    uuid not null references public.profiles (id) on delete cascade,
  kind        text not null default 'booking' check (kind in ('booking', 'blackout')),
  during      daterange not null check (not isempty(during) and upper(during) - lower(during) between 1 and 180),
  guests      smallint not null default 1 check (guests between 1 and 30),
  status      text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  total_php   numeric(12, 0) not null default 0 check (total_php >= 0),
  note        text not null default '' check (length(note) <= 500),
  created_at  timestamptz not null default now(),
  constraint bookings_no_overlap exclude using gist (stay_id with =, during with &&)
    where (status <> 'cancelled')
);

create index bookings_guest_idx on public.bookings (guest_id, created_at desc);

alter table public.bookings enable row level security;
-- Guests see their trips; hosts see everything booked or blocked on their stays.
-- All writes go through book_stay / set_booking_status / block_dates below.
create policy "guests see their bookings, hosts see bookings on their stays" on public.bookings for select
  using (
    guest_id = (select auth.uid())
    or stay_id in (select s.id from public.stays s where s.host_id = (select auth.uid()))
  );

-- Every status change, for the host dashboard's timeline.
create table public.booking_events (
  id          bigint generated always as identity primary key,
  booking_id  bigint not null references public.bookings (id) on delete cascade,
  at          timestamptz not null default now(),
  from_status text,
  to_status   text not null,
  actor       uuid
);

alter table public.booking_events enable row level security;
create policy "events follow their booking" on public.booking_events for select
  using (exists (select 1 from public.bookings b where b.id = booking_id));   -- bookings' policy applies

create or replace function public.log_booking_event() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into booking_events (booking_id, from_status, to_status, actor)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return new;
end $$;

create trigger bookings_log after insert or update of status on public.bookings
  for each row execute function public.log_booking_event();

-- ---------------------------------------------------------------------------
-- Reviews: one per completed booking, by that booking's guest.
-- ---------------------------------------------------------------------------
create table public.reviews (
  id          bigint generated always as identity primary key,
  booking_id  bigint not null unique references public.bookings (id) on delete cascade,
  stay_id     bigint not null references public.stays (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  body        text not null default '' check (length(body) <= 2000),
  created_at  timestamptz not null default now()
);

create index reviews_stay_idx on public.reviews (stay_id, created_at desc);

alter table public.reviews enable row level security;
create policy "reviews are public" on public.reviews for select using (true);
create policy "guests review stays they completed" on public.reviews for insert
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.stay_id = reviews.stay_id
        and b.guest_id = (select auth.uid()) and b.kind = 'booking' and b.status = 'completed'
    )
  );
create policy "authors edit their reviews" on public.reviews for update
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "authors delete their reviews" on public.reviews for delete
  using (author_id = (select auth.uid()));

create or replace function public.refresh_stay_rating() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare sid bigint := coalesce(new.stay_id, old.stay_id);
begin
  update stays s set
    rating_avg = r.avg, rating_count = r.n
  from (select round(avg(rating), 2) as avg, count(*)::int as n from reviews where stay_id = sid) r
  where s.id = sid;
  return null;
end $$;

create trigger reviews_rating after insert or update or delete on public.reviews
  for each row execute function public.refresh_stay_rating();

-- ---------------------------------------------------------------------------
-- Favorites.
-- ---------------------------------------------------------------------------
create table public.favorites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  stay_id    bigint not null references public.stays (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, stay_id)
);

alter table public.favorites enable row level security;
create policy "own favorites" on public.favorites for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
