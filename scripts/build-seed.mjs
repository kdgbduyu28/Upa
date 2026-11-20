#!/usr/bin/env node
// Writes supabase/seed.sql: demo hosts and guests, ~150 stays across 18 cities,
// seasonal rates, bookings (past, upcoming, pending, host blocks) and reviews.
//
//   node scripts/build-seed.mjs
//
// Deterministic (seeded PRNG), so the file only changes when this script does.
// Dates in the SQL are relative to current_date, so the seed stays valid
// whenever it is applied. Every person and place name here is made up.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- deterministic randomness -------------------------------------------------
let state = 20261120;
function rand() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (a) => a[Math.floor(rand() * a.length)];
const between = (lo, hi) => lo + rand() * (hi - lo);
const int = (lo, hi) => Math.floor(between(lo, hi + 1));
const chance = (p) => rand() < p;
const round = (n, step) => Math.round(n / step) * step;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// --- people -------------------------------------------------------------------
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const HOSTS = [
  ['Liza Mercado', 'Makati and BGC condos, managed by me and my sister. Fast replies!'],
  ['Ramon Dizon', 'Retired engineer. I keep three family houses up north tidy for guests.'],
  ['Bea Santos', 'Architect. Every unit I host is one I designed the interior for.'],
  ['Paolo Reyes', 'Surfer and host in Siargao. Ask me about the best breaks.'],
  ['Carmela Uy', 'Cebu-based. Business travellers welcome: fast Wi-Fi, desk, quiet.'],
  ['Joaquin Villanueva', 'Beach villas in Boracay and El Nido. Island hopping tips included.'],
  ['Tess Bautista', 'Baguio and Tagaytay cabins. Fireplace season is the best season.'],
  ['Migs Fernandez', 'Davao, CDO and Iloilo apartments for long stays.'],
];
const GUESTS = [
  'Andrea Lim', 'Carlo Navarro', 'Dana Ocampo', 'Enzo Garcia', 'Faye Castillo', 'Gino Ramos',
  'Hannah Tan', 'Ivan Aquino', 'Janine Cruz', 'Kevin Mendoza', 'Lara Pascual', 'Marco Torres',
];
// The two accounts behind the "Try as host / Try as guest" buttons.
const DEMO_HOST = { id: uuid(1), email: 'host@upa.test', name: 'Demo Host' };
const DEMO_GUEST = { id: uuid(2), email: 'guest@upa.test', name: 'Demo Guest' };
// Public on purpose: the demo buttons sign in with it. Change it here and in
// src/lib/demo.ts together.
const DEMO_PASSWORD = 'upa-demo-2026';

const people = [
  { ...DEMO_HOST, host: true, bio: 'The demo host account. Try confirming a booking request.' },
  { ...DEMO_GUEST, host: false, bio: '' },
  ...HOSTS.map(([name, bio], i) => ({ id: uuid(10 + i), email: `host${i + 1}@upa.test`, name, host: true, bio })),
  ...GUESTS.map((name, i) => ({ id: uuid(100 + i), email: `guest${i + 1}@upa.test`, name, host: false, bio: '' })),
];
const hostIds = people.filter((p) => p.host).map((p) => p.id);
const guestIds = people.filter((p) => !p.host).map((p) => p.id);

// --- places -------------------------------------------------------------------
// [slug, lat, lng, count, tier, style, areas]
// tier scales prices; style picks kinds and amenities.
const CITIES = [
  ['makati', 14.5547, 121.0244, 14, 1.25, 'metro', ['Salcedo Village', 'Legazpi Village', 'Poblacion', 'Rockwell', 'San Antonio', 'Bel-Air']],
  ['taguig', 14.5409, 121.0503, 14, 1.3, 'metro', ['BGC High Street', 'Uptown BGC', 'McKinley Hill', 'Forbes Town', 'Arca South']],
  ['pasig', 14.5869, 121.0614, 10, 1.0, 'metro', ['Ortigas Center', 'Kapitolyo', 'Capitol Commons', 'San Antonio']],
  ['quezon-city', 14.676, 121.0437, 10, 0.85, 'metro', ['Cubao', 'Katipunan', 'Tomas Morato', 'Eastwood', 'Diliman', 'Scout Area']],
  ['mandaluyong', 14.5794, 121.0359, 6, 0.95, 'metro', ['Shaw Boulevard', 'Greenfield District', 'Boni']],
  ['manila', 14.5995, 120.9842, 8, 0.8, 'metro', ['Malate', 'Ermita', 'Binondo', 'Intramuros', 'Sampaloc']],
  ['pasay', 14.5378, 121.0014, 6, 1.0, 'metro', ['Mall of Asia Complex', 'Newport', 'Roxas Boulevard']],
  ['paranaque', 14.4793, 121.0198, 4, 0.9, 'metro', ['BF Homes', 'Aseana City', 'Entertainment City']],
  ['cebu-city', 10.3157, 123.8854, 10, 0.85, 'metro', ['IT Park', 'Cebu Business Park', 'Lahug', 'Banilad']],
  ['lapu-lapu', 10.3103, 123.9494, 8, 1.1, 'beach', ['Mactan Newtown', 'Punta Engaño', 'Maribago']],
  ['davao-city', 7.1907, 125.4553, 6, 0.75, 'metro', ['Lanang', 'Poblacion', 'Matina', 'Bajada']],
  ['cagayan-de-oro', 8.4542, 124.6319, 4, 0.7, 'metro', ['Uptown', 'Limketkai', 'Carmen']],
  ['iloilo-city', 10.7202, 122.5621, 4, 0.75, 'metro', ['Iloilo Business Park', 'Smallville', 'Jaro']],
  ['baguio', 16.4023, 120.596, 10, 0.9, 'highland', ['Session Road', 'Camp John Hay', 'Teachers Camp', 'Legarda']],
  ['tagaytay', 14.1153, 120.9621, 8, 1.0, 'highland', ['Crosswinds', 'Ridgeview', 'Sungay', 'Maharlika']],
  ['boracay', 11.9674, 121.9248, 10, 1.5, 'beach', ['Station 1', 'Station 2', 'Station 3', 'Bulabog', 'Diniwid']],
  ['siargao', 9.7868, 126.1597, 8, 1.1, 'beach', ['Cloud 9', 'Tourism Road', 'Malinao', 'Catangnan']],
  ['el-nido', 11.1956, 119.4075, 8, 1.2, 'beach', ['Corong-Corong', 'Las Cabañas', 'Caalan', 'Town Proper']],
];

const KINDS = {
  metro: [['condo', 6], ['apartment', 2], ['room', 2], ['townhouse', 1]],
  highland: [['cabin', 3], ['house', 3], ['condo', 2], ['room', 1]],
  beach: [['villa', 3], ['house', 2], ['cabin', 2], ['room', 2], ['condo', 1]],
};
const BASE = { room: 1300, condo: 2600, apartment: 2200, townhouse: 4200, house: 4800, cabin: 3600, villa: 8500 };
const BED_STEP = { room: 0, condo: 1300, apartment: 1000, townhouse: 1200, house: 1300, cabin: 1100, villa: 2500 };

const AMENITIES = {
  metro: ['wifi', 'aircon', 'kitchen', 'washer', 'pool', 'gym', 'parking', 'workspace', 'balcony', '24h-security', 'elevator', 'netflix', 'backup-power', 'near-train'],
  highland: ['wifi', 'kitchen', 'parking', 'hot-shower', 'fireplace', 'mountain-view', 'garden', 'pet-friendly', 'workspace', 'netflix', 'bbq'],
  beach: ['wifi', 'aircon', 'kitchen', 'beach-access', 'pool', 'hot-shower', 'garden', 'bbq', 'pet-friendly', 'backup-power', 'surfboard-rack', 'balcony'],
};
const ALWAYS = { metro: ['wifi', 'aircon'], highland: ['wifi', 'hot-shower'], beach: ['wifi'] };

const KIND_WORD = { room: 'room', condo: 'condo', apartment: 'apartment', townhouse: 'townhouse', house: 'house', cabin: 'cabin', villa: 'villa' };
const ADJ = {
  metro: ['Bright', 'Cozy', 'Modern', 'Quiet', 'Sunny', 'Minimalist', 'Stylish', 'High-floor', 'Corner', 'Airy'],
  highland: ['Pine-view', 'Cozy', 'Rustic', 'Foggy-morning', 'Garden', 'Hillside', 'Warm', 'Family'],
  beach: ['Seaside', 'Breezy', 'Sunset', 'Tropical', 'Barefoot', 'Island', 'Palm-shaded', 'Laid-back'],
};
const HOOK = {
  metro: ['walk to the malls', 'near the train', 'skyline view', 'with a work desk', 'great for long stays', 'by the park', 'with pool access'],
  highland: ['with fireplace', 'mountain view', 'near the market', 'with a garden', 'fog-kissed mornings', 'with a big kitchen'],
  beach: ['steps from the sand', 'with private pool', 'near the surf break', 'sunset view', 'island-hopping base', 'with a hammock'],
};
const DESC = {
  metro: [
    'Fully furnished unit with fast fiber internet and a proper desk, a short walk from cafés, groceries and the mall.',
    'High-floor unit with blackout curtains, a full kitchen and a washer. Building has 24-hour security and a lap pool.',
    'Comfortable place for work trips or a weekend in the city. Grab and jeepneys stop right outside.',
    'Self check-in with a lockbox. Quiet building, strong water pressure, backup power for the essentials.',
  ],
  highland: [
    'Bring a jacket: nights get cold and the fireplace is part of the fun. Coffee from the local farm is on us.',
    'Wood-and-stone house among the pines with a big dining table for family dinners and a garden for morning coffee.',
    'Ten minutes from the town center but quiet enough to hear the wind in the trees.',
  ],
  beach: [
    'Wake up to the sound of the waves. Outdoor shower, hammocks and a shaded veranda for long lazy afternoons.',
    'Native-style villa with modern comforts: hot shower, fast Wi-Fi, solar backup and a kitchen for fresh seafood.',
    'Perfect base for island hopping and surfing. We can arrange boats, scooters and airport transfers.',
  ],
};
const REVIEW = {
  5: ['Spotless and exactly like the photos. Would book again!', 'Super bait ng host, ang bilis mag-reply. Highly recommended!', 'Perfect location, quiet at night, fast Wi-Fi. 10/10.', 'Best stay of our trip. The little details made it feel like home.'],
  4: ['Great place overall. Water pressure was a bit weak but the host fixed it quickly.', 'Comfortable and clean. Check-in instructions could be clearer.', 'Sulit for the price. A bit noisy on weekends but we expected that.'],
  3: ['Okay for a short stay. The aircon in the bedroom struggled in the afternoon.', 'Location is great, the unit needs some updating.'],
};

// --- build stays --------------------------------------------------------------
function weighted(list) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of list) if ((r -= w) < 0) return v;
  return list[0][0];
}

const stays = [];
let stayId = 0;
for (const [slug, lat, lng, count, tier, style, areas] of CITIES) {
  for (let i = 0; i < count; i++) {
    stayId++;
    const kind = weighted(KINDS[style]);
    const bedrooms = kind === 'room' ? 1 : kind === 'condo' || kind === 'apartment' ? pick([0, 1, 1, 1, 2, 2, 3]) : pick([1, 2, 2, 3, 3, 4]);
    const bathrooms = Math.max(1, Math.min(bedrooms, int(1, 3)));
    const maxGuests = kind === 'room' ? pick([1, 2, 2]) : Math.max(2, bedrooms * 2 + int(0, 2));
    const sqm = kind === 'room' ? int(12, 22) : bedrooms === 0 ? int(22, 32) : round(bedrooms * between(28, 48) + between(10, 40), 1);
    const nightly = round((BASE[kind] + BED_STEP[kind] * Math.max(bedrooms - 1, 0)) * tier * between(0.8, 1.25), 50);
    const monthly = style === 'metro' && kind !== 'room' && chance(0.6) ? round(nightly * 30 * between(0.4, 0.5), 500) : null;
    const area = pick(areas);
    const beds = bedrooms === 0 ? 'studio' : `${bedrooms}BR`;
    const title = kind === 'room'
      ? `${pick(ADJ[style])} private room in ${area}`
      : `${pick(ADJ[style])} ${beds} ${KIND_WORD[kind]} ${pick(HOOK[style])}`;
    const amen = new Set(ALWAYS[style]);
    for (const a of AMENITIES[style]) if (chance(0.38)) amen.add(a);
    if (kind === 'room') amen.delete('pool');
    const spread = style === 'metro' ? 0.018 : 0.012;
    stays.push({
      id: stayId,
      // hostIds: [demo, Liza, Ramon, Bea, Paolo, Carmela, Joaquin, Tess, Migs]
      host: style === 'metro' ? pick([hostIds[1], hostIds[3], hostIds[5], hostIds[8]]) :
        style === 'highland' ? pick([hostIds[2], hostIds[7]]) :
          pick([hostIds[4], hostIds[6]]),
      title: title.slice(0, 90),
      description: `${pick(DESC[style])} ${pick(DESC[style])}`.trim(),
      kind, slug, area,
      lat: lat + between(-spread, spread), lng: lng + between(-spread, spread),
      bedrooms, bathrooms, maxGuests, sqm, nightly, monthly,
      cleaning: round(nightly * between(0.1, 0.25), 50),
      minNights: monthly ? pick([1, 2, 3]) : style === 'beach' ? pick([1, 2, 2, 3]) : pick([1, 1, 2]),
      instant: chance(0.45),
      amenities: [...amen],
      art: int(1, 999999),
      style,
    });
  }
}
// The demo host owns a handful of stays in different cities, so its dashboard has variety.
for (const id of [1, 16, 30, 95, 125, 140]) {
  const s = stays.find((x) => x.id === id);
  if (s) s.host = DEMO_HOST.id;
}

// --- rates ----------------------------------------------------------------------
// Peak seasons in fixed dates (seasonal pricing is calendar-based).
const SEASONS = {
  beach: [['2026-12-20', '2027-01-04', 1.4, 'Holidays'], ['2027-03-21', '2027-03-29', 1.5, 'Holy Week'], ['2027-04-01', '2027-06-01', 1.2, 'Summer']],
  highland: [['2026-12-20', '2027-01-04', 1.35, 'Holidays'], ['2027-02-20', '2027-03-02', 1.4, 'Panagbenga'], ['2027-03-21', '2027-03-29', 1.5, 'Holy Week']],
  metro: [['2026-12-22', '2027-01-02', 1.2, 'Holidays']],
};
const rates = [];
for (const s of stays) {
  if (s.style === 'metro' && !chance(0.3)) continue;
  for (const [from, to, mult, label] of SEASONS[s.style]) {
    if (s.style === 'highland' && label === 'Panagbenga' && s.slug !== 'baguio') continue;
    rates.push({ stay: s.id, from, to, price: round(s.nightly * mult, 50), label });
  }
}

// --- bookings and reviews -------------------------------------------------------
// Offsets are days from current_date. Each stay keeps a cursor so ranges never overlap.
const bookings = [];
const reviews = [];
let bookingId = 0;
for (const s of stays) {
  // The demo guest gets only its three planned trips (added below), so its Trips page stays readable.
  const guestsFor = () => guestIds.filter((g) => g !== s.host && g !== DEMO_GUEST.id);
  // Past stays (completed), most with reviews.
  let cursor = -int(120, 150);
  const pastCount = int(1, 4);
  for (let i = 0; i < pastCount; i++) {
    const nights = Math.max(s.minNights, int(1, 5));
    const start = cursor + int(3, 20);
    if (start + nights >= -2) break;
    bookingId++;
    const guest = pick(guestsFor());
    bookings.push({ id: bookingId, stay: s.id, guest, from: start, to: start + nights, guests: Math.min(s.maxGuests, int(1, 4)), status: 'completed', total: Math.round(s.nightly * nights * 1.05 + s.cleaning), kind: 'booking' });
    if (chance(0.8)) {
      const rating = weighted([[5, 6], [4, 3], [3, 1]]);
      reviews.push({ booking: bookingId, stay: s.id, author: guest, rating, body: pick(REVIEW[rating]), daysAgo: -(start + nights) - int(0, 2) });
    }
    cursor = start + nights;
  }
  // Upcoming: a confirmed trip, sometimes a pending request, sometimes a host block.
  cursor = int(2, 12);
  for (const status of ['confirmed', 'pending', 'blackout']) {
    if (status === 'confirmed' && !chance(0.55)) continue;
    if (status === 'pending' && !chance(0.35)) continue;
    if (status === 'blackout' && !chance(0.2)) continue;
    const nights = status === 'blackout' ? int(2, 6) : Math.max(s.minNights, int(2, 6));
    const start = cursor + int(1, 15);
    bookingId++;
    const isBlock = status === 'blackout';
    bookings.push({
      id: bookingId, stay: s.id,
      guest: isBlock ? s.host : pick(guestsFor()),
      from: start, to: start + nights, guests: isBlock ? 1 : Math.min(s.maxGuests, int(1, 4)),
      status: isBlock ? 'confirmed' : status,
      total: isBlock ? 0 : Math.round(s.nightly * nights * 1.05 + s.cleaning),
      kind: isBlock ? 'blackout' : 'booking',
    });
    cursor = start + nights;
  }
}
// Give the demo guest one past trip it can review, one upcoming trip and one pending request.
{
  const targets = stays.filter((s) => s.host !== DEMO_HOST.id).slice(0, 60);
  const [a, b, c] = [targets[3], targets[22], targets[47]];
  const add = (s, from, to, status) => {
    bookingId++;
    // Move this stay's other bookings out of the way: drop any that overlap.
    for (let i = bookings.length - 1; i >= 0; i--) {
      const x = bookings[i];
      if (x.stay === s.id && x.from < to && from < x.to) {
        bookings.splice(i, 1);
        for (let j = reviews.length - 1; j >= 0; j--) if (reviews[j].booking === x.id) reviews.splice(j, 1);
      }
    }
    bookings.push({ id: bookingId, stay: s.id, guest: DEMO_GUEST.id, from, to, guests: 2, status, total: Math.round(s.nightly * (to - from) * 1.05 + s.cleaning), kind: 'booking' });
  };
  add(a, -9, -6, 'completed');
  add(b, 14, 17, 'confirmed');
  add(c, 30, 34, 'pending');
}
// And a pending request on one of the demo host's stays, so there's something to confirm.
{
  const s = stays.find((x) => x.host === DEMO_HOST.id);
  for (let i = bookings.length - 1; i >= 0; i--) {
    const x = bookings[i];
    if (x.stay === s.id && x.from < 12 && 8 < x.to) bookings.splice(i, 1);
  }
  bookingId++;
  bookings.push({ id: bookingId, stay: s.id, guest: guestIds[4], from: 8, to: 12, guests: 2, status: 'pending', total: Math.round(s.nightly * 4 * 1.05 + s.cleaning), kind: 'booking' });
}

// --- SQL --------------------------------------------------------------------------
const out = [];
out.push(`-- Generated by scripts/build-seed.mjs — edit that, not this.
-- Demo content for Upa: ${people.length} people, ${stays.length} stays, ${rates.length} seasonal rates,
-- ${bookings.length} bookings and ${reviews.length} reviews. Every name is made up.
--
-- Runs on a Supabase database (it writes auth.users and auth.identities).
-- Safe to re-run: it deletes the demo accounts (and so all their content) first.

begin;

delete from auth.users where email like '%@upa.test';
`);

out.push('-- People');
for (const p of people) {
  const meta = JSON.stringify({ display_name: p.name });
  out.push(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', ${q(p.id)}, 'authenticated', 'authenticated', ${q(p.email)},
  extensions.crypt(${q(DEMO_PASSWORD)}, extensions.gen_salt('bf')), now() - interval '200 days',
  '{"provider":"email","providers":["email"]}', ${q(meta)}, now() - interval '200 days', now(), '', '', '', '');
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), ${q(p.id)}, ${q(p.id)}, 'email', ${q(JSON.stringify({ sub: p.id, email: p.email, email_verified: true }))}, now(), now(), now());`);
}
out.push(`
-- Profiles were made by the on_auth_user_created trigger; mark the hosts.
update public.profiles p set is_host = v.host, bio = v.bio
from (values
${people.map((p) => `  (${q(p.id)}::uuid, ${p.host}, ${q(p.bio)})`).join(',\n')}
) as v(id, host, bio)
where p.id = v.id;
`);

out.push('-- Stays');
out.push(`insert into public.stays (id, host_id, title, description, kind, city_id, area, location, bedrooms, bathrooms,
  max_guests, floor_sqm, nightly_php, monthly_php, cleaning_fee_php, min_nights, instant_book, amenities, art_seed, published, created_at)
overriding system value
select v.id, v.host::uuid, v.title, v.description, v.kind, c.id, v.area,
  extensions.st_setsrid(extensions.st_makepoint(v.lng, v.lat), 4326)::extensions.geography,
  v.bedrooms, v.bathrooms, v.max_guests, v.sqm, v.nightly, v.monthly, v.cleaning, v.min_nights, v.instant,
  v.amenities::jsonb, v.art, true, now() - (v.id || ' days')::interval
from (values
${stays.map((s) => `  (${s.id}, ${q(s.host)}, ${q(s.title)}, ${q(s.description)}, ${q(s.kind)}, ${q(s.slug)}, ${q(s.area)}, ${s.lat.toFixed(6)}, ${s.lng.toFixed(6)}, ${s.bedrooms}, ${s.bathrooms}, ${s.maxGuests}, ${s.sqm}, ${s.nightly}, ${s.monthly ?? 'null'}::numeric, ${s.cleaning}, ${s.minNights}, ${s.instant}, ${q(JSON.stringify(s.amenities))}, ${s.art})`).join(',\n')}
) as v(id, host, title, description, kind, slug, area, lat, lng, bedrooms, bathrooms, max_guests, sqm, nightly, monthly, cleaning, min_nights, instant, amenities, art)
join public.cities c on c.slug = v.slug;
select setval(pg_get_serial_sequence('public.stays', 'id'), (select max(id) from public.stays));
`);

out.push('-- Seasonal rates');
out.push(`insert into public.stay_rates (stay_id, during, nightly_php, label) values
${rates.map((r) => `  (${r.stay}, daterange(${q(r.from)}, ${q(r.to)}), ${r.price}, ${q(r.label)})`).join(',\n')};
`);

out.push('-- Bookings (dates relative to the day the seed is applied)');
out.push(`insert into public.bookings (id, stay_id, guest_id, kind, during, guests, status, total_php, created_at)
overriding system value values
${bookings.map((b) => `  (${b.id}, ${b.stay}, ${q(b.guest)}, ${q(b.kind)}, daterange(current_date + ${b.from}, current_date + ${b.to}), ${b.guests}, ${q(b.status)}, ${b.total}, now() + interval '${Math.min(b.from, 0) - 20} days')`).join(',\n')};
select setval(pg_get_serial_sequence('public.bookings', 'id'), (select max(id) from public.bookings));
`);

out.push('-- Reviews');
out.push(`insert into public.reviews (booking_id, stay_id, author_id, rating, body, created_at) values
${reviews.map((r) => `  (${r.booking}, ${r.stay}, ${q(r.author)}, ${r.rating}, ${q(r.body)}, now() - interval '${Math.max(r.daysAgo, 0)} days')`).join(',\n')};
`);

out.push('commit;\n');

writeFileSync(join(ROOT, 'supabase', 'seed.sql'), out.join('\n'));
console.log(`seed.sql: ${people.length} people, ${stays.length} stays, ${rates.length} rates, ${bookings.length} bookings, ${reviews.length} reviews`);
