// Typed wrappers around the database's RPC functions and tables.
import { db } from './supabase';

export type Offer = 'rent' | 'sale';
export type MarketKind = 'condo' | 'house' | 'apartment' | 'townhouse';
export type StayKind = 'condo' | 'house' | 'apartment' | 'townhouse' | 'room' | 'villa' | 'cabin';

export type City = {
  slug: string; name: string; province: string; region: string; is_metro_manila: boolean;
  lat: number; lng: number; has_market: boolean;
};

export type MarketCity = {
  slug: string; name: string; province: string; is_metro_manila: boolean;
  rent_listings: number; sale_listings: number;
};

export type Snapshot = {
  month: string; n: number; p25: number; median: number; p75: number;
  median_per_sqm: number | null; avg_sqm: number | null;
  prev_median: number | null; change_pct: number | null;
  last_scraped: string | null; source_url: string;
};

export type TrendPoint = {
  month: string; n: number; p25: number; median: number; p75: number;
  median_per_sqm: number | null; change_pct: number | null; moving_avg_3: number | null;
};

export type CompareRow = {
  city_slug: string; city_name: string; n: number; median: number;
  median_per_sqm: number | null; rank: number; vs_average_pct: number;
};

export type RentCheck = {
  comparables: number; percentile: number | null; p25: number | null; median: number | null; p75: number | null;
  median_per_sqm: number | null; your_per_sqm: number | null; widened: boolean; verdict: string;
};

export type Yield = { rent_per_sqm: number; sale_per_sqm: number; yield_pct: number; month: string };

export type StayVsLease = {
  month: string; adr_php: number; occupancy: number; short_stay_monthly: number;
  lease_median: number | null; active_listings: number | null; source_url: string;
};

export type StayHit = {
  id: number; title: string; kind: StayKind; city_slug: string; city_name: string; area: string;
  nightly_php: number; bedrooms: number; max_guests: number; rating_avg: number | null; rating_count: number;
  art_seed: number; photo: string | null; instant_book: boolean; lat: number; lng: number;
  distance_m: number | null; score: number; total: number;
};

export type Stay = {
  id: number; host_id: string; title: string; description: string; kind: StayKind; city_id: number;
  area: string; bedrooms: number; bathrooms: number; max_guests: number; floor_sqm: number | null;
  nightly_php: number; monthly_php: number | null; cleaning_fee_php: number; min_nights: number;
  instant_book: boolean; amenities: string[]; photos: string[]; art_seed: number; published: boolean;
  rating_avg: number | null; rating_count: number; lat: number; lng: number;
  city: { slug: string; name: string }; host: { id: string; display_name: string; bio: string | null; avatar_url: string | null; created_at: string };
};

export type Quote = {
  stay_id: number; check_in: string; check_out: string; nights: number;
  per_night: { night: string; price: number; label: string }[];
  monthly_rate_applied: boolean; subtotal: number; cleaning_fee: number; service_fee: number; total: number;
  min_nights: number; meets_min_nights: boolean; available: boolean;
};

export type CalendarDay = { day: string; status: 'free' | 'booked' | 'blocked' | 'past'; nightly_php: number; label: string };

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type Booking = {
  id: number; stay_id: number; guest_id: string; kind: 'booking' | 'blackout'; during: string;
  guests: number; status: BookingStatus; total_php: number; note: string; created_at: string;
};
export type BookingWithStay = Booking & {
  stay: { id: number; title: string; kind: StayKind; art_seed: number; photos: string[]; city: { name: string } };
  guest?: { display_name: string } | null;
  // One-to-one (reviews.booking_id is unique), so PostgREST embeds an object.
  review?: { id: number; rating: number } | null;
};

export type Review = { id: number; rating: number; body: string; created_at: string; author: { display_name: string } };

export type Rate = { id: number; stay_id: number; during: string; nightly_php: number; label: string };

// ---------------------------------------------------------------------------

/** Postgres "[2026-12-01,2026-12-04)" → ["2026-12-01", "2026-12-04"] (inclusive start, exclusive end). */
export function parseRange(r: string): [string, string] {
  const m = r.match(/^[[(]([^,]*),([^)\]]*)[)\]]$/);
  if (!m) return [r, r];
  return [m[1], m[2]];
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new ApiError(error.message, error.hint ?? null, error.code ?? null);
  return data as T;
}

export class ApiError extends Error {
  constructor(message: string, public hint: string | null, public code: string | null) {
    super(message);
  }
}

const one = <T>(rows: T[] | null): T | null => (rows && rows.length ? rows[0] : null);

// --- cities ------------------------------------------------------------------

let citiesCache: Promise<City[]> | null = null;
export function cities(): Promise<City[]> {
  citiesCache ??= (async () => {
    const { data, error } = await db()
      .from('cities')
      .select('slug, name, province, region, is_metro_manila, center, dotproperty_path, sort')
      .order('sort');
    if (error) {
      citiesCache = null;
      throw new ApiError(error.message, null, error.code);
    }
    return (data ?? []).map((c: Record<string, unknown>) => {
      const [lng, lat] = pointOf(c.center);
      return {
        slug: c.slug as string, name: c.name as string, province: c.province as string, region: c.region as string,
        is_metro_manila: c.is_metro_manila as boolean, lat, lng, has_market: c.dotproperty_path != null,
      };
    });
  })();
  return citiesCache;
}

/**
 * PostgREST returns geography as GeoJSON ({type:"Point",coordinates:[lng,lat]})
 * or as hex EWKB depending on settings; handle both.
 */
export function pointOf(v: unknown): [number, number] {
  if (v && typeof v === 'object' && 'coordinates' in (v as object)) {
    const [lng, lat] = (v as { coordinates: number[] }).coordinates;
    return [lng, lat];
  }
  if (typeof v === 'string' && /^[0-9A-Fa-f]+$/.test(v) && v.length >= 42) {
    // Little-endian EWKB point with SRID: 01 01000020 E6100000 <x:8> <y:8>
    const hex = v.length === 50 ? v.slice(18) : v.slice(10);
    const read = (h: string) => {
      const bytes = new Uint8Array(8);
      for (let i = 0; i < 8; i++) bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
      return new DataView(bytes.buffer).getFloat64(0, true);
    };
    return [read(hex.slice(0, 16)), read(hex.slice(16, 32))];
  }
  return [121.0244, 14.5547];
}

// --- market ------------------------------------------------------------------

export const marketCities = () => rpc<MarketCity[]>('market_cities');

export const marketSnapshot = async (city: string, offer: Offer, kind: MarketKind, beds: number) =>
  one(await rpc<Snapshot[]>('market_snapshot', { p_city: city, p_offer: offer, p_kind: kind, p_beds: beds }));

export const marketTrend = (city: string, offer: Offer, kind: MarketKind, beds: number, months = 12) =>
  rpc<TrendPoint[]>('market_trend', { p_city: city, p_offer: offer, p_kind: kind, p_beds: beds, p_months: months });

export const marketCompare = (offer: Offer, kind: MarketKind, beds: number) =>
  rpc<CompareRow[]>('market_compare', { p_offer: offer, p_kind: kind, p_beds: beds });

export const rentCheck = async (city: string, kind: MarketKind, beds: number, sqm: number | null, price: number) =>
  one(await rpc<RentCheck[]>('rent_check', { p_city: city, p_kind: kind, p_beds: beds, p_sqm: sqm, p_price: price }));

export type AreaRow = { area: string; n: number; median: number; median_per_sqm: number | null; vs_city_pct: number | null };

export const marketAreas = (city: string, offer: Offer, kind: MarketKind, beds: number) =>
  rpc<AreaRow[]>('market_areas', { p_city: city, p_offer: offer, p_kind: kind, p_beds: beds });

export const grossYield = async (city: string, kind: MarketKind, beds: number) =>
  one(await rpc<Yield[]>('gross_yield', { p_city: city, p_kind: kind, p_beds: beds }));

export const stayVsLease = async (city: string) => one(await rpc<StayVsLease[]>('stay_vs_lease', { p_city: city }));

export async function lastScrape(): Promise<{ finished_at: string; status: string; seen: number } | null> {
  const { data } = await db()
    .from('scrape_runs')
    .select('finished_at, status, seen')
    .in('status', ['ok', 'partial'])
    .order('finished_at', { ascending: false })
    .limit(1);
  return one(data as { finished_at: string; status: string; seen: number }[] | null);
}

export async function priceIndex(): Promise<{ quarter: string; segment: string; area: string; value: number; yoy: number | null }[]> {
  const { data, error } = await db().from('price_index').select('quarter, segment, area, value, yoy').order('quarter');
  if (error) throw new ApiError(error.message, null, error.code);
  return data ?? [];
}

// --- stays -------------------------------------------------------------------

export type SearchParams = {
  q?: string; city?: string; lat?: number; lng?: number; radiusKm?: number;
  bounds?: { west: number; south: number; east: number; north: number };
  checkIn?: string; checkOut?: string; guests?: number;
  minPrice?: number; maxPrice?: number; minBedrooms?: number;
  amenities?: string[]; kinds?: StayKind[];
  sort?: 'best' | 'price' | 'price_desc' | 'distance' | 'rating';
  limit?: number; offset?: number;
};

export function searchStays(p: SearchParams) {
  return rpc<StayHit[]>('search_stays', {
    p_q: p.q || null,
    p_city: p.city || null,
    p_lat: p.lat ?? null,
    p_lng: p.lng ?? null,
    p_radius_km: p.radiusKm ?? 10,
    p_west: p.bounds?.west ?? null,
    p_south: p.bounds?.south ?? null,
    p_east: p.bounds?.east ?? null,
    p_north: p.bounds?.north ?? null,
    p_check_in: p.checkIn || null,
    p_check_out: p.checkOut || null,
    p_guests: p.guests ?? 1,
    p_min_price: p.minPrice ?? null,
    p_max_price: p.maxPrice ?? null,
    p_min_bedrooms: p.minBedrooms ?? 0,
    p_amenities: p.amenities ?? [],
    p_kinds: p.kinds?.length ? p.kinds : null,
    p_sort: p.sort ?? 'best',
    p_limit: p.limit ?? 24,
    p_offset: p.offset ?? 0,
  });
}

const STAY_SELECT = `id, host_id, title, description, kind, city_id, area, bedrooms, bathrooms, max_guests, floor_sqm,
  nightly_php, monthly_php, cleaning_fee_php, min_nights, instant_book, amenities, photos, art_seed, published,
  rating_avg, rating_count, location,
  city:cities(slug, name), host:profiles!stays_host_id_fkey(id, display_name, bio, avatar_url, created_at)`;

function toStay(r: Record<string, unknown>): Stay {
  const [lng, lat] = pointOf(r.location);
  const { location: _location, ...rest } = r;
  return { ...(rest as unknown as Stay), lat, lng };
}

export async function getStay(id: number): Promise<Stay | null> {
  const { data, error } = await db().from('stays').select(STAY_SELECT).eq('id', id).maybeSingle();
  if (error) throw new ApiError(error.message, null, error.code);
  return data ? toStay(data) : null;
}

export async function myStays(hostId: string): Promise<Stay[]> {
  const { data, error } = await db().from('stays').select(STAY_SELECT).eq('host_id', hostId).order('created_at', { ascending: false });
  if (error) throw new ApiError(error.message, null, error.code);
  return (data ?? []).map(toStay);
}

export async function stayReviews(stayId: number, limit = 20): Promise<Review[]> {
  const { data, error } = await db()
    .from('reviews')
    .select('id, rating, body, created_at, author:profiles!reviews_author_id_fkey(display_name)')
    .eq('stay_id', stayId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new ApiError(error.message, null, error.code);
  return (data ?? []) as unknown as Review[];
}

export async function stayRates(stayId: number): Promise<Rate[]> {
  const { data, error } = await db().from('stay_rates').select('*').eq('stay_id', stayId).order('during');
  if (error) throw new ApiError(error.message, null, error.code);
  return data ?? [];
}

export const quoteStay = (stay: number, checkIn: string, checkOut: string) =>
  rpc<Quote>('quote_stay', { p_stay: stay, p_check_in: checkIn, p_check_out: checkOut });

export const stayCalendar = (stay: number, from: string, to: string) =>
  rpc<CalendarDay[]>('stay_calendar', { p_stay: stay, p_from: from, p_to: to });

export const bookStay = (stay: number, checkIn: string, checkOut: string, guests: number, note: string) =>
  rpc<Booking>('book_stay', { p_stay: stay, p_check_in: checkIn, p_check_out: checkOut, p_guests: guests, p_note: note });

export const setBookingStatus = (id: number, status: BookingStatus) =>
  rpc<Booking>('set_booking_status', { p_booking: id, p_status: status });

export const blockDates = (stay: number, from: string, to: string, note = '') =>
  rpc<Booking>('block_dates', { p_stay: stay, p_from: from, p_to: to, p_note: note });

const BOOKING_SELECT = `*, stay:stays!bookings_stay_id_fkey(id, title, kind, art_seed, photos, city:cities(name)),
  guest:profiles!bookings_guest_id_fkey(display_name), review:reviews!reviews_booking_id_fkey(id, rating)`;

/** Bookings the signed-in user can see: their trips, plus bookings on stays they host. */
export async function myBookings(): Promise<BookingWithStay[]> {
  const { data, error } = await db().from('bookings').select(BOOKING_SELECT).order('during', { ascending: true }).limit(500);
  if (error) throw new ApiError(error.message, null, error.code);
  return (data ?? []) as unknown as BookingWithStay[];
}

export async function getBooking(id: number): Promise<BookingWithStay | null> {
  const { data, error } = await db().from('bookings').select(BOOKING_SELECT).eq('id', id).maybeSingle();
  if (error) throw new ApiError(error.message, null, error.code);
  return data as unknown as BookingWithStay | null;
}

export async function addReview(bookingId: number, stayId: number, authorId: string, rating: number, body: string) {
  const { error } = await db().from('reviews').insert({ booking_id: bookingId, stay_id: stayId, author_id: authorId, rating, body });
  if (error) throw new ApiError(error.message, null, error.code);
}

export type StayDraft = Omit<Stay, 'id' | 'host_id' | 'city_id' | 'rating_avg' | 'rating_count' | 'city' | 'host'> & { city_slug: string };

export async function saveStay(hostId: string, id: number | null, d: StayDraft): Promise<number> {
  const { data: cityRow, error: cityErr } = await db().from('cities').select('id').eq('slug', d.city_slug).single();
  if (cityErr) throw new ApiError(cityErr.message, null, cityErr.code);
  const row = {
    title: d.title, description: d.description, kind: d.kind, city_id: cityRow.id, area: d.area,
    // PostgREST accepts EWKT for geography columns.
    location: `SRID=4326;POINT(${d.lng} ${d.lat})`,
    bedrooms: d.bedrooms, bathrooms: d.bathrooms, max_guests: d.max_guests, floor_sqm: d.floor_sqm,
    nightly_php: d.nightly_php, monthly_php: d.monthly_php, cleaning_fee_php: d.cleaning_fee_php,
    min_nights: d.min_nights, instant_book: d.instant_book, amenities: d.amenities, photos: d.photos,
    art_seed: d.art_seed, published: d.published,
  };
  if (id == null) {
    const { data, error } = await db().from('stays').insert({ ...row, host_id: hostId }).select('id').single();
    if (error) throw new ApiError(error.message, null, error.code);
    return data.id as number;
  }
  const { error } = await db().from('stays').update(row).eq('id', id);
  if (error) throw new ApiError(error.message, null, error.code);
  return id;
}

export async function deleteStay(id: number) {
  const { error } = await db().from('stays').delete().eq('id', id);
  if (error) throw new ApiError(error.message, null, error.code);
}

export async function addRate(stayId: number, from: string, to: string, nightly: number, label: string) {
  const { error } = await db().from('stay_rates').insert({ stay_id: stayId, during: `[${from},${to})`, nightly_php: nightly, label });
  if (error) {
    if (error.code === '23P01') throw new ApiError('That overlaps another seasonal rate', 'rates_overlap', error.code);
    throw new ApiError(error.message, null, error.code);
  }
}

export async function deleteRate(id: number) {
  const { error } = await db().from('stay_rates').delete().eq('id', id);
  if (error) throw new ApiError(error.message, null, error.code);
}

export async function favorites(): Promise<number[]> {
  const { data, error } = await db().from('favorites').select('stay_id');
  if (error) throw new ApiError(error.message, null, error.code);
  return (data ?? []).map((r: { stay_id: number }) => r.stay_id);
}

export async function setFavorite(userId: string, stayId: number, on: boolean) {
  const q = on
    ? db().from('favorites').upsert({ user_id: userId, stay_id: stayId })
    : db().from('favorites').delete().eq('user_id', userId).eq('stay_id', stayId);
  const { error } = await q;
  if (error) throw new ApiError(error.message, null, error.code);
}

export async function updateProfile(id: string, patch: { display_name?: string; bio?: string; is_host?: boolean }) {
  const { error } = await db().from('profiles').update(patch).eq('id', id);
  if (error) throw new ApiError(error.message, null, error.code);
}

/** Uploads a photo to the stay-photos bucket and returns its public URL. */
export async function uploadPhoto(userId: string, file: { uri: string; mimeType?: string | null }): Promise<string> {
  const res = await fetch(file.uri);
  const blob = await res.blob();
  const ext = (file.mimeType ?? blob.type ?? 'image/jpeg').split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await db().storage.from('stay-photos').upload(path, blob, { contentType: file.mimeType ?? blob.type, upsert: false });
  if (error) throw new ApiError(error.message, null, null);
  return db().storage.from('stay-photos').getPublicUrl(path).data.publicUrl;
}
