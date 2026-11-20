// Formatting for pesos, dates and counts. Dates are plain "YYYY-MM-DD" strings
// (Manila calendar days), never Date objects carrying a time zone.

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });

export function php(n: number | string | null | undefined): string {
  if (n == null || n === '') return '—';
  return peso.format(Number(n));
}

/** ₱1.2M, ₱35k: for chart labels and tight tiles. */
export function phpShort(n: number | string | null | undefined): string {
  if (n == null || n === '') return '—';
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000) return `₱${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(v) >= 10_000) return `₱${Math.round(v / 1000)}k`;
  if (Math.abs(v) >= 1000) return `₱${(v / 1000).toFixed(1)}k`;
  return `₱${Math.round(v)}`;
}

export function pct(n: number | string | null | undefined, digits = 1): string {
  if (n == null) return '—';
  const v = Number(n);
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-PH')} ${n === 1 ? one : many}`;

/** Today in Manila as YYYY-MM-DD. */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

const DAY = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const DAY_YEAR = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const MONTH = new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const MONTH_ONLY = new Intl.DateTimeFormat('en-PH', { month: 'short', timeZone: 'UTC' });

const asUtc = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`);

export const fmtDay = (day: string) => DAY.format(asUtc(day));
export const fmtDayYear = (day: string) => DAY_YEAR.format(asUtc(day));
export const fmtMonth = (day: string) => MONTH.format(asUtc(day));
export const fmtMonthShort = (day: string) => MONTH_ONLY.format(asUtc(day));

/** "Dec 3 – 6" or "Dec 30 – Jan 2". `to` is the check-out day. */
export function fmtRange(from: string, to: string): string {
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return sameMonth ? `${fmtDay(from)} – ${Number(to.slice(8, 10))}` : `${fmtDay(from)} – ${fmtDay(to)}`;
}

export function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export const BEDS_LABEL = (n: number) => (n === 0 ? 'Studio' : n >= 3 ? '3+ BR' : `${n} BR`);

export const KIND_LABEL: Record<string, string> = {
  condo: 'Condo', house: 'House', apartment: 'Apartment', townhouse: 'Townhouse', room: 'Room', villa: 'Villa', cabin: 'Cabin',
};

export function distance(m: number | null): string {
  if (m == null) return '';
  return m < 1000 ? `${Math.round(m / 10) * 10} m away` : `${(m / 1000).toFixed(1)} km away`;
}
