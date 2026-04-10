import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  View,
  Text,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '@/hooks/useTheme';
import { ChipGroup } from '@/components/ChipGroup';
import { Config, DEFAULT_CONFIG } from '@/src/config/types';
import { loadConfig, saveConfig } from '@/src/storage/configStore';
import { useCarStore } from '@/src/store/carStore';

export default function PreferencesScreen() {
  const t = useTheme();
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadConfig().then((c) => {
      if (c) setConfig(c);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (saved) {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1500),
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setSaved(false));
    }
  }, [saved]);

  const updateConfig = useCarStore((s) => s.updateConfig);

  const handleSave = async () => {
    await saveConfig(config);
    await updateConfig(config);
    setSaved(true);
  };

  if (!loaded) {
    return (
      <View style={[styles.center, { backgroundColor: t.surface }]}>
        <ActivityIndicator size="large" color={t.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: t.surface }]}
      contentContainerStyle={styles.container}>

      <View style={[styles.section, { backgroundColor: t.surfaceContainer }]}>
        <Text style={[styles.sectionTitle, { color: t.onSurfaceVariant }]}>Preferences</Text>

        <ChipGroup
          label="Temperature"
          value={config.tempType}
          options={[
            { label: 'Celsius', value: 'C' },
            { label: 'Fahrenheit', value: 'F' },
          ]}
          onSelect={(v) => setConfig((prev) => ({ ...prev, tempType: v as 'C' | 'F' }))}
          t={t}
        />

        <ChipGroup
          label="Distance"
          value={config.distanceUnit}
          options={[
            { label: 'Kilometers', value: 'km' },
            { label: 'Miles', value: 'mi' },
          ]}
          onSelect={(v) => setConfig((prev) => ({ ...prev, distanceUnit: v as 'km' | 'mi' }))}
          t={t}
        />


      </View>

      {/* Save button */}
      <TouchableOpacity
        style={[styles.filledButton, { backgroundColor: t.primary }]}
        onPress={handleSave}>
        <MaterialCommunityIcons name="content-save-outline" size={18} color={t.onPrimary} />
        <Text style={[styles.filledButtonText, { color: t.onPrimary }]}>Save Preferences</Text>
      </TouchableOpacity>

      {/* Saved confirmation */}
      {saved && (
        <Animated.View style={[styles.savedRow, { opacity: fadeAnim }]}>
          <MaterialCommunityIcons name="check-circle" size={16} color={t.primary} />
          <Text style={[styles.savedText, { color: t.primary }]}>Saved!</Text>
        </Animated.View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 40, gap: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  section: {
    borderRadius: 20,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 16,
  },

  filledButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 100,
  },
  filledButtonText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.1 },

  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  savedText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
