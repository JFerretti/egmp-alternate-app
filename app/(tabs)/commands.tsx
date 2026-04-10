import React, { useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  View,
  Text,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';

import { useTheme } from '@/hooks/useTheme';
import { useCarStore } from '@/src/store/carStore';

function CommandTile({
  icon,
  label,
  onPress,
  disabled,
  loading,
  variant = 'tonal',
  t,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  disabled: boolean;
  loading: boolean;
  variant?: 'tonal' | 'filled' | 'outline';
  t: ReturnType<typeof useTheme>;
}) {
  const bg =
    variant === 'filled'
      ? t.primary
      : variant === 'tonal'
        ? t.secondaryContainer
        : 'transparent';
  const fg =
    variant === 'filled'
      ? t.onPrimary
      : variant === 'tonal'
        ? t.onSecondaryContainer
        : t.onSurfaceVariant;
  const borderStyle =
    variant === 'outline' ? { borderWidth: 1, borderColor: t.outline } : {};

  return (
    <TouchableOpacity
      style={[styles.commandTile, { backgroundColor: bg, ...borderStyle }, disabled && styles.tileDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}>
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <MaterialCommunityIcons name={icon as any} size={24} color={fg} />
      )}
      <Text style={[styles.commandTileLabel, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function CommandsScreen() {
  const router = useRouter();
  const t = useTheme();
  const {
    bluelink,
    status,
    isCommandLoading,
    commandError,
    sendLock,
    sendUnlock,
    sendStartCharge,
    sendStopCharge,
    sendClimateOn,
    sendClimateOff,
    sendSetChargeLimit,
    clearCommandError,
  } = useCarStore();

  const [acLimit, setAcLimit] = useState(status?.chargeLimit?.acPercent ?? 80);
  const [dcLimit, setDcLimit] = useState(status?.chargeLimit?.dcPercent ?? 80);
  const [activeCmd, setActiveCmd] = useState<string | null>(null);

  if (!bluelink) {
    return (
      <View style={[styles.center, { backgroundColor: t.surface }]}>
        <MaterialCommunityIcons name="car-off" size={64} color={t.outlineVariant} />
        <Text style={[styles.emptyTitle, { color: t.onSurface }]}>Not Connected</Text>
        <Text style={[styles.emptySubtitle, { color: t.onSurfaceVariant }]}>
          Connect your vehicle in Settings to get started.
        </Text>
        <TouchableOpacity
          style={[styles.filledButton, { backgroundColor: t.primary }]}
          onPress={() => router.push('/settings')}>
          <Text style={[styles.filledButtonText, { color: t.onPrimary }]}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const runCommand = async (name: string, fn: () => Promise<boolean>) => {
    clearCommandError();
    setActiveCmd(name);
    const success = await fn();
    setActiveCmd(null);
    if (success) {
      Alert.alert('Success', `${name} completed.`);
    }
  };

  const confirmAndRun = (name: string, fn: () => Promise<boolean>) => {
    Alert.alert('Confirm', `Send ${name} command?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', onPress: () => runCommand(name, fn) },
    ]);
  };

  const config = bluelink.getConfig();
  const warmTemp = config.climateTempWarm;
  const coldTemp = config.climateTempCold;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: t.surface }]}
      contentContainerStyle={styles.container}>
      {commandError && (
        <View style={[styles.errorBanner, { backgroundColor: t.errorContainer }]}>
          <MaterialCommunityIcons name="alert-circle" size={18} color={t.error} />
          <Text style={[styles.errorText, { color: t.error }]}>{commandError}</Text>
        </View>
      )}

      {/* Doors */}
      <Text style={[styles.sectionTitle, { color: t.onSurfaceVariant }]}>Doors</Text>
      <View style={styles.tileRow}>
        <CommandTile
          icon="lock"
          label="Lock"
          onPress={() => confirmAndRun('Lock', sendLock)}
          disabled={isCommandLoading}
          loading={activeCmd === 'Lock'}
          variant="filled"
          t={t}
        />
        <CommandTile
          icon="lock-open-variant"
          label="Unlock"
          onPress={() => confirmAndRun('Unlock', sendUnlock)}
          disabled={isCommandLoading}
          loading={activeCmd === 'Unlock'}
          variant="outline"
          t={t}
        />
      </View>

      {/* Charging */}
      <Text style={[styles.sectionTitle, { color: t.onSurfaceVariant }]}>Charging</Text>
      <View style={styles.tileRow}>
        <CommandTile
          icon="ev-station"
          label="Start Charge"
          onPress={() => confirmAndRun('Start Charge', sendStartCharge)}
          disabled={isCommandLoading}
          loading={activeCmd === 'Start Charge'}
          variant="tonal"
          t={t}
        />
        <CommandTile
          icon="ev-plug-type2"
          label="Stop Charge"
          onPress={() => confirmAndRun('Stop Charge', sendStopCharge)}
          disabled={isCommandLoading}
          loading={activeCmd === 'Stop Charge'}
          variant="outline"
          t={t}
        />
      </View>

      {/* Climate */}
      <Text style={[styles.sectionTitle, { color: t.onSurfaceVariant }]}>Climate</Text>
      <View style={styles.tileRow}>
        <CommandTile
          icon="fire"
          label={`Warm (${warmTemp}°)`}
          onPress={() =>
            confirmAndRun('Climate Warm', () =>
              sendClimateOn({
                enable: true,
                frontDefrost: false,
                rearDefrost: false,
                steering: false,
                temp: warmTemp,
                durationMinutes: 10,
              }),
            )
          }
          disabled={isCommandLoading}
          loading={activeCmd === 'Climate Warm'}
          variant="tonal"
          t={t}
        />
        <CommandTile
          icon="snowflake"
          label={`Cool (${coldTemp}°)`}
          onPress={() =>
            confirmAndRun('Climate Cool', () =>
              sendClimateOn({
                enable: true,
                frontDefrost: false,
                rearDefrost: false,
                steering: false,
                temp: coldTemp,
                durationMinutes: 10,
              }),
            )
          }
          disabled={isCommandLoading}
          loading={activeCmd === 'Climate Cool'}
          variant="tonal"
          t={t}
        />
      </View>
      <View style={styles.tileRow}>
        <CommandTile
          icon="car-defrost-front"
          label="Defrost"
          onPress={() =>
            confirmAndRun('Defrost', () =>
              sendClimateOn({
                enable: true,
                frontDefrost: true,
                rearDefrost: true,
                steering: true,
                temp: warmTemp,
                durationMinutes: 10,
              }),
            )
          }
          disabled={isCommandLoading}
          loading={activeCmd === 'Defrost'}
          variant="tonal"
          t={t}
        />
        <CommandTile
          icon="power"
          label="Climate Off"
          onPress={() => confirmAndRun('Climate Off', sendClimateOff)}
          disabled={isCommandLoading}
          loading={activeCmd === 'Climate Off'}
          variant="outline"
          t={t}
        />
      </View>

      {/* Charge Limit */}
      <Text style={[styles.sectionTitle, { color: t.onSurfaceVariant }]}>Charge Limit</Text>
      <View style={[styles.chargeLimitCard, { backgroundColor: t.surfaceContainer }]}>
        <View style={styles.sliderRow}>
          <Text style={[styles.sliderLabel, { color: t.onSurface }]}>AC</Text>
          <Slider
            style={styles.slider}
            minimumValue={50}
            maximumValue={100}
            step={10}
            value={acLimit}
            onValueChange={setAcLimit}
            minimumTrackTintColor={t.primary}
            maximumTrackTintColor={t.outlineVariant}
            thumbTintColor={t.primary}
          />
          <Text style={[styles.sliderValue, { color: t.onSurface }]}>{acLimit}%</Text>
        </View>
        <View style={styles.sliderRow}>
          <Text style={[styles.sliderLabel, { color: t.onSurface }]}>DC</Text>
          <Slider
            style={styles.slider}
            minimumValue={50}
            maximumValue={100}
            step={10}
            value={dcLimit}
            onValueChange={setDcLimit}
            minimumTrackTintColor={t.tertiary}
            maximumTrackTintColor={t.outlineVariant}
            thumbTintColor={t.tertiary}
          />
          <Text style={[styles.sliderValue, { color: t.onSurface }]}>{dcLimit}%</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.filledButton,
            { backgroundColor: t.primary, alignSelf: 'stretch' },
            isCommandLoading && styles.tileDisabled,
          ]}
          onPress={() =>
            confirmAndRun('Set Charge Limit', () =>
              sendSetChargeLimit({ acPercent: acLimit, dcPercent: dcLimit }),
            )
          }
          disabled={isCommandLoading}>
          {activeCmd === 'Set Charge Limit' ? (
            <ActivityIndicator color={t.onPrimary} />
          ) : (
            <Text style={[styles.filledButtonText, { color: t.onPrimary }]}>Apply</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  emptyTitle: { fontSize: 22, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 12,
    marginLeft: 4,
  },

  tileRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  commandTile: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 10,
  },
  commandTileLabel: { fontSize: 14, fontWeight: '600', letterSpacing: 0.1 },
  tileDisabled: { opacity: 0.5 },

  // Charge limit card
  chargeLimitCard: {
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sliderLabel: { fontSize: 14, fontWeight: '600', width: 28 },
  slider: { flex: 1, height: 40 },
  sliderValue: { fontSize: 14, fontWeight: '600', width: 40, textAlign: 'right' },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  errorText: { fontSize: 14, flex: 1 },

  // Buttons
  filledButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 100,
  },
  filledButtonText: { fontSize: 15, fontWeight: '600', letterSpacing: 0.1 },
});
