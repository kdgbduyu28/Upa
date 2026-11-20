// Month-grid date range picker. Taken nights (from stay_calendar) can't be
// selected and a range can't run across them; the check-out day itself may be
// a taken night, since the guest leaves that morning.
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { CalendarDay } from '../lib/api';
import { addDays, fmtMonth, today } from '../lib/format';
import { C, themed } from '../theme';
import { Row, T } from './ui';

const WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export type Range = { checkIn: string | null; checkOut: string | null };

export function Calendar({ days, value, onChange, months = 1, firstMonth, onMonthChange, showPrices, mode = 'range' }: {
  days?: Map<string, CalendarDay>;
  value: Range;
  onChange: (r: Range) => void;
  months?: 1 | 2;
  firstMonth?: string;
  onMonthChange?: (firstDayOfMonth: string) => void;
  showPrices?: boolean;
  /** 'range' for guests picking a stay; 'block' lets hosts pick any free range. */
  mode?: 'range' | 'block';
}) {
  const [month, setMonth] = useState(() => (firstMonth ?? value.checkIn ?? today()).slice(0, 7) + '-01');
  const t = today();

  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
    if (d.slice(0, 7) < t.slice(0, 7)) return;
    setMonth(d);
    onMonthChange?.(d);
  };

  const taken = (d: string) => {
    const s = days?.get(d)?.status;
    return s === 'booked' || s === 'blocked';
  };

  const pick = (d: string) => {
    const { checkIn, checkOut } = value;
    if (!checkIn || checkOut || d <= checkIn) {
      if (taken(d)) return;
      onChange({ checkIn: d, checkOut: null });
      return;
    }
    // Any taken night between check-in and the chosen check-out blocks the range.
    for (let x = checkIn; x < d; x = addDays(x, 1)) {
      if (taken(x)) {
        onChange({ checkIn: taken(d) ? null : d, checkOut: null });
        return;
      }
    }
    onChange({ checkIn, checkOut: d });
  };

  const monthsShown = useMemo(() => {
    const out = [month];
    if (months === 2) {
      const [y, m] = month.split('-').map(Number);
      out.push(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10));
    }
    return out;
  }, [month, months]);

  return (
    <View style={{ gap: 8 }}>
      <Row justify="space-between">
        <Pressable onPress={() => shift(-1)} accessibilityLabel="Previous month" style={s.nav}>
          <Ionicons name="chevron-back" size={18} color={C.text} />
        </Pressable>
        <T v="label">{monthsShown.map(fmtMonth).join('  ·  ')}</T>
        <Pressable onPress={() => shift(1)} accessibilityLabel="Next month" style={s.nav}>
          <Ionicons name="chevron-forward" size={18} color={C.text} />
        </Pressable>
      </Row>
      <Row align="flex-start" gap={20} wrap>
        {monthsShown.map((m) => (
          <MonthGrid key={m} first={m} today={t} days={days} value={value} onPick={pick} showPrices={showPrices} mode={mode} />
        ))}
      </Row>
    </View>
  );
}

function MonthGrid({ first, today: t, days, value, onPick, showPrices, mode }: {
  first: string; today: string; days?: Map<string, CalendarDay>; value: Range; onPick: (d: string) => void;
  showPrices?: boolean; mode: 'range' | 'block';
}) {
  const [y, m] = first.split('-').map(Number);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null)];
  for (let d = 1; d <= count; d++) cells.push(`${first.slice(0, 8)}${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);

  return (
    <View style={{ flexGrow: 1, flexBasis: 280, maxWidth: 380 }}>
      <View style={s.week}>
        {WEEK.map((w) => <T key={w} v="small" color={C.muted} style={s.weekday}>{w}</T>)}
      </View>
      <View style={s.grid}>
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={s.cell} />;
          const info = days?.get(d);
          const past = d < t;
          const isTaken = info?.status === 'booked' || info?.status === 'blocked';
          const inRange = value.checkIn && value.checkOut && d > value.checkIn && d < value.checkOut;
          const isEnd = d === value.checkIn || d === value.checkOut;
          // A taken night can still be chosen as check-out right after check-in.
          const canCheckOut = value.checkIn && !value.checkOut && d > value.checkIn;
          const disabled = past || (isTaken && !canCheckOut);
          return (
            <Pressable
              key={d}
              disabled={disabled}
              onPress={() => onPick(d)}
              accessibilityLabel={`${d}${isTaken ? (info?.status === 'blocked' ? ', blocked' : ', booked') : ''}`}
              accessibilityState={{ disabled, selected: !!isEnd }}
              style={[s.cell, inRange && s.inRange, isEnd && s.end]}
            >
              <T v="small" style={[
                { fontWeight: isEnd ? '800' : '500' },
                disabled && { color: C.muted, opacity: 0.5 },
                isTaken && !isEnd && { textDecorationLine: 'line-through' },
                isEnd && { color: C.onColor },
              ]}>
                {Number(d.slice(8))}
              </T>
              {showPrices && info && !past && !isTaken ? (
                <T v="small" style={[s.price, isEnd && { color: C.onColor }, info.label ? { color: C.primaryText } : null]}>
                  {Math.round(Number(info.nightly_php) / 100) / 10}k
                </T>
              ) : null}
              {mode === 'block' && info?.status === 'blocked' ? <View style={s.blockedDot} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = themed(() => ({
  nav: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  week: { flexDirection: 'row' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  inRange: { backgroundColor: C.primarySoft, borderRadius: 0 },
  end: { backgroundColor: C.primary },
  price: { fontSize: 10, lineHeight: 12, color: C.muted },
  blockedDot: { position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: C.muted },
}));
