import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { StayCard } from '../components/StayCard';
import { Button, Card, Page, Pill, Row, Section, Status, T } from '../components/ui';
import { lastScrape, marketCompare, searchStays } from '../lib/api';
import { ago, php } from '../lib/format';
import { useAsync, useLayout } from '../lib/hooks';
import { C, RADIUS, themed } from '../theme';

const POSTGRES_FEATURES: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string }[] = [
  { icon: 'calendar-outline', title: 'No double bookings', body: 'An EXCLUDE constraint on date ranges: the database refuses overlapping nights, even from two guests at the same instant.' },
  { icon: 'lock-closed-outline', title: 'Row-level security', body: 'Guests see their trips, hosts see bookings on their stays. Enforced in Postgres, not in the app.' },
  { icon: 'location-outline', title: 'PostGIS', body: '"Within 2 km of here", sorted nearest first, with a GiST index on geography points.' },
  { icon: 'search-outline', title: 'Typo-proof search', body: 'Full-text search plus trigram similarity, so "makatii" and "Paranaque" still find what you meant.' },
  { icon: 'stats-chart-outline', title: 'Market statistics', body: 'Percentiles, window functions and a materialized view over thousands of scraped listings.' },
  { icon: 'time-outline', title: 'Jobs and history', body: 'pg_cron finishes stays and refreshes stats; price history is partitioned by month.' },
];

export default function Home() {
  const { wide, desktop } = useLayout();
  const [q, setQ] = useState('');
  const market = useAsync(() => marketCompare('rent', 'condo', 1), []);
  const featured = useAsync(() => searchStays({ sort: 'rating', limit: desktop ? 8 : 4 }), [desktop]);
  const scrape = useAsync(lastScrape, []);

  const go = () => router.push(q.trim() ? `/stays?q=${encodeURIComponent(q.trim())}` : '/stays');

  return (
    <Page>
      <Stack.Screen options={{ title: 'Upa — rent in the Philippines, built on Postgres' }} />
      <View style={[s.hero, wide && { padding: 40 }]}>
        <T v={wide ? 'display' : 'h1'} color={C.onColor} style={{ maxWidth: 640 }}>
          What rent really costs, and a place to stay tonight.
        </T>
        <T color={C.onColor} style={{ opacity: 0.9, maxWidth: 560, marginTop: 8 }}>
          Daily market figures from thousands of public listings, and stays you can book across 18 Philippine cities.
        </T>
        <View style={s.search}>
          <Ionicons name="search" size={18} color={C.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            onSubmitEditing={go}
            placeholder="Where to? Try “BGC pool” or “Baguio cabin”"
            placeholderTextColor={C.muted}
            style={s.searchInput}
            returnKeyType="search"
            accessibilityLabel="Search stays"
          />
          <Button title="Search" onPress={go} small />
        </View>
        <Row gap={8} wrap style={{ marginTop: 12 }}>
          {['Makati', 'Siargao surf', 'Tagaytay fireplace', 'Cebu IT Park', 'Boracay villa'].map((t) => (
            <Pressable key={t} onPress={() => router.push(`/stays?q=${encodeURIComponent(t)}`)} style={s.suggest}>
              <T v="small" color={C.onColor} style={{ fontWeight: '600' }}>{t}</T>
            </Pressable>
          ))}
        </Row>
      </View>

      <Section
        title="Merkado: 1-bedroom condo rent"
        sub={scrape.data ? `Median monthly asking rent · updated ${ago(scrape.data.finished_at)}` : 'Median monthly asking rent from public listings'}
        right={<Button small kind="ghost" title="All market data" icon="arrow-forward" onPress={() => router.push('/market')} />}
      >
        <Status loading={market.loading} error={market.error} empty={!market.loading && !market.data?.length}
          emptyText="The first scrape hasn't run yet. Market figures appear here after it does." onRetry={market.reload} />
        {market.data?.length ? (
          <Row gap={12} wrap align="stretch">
            {market.data.slice(0, desktop ? 6 : 4).map((c) => (
              <Card key={c.city_slug} onPress={() => router.push(`/market?city=${c.city_slug}&beds=1`)} style={s.tile}>
                <T v="small" color={C.muted}>{c.city_name}</T>
                <T v="h2" style={{ fontVariant: ['tabular-nums'] }}>{php(c.median)}</T>
                <Row gap={6}>
                  <Pill tone={c.vs_average_pct > 0 ? 'primary' : 'teal'} label={`${c.vs_average_pct > 0 ? '+' : ''}${Math.round(c.vs_average_pct)}% vs avg`} />
                  <T v="small" color={C.muted}>{c.n} listings</T>
                </Row>
              </Card>
            ))}
          </Row>
        ) : null}
        <Card style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'flex-start', gap: 12 }}>
          <Ionicons name="pricetag-outline" size={24} color={C.teal} />
          <View style={{ flex: 1 }}>
            <T v="h3">Is your rent fair?</T>
            <T v="small" color={C.muted}>Enter what you pay. We rank it against active listings like yours.</T>
          </View>
          <Button kind="teal" title="Check my rent" onPress={() => router.push('/market/check')} />
        </Card>
      </Section>

      <Section title="Guest favourites" sub="Highest-rated stays right now"
        right={<Button small kind="ghost" title="Browse stays" icon="arrow-forward" onPress={() => router.push('/stays')} />}>
        <Status loading={featured.loading} error={featured.error} empty={!featured.loading && !featured.data?.length} onRetry={featured.reload} />
        <View style={s.grid}>
          {featured.data?.map((st) => (
            <View key={st.id} style={[s.gridItem, { flexBasis: desktop ? '23%' : wide ? '47%' : '100%' }]}>
              <StayCard stay={st} />
            </View>
          ))}
        </View>
      </Section>

      <Section title="Built on PostgreSQL" sub="The database does the hard parts. See the SQL behind each one."
        right={<Button small kind="ghost" title="Under the hood" icon="code-slash" onPress={() => router.push('/under-the-hood')} />}>
        <View style={s.grid}>
          {POSTGRES_FEATURES.map((f) => (
            <Card key={f.title} style={[s.gridItem, { flexBasis: desktop ? '31%' : wide ? '47%' : '100%', gap: 6 }]} onPress={() => router.push('/under-the-hood')}>
              <Ionicons name={f.icon} size={22} color={C.primary} />
              <T v="h3">{f.title}</T>
              <T v="small" color={C.muted}>{f.body}</T>
            </Card>
          ))}
        </View>
      </Section>
    </Page>
  );
}

const s = themed(() => ({
  hero: { backgroundColor: C.primary, borderRadius: RADIUS.lg + 6, padding: 22, gap: 4 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: RADIUS.md,
    paddingLeft: 14, paddingRight: 6, paddingVertical: 6, marginTop: 20, maxWidth: 640,
  },
  searchInput: { flex: 1, fontSize: 16, color: C.text, paddingVertical: 8, minWidth: 0 },
  suggest: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: 'rgba(255,255,255,0.18)' },
  tile: { flexGrow: 1, flexBasis: 170, gap: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridItem: { flexGrow: 1 },
}));
