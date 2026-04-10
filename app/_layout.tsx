import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import 'react-native-reanimated';

import { md3 } from '@/constants/Colors';
import { loadConfig } from '@/src/storage/configStore';
import { useCarStore } from '@/src/store/carStore';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const CustomDark = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: md3.dark.primary,
    background: md3.dark.surface,
    card: md3.dark.surface,
    text: md3.dark.onSurface,
    border: md3.dark.outlineVariant,
  },
};

const CustomLight = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: md3.light.primary,
    background: md3.light.surface,
    card: md3.light.surface,
    text: md3.light.onSurface,
    border: md3.light.outlineVariant,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({});

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'light' ? CustomLight : CustomDark;

  // Auto-reconnect if saved config exists but store is disconnected
  const { bluelink, connect, isLoading } = useCarStore();

  useEffect(() => {
    if (!bluelink && !isLoading) {
      loadConfig().then((config) => {
        if (config && config.auth.region) {
          connect(config);
        }
      });
    }
  }, []);

  return (
    <ThemeProvider value={theme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: false,
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="auth/oauth"
          options={{ title: 'Sign In', presentation: 'modal' }}
        />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
