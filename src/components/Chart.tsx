// Hand-drawn SVG charts: a median line with its p25–p75 band, and horizontal bars.
import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { fmtMonthShort, phpShort } from '../lib/format';
import { C } from '../theme';
import { T } from './ui';

export type BandPoint = { month: string; median: number; p25: number; p75: number; n: number };

/** Median over time with the middle half of listings shaded. */
export function BandChart({ points, height = 220 }: { points: BandPoint[]; height?: number }) {
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (points.length === 0) return null;
  const pad = { l: 48, r: 12, t: 12, b: 26 };
  const w = Math.max(width - pad.l - pad.r, 10);
  const h = height - pad.t - pad.b;
  const lo = Math.min(...points.map((p) => Number(p.p25)));
  const hi = Math.max(...points.map((p) => Number(p.p75)));
  const span = hi - lo || hi || 1;
  const y = (v: number) => pad.t + h - ((v - (lo - span * 0.1)) / (span * 1.2)) * h;
  const x = (i: number) => pad.l + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(Number(p.median))}`).join(' ');
  const band =
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(Number(p.p75))}`).join(' ') +
    points.slice().reverse().map((p, j) => ` L${x(points.length - 1 - j)} ${y(Number(p.p25))}`).join('') + ' Z';
  const ticks = [lo, (lo + hi) / 2, hi];
  const active = hover ?? points.length - 1;
  const ap = points[active];

  return (
    <View onLayout={onLayout} style={{ width: '100%', height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {ticks.map((t, i) => (
            <G key={i}>
              <Line x1={pad.l} x2={pad.l + w} y1={y(t)} y2={y(t)} stroke={C.line} strokeDasharray="3 4" />
              <SvgText x={pad.l - 6} y={y(t) + 4} fontSize={11} fill={C.muted} textAnchor="end">{phpShort(t)}</SvgText>
            </G>
          ))}
          <Path d={band} fill={C.teal} opacity={0.14} />
          <Path d={line} stroke={C.teal} strokeWidth={2.5} fill="none" />
          {points.map((p, i) => (
            <G key={p.month}>
              <Circle cx={x(i)} cy={y(Number(p.median))} r={i === active ? 5 : 3} fill={i === active ? C.teal : C.card} stroke={C.teal} strokeWidth={2} />
              {(points.length <= 8 || i % Math.ceil(points.length / 8) === 0 || i === points.length - 1) ? (
                <SvgText x={x(i)} y={height - 8} fontSize={11} fill={C.muted} textAnchor="middle">{fmtMonthShort(p.month)}</SvgText>
              ) : null}
            </G>
          ))}
          {/* Invisible hit areas so hovering or tapping a month shows its numbers. */}
          {points.map((p, i) => (
            <Rect key={`hit-${p.month}`} x={x(i) - w / points.length / 2} y={0} width={w / points.length} height={height} fill="transparent"
              onPressIn={() => setHover(i)} {...({ onMouseEnter: () => setHover(i), onMouseLeave: () => setHover(null) } as object)} />
          ))}
        </Svg>
      ) : null}
      {ap ? (
        <View style={{ position: 'absolute', left: pad.l + 6, top: 4, backgroundColor: C.card, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: C.line }} pointerEvents="none">
          <T v="small" style={{ fontWeight: '700' }}>{fmtMonthShort(ap.month)}: {phpShort(ap.median)}</T>
          <T v="small" color={C.muted}>middle half {phpShort(ap.p25)}–{phpShort(ap.p75)} · {ap.n} listings</T>
        </View>
      ) : null}
    </View>
  );
}

/** Horizontal bars, e.g. median rent by city. */
export function Bars({ rows, highlight, onPress }: {
  rows: { key: string; label: string; value: number; sub?: string }[]; highlight?: string; onPress?: (key: string) => void;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r) => (
        <Pressable key={r.key} onPress={() => onPress?.(r.key)} disabled={!onPress} style={{ gap: 4 }} accessibilityRole={onPress ? 'button' : undefined}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <T v="small" style={{ fontWeight: r.key === highlight ? '700' : '500' }}>{r.label}</T>
            <T v="small" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{phpShort(r.value)}{r.sub ? <T v="small" color={C.muted}>  {r.sub}</T> : null}</T>
          </View>
          <View style={{ height: 10, backgroundColor: C.surface, borderRadius: 5, overflow: 'hidden' }}>
            <View style={{ width: `${(r.value / max) * 100}%`, height: '100%', borderRadius: 5, backgroundColor: r.key === highlight ? C.primary : C.teal, opacity: r.key === highlight ? 1 : 0.75 }} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/** Where a value sits between p25 and p75: a range bar with a marker. */
export function RangeMarker({ p25, median, p75, value }: { p25: number; median: number; p75: number; value: number }) {
  const lo = Math.min(p25, value) * 0.85;
  const hi = Math.max(p75, value) * 1.1;
  const at = (v: number) => `${((v - lo) / (hi - lo)) * 100}%` as const;
  return (
    <View style={{ height: 54, justifyContent: 'center' }}>
      <View style={{ height: 8, backgroundColor: C.surface, borderRadius: 4 }} />
      <View style={{ position: 'absolute', left: at(p25), width: `${((p75 - p25) / (hi - lo)) * 100}%`, height: 8, backgroundColor: C.teal, opacity: 0.35, borderRadius: 4 }} />
      <View style={{ position: 'absolute', left: at(median), width: 2, height: 18, backgroundColor: C.teal }} />
      <View style={{ position: 'absolute', left: at(value), marginLeft: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: C.primary, borderWidth: 2, borderColor: C.card }} />
      <View style={{ position: 'absolute', left: at(p25), top: 38 }}><T v="small" color={C.muted}>{phpShort(p25)}</T></View>
      <View style={{ position: 'absolute', left: at(p75), top: 38 }}><T v="small" color={C.muted}>{phpShort(p75)}</T></View>
    </View>
  );
}
