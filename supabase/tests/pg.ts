/// <reference types="node" />
// An in-memory Postgres (PGlite + PostGIS) with a stand-in for Supabase's auth
// schema and every migration applied. No Docker needed.
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { postgis } from '@electric-sql/pglite-postgis';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '..', 'migrations');

// What a Supabase database has before any migration runs, as far as these
// migrations care: the API roles, auth.users, and auth.uid() reading the JWT.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  create schema extensions;
  grant usage on schema extensions to anon, authenticated;
  -- Supabase's default: new tables and functions in public are granted to the API roles.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  set search_path = public, extensions;
`;

let cached: string[] | null = null;
function migrations(): string[] {
  cached ??= readdirSync(DIR)
    .filter((f: string) => f.endsWith('.sql'))
    .sort()
    .map((f: string) => readFileSync(join(DIR, f), 'utf8'));
  return cached;
}

export type User = { id: string; name: string };

/** A fresh database with every migration applied and these users signed up. */
export async function createDb(users: User[] = []): Promise<PGlite> {
  const db = new PGlite({ extensions: { postgis, btree_gist, pg_trgm, unaccent } });
  await db.exec(SUPABASE_STUB);
  for (const sql of migrations()) await db.exec(sql);
  for (const u of users) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
      u.id,
      `${u.name.toLowerCase()}@upa.test`,
      JSON.stringify({ display_name: u.name }),
    ]);
  }
  return db;
}

/** Runs `sql` as a signed-in user (or anonymous with null), like a PostgREST request. */
export async function asUser<T = Record<string, unknown>>(
  db: PGlite,
  user: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ?? '']);
    await tx.exec(`set local role ${user ? 'authenticated' : 'anon'}`);
    return (await tx.query<T>(sql, params)).rows;
  });
}

/** The error message a statement fails with, or null if it succeeds. */
export async function failure(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Inserts a published stay as the owner and returns its id. */
export async function addStay(
  db: PGlite,
  host: string,
  o: Partial<{
    title: string; city: string; area: string; kind: string; lat: number; lng: number;
    nightly: number; monthly: number | null; minNights: number; maxGuests: number; bedrooms: number;
    amenities: string[]; published: boolean; instant: boolean; cleaning: number;
  }> = {},
): Promise<number> {
  const r = await db.query<{ id: number }>(
    `insert into stays (host_id, title, kind, city_id, area, location, bedrooms, max_guests, nightly_php,
       monthly_php, min_nights, amenities, published, instant_book, cleaning_fee_php)
     select $1, $2, $3, c.id, $5, st_setsrid(st_makepoint($7, $6), 4326)::geography, $8, $9, $10, $11, $12,
            $13::jsonb, $14, $15, $16
     from cities c where c.slug = $4
     returning id`,
    [
      host, o.title ?? 'Bright 1BR condo near the park', o.kind ?? 'condo', o.city ?? 'makati',
      o.area ?? 'Salcedo Village', o.lat ?? 14.5547, o.lng ?? 121.0244, o.bedrooms ?? 1, o.maxGuests ?? 4,
      o.nightly ?? 3000, o.monthly ?? null, o.minNights ?? 1, JSON.stringify(o.amenities ?? ['wifi']),
      o.published ?? true, o.instant ?? false, o.cleaning ?? 0,
    ],
  );
  return Number(r.rows[0].id);
}
