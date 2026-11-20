import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type Icon = ComponentProps<typeof Ionicons>['name'];

/** Every amenity key the database may hold, with a label and an icon. */
export const AMENITIES: Record<string, { label: string; icon: Icon }> = {
  wifi: { label: 'Wi-Fi', icon: 'wifi' },
  aircon: { label: 'Aircon', icon: 'snow-outline' },
  kitchen: { label: 'Kitchen', icon: 'restaurant-outline' },
  washer: { label: 'Washer', icon: 'shirt-outline' },
  pool: { label: 'Pool', icon: 'water-outline' },
  gym: { label: 'Gym', icon: 'barbell-outline' },
  parking: { label: 'Parking', icon: 'car-outline' },
  workspace: { label: 'Work desk', icon: 'laptop-outline' },
  balcony: { label: 'Balcony', icon: 'sunny-outline' },
  '24h-security': { label: '24h security', icon: 'shield-checkmark-outline' },
  elevator: { label: 'Elevator', icon: 'swap-vertical-outline' },
  netflix: { label: 'Streaming TV', icon: 'tv-outline' },
  'backup-power': { label: 'Backup power', icon: 'flash-outline' },
  'near-train': { label: 'Near the train', icon: 'train-outline' },
  'hot-shower': { label: 'Hot shower', icon: 'thermometer-outline' },
  fireplace: { label: 'Fireplace', icon: 'flame-outline' },
  'mountain-view': { label: 'Mountain view', icon: 'triangle-outline' },
  garden: { label: 'Garden', icon: 'leaf-outline' },
  'pet-friendly': { label: 'Pets allowed', icon: 'paw-outline' },
  bbq: { label: 'BBQ grill', icon: 'bonfire-outline' },
  'beach-access': { label: 'Beach access', icon: 'umbrella-outline' },
  'surfboard-rack': { label: 'Surfboard rack', icon: 'boat-outline' },
};

/** The filters offered on the search page, most asked-for first. */
export const FILTER_AMENITIES = ['wifi', 'aircon', 'kitchen', 'pool', 'workspace', 'parking', 'washer', 'beach-access', 'pet-friendly', 'backup-power'];

export const amenityLabel = (k: string) => AMENITIES[k]?.label ?? k;
export const amenityIcon = (k: string): Icon => AMENITIES[k]?.icon ?? 'checkmark-outline';
