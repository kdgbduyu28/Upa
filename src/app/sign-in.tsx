import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Divider, Field, Notice, Page, Row, Segmented, T } from '../components/ui';
import { signIn, signUp, useAuth } from '../lib/auth';
import { DEMO } from '../lib/demo';
import { supabase } from '../lib/supabase';
import { C } from '../theme';

export default function SignIn() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const session = useAuth((s) => s.session);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Only follow in-app paths, never another site.
  const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  useEffect(() => {
    if (session) router.replace(dest as never);
  }, [session, dest]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const submit = () =>
    run('form', async () => {
      if (mode === 'in') await signIn(email.trim(), password);
      else {
        const r = await signUp(email.trim(), password, name.trim() || email.split('@')[0]);
        if (r.needsConfirmation) setSent(true);
      }
    });

  return (
    <Page max={480}>
      <Stack.Screen options={{ title: 'Sign in · Upa' }} />
      <T v="h1">{mode === 'in' ? 'Welcome back' : 'Create an account'}</T>
      <T color={C.muted} style={{ marginTop: 4 }}>Book stays, keep favourites, or host your own place.</T>

      {!supabase ? <View style={{ marginTop: 16 }}><Notice tone="warn" title="Not connected yet">This build has no database configured.</Notice></View> : null}

      <Card style={{ gap: 12, marginTop: 20 }}>
        <T v="label">Just looking around?</T>
        <Row gap={8} wrap>
          <Button kind="teal" icon="home-outline" title={DEMO.host.label} loading={busy === 'host'} style={{ flexGrow: 1 }}
            onPress={() => run('host', () => signIn(DEMO.host.email, DEMO.password))} />
          <Button kind="secondary" icon="person-outline" title={DEMO.guest.label} loading={busy === 'guest'} style={{ flexGrow: 1 }}
            onPress={() => run('guest', () => signIn(DEMO.guest.email, DEMO.password))} />
        </Row>
        <T v="small" color={C.muted}>Shared demo accounts with sample bookings. Anything you change may be reset.</T>
      </Card>

      <Card style={{ gap: 14, marginTop: 16 }}>
        <Segmented value={mode} onChange={(m) => { setMode(m); setError(null); }} options={[{ value: 'in', label: 'Sign in' }, { value: 'up', label: 'Sign up' }]} />
        {sent ? (
          <Notice tone="good" title="Check your email">We sent a confirmation link to {email}. Open it, then sign in.</Notice>
        ) : (
          <>
            {mode === 'up' ? <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" placeholder="Juan Dela Cruz" /> : null}
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" inputMode="email" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              hint={mode === 'up' ? 'At least 8 characters.' : undefined} onSubmitEditing={submit} />
            <Divider />
            <Button title={mode === 'in' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy === 'form'}
              disabled={!email.includes('@') || password.length < (mode === 'up' ? 8 : 1)} />
          </>
        )}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </Card>
    </Page>
  );
}
