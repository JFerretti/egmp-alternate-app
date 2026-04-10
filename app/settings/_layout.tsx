import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';

export default function SettingsLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.surface },
        headerTintColor: t.onSurface,
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="preferences" options={{ title: 'Preferences' }} />
      <Stack.Screen name="connection" options={{ title: 'Vehicle & Connection' }} />
    </Stack>
  );
}
