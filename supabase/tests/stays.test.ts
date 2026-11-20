import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { addStay, asUser, createDb, failure, uid } from './pg';

const HOST = uid(1);
const GUEST = uid(2);
const OTHER = uid(3);

let db: PGlite;
beforeEach(async () => {
  db = await createDb([
    { id: HOST, name: 'Host' },
    { id: GUEST, name: 'Guest' },
    { id: OTHER, name: 'Other' },
  ]);
});

const book = (user: string | null, stay: number, from: number, to: number, guests = 2) =>
  asUser(db, user, `select * from book_stay($1, current_date + $2::int, current_date + $3::int, $4)`, [stay, from, to, guests]);

describe('profiles', () => {
  it('are created on sign-up with the display name', async () => {
    const r = await db.query<{ display_name: string }>(`select display_name from profiles where id = $1`, [GUEST]);
    expect(r.rows[0].display_name).toBe('Guest');
  });
});

describe('double booking', () => {
  it('rejects overlapping nights, allows back-to-back stays', async () => {
    const s = await addStay(db, HOST);
    await book(GUEST, s, 5, 8);
    expect(await failure(() => book(OTHER, s, 7, 9))).toMatch(/no longer available/);
    // Check-out day 8 is free for the next check-in: daterange is [from, to).
    await expect(book(OTHER, s, 8, 10)).resolves.toHaveLength(1);
  });

  it('frees the dates when a booking is cancelled', async () => {
    const s = await addStay(db, HOST);
    const [b] = await book(GUEST, s, 5, 8);
    await asUser(db, GUEST, `select set_booking_status($1, 'cancelled')`, [b.id]);
    await expect(book(OTHER, s, 6, 7)).resolves.toHaveLength(1);
  });

  it('host blocks stop bookings too', async () => {
    const s = await addStay(db, HOST);
    await asUser(db, HOST, `select block_dates($1, current_date + 3, current_date + 6)`, [s]);
    expect(await failure(() => book(GUEST, s, 5, 7))).toMatch(/no longer available/);
  });

  it('enforces the rule even when inserting directly as the owner', async () => {
    const s = await addStay(db, HOST);
    await db.query(`insert into bookings (stay_id, guest_id, during) values ($1, $2, daterange(current_date, current_date + 3))`, [s, GUEST]);
    expect(await failure(() =>
      db.query(`insert into bookings (stay_id, guest_id, during) values ($1, $2, daterange(current_date + 2, current_date + 4))`, [s, OTHER]),
    )).toMatch(/bookings_no_overlap/);
  });
});

describe('book_stay rules', () => {
  it('needs a signed-in guest who is not the host', async () => {
    const s = await addStay(db, HOST);
    expect(await failure(() => book(null, s, 2, 4))).toMatch(/permission denied|Sign in/);
    expect(await failure(() => book(HOST, s, 2, 4))).toMatch(/own stay/);
  });

  it('checks dates, minimum nights and guest count', async () => {
    const s = await addStay(db, HOST, { minNights: 3, maxGuests: 2 });
    expect(await failure(() => book(GUEST, s, -2, 2))).toMatch(/past/);
    expect(await failure(() => book(GUEST, s, 2, 4))).toMatch(/at least 3 nights/);
    expect(await failure(() => book(GUEST, s, 2, 6, 5))).toMatch(/up to 2 guests/);
  });

  it('is pending unless the stay is instant book', async () => {
    const a = await addStay(db, HOST);
    const b = await addStay(db, HOST, { instant: true });
    expect((await book(GUEST, a, 2, 4))[0].status).toBe('pending');
    expect((await book(GUEST, b, 2, 4))[0].status).toBe('confirmed');
  });

  it('charges the quoted total', async () => {
    const s = await addStay(db, HOST, { nightly: 2000, cleaning: 500 });
    const [b] = await book(GUEST, s, 2, 5);
    // 3 × 2000 + 500 cleaning + 5% service on 6000
    expect(Number(b.total_php)).toBe(6000 + 500 + 300);
  });
});

describe('status changes', () => {
  it('lets the host confirm, not the guest', async () => {
    const s = await addStay(db, HOST);
    const [b] = await book(GUEST, s, 5, 8);
    expect(await failure(() => asUser(db, GUEST, `select set_booking_status($1, 'confirmed')`, [b.id]))).toMatch(/can't change/);
    expect(await failure(() => asUser(db, OTHER, `select set_booking_status($1, 'cancelled')`, [b.id]))).toMatch(/can't change/);
    await asUser(db, HOST, `select set_booking_status($1, 'confirmed')`, [b.id]);
    const ev = await db.query<{ to_status: string }>(`select to_status from booking_events where booking_id = $1 order by id`, [b.id]);
    expect(ev.rows.map((r) => r.to_status)).toEqual(['pending', 'confirmed']);
  });
});

describe('row-level security', () => {
  it('guests see their bookings, hosts see bookings on their stays, others see none', async () => {
    const s = await addStay(db, HOST);
    await book(GUEST, s, 5, 8);
    await book(OTHER, s, 10, 12);
    expect(await asUser(db, GUEST, `select id from bookings`)).toHaveLength(1);
    expect(await asUser(db, HOST, `select id from bookings`)).toHaveLength(2);
    expect(await asUser(db, null, `select id from bookings`)).toHaveLength(0);
  });

  it('hides drafts from everyone but their host', async () => {
    await addStay(db, HOST, { published: false });
    expect(await asUser(db, GUEST, `select id from stays`)).toHaveLength(0);
    expect(await asUser(db, HOST, `select id from stays`)).toHaveLength(1);
  });

  it('stops hosts editing other hosts\' stays and their own ratings', async () => {
    const s = await addStay(db, HOST);
    await asUser(db, OTHER, `update stays set title = 'Hijacked listing' where id = $1`, [s]);
    const r = await db.query<{ title: string }>(`select title from stays where id = $1`, [s]);
    expect(r.rows[0].title).not.toBe('Hijacked listing');
    expect(await failure(() => asUser(db, HOST, `update stays set rating_avg = 5 where id = $1`, [s]))).toMatch(/permission denied/);
  });

  it('never exposes scraped listings', async () => {
    expect(await failure(() => asUser(db, null, `select * from market_listings`))).toBeNull();
    expect(await asUser(db, null, `select * from market_listings`)).toHaveLength(0);
  });
});

describe('seasonal rates and quotes', () => {
  it('rejects overlapping rates for one stay', async () => {
    const s = await addStay(db, HOST);
    await db.query(`insert into stay_rates (stay_id, during, nightly_php) values ($1, daterange(current_date + 1, current_date + 5), 4000)`, [s]);
    expect(await failure(() =>
      db.query(`insert into stay_rates (stay_id, during, nightly_php) values ($1, daterange(current_date + 4, current_date + 9), 5000)`, [s]),
    )).toMatch(/stay_rates_no_overlap/);
  });

  it('prices each night by its rate', async () => {
    const s = await addStay(db, HOST, { nightly: 2000 });
    await db.query(`insert into stay_rates (stay_id, during, nightly_php, label) values ($1, daterange(current_date + 2, current_date + 4), 3000, 'Peak')`, [s]);
    const [{ q }] = await asUser<{ q: { subtotal: number; per_night: { price: number }[] } }>(
      db, null, `select quote_stay($1, current_date + 1, current_date + 5) as q`, [s]);
    expect(q.per_night.map((n) => Number(n.price))).toEqual([2000, 3000, 3000, 2000]);
    expect(Number(q.subtotal)).toBe(10000);
  });

  it('uses the monthly rate for 28+ nights', async () => {
    const s = await addStay(db, HOST, { nightly: 2000, monthly: 30000 });
    const [{ q }] = await asUser<{ q: { subtotal: number; monthly_rate_applied: boolean } }>(
      db, null, `select quote_stay($1, current_date + 1, current_date + 31) as q`, [s]);
    expect(q.monthly_rate_applied).toBe(true);
    expect(Number(q.subtotal)).toBe(30000);
  });
});

describe('search', () => {
  it('finds stays despite typos and accents', async () => {
    await addStay(db, HOST, { title: 'Quiet studio in Parañaque', city: 'paranaque', area: 'BF Homes' });
    await addStay(db, HOST, { title: 'Garden house in Baguio', city: 'baguio', area: 'Camp John Hay', kind: 'house' });
    const hit = async (q: string) =>
      (await asUser<{ title: string }>(db, null, `select title from search_stays(p_q => $1)`, [q])).map((r) => r.title);
    expect(await hit('paranaque')).toEqual(['Quiet studio in Parañaque']);
    expect(await hit('baguoi garden')).toEqual(['Garden house in Baguio']);
  });

  it('matches a misspelt city plus an amenity', async () => {
    await addStay(db, HOST, { title: 'High-floor 1BR with a view', amenities: ['wifi', 'pool'] });
    await addStay(db, HOST, { title: 'Quiet 1BR near the park', amenities: ['wifi', 'backup-power'] });
    const r = await asUser<{ title: string }>(db, null, `select title from search_stays(p_q => 'makatii pool')`);
    expect(r.map((x) => x.title)).toEqual(['High-floor 1BR with a view']);
  });

  it('filters by distance and sorts nearest first', async () => {
    const near = await addStay(db, HOST, { lat: 14.5550, lng: 121.0250 });
    const mid = await addStay(db, HOST, { lat: 14.5650, lng: 121.0300 });
    await addStay(db, HOST, { city: 'cebu-city', lat: 10.3157, lng: 123.8854 });
    const r = await asUser<{ id: number; distance_m: number }>(db, null,
      `select id, distance_m from search_stays(p_lat => 14.5547, p_lng => 121.0244, p_radius_km => 5, p_sort => 'distance')`);
    expect(r.map((x) => Number(x.id))).toEqual([near, mid]);
    expect(r[0].distance_m).toBeLessThan(200);
  });

  it('only returns stays free on the chosen dates', async () => {
    const a = await addStay(db, HOST);
    const b = await addStay(db, HOST);
    await book(GUEST, a, 5, 8);
    const r = await asUser<{ id: number }>(db, OTHER,
      `select id from search_stays(p_check_in => current_date + 6, p_check_out => current_date + 9)`);
    expect(r.map((x) => Number(x.id))).toEqual([b]);
  });

  it('filters amenities with JSONB containment', async () => {
    const pool = await addStay(db, HOST, { amenities: ['wifi', 'pool'] });
    await addStay(db, HOST, { amenities: ['wifi'] });
    const r = await asUser<{ id: number }>(db, null, `select id from search_stays(p_amenities => '["pool"]')`);
    expect(r.map((x) => Number(x.id))).toEqual([pool]);
  });
});

describe('reviews', () => {
  it('only after a completed stay, and they update the rating', async () => {
    const s = await addStay(db, HOST);
    const [b] = await book(GUEST, s, 1, 2);
    const review = () => asUser(db, GUEST,
      `insert into reviews (booking_id, stay_id, author_id, rating, body) values ($1, $2, $3, 5, 'Lovely')`, [b.id, s, GUEST]);
    expect(await failure(review)).toMatch(/row-level security/);
    await db.query(`update bookings set status = 'completed' where id = $1`, [b.id]);
    await review();
    const r = await db.query<{ rating_avg: string; rating_count: number }>(`select rating_avg, rating_count from stays where id = $1`, [s]);
    expect(Number(r.rows[0].rating_avg)).toBe(5);
    expect(r.rows[0].rating_count).toBe(1);
  });

  it('complete_past_bookings finishes confirmed stays whose check-out passed', async () => {
    const s = await addStay(db, HOST);
    await db.query(`insert into bookings (stay_id, guest_id, during, status) values ($1, $2, daterange(current_date - 5, current_date - 2), 'confirmed')`, [s, GUEST]);
    const r = await db.query<{ n: number }>(`select complete_past_bookings() as n`);
    expect(r.rows[0].n).toBe(1);
  });
});
