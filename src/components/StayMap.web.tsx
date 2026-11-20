// Web map: Leaflet + OpenStreetMap tiles, price pills as markers.
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { View } from 'react-native';
import { phpShort } from '../lib/format';
import { C } from '../theme';
import type { StayMapProps } from './StayMap.types';

export type { StayMapProps } from './StayMap.types';

function pill(label: string, on: boolean) {
  return L.divIcon({
    className: '',
    html: `<div style="transform:translate(-50%,-50%);display:inline-block;white-space:nowrap;padding:4px 9px;border-radius:999px;
      font:700 13px system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.25);
      background:${on ? C.text : C.card};color:${on ? C.bg : C.text};border:1px solid ${C.line}">${label}</div>`,
  });
}

function pin() {
  return L.divIcon({
    className: '',
    html: `<div style="transform:translate(-50%,-100%);width:22px;height:22px;border-radius:50% 50% 50% 0;rotate:-45deg;
      background:${C.primary};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
  });
}

function Bounds({ onBounds, fitTo }: { onBounds?: StayMapProps['onBounds']; fitTo?: [number, number][] }) {
  const map = useMap();
  const fitted = useRef('');
  useEffect(() => {
    const key = JSON.stringify(fitTo);
    if (!fitTo?.length || key === fitted.current) return;
    fitted.current = key;
    if (fitTo.length === 1) map.setView(fitTo[0], 15);
    else map.fitBounds(L.latLngBounds(fitTo), { padding: [32, 32], maxZoom: 15 });
  }, [fitTo, map]);
  useMapEvents({
    moveend: () => {
      const b = map.getBounds();
      onBounds?.({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
    },
  });
  return null;
}

function Clicks({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick?.(e.latlng.lat, e.latlng.lng) });
  return null;
}

export function StayMap({ stays = [], selectedId, onSelect, center, zoom = 13, onBounds, height = 420, pinAt, onPick, fit = true }: StayMapProps) {
  const fitTo = useMemo<[number, number][] | undefined>(
    () => (fit && stays.length ? stays.map((s) => [s.lat, s.lng]) : pinAt ? [[pinAt.lat, pinAt.lng]] : undefined),
    // Refit only when the set of stays changes, not on hover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fit, stays.map((s) => s.id).join(','), pinAt?.lat, pinAt?.lng],
  );
  const start: [number, number] = center ? [center.lat, center.lng] : pinAt ? [pinAt.lat, pinAt.lng] : [14.5547, 121.0244];
  return (
    <View style={{ height, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line }}>
      <MapContainer center={start} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Bounds onBounds={onBounds} fitTo={fitTo} />
        <Clicks onPick={onPick} />
        {stays.map((s) => (
          <Marker
            key={s.id}
            position={[s.lat, s.lng]}
            icon={pill(phpShort(s.nightly_php), s.id === selectedId)}
            zIndexOffset={s.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => onSelect?.(s.id) }}
          />
        ))}
        {pinAt ? <Marker position={[pinAt.lat, pinAt.lng]} icon={pin()} /> : null}
      </MapContainer>
    </View>
  );
}
