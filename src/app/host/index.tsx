import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StayArt } from '../../components/StayArt';
import { Button, Card, Notice, Page, Pill, Row, Section, Stat, Status, T } from '../../components/ui';
import { myBookings, myStays, parseRange, setBookingStatus, type BookingWithStay } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { daysBetween, fmtRange, php, today } from '../../lib/format';
import { useAsync, useLayout } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { C } from '../../theme';

export default function HostDashboard() {
  const { desktop, wide } = useLayout();
  const { session, profile, ready } = useAuth();
  const me = session?.user.id;
  const stays = useAsync(() => (me ? myStays(me) : Promise.resolve([])), [me]);
  const bookings = useAsync(() => (me ? myBookings() : Promise.resolve([])), [me]);
  const [live, setLive] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !session) router.replace('/sign-in?next=/host');
  }, [ready, session]);

  // Realtime: a new request or a guest cancelling shows up without a refresh.
  // Postgres sends each change; Realtime checks it against the bookings
  // select policy, so a host only hears about their own stays.
  useEffect(() => {
    if (!supabase || !me) return;
    const channel = supabase
      .channel(`host-${me}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload) => {
        if (payload.eventType === 'INSERT' && (payload.new as { kind?: string }).kind === 'booking') setFlash('New booking request just came in.');
        bookings.reload();
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => {
      supabase?.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const myStayIds = new Set((stays.data ?? []).map((s) => s.id));
  const onMine = (bookings.data ?? []).filter((b) => myStayIds.has(b.stay_id) && b.kind === 'booking');
  const t = today();
  const pending = onMine.filter((b) => b.status === 'pending' && parseRange(b.during)[0] >= t);
  const upcoming = onMine.filter((b) => b.status === 'confirmed' && parseRange(b.during)[1] > t);
  const monthStart = t.slice(0, 8) + '01';
  const earned = onMine
    .filter((b) => (b.status === 'confirmed' || b.status === 'completed') && parseRange(b.during)[0] >= monthStart && parseRange(b.during)[0].slice(0, 7) === t.slice(0, 7))
    .reduce((sum, b) => sum + Number(b.total_php), 0);
  // Nights booked inside the window [today, today + 30).
  const t30 = addDaysLocal(t, 30);
  const booked30 = onMine
    .filter((b) => b.status === 'confirmed' || b.status === 'completed')
    .reduce((n, b) => {
      const [a, z] = parseRange(b.during);
      return n + Math.max(0, daysBetween(a > t ? a : t, z < t30 ? z : t30));
    }, 0);
  const occupancy = stays.data?.length ? Math.round((booked30 / (30 * stays.data.length)) * 100) : 0;

  if (ready && profile && !profile.is_host) {
    return (
      <Page max={560}>
        <Notice tone="info" title="You're not hosting yet">Turn on hosting from your account to list a place.</Notice>
        <Row style={{ marginTop: 12 }}><Button title="Go to account" onPress={() => router.push('/account')} /></Row>
      </Page>
    );
  }

  return (
    <Page>
      <Stack.Screen options={{ title: 'Hosting · Upa' }} />
      <Row justify="space-between" wrap gap={12}>
        <View>
          <T v="h1">Hosting</T>
          <Row gap={6}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: live ? '#2E9E4F' : C.muted }} />
            <T v="small" color={C.muted}>{live ? 'Live: new bookings appear here instantly' : 'Connecting to live updates…'}</T>
          </Row>
        </View>
        <Button icon="add" title="List a new place" onPress={() => router.push('/host/stays/new')} />
      </Row>
      {flash ? <View style={{ marginTop: 12 }}><Notice tone="good" action={<Button small kind="ghost" title="Dismiss" onPress={() => setFlash(null)} />}>{flash}</Notice></View> : null}

      <Card style={{ marginTop: 16 }}>
        <Row gap={16} wrap>
          <Stat label="Requests waiting" value={String(pending.length)} />
          <Stat label="Upcoming stays" value={String(upcoming.length)} />
          <Stat label="Booked this month" value={php(earned)} />
          <Stat label="Next 30 days booked" value={`${occupancy}%`} sub={`${booked30} nights across ${stays.data?.length ?? 0} places`} />
        </Row>
      </Card>

      <View style={{ flexDirection: desktop ? 'row' : 'column', gap: desktop ? 24 : 0, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, width: desktop ? undefined : '100%' }}>
          <Section title="Requests" sub="Dates stay held until you answer.">
            <Status loading={bookings.loading} error={bookings.error} empty={!bookings.loading && !pending.length} emptyText="No requests right now." />
            {pending.map((b) => <Request key={b.id} b={b} onDone={bookings.reload} />)}
          </Section>
          <Section title="Upcoming">
            <Status empty={!bookings.loading && !upcoming.length} emptyText="No confirmed stays coming up." />
            {upcoming.slice(0, 12).map((b) => {
              const [a, z] = parseRange(b.during);
              return (
                <Card key={b.id} pad={12} style={{ gap: 4 }}>
                  <Row justify="space-between" wrap>
                    <T v="label">{b.guest?.display_name ?? 'Guest'} · {fmtRange(a, z)}</T>
                    <T v="small" style={{ fontWeight: '700' }}>{php(b.total_php)}</T>
                  </Row>
                  <T v="small" color={C.muted} numberOfLines={1}>{b.stay.title}</T>
                </Card>
              );
            })}
          </Section>
        </View>
        <View style={{ flex: 1, width: desktop ? undefined : '100%' }}>
          <Section title="Your places">
            <Status loading={stays.loading} error={stays.error} empty={!stays.loading && !stays.data?.length} emptyText="You haven't listed a place yet." />
            {stays.data?.map((s) => (
              <Card key={s.id} pad={12} onPress={() => router.push(`/host/stays/${s.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <StayArt seed={s.art_seed} kind={s.kind} photo={s.photos[0]} style={{ width: wide ? 120 : 88 }} rounded={10} />
                <View style={{ flex: 1, gap: 3 }}>
                  <T v="label" numberOfLines={2}>{s.title}</T>
                  <T v="small" color={C.muted}>{s.city.name} · {php(s.nightly_php)}/night</T>
                  <Row gap={6}>
                    {s.published ? <Pill tone="good" label="Listed" /> : <Pill tone="warn" label="Draft" />}
                    {s.rating_count ? <Pill icon="star" label={`${Number(s.rating_avg).toFixed(1)} (${s.rating_count})`} /> : null}
                  </Row>
                </View>
              </Card>
            ))}
          </Section>
        </View>
      </View>
    </Page>
  );
}

function addDaysLocal(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function Request({ b, onDone }: { b: BookingWithStay; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [a, z] = parseRange(b.during);
  const act = async (status: 'confirmed' | 'cancelled') => {
    setBusy(status);
    setErr(null);
    try {
      await setBookingStatus(b.id, status);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card style={{ gap: 8 }}>
      <Row justify="space-between" wrap>
        <T v="label">{b.guest?.display_name ?? 'Guest'} · {b.guests} guest{b.guests > 1 ? 's' : ''}</T>
        <T v="label">{php(b.total_php)}</T>
      </Row>
      <T v="small" color={C.muted}>{fmtRange(a, z)} · {daysBetween(a, z)} nights · {b.stay.title}</T>
      {b.note ? <T v="small">“{b.note}”</T> : null}
      <Row gap={8}>
        <Button small title="Confirm" icon="checkmark" loading={busy === 'confirmed'} onPress={() => act('confirmed')} />
        <Button small kind="secondary" title="Decline" loading={busy === 'cancelled'} onPress={() => act('cancelled')} />
      </Row>
      {err ? <Notice tone="error">{err}</Notice> : null}
    </Card>
  );
}
