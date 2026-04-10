import React from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, View, Text, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';
import { useCarStore } from '@/src/store/carStore';

export default function SettingsIndex() {
  const router = useRouter();
  const t = useTheme();
  const { bluelink, car, resetAll } = useCarStore();
  const isConnected = bluelink !== null && car !== null;

  const handleReset = () => {
    Alert.alert(
      'Reset All',
      'This clears all cached data, tokens, and config. You will need to re-enter your settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await resetAll();
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: t.surface }]}
      contentContainerStyle={styles.container}>

      {/* Connected car banner */}
      {isConnected && car && (
        <View style={[styles.section, { backgroundColor: t.secondaryContainer }]}>
          <View style={styles.connectedHeader}>
            <MaterialCommunityIcons name="car-connected" size={22} color={t.onSecondaryContainer} />
            <Text style={[styles.connectedTitle, { color: t.onSecondaryContainer }]}>
              {car.nickName || car.modelName}
            </Text>
          </View>
          <Text style={[styles.connectedDetail, { color: t.onSecondaryContainer }]}>
            {car.modelName} {car.modelYear} — {car.vin}
          </Text>
        </View>
      )}

      {/* Preferences menu item */}
      <TouchableOpacity
        style={[styles.menuItem, { backgroundColor: t.surfaceContainer }]}
        onPress={() => router.push('/settings/preferences')}
        activeOpacity={0.7}>
        <View style={styles.menuItemLeft}>
          <View style={[styles.iconContainer, { backgroundColor: t.secondaryContainer }]}>
            <MaterialCommunityIcons name="tune-variant" size={22} color={t.onSecondaryContainer} />
          </View>
          <View style={styles.menuItemText}>
            <Text style={[styles.menuItemTitle, { color: t.onSurface }]}>Preferences</Text>
            <Text style={[styles.menuItemSubtitle, { color: t.onSurfaceVariant }]}>
              Temperature, distance, logging
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={t.onSurfaceVariant} />
      </TouchableOpacity>

      {/* Vehicle & Connection menu item */}
      <TouchableOpacity
        style={[styles.menuItem, { backgroundColor: t.surfaceContainer }]}
        onPress={() => router.push('/settings/connection')}
        activeOpacity={0.7}>
        <View style={styles.menuItemLeft}>
          <View style={[styles.iconContainer, { backgroundColor: t.secondaryContainer }]}>
            <MaterialCommunityIcons name="car-cog" size={22} color={t.onSecondaryContainer} />
          </View>
          <View style={styles.menuItemText}>
            <Text style={[styles.menuItemTitle, { color: t.onSurface }]}>Vehicle & Connection</Text>
            <Text style={[styles.menuItemSubtitle, { color: t.onSurfaceVariant }]}>
              Manage vehicle, credentials, connection
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={t.onSurfaceVariant} />
      </TouchableOpacity>

      {/* Reset All Data */}
      <TouchableOpacity
        style={[styles.outlineButton, { borderColor: t.outline }]}
        onPress={handleReset}>
        <MaterialCommunityIcons name="delete-outline" size={18} color={t.onSurfaceVariant} />
        <Text style={[styles.outlineButtonText, { color: t.onSurfaceVariant }]}>Reset All Data</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 40, gap: 16 },

  // Connected car banner
  section: {
    borderRadius: 20,
    padding: 20,
  },
  connectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  connectedTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  connectedDetail: {
    fontSize: 13,
    marginLeft: 32,
    opacity: 0.8,
  },

  // Menu items
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    padding: 20,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemText: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  menuItemSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },

  // Buttons
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 100,
    borderWidth: 1,
    marginTop: 8,
  },
  outlineButtonText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.1 },
});
