import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  View,
  Text,
  Animated,
  Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';

import { useTheme } from '@/hooks/useTheme';
import { useCarStore } from '@/src/store/carStore';
import { ClimateRequest } from '@/src/api/types';
import { ClimateSettings, loadClimateSettings, saveClimateSettings } from '@/src/storage/climateSettingsStore';

const TEMP_RANGE = {
  C: { min: 17, max: 27, step: 0.5 },
  F: { min: 62, max: 82, step: 1 },
};

const SEAT_LEVELS = [
  { label: 'Off', value: 0 },
  { label: 'Low', value: 6 },
  { label: 'High', value: 8 },
];

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
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'progress' | 'success' | 'error' } | null>(null);
  const statusAnim = useRef(new Animated.Value(0)).current;

  const [climateSettings, setClimateSettings] = useState<ClimateSettings>({
    temp: 19, tempType: 'C', defog: false, driverSeat: 0, passengerSeat: 0, steering: false,
  });

  useEffect(() => {
    if (!bluelink) return;
    const cfg = bluelink.getConfig();
    loadClimateSettings().then((saved) => {
      if (saved && saved.tempType === cfg.tempType) {
        const range = TEMP_RANGE[cfg.tempType];
        saved.temp = Math.max(range.min, Math.min(range.max, saved.temp));
        setClimateSettings(saved);
      } else {
        setClimateSettings({
          temp: cfg.tempType === 'F' ? 66 : 19,
          tempType: cfg.tempType,
          defog: false, driverSeat: 0, passengerSeat: 0, steering: false,
        });
      }
    });
  }, [bluelink]);

  useEffect(() => {
    if (statusMessage) {
      Animated.timing(statusAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      if (statusMessage.type !== 'progress') {
        const timer = setTimeout(() => {
          Animated.timing(statusAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
            setStatusMessage(null);
          });
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [statusMessage]);

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
    setStatusMessage({ text: `Sending ${name}...`, type: 'progress' });
    const success = await fn();
    setActiveCmd(null);
    if (success) {
      setStatusMessage({ text: `${name} completed`, type: 'success' });
    } else {
      setStatusMessage({ text: `${name} failed`, type: 'error' });
    }
  };

  const config = bluelink.getConfig();
  const tempRange = TEMP_RANGE[config.tempType];
  const supportsSeats = config.auth.region !== 'india';

  const adjustTemp = (direction: number) => {
    setClimateSettings(prev => {
      const range = TEMP_RANGE[prev.tempType];
      const newTemp = Math.round((prev.temp + direction * range.step) * 10) / 10;
      if (newTemp < range.min || newTemp > range.max) return prev;
      return { ...prev, temp: newTemp };
    });
  };

  const applyPreset = (preset: 'cool' | 'warm') => {
    const tt = config.tempType;
    if (preset === 'cool') {
      setClimateSettings({ temp: tt === 'F' ? 66 : 19, tempType: tt, defog: false, driverSeat: 0, passengerSeat: 0, steering: false });
    } else {
      setClimateSettings({ temp: tt === 'F' ? 71 : 21.5, tempType: tt, defog: true, driverSeat: 8, passengerSeat: 8, steering: true });
    }
  };

  const handleStartClimate = () => {
    const request: ClimateRequest = {
      enable: true,
      frontDefrost: climateSettings.defog,
      rearDefrost: climateSettings.defog,
      steering: climateSettings.steering,
      temp: climateSettings.temp,
      durationMinutes: 10,
    };
    if (supportsSeats && (climateSettings.driverSeat > 0 || climateSettings.passengerSeat > 0)) {
      request.seatClimateOption = {
        driver: climateSettings.driverSeat,
        passenger: climateSettings.passengerSeat,
        rearLeft: 0,
        rearRight: 0,
      };
    }
    saveClimateSettings(climateSettings);
    runCommand('Start Climate', () => sendClimateOn(request));
  };

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: t.surface }]}
      contentContainerStyle={styles.container}>
      {statusMessage && (
        <Animated.View
          style={[
            styles.statusBanner,
            {
              opacity: statusAnim,
              backgroundColor:
                statusMessage.type === 'progress'
                  ? t.secondaryContainer
                  : statusMessage.type === 'success'
                    ? t.primaryContainer
                    : t.errorContainer,
            },
          ]}>
          {statusMessage.type === 'progress' ? (
            <ActivityIndicator
              size="small"
              color={t.onSecondaryContainer}
            />
          ) : (
            <MaterialCommunityIcons
              name={statusMessage.type === 'success' ? 'check-circle' : 'alert-circle'}
              size={18}
              color={statusMessage.type === 'success' ? t.primary : t.error}
            />
          )}
          <Text
            style={[
              styles.statusText,
              {
                color:
                  statusMessage.type === 'progress'
                    ? t.onSecondaryContainer
                    : statusMessage.type === 'success'
                      ? t.onPrimaryContainer
                      : t.error,
              },
            ]}>
            {statusMessage.text}
          </Text>
        </Animated.View>
      )}

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
          onPress={() => runCommand('Lock', sendLock)}
          disabled={isCommandLoading}
          loading={activeCmd === 'Lock'}
          variant="filled"
          t={t}
        />
        <CommandTile
          icon="lock-open-variant"
          label="Unlock"
          onPress={() => runCommand('Unlock', sendUnlock)}
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
          label={status?.isCharging ? 'Already Charging' : 'Start Charge'}
          onPress={() => runCommand('Start Charge', sendStartCharge)}
          disabled={isCommandLoading || status?.isCharging === true}
          loading={activeCmd === 'Start Charge'}
          variant="tonal"
          t={t}
        />
        <CommandTile
          icon="ev-plug-type2"
          label={status?.isCharging === false ? 'Not Charging' : 'Stop Charge'}
          onPress={() => runCommand('Stop Charge', sendStopCharge)}
          disabled={isCommandLoading || status?.isCharging === false}
          loading={activeCmd === 'Stop Charge'}
          variant="outline"
          t={t}
        />
      </View>

      {/* Climate */}
      <Text style={[styles.sectionTitle, { color: t.onSurfaceVariant }]}>Climate</Text>
      <View style={[styles.climateCard, { backgroundColor: t.surfaceContainer }]}>
        {/* Presets */}
        <View style={styles.tileRow}>
          <TouchableOpacity
            style={[styles.presetButton, { backgroundColor: t.secondaryContainer }]}
            onPress={() => applyPreset('cool')}
            disabled={isCommandLoading}>
            <MaterialCommunityIcons name="snowflake" size={20} color={t.onSecondaryContainer} />
            <Text style={[styles.presetLabel, { color: t.onSecondaryContainer }]}>Cool</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.presetButton, { backgroundColor: t.secondaryContainer }]}
            onPress={() => applyPreset('warm')}
            disabled={isCommandLoading}>
            <MaterialCommunityIcons name="fire" size={20} color={t.onSecondaryContainer} />
            <Text style={[styles.presetLabel, { color: t.onSecondaryContainer }]}>Warm</Text>
          </TouchableOpacity>
        </View>

        {/* Temperature */}
        <View>
          <Text style={[styles.climateLabel, { color: t.onSurfaceVariant }]}>Temperature</Text>
          <View style={styles.tempRow}>
            <TouchableOpacity
              style={[styles.tempButton, { borderColor: t.outline }]}
              onPress={() => adjustTemp(-1)}
              disabled={isCommandLoading || climateSettings.temp <= tempRange.min}>
              <MaterialCommunityIcons name="minus" size={20} color={t.onSurface} />
            </TouchableOpacity>
            <Text style={[styles.tempValue, { color: t.onSurface }]}>
              {climateSettings.temp}°{config.tempType}
            </Text>
            <TouchableOpacity
              style={[styles.tempButton, { borderColor: t.outline }]}
              onPress={() => adjustTemp(1)}
              disabled={isCommandLoading || climateSettings.temp >= tempRange.max}>
              <MaterialCommunityIcons name="plus" size={20} color={t.onSurface} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Defog */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabelRow}>
            <MaterialCommunityIcons name="car-defrost-front" size={20} color={t.onSurfaceVariant} />
            <Text style={[styles.toggleLabelText, { color: t.onSurfaceVariant }]}>Defog</Text>
          </View>
          <Switch
            value={climateSettings.defog}
            onValueChange={(v) => setClimateSettings(prev => ({ ...prev, defog: v }))}
            trackColor={{ false: t.surfaceContainerHigh, true: t.primary }}
            thumbColor={climateSettings.defog ? t.onPrimary : t.outline}
            disabled={isCommandLoading}
          />
        </View>

        {/* Seat & steering controls — hidden for India */}
        {supportsSeats && (
          <>
            <View>
              <Text style={[styles.climateLabel, { color: t.onSurfaceVariant }]}>Driver Seat</Text>
              <View style={styles.chipRow}>
                {SEAT_LEVELS.map((level) => {
                  const selected = climateSettings.driverSeat === level.value;
                  return (
                    <TouchableOpacity
                      key={level.value}
                      style={[
                        styles.seatChip,
                        selected
                          ? { backgroundColor: t.secondaryContainer, borderColor: t.secondaryContainer }
                          : { backgroundColor: 'transparent', borderColor: t.outline },
                      ]}
                      onPress={() => setClimateSettings(prev => ({ ...prev, driverSeat: level.value }))}
                      disabled={isCommandLoading}>
                      <Text style={[styles.seatChipText, { color: selected ? t.onSecondaryContainer : t.onSurfaceVariant }]}>
                        {level.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={[styles.climateLabel, { color: t.onSurfaceVariant }]}>Passenger Seat</Text>
              <View style={styles.chipRow}>
                {SEAT_LEVELS.map((level) => {
                  const selected = climateSettings.passengerSeat === level.value;
                  return (
                    <TouchableOpacity
                      key={level.value}
                      style={[
                        styles.seatChip,
                        selected
                          ? { backgroundColor: t.secondaryContainer, borderColor: t.secondaryContainer }
                          : { backgroundColor: 'transparent', borderColor: t.outline },
                      ]}
                      onPress={() => setClimateSettings(prev => ({ ...prev, passengerSeat: level.value }))}
                      disabled={isCommandLoading}>
                      <Text style={[styles.seatChipText, { color: selected ? t.onSecondaryContainer : t.onSurfaceVariant }]}>
                        {level.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleLabelRow}>
                <MaterialCommunityIcons name="steering" size={20} color={t.onSurfaceVariant} />
                <Text style={[styles.toggleLabelText, { color: t.onSurfaceVariant }]}>Steering Wheel</Text>
              </View>
              <Switch
                value={climateSettings.steering}
                onValueChange={(v) => setClimateSettings(prev => ({ ...prev, steering: v }))}
                trackColor={{ false: t.surfaceContainerHigh, true: t.primary }}
                thumbColor={climateSettings.steering ? t.onPrimary : t.outline}
                disabled={isCommandLoading}
              />
            </View>
          </>
        )}

        {/* Action buttons */}
        <View style={[styles.tileRow, { marginTop: 4 }]}>
          <TouchableOpacity
            style={[styles.climateActionButton, { backgroundColor: t.primary }, isCommandLoading && styles.tileDisabled]}
            onPress={handleStartClimate}
            disabled={isCommandLoading}>
            {activeCmd === 'Start Climate' ? (
              <ActivityIndicator color={t.onPrimary} size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="play" size={18} color={t.onPrimary} />
                <Text style={[styles.climateActionText, { color: t.onPrimary }]}>Start</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.climateActionButton, { borderWidth: 1, borderColor: t.outline }, isCommandLoading && styles.tileDisabled]}
            onPress={() => runCommand('Stop Climate', sendClimateOff)}
            disabled={isCommandLoading}>
            {activeCmd === 'Stop Climate' ? (
              <ActivityIndicator color={t.onSurfaceVariant} size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="stop" size={18} color={t.onSurfaceVariant} />
                <Text style={[styles.climateActionText, { color: t.onSurfaceVariant }]}>Stop</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
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
            runCommand('Set Charge Limit', () =>
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

  // Climate card
  climateCard: {
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  climateLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  presetButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingVertical: 14,
    borderRadius: 100,
  },
  presetLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  tempRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 16,
  },
  tempButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  tempValue: {
    fontSize: 28,
    fontWeight: '600' as const,
    minWidth: 100,
    textAlign: 'center' as const,
  },
  toggleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  toggleLabelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  toggleLabelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  seatChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1,
    alignItems: 'center' as const,
  },
  seatChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  climateActionButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingVertical: 14,
    borderRadius: 100,
  },
  climateActionText: {
    fontSize: 15,
    fontWeight: '600',
  },

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

  // Status banner
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },

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
