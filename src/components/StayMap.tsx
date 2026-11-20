// Phones: a placeholder until the native map lands (phase 8 uses react-native-maps).
// Opens the location in the phone's maps app instead.
import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, View } from 'react-native';
import { C } from '../theme';
import { T } from './ui';
import type { StayMapProps } from './StayMap.types';

export type { StayMapProps } from './StayMap.types';

export function StayMap({ stays = [], pinAt, height = 200 }: StayMapProps) {
  const at = pinAt ?? (stays[0] ? { lat: stays[0].lat, lng: stays[0].lng } : null);
  return (
    <Pressable
      disabled={!at}
      onPress={() => at && Linking.openURL(`geo:${at.lat},${at.lng}?q=${at.lat},${at.lng}`)}
      style={{ height: Math.min(height, 200), borderRadius: 16, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 6 }}
    >
      <Ionicons name="map-outline" size={28} color={C.muted} />
      <View style={{ alignItems: 'center' }}>
        <T v="small" color={C.muted}>{stays.length ? `${stays.length} stays on the map` : 'Location'}</T>
        {at ? <T v="small" color={C.primaryText}>Open in Maps</T> : null}
      </View>
    </Pressable>
  );
}
