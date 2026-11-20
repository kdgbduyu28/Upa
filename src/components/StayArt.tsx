// Generated cover art for stays without photos: a small scene picked by the
// kind of place, with colours and shapes from the stay's art_seed.
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { StayKind } from '../lib/api';

function prng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sky palettes: dawn, noon, golden hour, dusk, overcast highland.
const SKIES = [
  ['#FBD7C4', '#F4A988'], ['#BFE3F2', '#7CC4E4'], ['#FFE1A8', '#F5A25D'],
  ['#C7B8E8', '#E9A6B5'], ['#D9E4E1', '#A9C3BD'], ['#F9E3D3', '#D99A7E'],
];
const WALLS = ['#F4EDE4', '#E8DCCB', '#D7C2A8', '#C9D6D3', '#EBD3C8', '#FFFFFF'];
const ACCENTS = ['#A63F24', '#11706B', '#C98A12', '#3E5C76', '#7A4E3A'];

export function StayArt({ seed, kind, photo, style, rounded = 14 }: {
  seed: number; kind: StayKind; photo?: string | null; style?: StyleProp<ViewStyle>; rounded?: number;
}) {
  const scene = useMemo(() => build(seed, kind), [seed, kind]);
  if (photo) {
    return (
      <View style={[{ overflow: 'hidden', borderRadius: rounded, aspectRatio: 4 / 3 }, style]}>
        <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
      </View>
    );
  }
  return (
    <View style={[{ overflow: 'hidden', borderRadius: rounded, aspectRatio: 4 / 3 }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={`sky${seed}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={scene.sky[0]} />
            <Stop offset="1" stopColor={scene.sky[1]} />
          </LinearGradient>
        </Defs>
        <Rect width="400" height="300" fill={`url(#sky${seed})`} />
        <Circle cx={scene.sunX} cy={scene.sunY} r={scene.sunR} fill="#FFFFFF" opacity={0.55} />
        {scene.shapes.map((p, i) => (
          <Path key={i} d={p.d} fill={p.fill} opacity={p.opacity ?? 1} />
        ))}
      </Svg>
    </View>
  );
}

type Shape = { d: string; fill: string; opacity?: number };

function build(seed: number, kind: StayKind) {
  const r = prng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const sky = pick(SKIES);
  const wall = pick(WALLS);
  const accent = pick(ACCENTS);
  const shapes: Shape[] = [];
  const ground = 240 + r() * 20;

  const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`;
  const windows = (x: number, y: number, w: number, h: number, cols: number, rows: number) => {
    const ww = w / (cols * 2 + 1);
    const hh = h / (rows * 2 + 1);
    let d = '';
    for (let c = 0; c < cols; c++) for (let rr = 0; rr < rows; rr++) {
      if (r() < 0.82) d += rect(x + ww * (c * 2 + 1), y + hh * (rr * 2 + 1), ww, hh);
    }
    return d;
  };

  if (kind === 'condo' || kind === 'apartment' || kind === 'room') {
    // A skyline behind, the building in front.
    let x = -10;
    let back = '';
    while (x < 410) {
      const w = 30 + r() * 50;
      const h = 60 + r() * 120;
      back += rect(x, ground - h, w, h);
      x += w + 4;
    }
    shapes.push({ d: back, fill: '#FFFFFF', opacity: 0.35 });
    const w = 110 + r() * 60;
    const h = kind === 'apartment' ? 120 + r() * 30 : 170 + r() * 50;
    const bx = 200 - w / 2 + (r() - 0.5) * 80;
    shapes.push({ d: rect(bx, ground - h, w, h), fill: wall });
    shapes.push({ d: rect(bx, ground - h, w, 8), fill: accent });
    shapes.push({ d: windows(bx + 6, ground - h + 12, w - 12, h - 18, 4, kind === 'apartment' ? 5 : 8), fill: kind === 'room' ? '#FFD27A' : accent, opacity: 0.55 });
    if (kind === 'room') shapes.push({ d: rect(bx + w * 0.35, ground - h * 0.55, w * 0.16, h * 0.08), fill: '#FFD27A' });
  } else if (kind === 'house' || kind === 'townhouse' || kind === 'cabin') {
    // Hills, then a house (or a row of them).
    const hill = (y: number, amp: number) => {
      let d = `M0 ${y}`;
      for (let x = 0; x <= 400; x += 50) d += ` Q${x + 25} ${y - amp * r()} ${x + 50} ${y}`;
      return `${d} V300 H0z`;
    };
    shapes.push({ d: hill(ground - 40, 60), fill: kind === 'cabin' ? '#4F7A5A' : '#8FB59A', opacity: 0.7 });
    const count = kind === 'townhouse' ? 3 : 1;
    const w = kind === 'townhouse' ? 80 : 130 + r() * 40;
    const start = 200 - (w * count) / 2;
    for (let i = 0; i < count; i++) {
      const hx = start + i * w;
      const hh = 70 + r() * 30;
      shapes.push({ d: rect(hx + 6, ground - hh, w - 12, hh), fill: kind === 'cabin' ? '#8A5A3C' : wall });
      shapes.push({ d: `M${hx - 4} ${ground - hh} L${hx + w / 2} ${ground - hh - 50 - r() * 20} L${hx + w + 4} ${ground - hh}z`, fill: accent });
      shapes.push({ d: rect(hx + w / 2 - 10, ground - 38, 20, 38), fill: '#3B2A22', opacity: 0.8 });
      shapes.push({ d: rect(hx + 16, ground - hh + 16, 18, 16) + rect(hx + w - 34, ground - hh + 16, 18, 16), fill: '#FFD27A', opacity: 0.8 });
    }
    if (kind === 'cabin') {
      let pines = '';
      for (let i = 0; i < 6; i++) {
        const px = r() * 400;
        const ph = 50 + r() * 50;
        pines += `M${px} ${ground - ph} L${px - 16} ${ground} L${px + 16} ${ground}z`;
      }
      shapes.push({ d: pines, fill: '#2F5B3F' });
    }
  } else {
    // villa: sea, sand, a hut with a peaked roof and a palm.
    shapes.push({ d: rect(0, ground - 30, 400, 40), fill: '#3FA7B5', opacity: 0.8 });
    shapes.push({ d: `M0 ${ground} Q200 ${ground - 18} 400 ${ground} V300 H0z`, fill: '#F2DDB2' });
    const vx = 150 + r() * 80;
    shapes.push({ d: rect(vx, ground - 70, 120, 62), fill: wall });
    shapes.push({ d: `M${vx - 14} ${ground - 70} L${vx + 60} ${ground - 120} L${vx + 134} ${ground - 70}z`, fill: '#B07A3A' });
    shapes.push({ d: rect(vx + 48, ground - 42, 24, 34), fill: '#3B2A22', opacity: 0.8 });
    const px = vx < 190 ? 330 : 70;
    shapes.push({ d: `M${px} ${ground} q8 -60 -4 -120 l6 0 q14 60 4 120z`, fill: '#6B4A2B' });
    shapes.push({ d: `M${px} ${ground - 120} q-40 -10 -60 18 q30 -12 60 -14 q-20 -30 -50 -30 q35 2 50 22 q10 -30 40 -38 q-20 20 -34 42 q36 -6 56 16 q-30 -10 -62 -16z`, fill: '#2E7D4F' });
  }

  return { sky, shapes, sunX: 60 + r() * 280, sunY: 40 + r() * 50, sunR: 18 + r() * 16 };
}
