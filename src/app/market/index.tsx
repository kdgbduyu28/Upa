import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking, View } from 'react-native';
import { Bars, BandChart } from '../../components/Chart';
import { Button, Card, Chip, Notice, Page, Pill, Row, Section, Segmented, Stat, Status, T } from '../../components/ui';
import {
  grossYield, lastScrape, marketAreas, marketCities, marketCompare, marketSnapshot, marketTrend, priceIndex, stayVsLease,
  type MarketKind, type Offer,
} from '../../lib/api';
import { ago, fmtMonth, pct, php, phpShort } from '../../lib/format';
import { useAsync, useLayout } from '../../lib/hooks';
import { C } from '../../theme';

const KINDS: { value: MarketKind; label: string }[] = [
  { value: 'condo', label: 'Condo' }, { value: 'house', label: 'House' },
  { value: 'apartment', label: 'Apartment' }, { value: 'townhouse', label: 'Townhouse' },
];
const BEDS = [
  { value: -1, label: 'Any' }, { value: 0, label: 'Studio' }, { value: 1, label: '1 BR' },
  { value: 2, label: '2 BR' }, { value: 3, label: '3+ BR' },
];

export default function Market() {
  const { desktop } = useLayout();
  const params = useLocalSearchParams<{ city?: string; offer?: Offer; kind?: MarketKind; beds?: string }>();
  const city = params.city ?? 'makati';
  const offer: Offer = params.offer === 'sale' ? 'sale' : 'rent';
  const kind: MarketKind = (KINDS.find((k) => k.value === params.kind)?.value ?? 'condo');
  const beds = params.beds != null ? Number(params.beds) : -1;
  const set = (p: Record<string, string | number>) => router.setParams(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])));

  const cities = useAsync(marketCities, []);
  const snap = useAsync(() => marketSnapshot(city, offer, kind, beds), [city, offer, kind, beds]);
  const trend = useAsync(() => marketTrend(city, offer, kind, beds, 12), [city, offer, kind, beds]);
  const compare = useAsync(() => marketCompare(offer, kind, beds), [offer, kind, beds]);
  const areas = useAsync(() => marketAreas(city, offer, kind, beds), [city, offer, kind, beds]);
  const yld = useAsync(() => grossYield(city, kind, beds), [city, kind, beds]);
  const svl = useAsync(() => stayVsLease(city), [city]);
  const bsp = useAsync(priceIndex, []);
  const scrape = useAsync(lastScrape, []);

  const cityName = cities.data?.find((c) => c.slug === city)?.name ?? city;
  const unit = offer === 'rent' ? '/mo' : '';
  const s = snap.data;

  const pickers = (
    <Card style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <T v="label">City</T>
        <Row gap={6} wrap>
          {(cities.data ?? []).map((c) => (
            <Chip key={c.slug} label={c.name} on={c.slug === city} onPress={() => set({ city: c.slug })} />
          ))}
        </Row>
      </View>
      <Row gap={16} wrap>
        <View style={{ gap: 6 }}>
          <T v="label">Looking to</T>
          <Segmented value={offer} onChange={(v) => set({ offer: v })} options={[{ value: 'rent', label: 'Rent' }, { value: 'sale', label: 'Buy' }]} />
        </View>
        <View style={{ gap: 6 }}>
          <T v="label">Type</T>
          <Segmented value={kind} onChange={(v) => set({ kind: v })} options={offer === 'sale' ? KINDS.slice(0, 2) : KINDS} />
        </View>
        <View style={{ gap: 6 }}>
          <T v="label">Bedrooms</T>
          <Segmented value={beds} onChange={(v) => set({ beds: v })} options={BEDS} />
        </View>
      </Row>
    </Card>
  );

  return (
    <Page>
      <Stack.Screen options={{ title: `${cityName} ${kind} ${offer === 'rent' ? 'rent' : 'prices'} · Merkado · Upa` }} />
      <View style={{ gap: 4 }}>
        <T v="h1">Merkado</T>
        <T color={C.muted}>
          Asking prices from public listings on Dot Property, collected daily
          {scrape.data ? ` (last run ${ago(scrape.data.finished_at)}, ${scrape.data.seen.toLocaleString()} listings seen)` : ''}.
          Reposts of the same unit are counted once.
        </T>
      </View>
      <View style={{ marginTop: 16 }}>{pickers}</View>

      <Section title={`${kind[0].toUpperCase()}${kind.slice(1)}s for ${offer === 'rent' ? 'rent' : 'sale'} in ${cityName}`}
        sub={s ? `${fmtMonth(s.month)} · ${s.n} listings` : undefined}>
        <Status loading={snap.loading} error={snap.error} onRetry={snap.reload}
          empty={!snap.loading && !s} emptyText="Not enough listings for this combination yet. Try another type or bedroom count." />
        {s ? (
          <Card style={{ gap: 16 }}>
            <Row gap={16} wrap align="flex-start">
              <Stat label={`Median ${offer === 'rent' ? 'rent' : 'price'}`} value={`${php(s.median)}${unit}`}
                sub={s.change_pct != null ? `${pct(s.change_pct)} vs last month` : 'First month of data'}
                tone={s.change_pct == null ? 'muted' : s.change_pct > 0 ? 'bad' : 'good'} />
              <Stat label="Middle half of listings" value={`${phpShort(s.p25)} – ${phpShort(s.p75)}`} sub="25th to 75th percentile" />
              <Stat label="Per square metre" value={s.median_per_sqm ? `${php(s.median_per_sqm)}${unit}` : '—'}
                sub={s.avg_sqm ? `Average size ${Math.round(Number(s.avg_sqm))} m²` : undefined} />
            </Row>
            <Row gap={8} wrap>
              <Button small kind="secondary" icon="open-outline" title="See these listings on Dot Property" onPress={() => Linking.openURL(s.source_url)} />
              {offer === 'rent' ? <Button small kind="teal" icon="pricetag-outline" title="Check a rent" onPress={() => router.push(`/market/check?city=${city}&kind=${kind}&beds=${Math.max(beds, 1)}`)} /> : null}
            </Row>
          </Card>
        ) : null}
      </Section>

      <View style={{ flexDirection: desktop ? 'row' : 'column', gap: desktop ? 24 : 0, alignItems: 'flex-start' }}>
        <View style={{ flex: desktop ? 3 : undefined, width: desktop ? undefined : '100%' }}>
          <Section title="Last 12 months" sub="Median, with the middle half of listings shaded">
            <Status loading={trend.loading} error={trend.error} empty={!trend.loading && !trend.data?.length}
              emptyText="The trend fills in as the scraper runs day after day." />
            {trend.data?.length ? (
              <Card>
                <BandChart points={trend.data} />
                {trend.data.length < 3 ? <T v="small" color={C.muted}>Collection started recently, so there are only {trend.data.length} month(s) so far.</T> : null}
              </Card>
            ) : null}
          </Section>

          <Section title={`Neighbourhoods in ${cityName}`} sub={`Median ${offer === 'rent' ? 'monthly rent' : 'price'} of active listings, areas with at least 5`}>
            <Status loading={areas.loading} error={areas.error} empty={!areas.loading && !areas.data?.length}
              emptyText="Not enough listings per neighbourhood yet for this combination." />
            {areas.data?.length ? (
              <Card>
                <Bars rows={areas.data.slice(0, 12).map((r) => ({
                  key: r.area, label: r.area, value: Number(r.median),
                  sub: `${r.n} · ${r.vs_city_pct != null ? `${r.vs_city_pct > 0 ? '+' : ''}${Math.round(Number(r.vs_city_pct))}%` : ''}`,
                }))} />
              </Card>
            ) : null}
          </Section>

          <Section title="Compared with other cities" sub={`Median ${offer === 'rent' ? 'monthly rent' : 'price'}, latest month, at least 5 listings`}>
            <Status loading={compare.loading} error={compare.error} empty={!compare.loading && !compare.data?.length} />
            {compare.data?.length ? (
              <Card>
                <Bars highlight={city} onPress={(k) => set({ city: k })}
                  rows={compare.data.map((r) => ({ key: r.city_slug, label: `${r.rank}. ${r.city_name}`, value: Number(r.median), sub: `${r.n}` }))} />
              </Card>
            ) : null}
          </Section>
        </View>

        <View style={{ flex: desktop ? 2 : undefined, width: desktop ? undefined : '100%' }}>
          <Section title="Rent or buy?" sub="Gross rental yield from median prices per m²">
            {yld.data ? (
              <Card style={{ gap: 8 }}>
                <Stat label="Gross yield" value={`${Number(yld.data.yield_pct).toFixed(1)}%`} sub="12 × rent per m² ÷ price per m², before dues and taxes" />
                <T v="small" color={C.muted}>Rent {php(yld.data.rent_per_sqm)}/m² a month · price {php(yld.data.sale_per_sqm)}/m²</T>
              </Card>
            ) : (
              <Status loading={yld.loading} error={yld.error} empty emptyText="Needs at least 5 rent and 5 sale listings of this type." />
            )}
          </Section>

          <Section title="Short stay or long lease?" sub="A typical short-stay listing's month vs a 1BR condo lease">
            {svl.data ? (
              <Card style={{ gap: 10 }}>
                <Row gap={16} wrap>
                  <Stat label="Short stay, per month" value={php(svl.data.short_stay_monthly)}
                    sub={`${php(svl.data.adr_php)}/night × ${Math.round(Number(svl.data.occupancy) * 100)}% occupancy`} />
                  <Stat label="1BR lease" value={svl.data.lease_median ? php(svl.data.lease_median) : '—'} sub="Median monthly rent" />
                </Row>
                <T v="small" color={C.muted}>
                  Short-stay figures: AirDNA, {fmtMonth(svl.data.month)}
                  {svl.data.active_listings ? `, ${svl.data.active_listings.toLocaleString()} active listings` : ''}. Before platform fees, cleaning and furnishing.
                </T>
              </Card>
            ) : (
              <Status loading={svl.loading} error={svl.error} empty emptyText="No short-stay figures for this city yet." />
            )}
          </Section>

          <Section title="Nationwide price index" sub="BSP Residential Property Price Index, year on year">
            {bsp.data?.length ? (
              <Card style={{ gap: 8 }}>
                {latestIndex(bsp.data).map((r) => (
                  <Row key={`${r.segment}-${r.area}`} justify="space-between">
                    <T v="small">{r.segment === 'all' ? 'All homes' : r.segment === 'condo' ? 'Condos' : 'Houses'} · {r.area === 'NCR' ? 'Metro Manila' : r.area === 'AONCR' ? 'Outside Metro Manila' : 'Philippines'}</T>
                    {r.yoy != null ? <Pill tone={r.yoy >= 0 ? 'primary' : 'teal'} label={pct(r.yoy)} /> : <T v="small" color={C.muted}>—</T>}
                  </Row>
                ))}
                <T v="small" color={C.muted}>{fmtMonth(latestIndex(bsp.data)[0].quarter)} quarter. Source: Bangko Sentral ng Pilipinas.</T>
              </Card>
            ) : (
              <Status loading={bsp.loading} error={bsp.error} empty emptyText="BSP figures not loaded yet." />
            )}
          </Section>
        </View>
      </View>

      <View style={{ marginTop: 24 }}>
        <Notice tone="info" title="About these numbers">
          These are asking prices, not what people end up paying. Each day the newest listings are read along with a
          rotating set of older pages, so large markets are estimated from a sample of their most recent 500 listings.
        </Notice>
      </View>
      <Row style={{ marginTop: 12 }}>
        <Button small kind="ghost" icon="information-circle-outline" title="How the data is collected" onPress={() => router.push('/about')} />
        <Ionicons name="code-slash" size={14} color={C.muted} />
        <Button small kind="ghost" title="See the SQL" onPress={() => router.push('/under-the-hood#market')} />
      </Row>
    </Page>
  );
}

function latestIndex<T extends { quarter: string }>(rows: T[]): T[] {
  const last = rows.reduce((m, r) => (r.quarter > m ? r.quarter : m), '');
  return rows.filter((r) => r.quarter === last);
}
