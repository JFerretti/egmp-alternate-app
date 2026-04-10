// Secure storage adapter
// Uses expo-secure-store on native, falls back to AsyncStorage on web/unsupported

import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

let SecureStore: typeof import('expo-secure-store') | null = null

// Only load SecureStore on native platforms where it's available
if (Platform.OS !== 'web') {
  try {
    SecureStore = require('expo-secure-store')
  } catch {
    SecureStore = null
  }
}

export async function storageGet(key: string): Promise<string | null> {
  if (SecureStore) {
    return await SecureStore.getItemAsync(key)
  }
  return await AsyncStorage.getItem(key)
}

export async function storageSet(key: string, value: string): Promise<void> {
  if (SecureStore) {
    await SecureStore.setItemAsync(key, value)
  } else {
    await AsyncStorage.setItem(key, value)
  }
}

export async function storageContains(key: string): Promise<boolean> {
  if (SecureStore) {
    return (await SecureStore.getItemAsync(key)) !== null
  }
  return (await AsyncStorage.getItem(key)) !== null
}

export async function storageRemove(key: string): Promise<void> {
  if (SecureStore) {
    await SecureStore.deleteItemAsync(key)
  } else {
    await AsyncStorage.removeItem(key)
  }
}
