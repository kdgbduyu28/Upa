import { router, Stack } from 'expo-router';
import { Button, Page, T } from '../components/ui';
import { C } from '../theme';

export default function NotFound() {
  return (
    <Page max={560}>
      <Stack.Screen options={{ title: 'Not found · Upa' }} />
      <T v="h1">Nothing here</T>
      <T color={C.muted} style={{ marginVertical: 8 }}>That page doesn’t exist.</T>
      <Button title="Go home" onPress={() => router.replace('/')} />
    </Page>
  );
}
