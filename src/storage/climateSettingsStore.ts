import { storageGet, storageSet } from './secureStore'

export interface ClimateSettings {
  temp: number
  tempType: 'C' | 'F'
  defog: boolean
  driverSeat: number
  passengerSeat: number
  steering: boolean
}

const CLIMATE_SETTINGS_KEY = 'egmp-climate-settings'

export async function loadClimateSettings(): Promise<ClimateSettings | null> {
  const raw = await storageGet(CLIMATE_SETTINGS_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ClimateSettings
  } catch {
    return null
  }
}

export async function saveClimateSettings(settings: ClimateSettings): Promise<void> {
  await storageSet(CLIMATE_SETTINGS_KEY, JSON.stringify(settings))
}
