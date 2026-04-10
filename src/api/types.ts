// All core types — ported directly from egmp-bluelink-scriptable/src/lib/bluelink-regions/base.ts

export interface BluelinkTokens {
  accessToken: string
  refreshToken?: string
  expiry: number
  authCookie?: string
  authId?: string
  additionalTokens?: Record<string, string>
}

export interface CarOption {
  vin: string
  nickName: string
  modelName: string
  modelYear: string
}

export interface BluelinkCar {
  id: string
  vin: string
  nickName: string
  modelName: string
  modelYear: string
  modelTrim?: string
  modelColour?: string
  odometer?: number
  europeccs2?: number
}

export interface BluelinkStatus {
  lastStatusCheck: number
  lastRemoteStatusCheck: number
  isCharging: boolean
  isPluggedIn: boolean
  chargingPower: number
  remainingChargeTimeMins: number
  range: number
  locked: boolean
  climate: boolean
  soc: number
  twelveSoc: number
  odometer: number
  chargeLimit?: ChargeLimit
  location?: Location
}

export interface Status {
  car: BluelinkCar
  status: BluelinkStatus
}

export interface Cache {
  token: BluelinkTokens
  car: BluelinkCar
  status: BluelinkStatus
}

export interface RequestProps {
  url: string
  data?: string
  method?: string
  noAuth?: boolean
  headers?: Record<string, string>
  validResponseFunction: (resp: Record<string, any>, data: Record<string, any>) => { valid: boolean; retry: boolean }
  noRetry?: boolean
  notJSON?: boolean
  noRedirect?: boolean
  authTokenOverride?: string
  disableAdditionalHeaders?: boolean
}

export interface DebugLastRequest {
  url: string
  method: string
  data?: string
  headers: Record<string, string>
}

export interface TempConversion {
  F: number[]
  C: number[]
  H: string[]
}

export interface SeatClimate {
  driver: number
  passenger: number
  rearLeft: number
  rearRight: number
}

export interface ClimateRequest {
  enable: boolean
  frontDefrost: boolean
  rearDefrost: boolean
  steering: boolean
  temp: number
  durationMinutes: number
  seatClimateOption?: SeatClimate
}

export interface ChargeLimit {
  acPercent: number
  dcPercent: number
}

export interface Location {
  latitude: string
  longitude: string
}
