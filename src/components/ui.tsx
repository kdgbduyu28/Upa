// Small shared building blocks. Styles read the active palette through `themed`.
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, Text as RNText, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { C, MAX_WIDTH, RADIUS, themed } from '../theme';
import { NotConnected } from '../lib/supabase';

type IconName = ComponentProps<typeof Ionicons>['name'];

// --- text -------------------------------------------------------------------

type Variant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'label' | 'mono';

export function T({ v = 'body', color, style, children, numberOfLines, selectable }: {
  v?: Variant; color?: string; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; selectable?: boolean;
}) {
  return (
    <RNText style={[s[v], color ? { color } : null, style]} numberOfLines={numberOfLines} selectable={selectable}>
      {children}
    </RNText>
  );
}

// --- layout -----------------------------------------------------------------

/** A scrolling page with the content centred at a readable width. */
export function Page({ children, max = MAX_WIDTH, scroll = true, pad = true }: {
  children: ReactNode; max?: number; scroll?: boolean; pad?: boolean;
}) {
  const inner = <View style={[s.pageInner, { maxWidth: max }, pad && s.pagePad]}>{children}</View>;
  if (!scroll) return <View style={s.page}>{inner}</View>;
  return (
    <ScrollView style={s.page} contentContainerStyle={s.pageContent} keyboardShouldPersistTaps="handled">
      {inner}
      <Footer />
    </ScrollView>
  );
}

function Footer() {
  return (
    <View style={s.footer}>
      <T v="small" color={C.muted}>
        Upa is a portfolio project. Market figures come from public listings on Dot Property, AirDNA and the BSP;
        stays and hosts are demo data.
      </T>
    </View>
  );
}

export function Row({ children, gap = 8, wrap, align = 'center', justify, style }: {
  children: ReactNode; gap?: number; wrap?: boolean; align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent']; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', gap, alignItems: align, justifyContent: justify, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>
      {children}
    </View>
  );
}

export function Card({ children, style, onPress, pad = 16 }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; pad?: number;
}) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        s.card, { padding: pad }, hovered && s.cardHover, pressed && { opacity: 0.85 }, style,
      ]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, { padding: pad }, style]}>{children}</View>;
}

export function Section({ title, sub, right, children, style }: {
  title: string; sub?: string; right?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: 12, marginTop: 28 }, style]}>
      <Row justify="space-between" align="flex-end" wrap>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <T v="h2">{title}</T>
          {sub ? <T v="small" color={C.muted}>{sub}</T> : null}
        </View>
        {right}
      </Row>
      {children}
    </View>
  );
}

// --- controls ---------------------------------------------------------------

export function Button({ title, onPress, kind = 'primary', icon, loading, disabled, small, style }: {
  title: string; onPress?: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'teal';
  icon?: IconName; loading?: boolean; disabled?: boolean; small?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: C.primary, teal: C.teal, secondary: C.surface, ghost: 'transparent', danger: C.dangerSoft }[kind];
  const fg = { primary: C.onColor, teal: C.onColor, secondary: C.text, ghost: C.primaryText, danger: C.dangerText }[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        s.button, small && s.buttonSmall, { backgroundColor: bg },
        kind === 'secondary' && { borderWidth: 1, borderColor: C.line },
        (disabled || loading) && { opacity: 0.5 }, hovered && { opacity: 0.9 }, pressed && { opacity: 0.75 }, style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={small ? 15 : 17} color={fg} /> : null}
      <RNText style={[s.buttonText, small && { fontSize: 14 }, { color: fg }]}>{title}</RNText>
    </Pressable>
  );
}

export function Chip({ label, on, onPress, icon }: { label: string; on?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      style={[s.chip, on && { backgroundColor: C.text, borderColor: C.text }]}
    >
      {icon ? <Ionicons name={icon} size={14} color={on ? C.bg : C.text} /> : null}
      <RNText style={[s.chipText, on && { color: C.bg }]}>{label}</RNText>
    </Pressable>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <View style={s.segmented}>
      {options.map((o) => (
        <Pressable
          key={String(o.value)}
          onPress={() => onChange(o.value)}
          accessibilityRole="button"
          accessibilityState={{ selected: o.value === value }}
          style={[s.segment, o.value === value && s.segmentOn]}
        >
          <RNText style={[s.segmentText, o.value === value && { color: C.text, fontWeight: '700' }]}>{o.label}</RNText>
        </Pressable>
      ))}
    </View>
  );
}

export function Field({ label, hint, error, style, ...input }: TextInputProps & {
  label: string; hint?: string; error?: string | null; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <T v="label">{label}</T>
      <TextInput
        placeholderTextColor={C.muted}
        {...input}
        style={[s.input, input.multiline && { minHeight: 96, textAlignVertical: 'top' }, error ? { borderColor: C.danger } : null]}
      />
      {error ? <T v="small" color={C.dangerText}>{error}</T> : hint ? <T v="small" color={C.muted}>{hint}</T> : null}
    </View>
  );
}

export function Stepper({ label, value, onChange, min = 0, max = 99, format }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; format?: (v: number) => string;
}) {
  return (
    <Row justify="space-between" style={{ paddingVertical: 6 }}>
      <T>{label}</T>
      <Row gap={12}>
        <Pressable accessibilityLabel={`Fewer ${label}`} onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min} style={[s.step, value <= min && { opacity: 0.35 }]}>
          <Ionicons name="remove" size={16} color={C.text} />
        </Pressable>
        <T style={{ minWidth: 44, textAlign: 'center', fontWeight: '600' }}>{format ? format(value) : value}</T>
        <Pressable accessibilityLabel={`More ${label}`} onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} style={[s.step, value >= max && { opacity: 0.35 }]}>
          <Ionicons name="add" size={16} color={C.text} />
        </Pressable>
      </Row>
    </Row>
  );
}

// --- display ----------------------------------------------------------------

export function Stat({ label, value, sub, tone, style }: {
  label: string; value: string; sub?: string; tone?: 'good' | 'bad' | 'muted'; style?: StyleProp<ViewStyle>;
}) {
  const subColor = tone === 'good' ? C.goodText : tone === 'bad' ? C.dangerText : C.muted;
  return (
    <View style={[s.stat, style]}>
      <T v="small" color={C.muted}>{label}</T>
      <T v="h1" style={{ fontVariant: ['tabular-nums'] }}>{value}</T>
      {sub ? <T v="small" color={subColor}>{sub}</T> : null}
    </View>
  );
}

export function Pill({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'teal' | 'primary'; icon?: IconName }) {
  const [bg, fg] = {
    neutral: [C.surface, C.text], good: [C.goodSoft, C.goodText], warn: [C.warnSoft, C.warnText],
    bad: [C.dangerSoft, C.dangerText], teal: [C.tealSoft, C.tealText], primary: [C.primarySoft, C.primaryText],
  }[tone];
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <RNText style={[s.pillText, { color: fg }]}>{label}</RNText>
    </View>
  );
}

export function Notice({ tone = 'info', title, children, action }: {
  tone?: 'info' | 'warn' | 'error' | 'good'; title?: string; children?: ReactNode; action?: ReactNode;
}) {
  const [bg, fg, icon] = {
    info: [C.tealSoft, C.tealText, 'information-circle-outline'],
    warn: [C.warnSoft, C.warnText, 'alert-circle-outline'],
    error: [C.dangerSoft, C.dangerText, 'close-circle-outline'],
    good: [C.goodSoft, C.goodText, 'checkmark-circle-outline'],
  }[tone] as [string, string, IconName];
  return (
    <View style={[s.notice, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={20} color={fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <T v="label" color={fg}>{title}</T> : null}
        {children ? <T v="small" color={fg}>{children}</T> : null}
      </View>
      {action}
    </View>
  );
}

/** Loading / error / empty states for a data block. */
export function Status({ loading, error, empty, emptyText, onRetry }: {
  loading?: boolean; error?: Error | null; empty?: boolean; emptyText?: string; onRetry?: () => void;
}) {
  if (error) {
    if (error instanceof NotConnected) {
      return <Notice tone="warn" title="Not connected yet">This build has no database configured, so there is nothing to show.</Notice>;
    }
    return (
      <Notice tone="error" title="Couldn't load this" action={onRetry ? <Button small kind="secondary" title="Retry" onPress={onRetry} /> : null}>
        {error.message}
      </Notice>
    );
  }
  if (loading) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }
  if (empty) {
    return (
      <View style={s.empty}>
        <T color={C.muted} style={{ textAlign: 'center' }}>{emptyText ?? 'Nothing here yet.'}</T>
      </View>
    );
  }
  return null;
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: C.line, marginVertical: 12 }} />;
}

export function Stars({ value, count, size = 14 }: { value: number | null; count?: number; size?: number }) {
  if (value == null || !count) return <T v="small" color={C.muted}>New</T>;
  return (
    <Row gap={4}>
      <Ionicons name="star" size={size} color={C.gold} />
      <T v="small" style={{ fontWeight: '600' }}>{Number(value).toFixed(2)}</T>
      {count != null ? <T v="small" color={C.muted}>({count})</T> : null}
    </Row>
  );
}

const s = themed(() => ({
  display: { fontSize: 40, lineHeight: 46, fontWeight: '800', color: C.text, letterSpacing: -0.8 },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: C.text },
  h3: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: C.text },
  body: { fontSize: 15, lineHeight: 22, color: C.text },
  small: { fontSize: 13, lineHeight: 18, color: C.text },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: C.text },
  mono: { fontSize: 13, lineHeight: 19, color: C.codeText, fontFamily: Platform.select({ web: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', ios: 'Menlo', default: 'monospace' }) },
  page: { flex: 1, backgroundColor: C.bg },
  pageContent: { flexGrow: 1 },
  pageInner: { width: '100%', alignSelf: 'center', flexGrow: 1 },
  pagePad: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  footer: { borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 20, paddingHorizontal: 16, alignItems: 'center' },
  card: { backgroundColor: C.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.line },
  cardHover: { borderColor: C.muted },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, minHeight: 44, borderRadius: RADIUS.md },
  buttonSmall: { minHeight: 34, paddingHorizontal: 12, borderRadius: RADIUS.sm },
  buttonText: { fontSize: 15, fontWeight: '700' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: RADIUS.pill, paddingHorizontal: 12, minHeight: 34 },
  chipText: { fontSize: 14, color: C.text, fontWeight: '500' },
  segmented: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: RADIUS.md, padding: 3, alignSelf: 'flex-start', flexWrap: 'wrap' },
  segment: { paddingHorizontal: 12, minHeight: 34, justifyContent: 'center', borderRadius: RADIUS.sm },
  segmentOn: { backgroundColor: C.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  segmentText: { fontSize: 14, color: C.muted, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text, minHeight: 44 },
  step: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  stat: { gap: 2, minWidth: 140, flexGrow: 1, flexBasis: 140 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: RADIUS.md, alignItems: 'flex-start' },
  empty: { padding: 28, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, borderRadius: RADIUS.lg },
}));
