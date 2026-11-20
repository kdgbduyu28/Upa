import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, Card, Field, Notice, Page, Row, T } from '../components/ui';
import { updateProfile } from '../lib/api';
import { signOut, useAuth } from '../lib/auth';
import { C } from '../theme';

export default function Account() {
  const { session, profile, ready, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (ready && !session) router.replace('/sign-in?next=/account');
  }, [ready, session]);
  useEffect(() => {
    if (profile) {
      setName(profile.display_name);
      setBio(profile.bio ?? '');
    }
  }, [profile]);

  if (!session || !profile) return <Page><T color={C.muted}>Loading…</T></Page>;

  const save = async (patch: Parameters<typeof updateProfile>[1], done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await updateProfile(profile.id, patch);
      await refreshProfile();
      setMsg({ tone: 'good', text: done });
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page max={560}>
      <Stack.Screen options={{ title: 'Account · Upa' }} />
      <T v="h1">Account</T>
      <T color={C.muted}>{session.user.email}</T>

      <Card style={{ gap: 14, marginTop: 20 }}>
        <Field label="Display name" value={name} onChangeText={setName} maxLength={60} />
        <Field label="About you" value={bio} onChangeText={setBio} multiline maxLength={500} hint="Shown on your stays if you host." />
        <Button title="Save" onPress={() => save({ display_name: name.trim() || profile.display_name, bio }, 'Saved.')} loading={busy} />
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      </Card>

      <Card style={{ gap: 10, marginTop: 16 }}>
        <T v="h3">Hosting</T>
        {profile.is_host ? (
          <Button kind="teal" icon="home-outline" title="Go to your hosting dashboard" onPress={() => router.push('/host')} />
        ) : (
          <>
            <T v="small" color={C.muted}>List a room, condo or house and take bookings. You can switch this off any time.</T>
            <Button kind="teal" icon="add" title="Become a host" loading={busy}
              onPress={async () => { await save({ is_host: true }, 'You can host now.'); router.push('/host'); }} />
          </>
        )}
      </Card>

      <Row style={{ marginTop: 16 }}>
        <Button kind="secondary" icon="log-out-outline" title="Sign out" onPress={async () => { await signOut(); router.replace('/'); }} />
      </Row>
    </Page>
  );
}
