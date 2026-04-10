// Config types — ported from egmp-bluelink-scriptable/src/config.ts

export interface Auth {
  username: string
  password: string
  pin: string
  region: string
  refreshToken?: string
}

// Determines what credentials the UI should collect for a given manufacturer/region
export type AuthMethod = 'credentials' | 'refresh_token' | 'webview'

export function getAuthMethod(manufacturer: string, region: string): AuthMethod {
  if (region === 'europe') {
    if (manufacturer.toLowerCase() === 'hyundai') return 'refresh_token'
    return 'webview'
  }
  return 'credentials'
}

export interface Config {
  manufacturer: string
  auth: Auth
  tempType: 'C' | 'F'
  distanceUnit: 'km' | 'mi'
  climateTempWarm: number
  climateTempCold: number
  climateSeatLevel: string
  mfaPreference: 'sms' | 'email'
  carColor: string
  debugLogging: boolean
  vin?: string
}

export const DEFAULT_CONFIG: Config = {
  manufacturer: 'hyundai',
  auth: {
    username: '',
    password: '',
    pin: '',
    region: '',
  },
  tempType: 'C',
  distanceUnit: 'km',
  mfaPreference: 'sms',
  climateTempCold: 19,
  climateTempWarm: 21.5,
  climateSeatLevel: 'Off',
  debugLogging: false,
  vin: undefined,
  carColor: 'white',
}

export const SUPPORTED_REGIONS = ['canada', 'usa', 'europe', 'india', 'australia']
export const SUPPORTED_MANUFACTURERS = ['Hyundai', 'Kia', 'Genesis']
