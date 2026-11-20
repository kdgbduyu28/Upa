-- Upa foundation: extensions, shared helpers, cities and profiles.
--
-- Extensions go in the `extensions` schema (Supabase's convention), so every
-- function below pins `search_path = public, extensions`.

create schema if not exists extensions;
create extension if not exists postgis    with schema extensions;  -- geography, ST_DWithin, KNN <->
create extension if not exists btree_gist with schema extensions;  -- "=" inside EXCLUDE ... USING gist
create extension if not exists pg_trgm    with schema extensions;  -- similarity(), % operator, trigram indexes
create extension if not exists unaccent   with schema extensions;  -- "Parañaque" matches "paranaque"

-- unaccent() is only STABLE (it reads a dictionary), so it can't sit in a
-- generated column or index. Naming the dictionary makes the result fixed,
-- which lets us promise IMMUTABLE.
create or replace function public.fold(t text) returns text
language sql immutable parallel safe
set search_path = public, extensions
as $$ select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))) $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Cities: the places both halves of the app are about.
-- ---------------------------------------------------------------------------
create table public.cities (
  id              smallint generated always as identity primary key,
  slug            text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name            text not null,
  province        text not null,
  region          text not null,
  is_metro_manila boolean not null default false,
  center          extensions.geography(Point, 4326) not null,
  -- Path segment on dotproperty.com.ph, e.g. 'metro-manila/makati'. Null = not crawled.
  dotproperty_path text unique,
  sort            smallint not null default 100
);

comment on table public.cities is 'Cities Upa covers: market stats are grouped by these, stays belong to one.';

alter table public.cities enable row level security;
create policy "cities are public" on public.cities for select using (true);

-- ---------------------------------------------------------------------------
-- Profiles: one per signed-up user, created by a trigger on auth.users.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Guest' check (length(display_name) between 1 and 60),
  avatar_url   text,
  is_host      boolean not null default false,
  bio          text check (length(bio) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
-- Names and avatars show on stays and reviews, so anyone may read them.
create policy "profiles are public" on public.profiles for select using (true);
create policy "edit own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
             split_part(coalesce(new.email, 'Guest'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
