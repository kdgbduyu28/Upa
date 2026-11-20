// Create or edit a stay: details, pin on the map, amenities, photos, and for
// saved stays, blocked dates and seasonal rates.
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Calendar, type Range } from '../../../components/Calendar';
import { StayArt } from '../../../components/StayArt';
import { StayMap } from '../../../components/StayMap';
import { Button, Card, Chip, Field, Notice, Page, Pill, Row, Section, Segmented, Status, Stepper, T } from '../../../components/ui';
import {
  addRate, blockDates, cities, deleteRate, deleteStay, getStay, myBookings, parseRange, saveStay, setBookingStatus,
  stayCalendar, stayRates, uploadPhoto, type CalendarDay, type StayDraft, type StayKind,
} from '../../../lib/api';
import { AMENITIES } from '../../../lib/amenities';
import { useAuth } from '../../../lib/auth';
import { addDays, fmtRange, KIND_LABEL, php, today } from '../../../lib/format';
import { useAsync, useLayout } from '../../../lib/hooks';
import { C } from '../../../theme';

const EMPTY: StayDraft = {
  title: '', description: '', kind: 'condo', city_slug: 'makati', area: '', lat: 14.5547, lng: 121.0244,
  bedrooms: 1, bathrooms: 1, max_guests: 2, floor_sqm: null, nightly_php: 2500, monthly_php: null,
  cleaning_fee_php: 0, min_nights: 1, instant_book: false, amenities: ['wifi'], photos: [],
  art_seed: Math.floor(Math.random() * 1_000_000), published: false,
};

const num = (s: string) => {
  const n = Number(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && s.trim() !== '' ? n : null;
};

export default function StayEditor() {
  const { wide } = useLayout();
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const isNew = raw === 'new';
  const id = isNew ? null : Number(raw);
  const me = useAuth((s) => s.session?.user.id ?? null);
  const ready = useAuth((s) => s.ready);
  const cityList = useAsync(cities, []);
  const existing = useAsync(() => (id ? getStay(id) : Promise.resolve(null)), [id]);
  const [d, setD] = useState<StayDraft>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'good' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (ready && !me) router.replace(`/sign-in?next=/host/stays/${raw}`);
  }, [ready, me, raw]);

  useEffect(() => {
    const s = existing.data;
    if (!s) return;
    setD({
      title: s.title, description: s.description, kind: s.kind, city_slug: s.city.slug, area: s.area, lat: s.lat, lng: s.lng,
      bedrooms: s.bedrooms, bathrooms: s.bathrooms, max_guests: s.max_guests, floor_sqm: s.floor_sqm,
      nightly_php: Number(s.nightly_php), monthly_php: s.monthly_php ? Number(s.monthly_php) : null,
      cleaning_fee_php: Number(s.cleaning_fee_php), min_nights: s.min_nights, instant_book: s.instant_book,
      amenities: s.amenities, photos: s.photos, art_seed: s.art_seed, published: s.published,
    });
  }, [existing.data]);

  const up = (patch: Partial<StayDraft>) => setD((x) => ({ ...x, ...patch }));
  const problems = [
    d.title.trim().length < 5 && 'Give it a title of at least 5 characters.',
    (d.nightly_php < 300 || d.nightly_php > 200000) && 'Nightly price must be between ₱300 and ₱200,000.',
  ].filter(Boolean) as string[];

  const save = async (publish?: boolean) => {
    if (!me) return;
    setBusy('save');
    setMsg(null);
    try {
      const saved = await saveStay(me, id, { ...d, title: d.title.trim(), published: publish ?? d.published });
      if (publish != null) up({ published: publish });
      setMsg({ tone: 'good', text: publish ? 'Listed! Guests can find it now.' : 'Saved.' });
      if (isNew) router.replace(`/host/stays/${saved}`);
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const addPhoto = async () => {
    if (!me) return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (r.canceled || !r.assets[0]) return;
    setBusy('photo');
    try {
      const url = await uploadPhoto(me, r.assets[0]);
      up({ photos: [...d.photos, url].slice(0, 20) });
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (id && existing.data === null && !existing.loading) {
    return <Page><Notice tone="error">This stay doesn't exist or isn't yours.</Notice></Page>;
  }
  if (existing.data && me && existing.data.host_id !== me) {
    return <Page><Notice tone="error">Only the host can edit this stay.</Notice></Page>;
  }

  return (
    <Page max={900}>
      <Stack.Screen options={{ title: `${isNew ? 'New place' : d.title || 'Edit'} · Hosting · Upa` }} />
      <Row justify="space-between" wrap gap={12}>
        <View style={{ gap: 4 }}>
          <T v="h1">{isNew ? 'List a new place' : 'Edit your place'}</T>
          {!isNew ? <Row gap={6}>{d.published ? <Pill tone="good" label="Listed" /> : <Pill tone="warn" label="Draft" />}</Row> : null}
        </View>
        {!isNew ? <Button small kind="secondary" icon="eye-outline" title="View as a guest" onPress={() => router.push(`/stays/${id}`)} /> : null}
      </Row>
      <Status loading={existing.loading && !!id} error={existing.error} />

      <Section title="The basics">
        <Card style={{ gap: 14 }}>
          <Field label="Title" value={d.title} onChangeText={(v) => up({ title: v })} maxLength={90} placeholder="Bright 1BR condo near Ayala" />
          <Field label="Description" value={d.description} onChangeText={(v) => up({ description: v })} multiline maxLength={3000}
            placeholder="What makes it nice, who it's good for, how check-in works." />
          <View style={{ gap: 6 }}>
            <T v="label">Type of place</T>
            <Row gap={6} wrap>
              {(Object.keys(KIND_LABEL) as StayKind[]).map((k) => <Chip key={k} label={KIND_LABEL[k]} on={d.kind === k} onPress={() => up({ kind: k })} />)}
            </Row>
          </View>
          <Stepper label="Bedrooms" value={d.bedrooms} min={0} max={20} onChange={(v) => up({ bedrooms: v })} format={(v) => (v === 0 ? 'Studio' : String(v))} />
          <Stepper label="Bathrooms" value={d.bathrooms} min={0} max={20} onChange={(v) => up({ bathrooms: v })} />
          <Stepper label="Guests" value={d.max_guests} min={1} max={30} onChange={(v) => up({ max_guests: v })} />
          <Field label="Floor area (m², optional)" value={d.floor_sqm ? String(d.floor_sqm) : ''} keyboardType="numeric"
            onChangeText={(v) => up({ floor_sqm: num(v) })} />
        </Card>
      </Section>

      <Section title="Where it is" sub="Tap the map to move the pin. Guests see the area, not the exact spot, until they book.">
        <Card style={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            <T v="label">City</T>
            <Row gap={6} wrap>
              {(cityList.data ?? []).map((c) => (
                <Chip key={c.slug} label={c.name} on={d.city_slug === c.slug}
                  onPress={() => up({ city_slug: c.slug, ...(d.city_slug !== c.slug ? { lat: c.lat, lng: c.lng } : {}) })} />
              ))}
            </Row>
          </View>
          <Field label="Neighbourhood" value={d.area} onChangeText={(v) => up({ area: v })} maxLength={80} placeholder="Salcedo Village" />
          <StayMap pinAt={{ lat: d.lat, lng: d.lng }} onPick={(lat, lng) => up({ lat, lng })} height={320} zoom={14} />
        </Card>
      </Section>

      <Section title="Price and rules">
        <Card style={{ gap: 14 }}>
          <Row gap={12} wrap align="flex-start">
            <Field style={{ flex: 1, minWidth: 160 }} label="Per night (₱)" value={String(d.nightly_php || '')} keyboardType="numeric"
              onChangeText={(v) => up({ nightly_php: num(v) ?? 0 })} />
            <Field style={{ flex: 1, minWidth: 160 }} label="Per month (₱, optional)" value={d.monthly_php ? String(d.monthly_php) : ''} keyboardType="numeric"
              onChangeText={(v) => up({ monthly_php: num(v) })} hint="Used for stays of 28+ nights." />
            <Field style={{ flex: 1, minWidth: 160 }} label="Cleaning fee (₱)" value={String(d.cleaning_fee_php || '')} keyboardType="numeric"
              onChangeText={(v) => up({ cleaning_fee_php: num(v) ?? 0 })} />
          </Row>
          <Stepper label="Minimum nights" value={d.min_nights} min={1} max={90} onChange={(v) => up({ min_nights: v })} />
          <View style={{ gap: 6 }}>
            <T v="label">Booking</T>
            <Segmented value={d.instant_book ? 'instant' : 'request'} onChange={(v) => up({ instant_book: v === 'instant' })}
              options={[{ value: 'request', label: 'I approve each request' }, { value: 'instant', label: 'Instant book' }]} />
          </View>
        </Card>
      </Section>

      <Section title="Amenities">
        <Card>
          <Row gap={6} wrap>
            {Object.entries(AMENITIES).map(([k, a]) => (
              <Chip key={k} icon={a.icon} label={a.label} on={d.amenities.includes(k)}
                onPress={() => up({ amenities: d.amenities.includes(k) ? d.amenities.filter((x) => x !== k) : [...d.amenities, k] })} />
            ))}
          </Row>
        </Card>
      </Section>

      <Section title="Photos" sub="Without photos, guests see generated art for your type of place.">
        <Card style={{ gap: 12 }}>
          <Row gap={10} wrap>
            {d.photos.map((p) => (
              <Pressable key={p} onPress={() => up({ photos: d.photos.filter((x) => x !== p) })} accessibilityLabel="Remove photo">
                <StayArt seed={d.art_seed} kind={d.kind} photo={p} style={{ width: wide ? 180 : 140 }} rounded={10} />
                <T v="small" color={C.dangerText} style={{ textAlign: 'center' }}>Remove</T>
              </Pressable>
            ))}
            {!d.photos.length ? <StayArt seed={d.art_seed} kind={d.kind} style={{ width: wide ? 180 : 140 }} rounded={10} /> : null}
          </Row>
          <Row gap={8} wrap>
            <Button small kind="secondary" icon="image-outline" title="Add a photo" onPress={addPhoto} loading={busy === 'photo'} />
            {!d.photos.length ? <Button small kind="ghost" icon="shuffle" title="New art" onPress={() => up({ art_seed: Math.floor(Math.random() * 1_000_000) })} /> : null}
          </Row>
        </Card>
      </Section>

      <View style={{ marginTop: 24, gap: 10 }}>
        {problems.map((p) => <Notice key={p} tone="warn">{p}</Notice>)}
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <Row gap={8} wrap>
          <Button title={isNew ? 'Save draft' : 'Save changes'} onPress={() => save()} loading={busy === 'save'} disabled={problems.length > 0} />
          {d.published ? (
            <Button kind="secondary" title="Unlist" onPress={() => save(false)} disabled={problems.length > 0 || isNew} />
          ) : (
            <Button kind="teal" icon="globe-outline" title="Save and list it" onPress={() => save(true)} disabled={problems.length > 0} />
          )}
          {!isNew ? (
            <Button kind="danger" icon="trash-outline" title="Delete" onPress={async () => {
              if (!id) return;
              await deleteStay(id);
              router.replace('/host');
            }} />
          ) : null}
        </Row>
      </View>

      {id ? <Availability stayId={id} nightly={d.nightly_php} /> : null}
    </Page>
  );
}

/** Blocked dates and seasonal rates for a saved stay. */
function Availability({ stayId, nightly }: { stayId: number; nightly: number }) {
  const { wide } = useLayout();
  const [from, setFrom] = useState(() => today().slice(0, 8) + '01');
  const cal = useAsync(() => stayCalendar(stayId, from, addDays(from, 70)), [stayId, from]);
  const days = useMemo(() => new Map<string, CalendarDay>((cal.data ?? []).map((x) => [x.day, x])), [cal.data]);
  const blocks = useAsync(async () => (await myBookings()).filter((b) => b.stay_id === stayId && b.kind === 'blackout' && b.status !== 'cancelled'), [stayId]);
  const rates = useAsync(() => stayRates(stayId), [stayId]);
  const [range, setRange] = useState<Range>({ checkIn: null, checkOut: null });
  const [rate, setRate] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => { cal.reload(); blocks.reload(); rates.reload(); setRange({ checkIn: null, checkOut: null }); };
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try { await fn(); refresh(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const ok = range.checkIn && range.checkOut;

  return (
    <Section title="Calendar" sub="Pick a date range, then block it or give it a seasonal price. Blocked dates can't be booked: the same database rule that stops double bookings.">
      <Card style={{ gap: 14 }}>
        <Calendar mode="block" days={days} value={range} onChange={setRange} months={wide ? 2 : 1} showPrices firstMonth={from} onMonthChange={setFrom} />
        {ok ? (
          <View style={{ gap: 10 }}>
            <T v="label">{fmtRange(range.checkIn!, range.checkOut!)}</T>
            <Row gap={8} wrap align="flex-end">
              <Button small kind="secondary" icon="ban-outline" title="Block these dates" loading={busy}
                onPress={() => act(() => blockDates(stayId, range.checkIn!, range.checkOut!))} />
              <Field style={{ width: 130 }} label="Nightly (₱)" value={rate} onChangeText={setRate} keyboardType="numeric" placeholder={String(Math.round(nightly * 1.3))} />
              <Field style={{ width: 150 }} label="Label" value={label} onChangeText={setLabel} placeholder="Holidays" maxLength={40} />
              <Button small kind="teal" title="Set price" loading={busy} disabled={!num(rate)}
                onPress={() => act(() => addRate(stayId, range.checkIn!, range.checkOut!, num(rate)!, label.trim()))} />
            </Row>
          </View>
        ) : null}
        {err ? <Notice tone="error">{err}</Notice> : null}

        <T v="label">Blocked</T>
        <Status empty={!blocks.loading && !blocks.data?.length} emptyText="Nothing blocked." />
        {blocks.data?.map((b) => {
          const [a, z] = parseRange(b.during);
          return (
            <Row key={b.id} justify="space-between">
              <T v="small">{fmtRange(a, z)}{b.note ? ` · ${b.note}` : ''}</T>
              <Button small kind="ghost" title="Unblock" onPress={() => act(() => setBookingStatus(b.id, 'cancelled'))} />
            </Row>
          );
        })}

        <T v="label">Seasonal prices</T>
        <Status empty={!rates.loading && !rates.data?.length} emptyText="No seasonal prices." />
        {rates.data?.map((r) => {
          const [a, z] = parseRange(r.during);
          return (
            <Row key={r.id} justify="space-between">
              <T v="small">{fmtRange(a, z)} · {php(r.nightly_php)}/night{r.label ? ` · ${r.label}` : ''}</T>
              <Button small kind="ghost" title="Remove" onPress={() => act(() => deleteRate(r.id))} />
            </Row>
          );
        })}
      </Card>
    </Section>
  );
}
