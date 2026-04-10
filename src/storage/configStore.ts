// Persist user config (region, manufacturer, credentials, preferences) in expo-secure-store

import { storageGet, storageSet, storageRemove, storageContains } from './secureStore'
import { Config, DEFAULT_CONFIG } from '../config/types'

const CONFIG_KEY = 'egmp-app-config'

export async function loadConfig(): Promise<Config | null> {
  const raw = await storageGet(CONFIG_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Config
  } catch {
    return null
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await storageSet(CONFIG_KEY, JSON.stringify(config))
}

export async function hasConfig(): Promise<boolean> {
  return await storageContains(CONFIG_KEY)
}

export async function clearConfig(): Promise<void> {
  await storageRemove(CONFIG_KEY)
}
