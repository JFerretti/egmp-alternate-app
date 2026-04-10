import React from 'react';
import { TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';

export default function TabLayout() {
  const t = useTheme();
  const router = useRouter();

  const settingsButton = () => (
    <TouchableOpacity onPress={() => router.push('/settings')} style={{ marginRight: 16 }}>
      <MaterialCommunityIcons name="cog-outline" size={24} color={t.onSurface} />
    </TouchableOpacity>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: t.surfaceContainer,
          borderTopColor: t.outlineVariant,
          borderTopWidth: 0.5,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
          letterSpacing: 0.5,
        },
        headerStyle: {
          backgroundColor: t.surface,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 0,
        },
        headerTintColor: t.onSurface,
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 20,
        },
        headerRight: settingsButton,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Status',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'car-electric' : 'car-electric-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="commands"
        options={{
          title: 'Controls',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'remote' : 'remote'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      {/* Hide settings from tabs — it's now a separate screen */}
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
