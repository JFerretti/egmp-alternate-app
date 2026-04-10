import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  View,
  Text,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';
import { ChipGroup } from '@/components/ChipGroup';
import { Config, DEFAULT_CONFIG, SUPPORTED_REGIONS, SUPPORTED_MANUFACTURERS, getAuthMethod } from '@/src/config/types';
import { loadConfig, saveConfig, clearConfig } from '@/src/storage/configStore';
import { useCarStore } from '@/src/store/carStore';

export default function ConnectionScreen() {
  const router = useRouter();
  const t = useTheme();
  const {
    connect, selectCar, switchVehicle, disconnect,
    isLoading, error, needsWebviewAuth,
    bluelink, car, carOptions,
  } = useCarStore();

  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const authMethod = getAuthMethod(config.manufacturer, config.auth.region);
  const isConnected = bluelink !== null && car !== null;
  const needsCarSelection = carOptions.length > 0;

  useEffect(() => {
    loadConfig().then((saved) => {
      if (saved) setConfig(saved);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (needsWebviewAuth) {
      router.push('/auth/oauth');
    }
  }, [needsWebviewAuth]);

  const updateAuth = (key: keyof Config['auth'], value: string) => {
    setConfig((prev) => ({ ...prev, auth: { ...prev.auth, [key]: value } }));
  };

  const handleConnect = async () => {
    await saveConfig(config);
    await connect(config);
  };

  const handleSelectCar = async (vin: string) => {
    setConfig((prev) => ({ ...prev, vin }));
    const updatedConfig = { ...config, vin };
    await saveConfig(updatedConfig);
    await selectCar(vin, updatedConfig);
  };

  const handleSwitchVehicle = async () => {
    await switchVehicle(config);
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect', 'Clear stored session and credentials?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          disconnect();
          await clearConfig();
          setConfig(DEFAULT_CONFIG);
        },
      },
    ]);
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

      {/* Connected car info */}
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

      {/* Car selection (multiple vehicles found, no VIN set) */}
      {needsCarSelection && (
        <View style={[styles.section, { backgroundColor: t.surfaceContainer }]}>
          <Text style={[styles.sectionTitle, { color: t.onSurfaceVariant }]}>Select Vehicle</Text>
          <Text style={[styles.helperText, { color: t.onSurfaceVariant }]}>
            Multiple vehicles found on your account. Choose one:
          </Text>
          {carOptions.map((opt) => (
            <TouchableOpacity
              key={opt.vin}
              style={[styles.carOption, { borderColor: t.outlineVariant }]}
              onPress={() => handleSelectCar(opt.vin)}
              disabled={isLoading}>
              <View style={styles.carOptionInfo}>
                <MaterialCommunityIcons name="car" size={20} color={t.onSurface} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.carOptionName, { color: t.onSurface }]}>
                    {opt.nickName || opt.modelName}
                  </Text>
                  <Text style={[styles.carOptionDetail, { color: t.onSurfaceVariant }]}>
                    {opt.modelName} {opt.modelYear} — {opt.vin}
                  </Text>
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={t.onSurfaceVariant} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Connection section */}
      {!needsCarSelection && (
        <View style={[styles.section, { backgroundColor: t.surfaceContainer }]}>
          <Text style={[styles.sectionTitle, { color: t.onSurfaceVariant }]}>Connection</Text>

          <ChipGroup
            label="Manufacturer"
            value={config.manufacturer}
            options={SUPPORTED_MANUFACTURERS.map((m) => ({ label: m, value: m.toLowerCase() }))}
            onSelect={(v) => setConfig((prev) => ({ ...prev, manufacturer: v }))}
            t={t}
          />

          <ChipGroup
            label="Region"
            value={config.auth.region}
            options={SUPPORTED_REGIONS.map((r) => ({
              label: r.charAt(0).toUpperCase() + r.slice(1),
              value: r,
            }))}
            onSelect={(v) => updateAuth('region', v)}
            t={t}
          />
        </View>
      )}

      {/* Credentials section */}
      {!needsCarSelection && (
        <View style={[styles.section, { backgroundColor: t.surfaceContainer }]}>
          <Text style={[styles.sectionTitle, { color: t.onSurfaceVariant }]}>
            {authMethod === 'refresh_token' ? 'Authentication' : 'Credentials'}
          </Text>

          {authMethod === 'refresh_token' && (
            <View style={styles.field}>
              <Text style={[styles.label, { color: t.onSurfaceVariant }]}>Refresh Token</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.multilineInput,
                  {
                    backgroundColor: t.surfaceContainerHigh,
                    color: t.onSurface,
                    borderColor: t.outlineVariant,
                  },
                ]}
                value={config.auth.refreshToken ?? ''}
                onChangeText={(v) => updateAuth('refreshToken', v)}
                multiline
                numberOfLines={3}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Paste refresh token from bluelink_refresh_token tool"
                placeholderTextColor={t.outline}
              />
            </View>
          )}

          {authMethod === 'credentials' && (
            <>
              <View style={styles.field}>
                <Text style={[styles.label, { color: t.onSurfaceVariant }]}>Username / Email</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: t.surfaceContainerHigh,
                      color: t.onSurface,
                      borderColor: t.outlineVariant,
                    },
                  ]}
                  value={config.auth.username}
                  onChangeText={(v) => updateAuth('username', v)}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="email@example.com"
                  placeholderTextColor={t.outline}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: t.onSurfaceVariant }]}>Password</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: t.surfaceContainerHigh,
                      color: t.onSurface,
                      borderColor: t.outlineVariant,
                    },
                  ]}
                  value={config.auth.password}
                  onChangeText={(v) => updateAuth('password', v)}
                  secureTextEntry
                  placeholder="Password"
                  placeholderTextColor={t.outline}
                />
              </View>
            </>
          )}

          <View style={styles.field}>
            <Text style={[styles.label, { color: t.onSurfaceVariant }]}>PIN</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: t.surfaceContainerHigh,
                  color: t.onSurface,
                  borderColor: t.outlineVariant,
                },
              ]}
              value={config.auth.pin}
              onChangeText={(v) => updateAuth('pin', v)}
              keyboardType="number-pad"
              secureTextEntry
              placeholder="Vehicle PIN"
              placeholderTextColor={t.outline}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: t.onSurfaceVariant }]}>VIN (optional)</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: t.surfaceContainerHigh,
                  color: t.onSurface,
                  borderColor: t.outlineVariant,
                },
              ]}
              value={config.vin ?? ''}
              onChangeText={(v) => setConfig((prev) => ({ ...prev, vin: v || undefined }))}
              autoCapitalize="characters"
              placeholder="KMXXXXXXXXXXXXXXX"
              placeholderTextColor={t.outline}
            />
          </View>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={[styles.errorBanner, { backgroundColor: t.errorContainer }]}>
          <MaterialCommunityIcons name="alert-circle" size={18} color={t.error} />
          <Text style={[styles.errorText, { color: t.error }]}>{error}</Text>
        </View>
      )}

      {/* Connect / Reconnect button */}
      {!needsCarSelection && (
        <TouchableOpacity
          style={[styles.filledButton, { backgroundColor: t.primary }, isLoading && styles.buttonDisabled]}
          onPress={handleConnect}
          disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator color={t.onPrimary} />
          ) : (
            <>
              <MaterialCommunityIcons
                name={isConnected ? 'refresh' : 'connection'}
                size={18}
                color={t.onPrimary}
              />
              <Text style={[styles.filledButtonText, { color: t.onPrimary }]}>
                {isConnected ? 'Reconnect' : 'Connect'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Loading indicator during car selection */}
      {needsCarSelection && isLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={t.primary} />
          <Text style={[styles.helperText, { color: t.onSurfaceVariant }]}>Connecting to vehicle...</Text>
        </View>
      )}

      {/* Switch Vehicle button */}
      {isConnected && (
        <TouchableOpacity
          style={[styles.tonalButton, { backgroundColor: t.secondaryContainer }]}
          onPress={handleSwitchVehicle}
          disabled={isLoading}>
          <MaterialCommunityIcons name="car-select" size={18} color={t.onSecondaryContainer} />
          <Text style={[styles.tonalButtonText, { color: t.onSecondaryContainer }]}>Switch Vehicle</Text>
        </TouchableOpacity>
      )}

      {/* Disconnect button */}
      {isConnected && (
        <TouchableOpacity
          style={[styles.outlineButton, { borderColor: t.error }]}
          onPress={handleDisconnect}>
          <MaterialCommunityIcons name="link-off" size={18} color={t.error} />
          <Text style={[styles.outlineButtonText, { color: t.error }]}>Disconnect</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 40, gap: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Sections
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

  // Connected car header
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

  // Car selection
  helperText: {
    fontSize: 14,
    marginBottom: 12,
  },
  carOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  carOptionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  carOptionName: {
    fontSize: 15,
    fontWeight: '600',
  },
  carOptionDetail: {
    fontSize: 12,
    marginTop: 2,
  },

  // Fields
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8, letterSpacing: 0.2 },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 13,
    fontFamily: 'monospace',
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    padding: 16,
  },
  errorText: { fontSize: 14, flex: 1 },

  // Buttons
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
  tonalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 100,
  },
  tonalButtonText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.1 },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 100,
    borderWidth: 1,
  },
  outlineButtonText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.1 },
  buttonDisabled: { opacity: 0.5 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
});
