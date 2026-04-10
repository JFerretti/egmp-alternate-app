import React, { useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  View,
  Text,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';
import { useCarStore } from '@/src/store/carStore';

function StatusCard({
  icon,
  label,
  value,
  accent,
  t,
}: {
  icon: string;
  label: string;
  value: string | number | undefined;
  accent?: boolean;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={[styles.statusCard, { backgroundColor: t.surfaceContainerHigh }]}>
      <MaterialCommunityIcons
        name={icon as any}
        size={22}
        color={accent ? t.primary : t.onSurfaceVariant}
      />
      <Text style={[styles.statusCardValue, { color: accent ? t.primary : t.onSurface }]}>
        {value ?? '—'}
      </Text>
      <Text style={[styles.statusCardLabel, { color: t.onSurfaceVariant }]}>{label}</Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  t,
}: {
  label: string;
  value: string | number | undefined;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={[styles.detailRow, { borderBottomColor: t.outlineVariant }]}>
      <Text style={[styles.detailLabel, { color: t.onSurfaceVariant }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: t.onSurface }]}>{value ?? '—'}</Text>
    </View>
  );
}

export default function StatusScreen() {
  const router = useRouter();
  const t = useTheme();
  const { bluelink, car, status, isLoading, error, refreshStatus } = useCarStore();

  useEffect(() => {
    if (bluelink && !status) {
      refreshStatus(false, true);
    }
  }, [bluelink]);

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

  const distanceUnit = bluelink.getDistanceUnit();

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: t.surface }]}
      contentContainerStyle={styles.container}>
      {/* Car header */}
      {car && (
        <View style={styles.carHeader}>
          <Text style={[styles.carName, { color: t.onSurface }]}>
            {car.nickName || car.modelName}
          </Text>
          <Text style={[styles.carSub, { color: t.onSurfaceVariant }]}>
            {car.modelYear} {car.modelName}
          </Text>
        </View>
      )}

      {status && (
        <>
          {/* Battery hero */}
          <View style={[styles.batteryHero, { backgroundColor: t.primaryContainer }]}>
            <Text style={[styles.batteryPercent, { color: t.onPrimaryContainer }]}>
              {status.soc}%
            </Text>
            <Text style={[styles.batteryLabel, { color: t.onPrimaryContainer }]}>Battery</Text>
            {status.isCharging && (
              <View style={styles.chargingBadge}>
                <MaterialCommunityIcons name="lightning-bolt" size={16} color={t.primary} />
                <Text style={[styles.chargingText, { color: t.primary }]}>Charging</Text>
              </View>
            )}
          </View>

          {/* Quick status grid */}
          <View style={styles.statusGrid}>
            <StatusCard
              icon="map-marker-distance"
              label="Range"
              value={`${status.range} ${distanceUnit}`}
              t={t}
            />
            <StatusCard
              icon={status.locked ? 'lock' : 'lock-open'}
              label="Doors"
              value={status.locked ? 'Locked' : 'Unlocked'}
              accent={!status.locked}
              t={t}
            />
            <StatusCard
              icon={status.isPluggedIn ? 'ev-plug-type2' : 'power-plug-off'}
              label="Plug"
              value={status.isPluggedIn ? 'Connected' : 'Unplugged'}
              t={t}
            />
            <StatusCard
              icon="air-conditioner"
              label="Climate"
              value={status.climate ? 'On' : 'Off'}
              accent={status.climate}
              t={t}
            />
          </View>

          {/* Details card */}
          <View style={[styles.detailsCard, { backgroundColor: t.surfaceContainer }]}>
            <Text style={[styles.sectionTitle, { color: t.onSurface }]}>Details</Text>
            {status.isCharging && (
              <>
                <DetailRow label="Charge Power" value={`${status.chargingPower} kW`} t={t} />
                <DetailRow
                  label="Time Remaining"
                  value={`${status.remainingChargeTimeMins} min`}
                  t={t}
                />
              </>
            )}
            <DetailRow label="12V Battery" value={`${status.twelveSoc}%`} t={t} />
            {status.odometer ? (
              <DetailRow
                label="Odometer"
                value={`${status.odometer.toLocaleString()} ${distanceUnit}`}
                t={t}
              />
            ) : null}
            {status.chargeLimit && (
              <>
                <DetailRow label="AC Charge Limit" value={`${status.chargeLimit.acPercent}%`} t={t} />
                <DetailRow label="DC Charge Limit" value={`${status.chargeLimit.dcPercent}%`} t={t} />
              </>
            )}
          </View>

          {/* Last updated */}
          <Text style={[styles.lastUpdate, { color: t.outline }]}>
            Last updated: {new Date(status.lastRemoteStatusCheck).toLocaleString()}
          </Text>
        </>
      )}

      {error && (
        <View style={[styles.errorBanner, { backgroundColor: t.errorContainer }]}>
          <MaterialCommunityIcons name="alert-circle" size={18} color={t.error} />
          <Text style={[styles.errorText, { color: t.error }]}>{error}</Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.filledButton, { backgroundColor: t.primary, flex: 1 }, isLoading && styles.buttonDisabled]}
          onPress={() => refreshStatus(false)}
          disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator color={t.onPrimary} />
          ) : (
            <>
              <MaterialCommunityIcons name="refresh" size={18} color={t.onPrimary} />
              <Text style={[styles.filledButtonText, { color: t.onPrimary }]}>Refresh</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tonalButton,
            { backgroundColor: t.secondaryContainer, flex: 1 },
            isLoading && styles.buttonDisabled,
          ]}
          onPress={() => refreshStatus(true, true)}
          disabled={isLoading}>
          <MaterialCommunityIcons name="car-connected" size={18} color={t.onSecondaryContainer} />
          <Text style={[styles.tonalButtonText, { color: t.onSecondaryContainer }]}>
            Force Update
          </Text>
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
  carHeader: { alignItems: 'center', marginBottom: 20 },
  carName: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
  carSub: { fontSize: 14, marginTop: 4, letterSpacing: 0.2 },

  // Battery hero
  batteryHero: {
    borderRadius: 28,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  batteryPercent: { fontSize: 64, fontWeight: '800', letterSpacing: -2 },
  batteryLabel: { fontSize: 16, fontWeight: '500', marginTop: 4, opacity: 0.8 },
  chargingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 4,
  },
  chargingText: { fontSize: 14, fontWeight: '600' },

  // Status grid
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  statusCard: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  statusCardValue: { fontSize: 15, fontWeight: '600' },
  statusCardLabel: { fontSize: 12, fontWeight: '500', letterSpacing: 0.3 },

  // Details card
  detailsCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, letterSpacing: 0.1 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailLabel: { fontSize: 14 },
  detailValue: { fontSize: 14, fontWeight: '600' },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  errorText: { fontSize: 14, flex: 1 },

  // Last updated
  lastUpdate: { textAlign: 'center', fontSize: 12, marginBottom: 20, letterSpacing: 0.2 },

  // Buttons
  buttonRow: { flexDirection: 'row', gap: 12 },
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
  tonalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 100,
  },
  tonalButtonText: { fontSize: 15, fontWeight: '600', letterSpacing: 0.1 },
  buttonDisabled: { opacity: 0.5 },
});
