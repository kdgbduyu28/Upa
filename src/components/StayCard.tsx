import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { StayHit } from '../lib/api';
import { BEDS_LABEL, KIND_LABEL, distance, php } from '../lib/format';
import { C, themed } from '../theme';
import { StayArt } from './StayArt';
import { Row, Stars, T } from './ui';

export function StayCard({ stay, query, highlighted, onHover, compact }: {
  stay: StayHit; query?: string; highlighted?: boolean; onHover?: (id: number | null) => void; compact?: boolean;
}) {
  return (
    <Pressable
      onPress={() => router.push(`/stays/${stay.id}${query ? `?${query}` : ''}`)}
      onHoverIn={() => onHover?.(stay.id)}
      onHoverOut={() => onHover?.(null)}
      style={({ pressed }) => [s.card, compact && s.compact, highlighted && s.highlighted, pressed && { opacity: 0.85 }]}
     
      accessibilityLabel={`${stay.title}, ${php(stay.nightly_php)} a night`}
    >
      <StayArt seed={stay.art_seed} kind={stay.kind} photo={stay.photo} style={compact ? { width: 120 } : undefined} />
      <View style={{ gap: 3, flex: 1, paddingTop: compact ? 0 : 4 }}>
        <Row justify="space-between" align="flex-start">
          <T v="label" numberOfLines={1} style={{ flex: 1 }}>{stay.area ? `${stay.area}, ${stay.city_name}` : stay.city_name}</T>
          <Stars value={stay.rating_avg} count={stay.rating_count} />
        </Row>
        <T v="small" color={C.muted} numberOfLines={1}>{stay.title}</T>
        <T v="small" color={C.muted}>
          {KIND_LABEL[stay.kind]} · {BEDS_LABEL(stay.bedrooms)} · {stay.max_guests} guests
          {stay.distance_m != null ? ` · ${distance(stay.distance_m)}` : ''}
        </T>
        <Row gap={6} style={{ marginTop: 2 }}>
          <T v="label">{php(stay.nightly_php)}</T>
          <T v="small" color={C.muted}>night</T>
          {stay.instant_book ? <Ionicons name="flash" size={13} color={C.gold} accessibilityLabel="Instant book" /> : null}
        </Row>
      </View>
    </Pressable>
  );
}

const s = themed(() => ({
  card: { gap: 8, borderRadius: 16, padding: 4 },
  compact: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  highlighted: { backgroundColor: C.primarySoft },
}));
