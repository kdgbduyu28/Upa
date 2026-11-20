export type MapStay = { id: number; lat: number; lng: number; nightly_php: number; title?: string };

export type StayMapProps = {
  stays?: MapStay[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
  onBounds?: (b: { west: number; south: number; east: number; north: number }) => void;
  height?: number;
  /** A single location pin, e.g. on a stay's page or the host editor. */
  pinAt?: { lat: number; lng: number };
  /** Host editor: tap the map to move the pin. */
  onPick?: (lat: number, lng: number) => void;
  /** Zoom to fit the stays (or the pin) when they change. */
  fit?: boolean;
};
