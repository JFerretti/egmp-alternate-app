import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

type ChipGroupProps = {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onSelect: (value: string) => void;
  t: ReturnType<typeof useTheme>;
};

export function ChipGroup({ label, value, options, onSelect, t }: ChipGroupProps) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.onSurfaceVariant }]}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.chip,
                selected
                  ? { backgroundColor: t.secondaryContainer, borderColor: t.secondaryContainer }
                  : { backgroundColor: 'transparent', borderColor: t.outline },
              ]}
              onPress={() => onSelect(opt.value)}>
              <Text
                style={[
                  styles.chipText,
                  { color: selected ? t.onSecondaryContainer : t.onSurfaceVariant },
                ]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8, letterSpacing: 0.2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1,
  },
  chipText: { fontSize: 14, fontWeight: '500' },
});
