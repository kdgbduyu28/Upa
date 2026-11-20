import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Calendar } from '../../components/Calendar';
import { StayCard } from '../../components/StayCard';
import { StayMap } from '../../components/StayMap';
import { Button, Chip, Page, Row, Segmented, Status, Stepper, T } from '../../components/ui';
import { cities as loadCities, searchStays, type SearchParams, type StayKind } from '../../lib/api';
import { amenityIcon, amenityLabel, FILTER_AMENITIES } from '../../lib/amenities';
import { fmtRange, KIND_LABEL, php } from '../../lib/format';
import { useAsync, useDebounced, useLayout } from '../../lib/hooks';
import { C, RADIUS, themed } from '../../theme';

type Bounds = NonNullable<SearchParams['bounds']>;
const PAGE = 24;
const PRICE_CAPS = [0, 2000, 3500, 5000, 8000];

export default function Stays() {
  const { desktop, wide } = useLayout();
  const p = useLocalSearchParams<{ q?: string; city?: string; in?: string; out?: string; guests?: string }>();
  const [q, setQ] = useState(p.q ?? '');
  const query = useDebounced(q, 350);
  const city = p.city ?? '';
  const checkIn = p.in ?? '';
  const checkOut = p.out ?? '';
  const guests = Number(p.guests ?? 1) || 1;
  const [kinds, setKinds] = useState<StayKind[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [maxPrice, setMaxPrice] = useState(0);
  const [sort, setSort] = useState<NonNullable<SearchParams['sort']>>('best');
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [areaOnly, setAreaOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [hover, setHover] = useState<number | null>(null);
  const [panel, setPanel] = useState<null | 'dates' | 'filters'>(null);
  const [showMap, setShowMap] = useState(false);

  const set = (patch: Record<string, string | number | null>) =>
    router.setParams(Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v == null || v === '' ? undefined : String(v)])) as never);

  const cityList = useAsync(loadCities, []);
  const search = useAsync(
    () => searchStays({
      q: query, city: city || undefined, checkIn: checkIn || undefined, checkOut: checkOut || undefined, guests,
      kinds, amenities, maxPrice: maxPrice || undefined, sort, limit,
      bounds: areaOnly && bounds ? bounds : undefined,
    }),
    [query, city, checkIn, checkOut, guests, kinds.join(), amenities.join(), maxPrice, sort, limit, areaOnly, areaOnly ? JSON.stringify(bounds) : ''],
  );
  const stays = search.data ?? [];
  const total = stays[0]?.total ?? 0;
  const carry = useMemo(() => [checkIn && `in=${checkIn}`, checkOut && `out=${checkOut}`, guests > 1 && `guests=${guests}`].filter(Boolean).join('&'), [checkIn, checkOut, guests]);
  const filterCount = kinds.length + amenities.length + (maxPrice ? 1 : 0);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const bar = (
    <View style={{ gap: 10 }}>
      <View style={s.searchBox}>
        <Ionicons name="search" size={18} color={C.muted} />
        <TextInput value={q} onChangeText={(t) => { setQ(t); setLimit(PAGE); }} placeholder="Search by place, area or what you need"
          placeholderTextColor={C.muted} style={s.searchInput} accessibilityLabel="Search" returnKeyType="search" />
        {q ? <Pressable onPress={() => setQ('')} accessibilityLabel="Clear search"><Ionicons name="close-circle" size={18} color={C.muted} /></Pressable> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip icon="calendar-outline" label={checkIn && checkOut ? fmtRange(checkIn, checkOut) : 'Any dates'} on={!!checkIn} onPress={() => setPanel('dates')} />
        <Chip icon="people-outline" label={`${guests} guest${guests > 1 ? 's' : ''}`} on={guests > 1} onPress={() => setPanel('dates')} />
        <Chip icon="options-outline" label={filterCount ? `Filters · ${filterCount}` : 'Filters'} on={filterCount > 0} onPress={() => setPanel('filters')} />
        <Chip label="All cities" on={!city} onPress={() => set({ city: null })} />
        {(cityList.data ?? []).map((c) => (
          <Chip key={c.slug} label={c.name} on={c.slug === city} onPress={() => { set({ city: c.slug === city ? null : c.slug }); setAreaOnly(false); setLimit(PAGE); }} />
        ))}
      </ScrollView>
    </View>
  );

  const list = (
    <View style={{ gap: 12 }}>
      <Row justify="space-between" wrap>
        <T v="small" color={C.muted}>
          {search.loading && !stays.length ? 'Searching…' : `${total.toLocaleString()} stay${total === 1 ? '' : 's'}${areaOnly ? ' in this map area' : ''}`}
        </T>
        <Segmented value={sort} onChange={(v) => { setSort(v); setLimit(PAGE); }} options={[
          { value: 'best', label: q ? 'Best match' : 'Popular' }, { value: 'price', label: 'Price ↑' },
          { value: 'price_desc', label: 'Price ↓' }, { value: 'rating', label: 'Rating' },
        ]} />
      </Row>
      <Status loading={search.loading && !stays.length} error={search.error} onRetry={search.reload}
        empty={!search.loading && !stays.length} emptyText="No stays match. Try fewer filters, other dates or a wider area." />
      <View style={s.grid}>
        {stays.map((st) => (
          <View key={st.id} style={{ flexBasis: wide ? '47%' : '100%', flexGrow: 1 }}>
            <StayCard stay={st} query={carry} highlighted={hover === st.id} onHover={setHover} />
          </View>
        ))}
      </View>
      {stays.length < total ? (
        <Button kind="secondary" title={`Show more (${total - stays.length} left)`} onPress={() => setLimit((l) => l + PAGE)} loading={search.loading} />
      ) : null}
    </View>
  );

  const map = (
    <View style={{ gap: 8 }}>
      <StayMap stays={stays} selectedId={hover} onSelect={(id) => router.push(`/stays/${id}${carry ? `?${carry}` : ''}`)}
        onBounds={setBounds} height={desktop ? 640 : 420} fit={!areaOnly} />
      <Row gap={8}>
        <Button small kind={areaOnly ? 'primary' : 'secondary'} icon="scan-outline"
          title={areaOnly ? 'Searching this map area' : 'Search this map area'} onPress={() => { setAreaOnly(!areaOnly); setLimit(PAGE); }} />
      </Row>
    </View>
  );

  return (
    <Page pad={false}>
      <Stack.Screen options={{ title: `${city ? `Stays in ${cityList.data?.find((c) => c.slug === city)?.name ?? city}` : 'Stays'} · Upa` }} />
      <View style={{ padding: 16, gap: 16 }}>
        {bar}
        {desktop ? (
          <Row align="flex-start" gap={24}>
            <View style={{ flex: 1.15 }}>{list}</View>
            <View style={{ flex: 1, position: 'sticky' as never, top: 16 }}>{map}</View>
          </Row>
        ) : (
          <>
            <Segmented value={showMap ? 'map' : 'list'} onChange={(v) => setShowMap(v === 'map')} options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]} />
            {showMap ? map : list}
          </>
        )}
      </View>

      <Modal visible={panel != null} transparent animationType="slide" onRequestClose={() => setPanel(null)}>
        <Pressable style={s.scrim} onPress={() => setPanel(null)}>
          <Pressable style={[s.sheet, wide && s.sheetWide]} onPress={(e) => e.stopPropagation()}>
            <ScrollView contentContainerStyle={{ gap: 16, padding: 20 }}>
              {panel === 'dates' ? (
                <>
                  <T v="h2">When and who</T>
                  <Calendar months={wide ? 2 : 1} value={{ checkIn: checkIn || null, checkOut: checkOut || null }}
                    onChange={(r) => set({ in: r.checkIn, out: r.checkOut })} />
                  <Stepper label="Guests" value={guests} min={1} max={16} onChange={(g) => set({ guests: g })} />
                  <Row gap={8}>
                    <Button kind="secondary" title="Clear dates" onPress={() => set({ in: null, out: null })} />
                    <Button title="Done" onPress={() => setPanel(null)} style={{ flex: 1 }} />
                  </Row>
                </>
              ) : (
                <>
                  <T v="h2">Filters</T>
                  <View style={{ gap: 8 }}>
                    <T v="label">Type of place</T>
                    <Row gap={6} wrap>
                      {(Object.keys(KIND_LABEL) as StayKind[]).map((k) => (
                        <Chip key={k} label={KIND_LABEL[k]} on={kinds.includes(k)} onPress={() => setKinds(toggle(kinds, k))} />
                      ))}
                    </Row>
                  </View>
                  <View style={{ gap: 8 }}>
                    <T v="label">Price per night</T>
                    <Row gap={6} wrap>
                      {PRICE_CAPS.map((c) => (
                        <Chip key={c} label={c ? `Up to ${php(c)}` : 'Any price'} on={maxPrice === c} onPress={() => setMaxPrice(c)} />
                      ))}
                    </Row>
                  </View>
                  <View style={{ gap: 8 }}>
                    <T v="label">Must have</T>
                    <Row gap={6} wrap>
                      {FILTER_AMENITIES.map((a) => (
                        <Chip key={a} icon={amenityIcon(a)} label={amenityLabel(a)} on={amenities.includes(a)} onPress={() => setAmenities(toggle(amenities, a))} />
                      ))}
                    </Row>
                  </View>
                  <Row gap={8}>
                    <Button kind="secondary" title="Clear all" onPress={() => { setKinds([]); setAmenities([]); setMaxPrice(0); }} />
                    <Button title={search.loading ? 'Searching…' : `Show ${total} stays`} onPress={() => setPanel(null)} style={{ flex: 1 }} />
                  </Row>
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Page>
  );
}

const s = themed(() => ({
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 16, minHeight: 48 },
  searchInput: { flex: 1, fontSize: 16, color: C.text, minWidth: 0, paddingVertical: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  scrim: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', width: '100%' },
  sheetWide: { maxWidth: 760, borderRadius: 24, marginBottom: 40 },
}));
