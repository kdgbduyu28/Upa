import { Ionicons } from '@expo/vector-icons';
import { Link, router, usePathname } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut, useAuth } from '../lib/auth';
import { useLayout } from '../lib/hooks';
import { C, MAX_WIDTH, themed } from '../theme';
import { Row, T } from './ui';

type NavItem = { href: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; when?: 'signedIn' | 'host' };

const ITEMS: NavItem[] = [
  { href: '/stays', label: 'Stays', icon: 'bed-outline' },
  { href: '/market', label: 'Merkado', icon: 'stats-chart-outline' },
  { href: '/market/check', label: 'Rent check', icon: 'pricetag-outline' },
  { href: '/under-the-hood', label: 'Under the hood', icon: 'code-slash-outline' },
  { href: '/trips', label: 'Trips', icon: 'airplane-outline', when: 'signedIn' },
  { href: '/host', label: 'Hosting', icon: 'home-outline', when: 'host' },
];

export function TopBar() {
  const { wide, desktop } = useLayout();
  const path = usePathname();
  const session = useAuth((s) => s.session);
  const profile = useAuth((s) => s.profile);
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const items = ITEMS.filter((i) => !i.when || (i.when === 'signedIn' ? !!session : !!profile?.is_host));
  const active = (href: string) => (href === '/market' ? path === '/market' : path.startsWith(href));

  return (
    <View style={[s.bar, { paddingTop: insets.top }]}>
      <Row style={s.inner} justify="space-between">
        <Link href="/" asChild>
          <Pressable accessibilityRole="link" accessibilityLabel="Upa home">
            <Row gap={8}>
              <View style={s.logo}><Ionicons name="home" size={16} color={C.onColor} /></View>
              <T v="h2" style={{ letterSpacing: -0.5 }}>upa</T>
            </Row>
          </Pressable>
        </Link>

        {desktop ? (
          <Row gap={4}>
            {items.map((i) => (
              <Link key={i.href} href={i.href as never} asChild>
                <Pressable style={[s.link, active(i.href) && s.linkOn]} accessibilityRole="link">
                  <T v="small" style={{ fontWeight: active(i.href) ? '700' : '500' }}>{i.label}</T>
                </Pressable>
              </Link>
            ))}
          </Row>
        ) : null}

        <Row gap={8}>
          {session ? (
            wide ? (
              <Pressable onPress={() => router.push('/account')} style={s.avatar} accessibilityLabel="Account">
                <T v="label" color={C.onColor}>{(profile?.display_name ?? '?').slice(0, 1).toUpperCase()}</T>
              </Pressable>
            ) : null
          ) : (
            <Pressable onPress={() => router.push('/sign-in')} style={s.signIn} accessibilityRole="button">
              <T v="small" style={{ fontWeight: '700' }}>Sign in</T>
            </Pressable>
          )}
          {!desktop ? (
            <Pressable onPress={() => setOpen(true)} style={s.menuBtn} accessibilityLabel="Menu">
              <Ionicons name="menu" size={22} color={C.text} />
            </Pressable>
          ) : null}
        </Row>
      </Row>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.scrim} onPress={() => setOpen(false)}>
          <Pressable style={[s.sheet, { paddingTop: insets.top + 12 }]} onPress={(e) => e.stopPropagation()}>
            {items.map((i) => (
              <Pressable key={i.href} onPress={() => { setOpen(false); router.push(i.href as never); }} style={[s.sheetItem, active(i.href) && s.linkOn]}>
                <Ionicons name={i.icon} size={20} color={C.text} />
                <T v="h3">{i.label}</T>
              </Pressable>
            ))}
            <View style={{ height: 1, backgroundColor: C.line, marginVertical: 8 }} />
            {session ? (
              <>
                <Pressable onPress={() => { setOpen(false); router.push('/account'); }} style={s.sheetItem}>
                  <Ionicons name="person-circle-outline" size={20} color={C.text} />
                  <T v="h3">{profile?.display_name ?? 'Account'}</T>
                </Pressable>
                <Pressable onPress={() => { setOpen(false); signOut(); }} style={s.sheetItem}>
                  <Ionicons name="log-out-outline" size={20} color={C.text} />
                  <T v="h3">Sign out</T>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={() => { setOpen(false); router.push('/sign-in'); }} style={s.sheetItem}>
                <Ionicons name="log-in-outline" size={20} color={C.text} />
                <T v="h3">Sign in</T>
              </Pressable>
            )}
            <Pressable onPress={() => { setOpen(false); router.push('/about'); }} style={s.sheetItem}>
              <Ionicons name="information-circle-outline" size={20} color={C.text} />
              <T v="h3">About the data</T>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = themed(() => ({
  bar: { backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.line },
  inner: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 16, height: 60 },
  logo: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  link: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  linkOn: { backgroundColor: C.surface },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center' },
  signIn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.line },
  menuBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scrim: { flex: 1, backgroundColor: C.overlay, alignItems: 'flex-end' },
  sheet: { width: 300, maxWidth: '85%', height: '100%', backgroundColor: C.card, paddingHorizontal: 12, gap: 2 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12 },
}));
