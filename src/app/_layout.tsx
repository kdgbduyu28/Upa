import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TopBar } from '../components/TopBar';
import { startAuth } from '../lib/auth';
import { C, setScheme, type Scheme } from '../theme';

export default function RootLayout() {
  const system = useColorScheme();
  const scheme: Scheme = system === 'dark' ? 'dark' : 'light';
  useEffect(startAuth, []);
  // Swap the palette before anything renders; the key re-renders the whole tree.
  setScheme(scheme);
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: C.primary, background: C.bg, card: C.card, text: C.text, border: C.line },
  };

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <View key={scheme} style={{ flex: 1, backgroundColor: C.bg }}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <TopBar />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'fade' }} />
        </View>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
