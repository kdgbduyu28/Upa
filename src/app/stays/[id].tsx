import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Calendar, type Range } from '../../components/Calendar';
import { StayArt } from '../../components/StayArt';
import { StayMap } from '../../components/StayMap';
import { Button, Card, Divider, Field, Notice, Page, Pill, Row, Section, Stars, Status, Stepper, T } from '../../components/ui';
import {
  ApiError, bookStay, favorites, getStay, quoteStay, setFavorite, stayCalendar, stayReviews,
  type CalendarDay,
} from '../../lib/api';
import { amenityIcon, amenityLabel } from '../../lib/amenities';
import { useAuth } from '../../lib/auth';
import { addDays, BEDS_LABEL, fmtDayYear, fmtMonth, fmtRange, KIND_LABEL, php, today } from '../../lib/format';
import { useAsync, useLayout } from '../../lib/hooks';
import { C } from '../../theme';

export default function StayPage() {
  const { desktop, wide } = useLayout();
  const p = useLocalSearchParams<{ id: string; in?: string; out?: string; guests?: string }>();
  const id = Number(p.id);
  const userId = useAuth((s) => s.session?.user.id ?? null);

  const stay = useAsync(() => getStay(id), [id]);
  const reviews = useAsync(() => stayReviews(id), [id]);
  const [from, setFrom] = useState(() => today().slice(0, 8) + '01');
  const cal = useAsync(() => stayCalendar(id, from, addDays(from, 70)), [id, from]);
  const days = useMemo(() => new Map<string, CalendarDay>((cal.data ?? []).map((d) => [d.day, d])), [cal.data]);
  const favs = useAsync(() => (userId ? favorites() : Promise.resolve([] as number[])), [userId]);

  const [range, setRange] = useState<Range>({ checkIn: p.in ?? null, checkOut: p.out ?? null });
  const [guests, setGuests] = useState(Number(p.guests ?? 1) || 1);
  const [note, setNote] = useState('');
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  const ready = range.checkIn && range.checkOut;
  const quote = useAsync(
    () => (ready ? quoteStay(id, range.checkIn!, range.checkOut!) : Promise.resolve(null)),
    [id, range.checkIn, range.checkOut],
  );

  const st = stay.data;
  if (!st) {
    return (
      <Page>
        <Status loading={stay.loading} error={stay.error} empty={!stay.loading} emptyText="This stay doesn't exist or isn't published." onRetry={stay.reload} />
      </Page>
    );
  }

  const isHost = userId === st.host_id;
  const isFav = favs.data?.includes(id) ?? false;
  const q = quote.data;

  const book = async () => {
    if (!userId) {
      router.push(`/sign-in?next=${encodeURIComponent(`/stays/${id}?in=${range.checkIn}&out=${range.checkOut}&guests=${guests}`)}`);
      return;
    }
    setBooking(true);
    setBookError(null);
    try {
      const b = await bookStay(id, range.checkIn!, range.checkOut!, guests, note);
      router.replace(`/trips?booked=${b.id}`);
    } catch (e) {
      const err = e as ApiError;
      setBookError(err.hint === 'dates_taken'
        ? 'Someone just booked some of those nights. The calendar has been refreshed; pick other dates.'
        : err.message);
      cal.reload();
      quote.reload();
    } finally {
      setBooking(false);
    }
  };

  const bookingBox = (
    <Card style={{ gap: 14 }}>
      <Row gap={6} align="flex-end">
        <T v="h2">{php(st.nightly_php)}</T>
        <T color={C.muted}>night</T>
        {st.monthly_php ? <Pill tone="teal" label={`${php(st.monthly_php)}/month for 28+ nights`} /> : null}
      </Row>
      <Calendar days={days} value={range} onChange={setRange} showPrices firstMonth={from}
        onMonthChange={(m) => setFrom(m)} />
      <Status loading={cal.loading && !cal.data} error={cal.error} />
      <Row gap={8} wrap>
        <Pill label={range.checkIn ? `Check-in ${fmtDayYear(range.checkIn)}` : 'Pick check-in'} tone={range.checkIn ? 'primary' : 'neutral'} />
        <Pill label={range.checkOut ? `Check-out ${fmtDayYear(range.checkOut)}` : 'Pick check-out'} tone={range.checkOut ? 'primary' : 'neutral'} />
        {range.checkIn ? <Button small kind="ghost" title="Clear" onPress={() => setRange({ checkIn: null, checkOut: null })} /> : null}
      </Row>
      <Stepper label="Guests" value={guests} min={1} max={st.max_guests} onChange={setGuests} />

      {q ? (
        <View style={{ gap: 6 }}>
          {q.monthly_rate_applied ? (
            <Row justify="space-between"><T v="small">Monthly rate × {q.nights} nights</T><T v="small">{php(q.subtotal)}</T></Row>
          ) : (
            groupNights(q.per_night).map((g) => (
              <Row key={g.key} justify="space-between">
                <T v="small">{php(g.price)} × {g.count} night{g.count > 1 ? 's' : ''}{g.label ? ` (${g.label})` : ''}</T>
                <T v="small">{php(g.price * g.count)}</T>
              </Row>
            ))
          )}
          {Number(q.cleaning_fee) > 0 ? <Row justify="space-between"><T v="small">Cleaning fee</T><T v="small">{php(q.cleaning_fee)}</T></Row> : null}
          <Row justify="space-between"><T v="small">Service fee (5%)</T><T v="small">{php(q.service_fee)}</T></Row>
          <Divider />
          <Row justify="space-between"><T v="label">Total</T><T v="label">{php(q.total)}</T></Row>
          {!q.meets_min_nights ? <Notice tone="warn">This stay needs at least {q.min_nights} nights.</Notice> : null}
          {!q.available ? <Notice tone="error">Some of these nights are taken.</Notice> : null}
        </View>
      ) : (
        <T v="small" color={C.muted}>Pick dates to see the price for each night.{st.min_nights > 1 ? ` Minimum ${st.min_nights} nights.` : ''}</T>
      )}

      {ready && !isHost ? (
        <Field label="Message to the host (optional)" value={note} onChangeText={setNote} multiline maxLength={500}
          placeholder="Arrival time, who's coming, questions…" />
      ) : null}
      {bookError ? <Notice tone="error">{bookError}</Notice> : null}
      {isHost ? (
        <Button kind="secondary" title="Edit this stay" icon="create-outline" onPress={() => router.push(`/host/stays/${id}`)} />
      ) : (
        <Button
          title={!userId ? 'Sign in to book' : st.instant_book ? 'Book now' : 'Request to book'}
          icon={st.instant_book ? 'flash' : undefined}
          onPress={book}
          loading={booking}
          disabled={!ready || !q || !q.available || !q.meets_min_nights}
        />
      )}
      <T v="small" color={C.muted} style={{ textAlign: 'center' }}>
        {st.instant_book ? 'Confirmed right away.' : 'The host confirms requests, usually within a day.'} Demo only: no payment is taken.
      </T>
    </Card>
  );

  return (
    <Page>
      <Stack.Screen options={{ title: `${st.title} · Upa` }} />
      <Row justify="space-between" align="flex-start" wrap gap={12}>
        <View style={{ flex: 1, minWidth: 260, gap: 4 }}>
          <T v="h1">{st.title}</T>
          <Row gap={10} wrap>
            <Stars value={st.rating_avg} count={st.rating_count} />
            <T v="small" color={C.muted}>{st.area ? `${st.area}, ` : ''}{st.city.name}</T>
            {!st.published ? <Pill tone="warn" label="Draft: only you can see this" /> : null}
          </Row>
        </View>
        {userId && !isHost ? (
          <Button small kind="secondary" icon={isFav ? 'heart' : 'heart-outline'} title={isFav ? 'Saved' : 'Save'}
            onPress={async () => { await setFavorite(userId, id, !isFav); favs.reload(); }} />
        ) : null}
      </Row>

      <View style={{ marginTop: 16 }}>
        {st.photos.length > 1 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator contentContainerStyle={{ gap: 8 }}>
            {st.photos.map((ph) => <StayArt key={ph} seed={st.art_seed} kind={st.kind} photo={ph} style={{ width: wide ? 560 : 320 }} />)}
          </ScrollView>
        ) : (
          <StayArt seed={st.art_seed} kind={st.kind} photo={st.photos[0]} style={{ maxHeight: 420, width: '100%', aspectRatio: wide ? 21 / 9 : 4 / 3 }} />
        )}
      </View>

      <View style={{ flexDirection: desktop ? 'row' : 'column', gap: 32, marginTop: 24, alignItems: 'flex-start' }}>
        <View style={{ flex: desktop ? 1.4 : undefined, width: desktop ? undefined : '100%', gap: 4 }}>
          <T v="h2">{KIND_LABEL[st.kind]} hosted by {st.host.display_name}</T>
          <T color={C.muted}>
            {st.max_guests} guests · {BEDS_LABEL(st.bedrooms)} · {st.bathrooms} bath{st.bathrooms > 1 ? 's' : ''}
            {st.floor_sqm ? ` · ${Math.round(Number(st.floor_sqm))} m²` : ''}
          </T>
          <Row gap={8} wrap style={{ marginTop: 10 }}>
            {st.instant_book ? <Pill icon="flash" tone="warn" label="Instant book" /> : null}
            {st.min_nights > 1 ? <Pill icon="moon-outline" label={`${st.min_nights}-night minimum`} /> : null}
            <Pill icon="person-outline" label={`Hosting since ${fmtMonth(st.host.created_at)}`} />
          </Row>
          <Divider />
          <T>{st.description}</T>
          {st.host.bio ? (
            <Card style={{ marginTop: 16, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center' }}>
                <T v="h3" color={C.onColor}>{st.host.display_name.slice(0, 1)}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T v="label">{st.host.display_name}</T>
                <T v="small" color={C.muted}>{st.host.bio}</T>
              </View>
            </Card>
          ) : null}

          <Section title="What this place offers">
            <Row gap={10} wrap>
              {st.amenities.map((a) => (
                <Row key={a} gap={8} style={{ minWidth: 180, flexBasis: '45%' }}>
                  <Ionicons name={amenityIcon(a)} size={18} color={C.text} />
                  <T>{amenityLabel(a)}</T>
                </Row>
              ))}
            </Row>
          </Section>

          {!desktop ? <View style={{ marginTop: 28 }}>{bookingBox}</View> : null}

          <Section title="Where you'll be" sub={`${st.area ? `${st.area}, ` : ''}${st.city.name}. The exact spot is shared after booking.`}>
            <StayMap pinAt={{ lat: st.lat, lng: st.lng }} zoom={14} height={320} />
          </Section>

          <Section title={st.rating_count ? `${Number(st.rating_avg).toFixed(2)} · ${st.rating_count} review${st.rating_count > 1 ? 's' : ''}` : 'Reviews'}>
            <Status loading={reviews.loading} error={reviews.error} empty={!reviews.loading && !reviews.data?.length} emptyText="No reviews yet." />
            <View style={{ gap: 14 }}>
              {reviews.data?.map((r) => (
                <View key={r.id} style={{ gap: 4 }}>
                  <Row gap={8}>
                    <T v="label">{r.author.display_name}</T>
                    <Row gap={2}>{Array.from({ length: 5 }, (_, i) => <Ionicons key={i} name={i < r.rating ? 'star' : 'star-outline'} size={12} color={C.gold} />)}</Row>
                    <T v="small" color={C.muted}>{fmtMonth(r.created_at)}</T>
                  </Row>
                  {r.body ? <T>{r.body}</T> : null}
                </View>
              ))}
            </View>
          </Section>
        </View>
        {desktop ? <View style={{ flex: 1, position: 'sticky' as never, top: 16 }}>{bookingBox}</View> : null}
      </View>
      {range.checkIn && range.checkOut ? (
        <T v="small" color={C.muted} style={{ marginTop: 16 }}>Selected: {fmtRange(range.checkIn, range.checkOut)}</T>
      ) : null}
    </Page>
  );
}

/** Consecutive nights at the same price and label, for the price breakdown. */
function groupNights(nights: { night: string; price: number; label: string }[]) {
  const out: { key: string; price: number; label: string; count: number }[] = [];
  for (const n of nights) {
    const last = out[out.length - 1];
    if (last && last.price === Number(n.price) && last.label === n.label) last.count++;
    else out.push({ key: n.night, price: Number(n.price), label: n.label, count: 1 });
  }
  return out;
}
