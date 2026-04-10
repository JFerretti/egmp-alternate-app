import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Config, DEFAULT_CONFIG, SUPPORTED_REGIONS, SUPPORTED_MANUFACTURERS, getAuthMethod } from '@/src/config/types';
import { loadConfig, saveConfig, clearConfig } from '@/src/storage/configStore';
import { useCarStore } from '@/src/store/carStore';

function Picker({ label, value, options, onSelect }: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.optionRow}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.optionBtn, value === opt.value && styles.optionBtnActive]}
            onPress={() => onSelect(opt.value)}>
            <Text style={[styles.optionText, value === opt.value && styles.optionTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const {
    connect, selectCar, switchVehicle, disconnect, resetAll,
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

  const handleReset = () => {
    Alert.alert('Reset All', 'This clears all cached data, tokens, and config. You will need to re-enter your settings.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          await resetAll();
          setConfig(DEFAULT_CONFIG);
        },
      },
    ]);
  };

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      {/* Connected car info */}
      {isConnected && car && (
        <View style={styles.connectedBanner}>
          <Text style={styles.connectedTitle}>{car.nickName || car.modelName}</Text>
          <Text style={styles.connectedDetail}>
            {car.modelName} {car.modelYear} — {car.vin}
          </Text>
          <TouchableOpacity
            style={styles.switchButton}
            onPress={handleSwitchVehicle}
            disabled={isLoading}>
            <Text style={styles.switchButtonText}>Switch Vehicle</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Car selection (multiple vehicles found) */}
      {needsCarSelection && (
        <View style={styles.field}>
          <Text style={styles.label}>Select Vehicle</Text>
          <Text style={styles.helperText}>Multiple vehicles found on your account:</Text>
          {carOptions.map((opt) => (
            <TouchableOpacity
              key={opt.vin}
              style={styles.carOption}
              onPress={() => handleSelectCar(opt.vin)}
              disabled={isLoading}>
              <View>
                <Text style={styles.carOptionName}>{opt.nickName || opt.modelName}</Text>
                <Text style={styles.carOptionDetail}>
                  {opt.modelName} {opt.modelYear} — {opt.vin}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Configuration — hide during car selection */}
      {!needsCarSelection && (
        <>
          <Picker
            label="Manufacturer"
            value={config.manufacturer}
            options={SUPPORTED_MANUFACTURERS.map((m) => ({ label: m, value: m.toLowerCase() }))}
            onSelect={(v) => setConfig((prev) => ({ ...prev, manufacturer: v }))}
          />

          <Picker
            label="Region"
            value={config.auth.region}
            options={SUPPORTED_REGIONS.map((r) => ({ label: r.charAt(0).toUpperCase() + r.slice(1), value: r }))}
            onSelect={(v) => updateAuth('region', v)}
          />

          {authMethod === 'refresh_token' && (
            <View style={styles.field}>
              <Text style={styles.label}>Refresh Token</Text>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top', fontSize: 13 }]}
                value={config.auth.refreshToken ?? ''}
                onChangeText={(v) => updateAuth('refreshToken', v)}
                multiline
                numberOfLines={3}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Paste refresh token from bluelink_refresh_token tool"
                placeholderTextColor="#999"
              />
            </View>
          )}

          {authMethod === 'credentials' && (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Username / Email</Text>
                <TextInput
                  style={styles.input}
                  value={config.auth.username}
                  onChangeText={(v) => updateAuth('username', v)}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="email@example.com"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={config.auth.password}
                  onChangeText={(v) => updateAuth('password', v)}
                  secureTextEntry
                  placeholder="Password"
                  placeholderTextColor="#999"
                />
              </View>
            </>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>PIN</Text>
            <TextInput
              style={styles.input}
              value={config.auth.pin}
              onChangeText={(v) => updateAuth('pin', v)}
              keyboardType="number-pad"
              secureTextEntry
              placeholder="Vehicle PIN"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>VIN (optional, for multiple vehicles)</Text>
            <TextInput
              style={styles.input}
              value={config.vin ?? ''}
              onChangeText={(v) => setConfig((prev) => ({ ...prev, vin: v || undefined }))}
              autoCapitalize="characters"
              placeholder="KMXXXXXXXXXXXXXXX"
              placeholderTextColor="#999"
            />
          </View>

          <Picker
            label="Temperature Unit"
            value={config.tempType}
            options={[
              { label: 'Celsius', value: 'C' },
              { label: 'Fahrenheit', value: 'F' },
            ]}
            onSelect={(v) => setConfig((prev) => ({ ...prev, tempType: v as 'C' | 'F' }))}
          />

          <Picker
            label="Distance Unit"
            value={config.distanceUnit}
            options={[
              { label: 'km', value: 'km' },
              { label: 'mi', value: 'mi' },
            ]}
            onSelect={(v) => setConfig((prev) => ({ ...prev, distanceUnit: v as 'km' | 'mi' }))}
          />

          <Picker
            label="Debug Logging"
            value={config.debugLogging ? 'on' : 'off'}
            options={[
              { label: 'Off', value: 'off' },
              { label: 'On', value: 'on' },
            ]}
            onSelect={(v) => setConfig((prev) => ({ ...prev, debugLogging: v === 'on' }))}
          />
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Connect/Reconnect — only when not in car selection */}
      {!needsCarSelection && (
        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleConnect}
          disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isConnected ? 'Reconnect' : 'Connect'}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Loading during car selection */}
      {needsCarSelection && isLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={styles.helperText}>Connecting to vehicle...</Text>
        </View>
      )}

      {isConnected && (
        <TouchableOpacity style={styles.buttonDanger} onPress={handleDisconnect}>
          <Text style={styles.buttonText}>Disconnect</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.buttonReset} onPress={handleReset}>
        <Text style={styles.buttonResetText}>Reset All Data</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#fff',
  },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#f5f5f5',
  },
  optionBtnActive: {
    backgroundColor: '#2f95dc',
    borderColor: '#2f95dc',
  },
  optionText: { fontSize: 14, color: '#333' },
  optionTextActive: { color: '#fff', fontWeight: '600' },

  // Connected banner
  connectedBanner: {
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  connectedTitle: { fontSize: 16, fontWeight: '700', color: '#2e7d32' },
  connectedDetail: { fontSize: 12, color: '#388e3c', marginTop: 2 },
  switchButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2e7d32',
    alignSelf: 'flex-start' as const,
  },
  switchButtonText: { color: '#2e7d32', fontSize: 14, fontWeight: '600' as const },

  // Car selection
  helperText: { fontSize: 13, color: '#666', marginBottom: 8 },
  carOption: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  carOptionName: { fontSize: 15, fontWeight: '600', color: '#000' },
  carOptionDetail: { fontSize: 12, color: '#666', marginTop: 2 },

  // Buttons
  button: {
    backgroundColor: '#2f95dc',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonDanger: {
    backgroundColor: '#d44',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonReset: {
    borderWidth: 1,
    borderColor: '#999',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center' as const,
    marginTop: 12,
  },
  buttonResetText: { color: '#666', fontSize: 16, fontWeight: '600' as const },
  error: { color: '#d44', marginBottom: 8, fontSize: 14 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
});
