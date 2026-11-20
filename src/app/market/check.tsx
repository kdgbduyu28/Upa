import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { RangeMarker } from '../../components/Chart';
import { Button, Card, Chip, Field, Notice, Page, Pill, Row, Segmented, Stat, Status, T } from '../../components/ui';
import { marketCities, rentCheck, type MarketKind, type RentCheck } from '../../lib/api';
import { php } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import { C } from '../../theme';

const TONE: Record<string, 'good' | 'teal' | 'warn' | 'bad' | 'neutral'> = {
  'Cheaper than most': 'good', 'About typical': 'teal', 'On the high side': 'warn', 'Well above typical': 'bad',
};

export default function RentCheckScreen() {
  const p = useLocalSearchParams<{ city?: string; kind?: MarketKind; beds?: string }>();
  const cities = useAsync(marketCities, []);
  const [city, setCity] = useState(p.city ?? 'makati');
  const [kind, setKind] = useState<MarketKind>(p.kind ?? 'condo');
  const [beds, setBeds] = useState(p.beds != null ? Number(p.beds) : 1);
  const [sqm, setSqm] = useState('');
  const [price, setPrice] = useState('');
  const [result, setResult] = useState<RentCheck | null>(null);
  const [checked, setChecked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const amount = Number(price.replace(/[^\d.]/g, ''));
  const size = sqm ? Number(sqm.replace(/[^\d.]/g, '')) : null;
  const valid = amount >= 1000 && amount <= 5_000_000;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await rentCheck(city, kind, beds, size && size >= 8 ? size : null, amount));
      setChecked(amount);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page max={760}>
      <Stack.Screen options={{ title: 'Is this rent fair? · Upa' }} />
      <T v="h1">Is this rent fair?</T>
      <T color={C.muted} style={{ marginTop: 4 }}>
        We rank your monthly rent against active listings of the same type, city and bedroom count, sized within 30% of yours.
      </T>

      <Card style={{ gap: 16, marginTop: 20 }}>
        <View style={{ gap: 6 }}>
          <T v="label">City</T>
          <Row gap={6} wrap>
            {(cities.data ?? []).map((c) => <Chip key={c.slug} label={c.name} on={c.slug === city} onPress={() => setCity(c.slug)} />)}
          </Row>
          <Status loading={cities.loading} error={cities.error} />
        </View>
        <Row gap={16} wrap>
          <View style={{ gap: 6 }}>
            <T v="label">Type</T>
            <Segmented value={kind} onChange={setKind} options={[
              { value: 'condo', label: 'Condo' }, { value: 'apartment', label: 'Apartment' },
              { value: 'house', label: 'House' }, { value: 'townhouse', label: 'Townhouse' },
            ]} />
          </View>
          <View style={{ gap: 6 }}>
            <T v="label">Bedrooms</T>
            <Segmented value={beds} onChange={setBeds} options={[
              { value: 0, label: 'Studio' }, { value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3+' },
            ]} />
          </View>
        </Row>
        <Row gap={12} wrap align="flex-start">
          <Field style={{ flex: 1, minWidth: 180 }} label="Monthly rent (₱)" value={price} onChangeText={setPrice}
            keyboardType="numeric" placeholder="35,000" inputMode="numeric" onSubmitEditing={() => valid && run()}
            error={price && !valid ? 'Enter a monthly rent between ₱1,000 and ₱5,000,000' : null} />
          <Field style={{ flex: 1, minWidth: 140 }} label="Floor area (m², optional)" value={sqm} onChangeText={setSqm}
            keyboardType="numeric" placeholder="36" inputMode="decimal" />
        </Row>
        <Button title="Check" icon="pricetag-outline" kind="teal" onPress={run} disabled={!valid} loading={busy} />
      </Card>

      <View style={{ marginTop: 20, gap: 12 }}>
        {error ? <Status error={error} /> : null}
        {result && checked != null ? (
          result.comparables < 5 ? (
            <Notice tone="warn" title={result.verdict}>
              Only {result.comparables} active listing{result.comparables === 1 ? '' : 's'} match. Try a nearby city or another bedroom count.
            </Notice>
          ) : (
            <Card style={{ gap: 14 }}>
              <Row justify="space-between" wrap>
                <T v="h2">{result.verdict}</T>
                <Pill tone={TONE[result.verdict] ?? 'neutral'} label={`Higher than ${result.percentile}% of listings`} />
              </Row>
              <RangeMarker p25={Number(result.p25)} median={Number(result.median)} p75={Number(result.p75)} value={checked} />
              <Row gap={16} wrap>
                <Stat label="Median for places like yours" value={php(result.median)} sub={`${result.comparables} comparable listings`} />
                {result.your_per_sqm ? (
                  <Stat label="Your rent per m²" value={php(result.your_per_sqm)}
                    sub={result.median_per_sqm ? `Median ${php(result.median_per_sqm)}/m²` : undefined} />
                ) : null}
              </Row>
              {result.widened ? <T v="small" color={C.muted}>Few listings were close to your size, so all sizes were compared.</T> : null}
              <T v="small" color={C.muted}>
                Compared with asking rents on active listings. Asking rents are often a little above what is finally agreed.
              </T>
              <Button small kind="ghost" title="See the market for this city" icon="arrow-forward"
                onPress={() => router.push(`/market?city=${city}&kind=${kind}&beds=${beds}`)} />
            </Card>
          )
        ) : null}
      </View>
    </Page>
  );
}
