import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { StayArt } from '../components/StayArt';
import { Button, Card, Field, Notice, Page, Pill, Row, Section, Status, T } from '../components/ui';
import { addReview, myBookings, parseRange, setBookingStatus, type BookingWithStay } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtRange, php, today } from '../lib/format';
import { useAsync, useLayout } from '../lib/hooks';
import { C } from '../theme';

const STATUS_PILL = {
  pending: { tone: 'warn', label: 'Waiting for host' },
  confirmed: { tone: 'good', label: 'Confirmed' },
  completed: { tone: 'neutral', label: 'Completed' },
  cancelled: { tone: 'bad', label: 'Cancelled' },
} as const;

export default function Trips() {
  const { booked } = useLocalSearchParams<{ booked?: string }>();
  const { session, ready } = useAuth();
  const me = session?.user.id;
  const data = useAsync(() => (me ? myBookings() : Promise.resolve([])), [me]);

  useEffect(() => {
    if (ready && !session) router.replace('/sign-in?next=/trips');
  }, [ready, session]);

  const t = today();
  const mine = (data.data ?? []).filter((b) => b.guest_id === me && b.kind === 'booking');
  const upcoming = mine.filter((b) => (b.status === 'pending' || b.status === 'confirmed') && parseRange(b.during)[1] > t);
  const past = mine.filter((b) => b.status === 'completed').reverse();
  const cancelled = mine.filter((b) => b.status === 'cancelled').reverse();
  const just = booked ? mine.find((b) => b.id === Number(booked)) : null;

  return (
    <Page max={900}>
      <Stack.Screen options={{ title: 'Trips · Upa' }} />
      <T v="h1">Trips</T>
      {just ? (
        <View style={{ marginTop: 16 }}>
          <Notice tone="good" title={just.status === 'confirmed' ? "You're booked!" : 'Request sent'}>
            {just.stay.title}, {fmtRange(...parseRange(just.during))}.{' '}
            {just.status === 'confirmed' ? 'The host has your dates.' : 'The host will confirm or decline soon.'}
          </Notice>
        </View>
      ) : null}
      <Status loading={data.loading} error={data.error} onRetry={data.reload} />

      <Section title="Upcoming">
        {!data.loading && !upcoming.length ? (
          <Card style={{ gap: 10, alignItems: 'flex-start' }}>
            <T color={C.muted}>No trips planned yet.</T>
            <Button title="Find a stay" icon="search" onPress={() => router.push('/stays')} />
          </Card>
        ) : null}
        {upcoming.map((b) => <TripRow key={b.id} b={b} onChange={data.reload} />)}
      </Section>

      {past.length ? (
        <Section title="Past stays">
          {past.map((b) => <TripRow key={b.id} b={b} onChange={data.reload} reviewer={me} />)}
        </Section>
      ) : null}

      {cancelled.length ? (
        <Section title="Cancelled">
          {cancelled.map((b) => <TripRow key={b.id} b={b} onChange={data.reload} />)}
        </Section>
      ) : null}
    </Page>
  );
}

function TripRow({ b, onChange, reviewer }: { b: BookingWithStay; onChange: () => void; reviewer?: string }) {
  const { wide } = useLayout();
  const [from, to] = parseRange(b.during);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const canCancel = (b.status === 'pending' || b.status === 'confirmed') && from > today();
  const canReview = reviewer && b.status === 'completed' && !b.review;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <Pressable onPress={() => router.push(`/stays/${b.stay.id}`)} style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <StayArt seed={b.stay.art_seed} kind={b.stay.kind} photo={b.stay.photos?.[0]} style={{ width: wide ? 140 : 96 }} rounded={10} />
        <View style={{ flex: 1, gap: 4 }}>
          <T v="label" numberOfLines={2}>{b.stay.title}</T>
          <T v="small" color={C.muted}>{b.stay.city.name} · {fmtRange(from, to)} · {b.guests} guest{b.guests > 1 ? 's' : ''}</T>
          <Row gap={8} wrap>
            <Pill tone={STATUS_PILL[b.status].tone} label={STATUS_PILL[b.status].label} />
            <T v="small" style={{ fontWeight: '700' }}>{php(b.total_php)}</T>
            {b.review ? <Pill icon="star" label={`You rated ${b.review.rating}`} /> : null}
          </Row>
        </View>
      </Pressable>
      {canCancel ? (
        <Row>
          <Button small kind="danger" title={b.status === 'pending' ? 'Withdraw request' : 'Cancel booking'} loading={busy}
            onPress={() => act(() => setBookingStatus(b.id, 'cancelled'))} />
        </Row>
      ) : null}
      {canReview ? (
        <View style={{ gap: 8 }}>
          <T v="label">How was it?</T>
          <Row gap={4}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}>
                <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={26} color={C.gold} />
              </Pressable>
            ))}
          </Row>
          <Field label="Review (optional)" value={body} onChangeText={setBody} multiline maxLength={2000} />
          <Row><Button small title="Post review" disabled={!rating} loading={busy}
            onPress={() => act(() => addReview(b.id, b.stay_id, reviewer!, rating, body.trim()))} /></Row>
        </View>
      ) : null}
      {err ? <Notice tone="error">{err}</Notice> : null}
    </Card>
  );
}
