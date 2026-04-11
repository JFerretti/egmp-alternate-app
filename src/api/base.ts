// Base Bluelink class — ported from egmp-bluelink-scriptable/src/lib/bluelink-regions/base.ts
// Key changes from original:
//   - Keychain.* replaced with expo-secure-store (all async)
//   - Scriptable Request replaced with fetch
//   - Timer.schedule replaced with setTimeout/Promise
//   - Script.name() replaced with APP_CACHE_KEY constant
//   - UUID.string() replaced with crypto.randomUUID()
//   - Buffer (Node) replaced with TextEncoder / btoa / atob

import { Config } from '../config/types'
import { storageGet, storageSet, storageContains, storageRemove } from '../storage/secureStore'
import type {
  BluelinkTokens,
  BluelinkCar,
  BluelinkStatus,
  CarOption,
  Status,
  Cache,
  RequestProps,
  DebugLastRequest,
  TempConversion,
  ClimateRequest,
  ChargeLimit,
  Location,
} from './types'

export {
  BluelinkTokens,
  BluelinkCar,
  BluelinkStatus,
  CarOption,
  Status,
  Cache,
  RequestProps,
  DebugLastRequest,
  TempConversion,
  ClimateRequest,
  ChargeLimit,
  Location,
}

export const DEFAULT_STATUS_CHECK_INTERVAL = 3600 * 1000
export const MAX_COMPLETION_POLLS = 20
export const CHARGE_COMPLETION_POLLS = 40
const APP_CACHE_KEY = 'egmp-alternate-app'
const CACHE_KEY = `egmp-bl-cache-${APP_CACHE_KEY}`

// Utility: parse URL query parameters without a URL polyfill dependency
export function parseUrlParams(url: string): Record<string, string> {
  const queryStart = url.indexOf('?')
  if (queryStart === -1) return {}
  const query = url.slice(queryStart + 1)
  const params: Record<string, string> = {}
  for (const part of query.split('&')) {
    const eqIdx = part.indexOf('=')
    if (eqIdx === -1) continue
    const key = decodeURIComponent(part.slice(0, eqIdx))
    const value = decodeURIComponent(part.slice(eqIdx + 1))
    params[key] = value
  }
  return params
}

export function isNotEmptyObject(obj: Record<string, any>): boolean {
  return obj != null && !(Object.keys(obj).length === 0 && obj.constructor === Object)
}

export class Bluelink {
  // @ts-ignore — initialised in superInit
  protected config: Config
  // @ts-ignore — initialised in superInit
  protected cache: Cache
  protected vin: string | undefined
  protected statusCheckInterval: number
  protected apiHost: string
  protected apiDomain: string
  protected additionalHeaders: Record<string, string>
  protected authHeader: string
  protected tempLookup: TempConversion | undefined
  protected tokens: BluelinkTokens | undefined
  protected authIdHeader: string | undefined
  protected debugLastRequest: DebugLastRequest | undefined
  protected loginFailure: boolean
  protected loginRequiredWebview: boolean
  protected carOptions: CarOption[]
  protected distanceUnit: string
  protected lastCommandSent: number | undefined

  constructor(config: Config, vin?: string) {
    this.config = config
    this.vin = vin
    this.apiDomain = 'https://mybluelink.ca/tods/api/'
    this.apiHost = 'mybluelink.ca'
    this.statusCheckInterval = DEFAULT_STATUS_CHECK_INTERVAL
    this.additionalHeaders = {}
    this.authHeader = 'Authentication'
    this.tokens = undefined
    this.loginFailure = false
    this.loginRequiredWebview = false
    this.carOptions = []
    this.debugLastRequest = undefined
    this.tempLookup = undefined
    this.authIdHeader = undefined
    this.distanceUnit = 'km'
  }

  protected async superInit(config: Config, refreshAuth: boolean, statusCheckInterval?: number) {
    this.vin = this.config.vin
    this.statusCheckInterval = statusCheckInterval || DEFAULT_STATUS_CHECK_INTERVAL

    const existingCache = await this.cacheExists()
    const cache = await this.loadCache()
    if (!cache) {
      if (this.carOptions.length === 0) this.loginFailure = true
      return
    }
    this.cache = cache
    if (existingCache && refreshAuth) await this.refreshLogin()
  }

  protected getAdditionalHeaders(): Record<string, string> {
    return this.additionalHeaders
  }

  protected async refreshLogin(force?: boolean) {
    if (!this.cache) return
    if (force || !this.tokenValid()) {
      let tokens: BluelinkTokens | undefined = undefined
      if (typeof (this as any).refreshTokens === 'function') {
        tokens = await (this as any).refreshTokens()
        if (!tokens) {
          tokens = await this.login()
        }
      } else {
        tokens = await this.login()
      }

      if (!tokens) this.loginFailure = true
      else {
        this.tokens = tokens
        if (this.cache) {
          this.cache.token = this.tokens
          await this.saveCache()
        }
      }
    }
  }

  // Generate the Stamp header required by some regions
  protected getStamp(appId: string, cfbB64: string): string {
    const rawData = `${appId}:${Math.floor(Date.now() / 1000)}`
    const rawDataBytes = new TextEncoder().encode(rawData)
    const cfbBytes = Uint8Array.from(atob(cfbB64), (c) => c.charCodeAt(0))
    const minLen = Math.min(rawDataBytes.length, cfbBytes.length)
    const result = new Uint8Array(minLen)
    for (let i = 0; i < minLen; i++) {
      result[i] = rawDataBytes[i]! ^ cfbBytes[i]!
    }
    return btoa(String.fromCharCode(...Array.from(result)))
  }

  protected genRanHex(size: number): string {
    return [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')
  }

  protected generateUUID(): string {
    const h = (n: number) => this.genRanHex(n)
    return `${h(8)}-${h(4)}-4${h(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${h(3)}-${h(12)}`
  }

  protected getTimeZone(): string {
    const offset = new Date().getTimezoneOffset()
    const o = Math.abs(offset)
    return (offset < 0 ? '+' : '-') + ('0' + Math.floor(o / 60)).slice(-1)
  }

  protected getTimeZoneFull(): string {
    const offset = new Date().getTimezoneOffset()
    const o = Math.abs(offset)
    return (offset < 0 ? '+' : '-') + ('0' + Math.floor(o / 60)).padStart(2, '0') + ':00'
  }

  protected getApiDomain(lookup: string, domains: Record<string, string>, _default: string): string {
    for (const [key, domain] of Object.entries(domains)) {
      if (key === lookup) return domain
    }
    return _default
  }

  protected getHeatingValue(rearDefrost: boolean, steering: boolean): number {
    if (!rearDefrost && !steering) return 0
    if (rearDefrost && steering) return 4
    if (rearDefrost) return 2
    if (steering) return 3
    return 0
  }

  protected setLastCommandSent() {
    this.lastCommandSent = Date.now()
  }

  protected defaultNoEVStatus(
    lastRemoteCheck: Date,
    status: any,
    forceUpdate: boolean,
    odometer?: number,
    chargeLimit?: ChargeLimit,
    location?: Location,
  ): BluelinkStatus {
    return {
      lastStatusCheck: Date.now(),
      lastRemoteStatusCheck: forceUpdate ? Date.now() : lastRemoteCheck.getTime(),
      isCharging: this.cache ? this.cache.status.isCharging : false,
      isPluggedIn: this.cache ? this.cache.status.isCharging : false,
      chargingPower: this.cache ? this.cache.status.chargingPower : 0,
      remainingChargeTimeMins: this.cache ? this.cache.status.remainingChargeTimeMins : 0,
      range: this.cache ? this.cache.status.range : 0,
      soc: this.cache ? this.cache.status.soc : 0,
      locked: status.doorLock,
      climate: status.airCtrlOn,
      twelveSoc: status.battery?.batSoc ?? 0,
      odometer: odometer ?? (this.cache ? this.cache.status.odometer : 0),
      location: location ?? (this.cache ? this.cache.status.location : undefined),
      chargeLimit:
        chargeLimit && chargeLimit.acPercent > 0 ? chargeLimit : this.cache ? this.cache.status.chargeLimit : undefined,
    }
  }

  public updateConfig(config: Config): void {
    this.config = config
    this.distanceUnit = config.distanceUnit
  }

  public getDistanceUnit(): string {
    return this.distanceUnit
  }

  public getLastCommandSent(): number | undefined {
    return this.lastCommandSent
  }

  public getCarOptions(): CarOption[] {
    return this.carOptions
  }

  public loginFailed(): boolean {
    return this.loginFailure
  }

  public isDemo(): boolean {
    return false
  }

  public needRestart(): boolean {
    return this.loginRequiredWebview
  }

  public getCachedStatus(): Status {
    return {
      car: this.cache?.car,
      status: this.cache?.status,
    }
  }

  public async refreshAuth(force = false): Promise<void> {
    return await this.refreshLogin(force)
  }

  public async getStatus(forceUpdate: boolean, noCache: boolean, location = false): Promise<Status> {
    if (!this.cache) {
      throw new Error('No vehicle selected — please select a vehicle first')
    }
    if (forceUpdate) {
      const car = await this.getCar()
      if (car) this.cache.car = car
      await this.saveCache()
      this.setLastCommandSent()
      this.cache.status = await this.getCarStatus(this.cache.car.id, true, location)
      await this.saveCache()
    } else if (noCache || this.cache.status.lastStatusCheck + this.statusCheckInterval < Date.now()) {
      this.cache.status = await this.getCarStatus(this.cache.car.id, false, location)
      await this.saveCache()
    }
    return {
      car: this.cache.car,
      status: this.cache.status,
    }
  }

  public getConfig() {
    return this.config
  }

  public async deleteCache(all = false) {
    await storageRemove(CACHE_KEY)
    if (all) await storageRemove(CACHE_KEY)
  }

  protected async saveCache() {
    await storageSet(CACHE_KEY, JSON.stringify(this.cache))
  }

  protected async cacheExists(): Promise<boolean> {
    return await storageContains(CACHE_KEY)
  }

  protected async loadCache(): Promise<Cache | undefined> {
    let cache: Cache | undefined = undefined
    const stored = await storageGet(CACHE_KEY)
    if (stored) {
      cache = JSON.parse(stored)
    }
    if (!cache) {
      const tokens = await this.login()
      if (!tokens) {
        this.loginFailure = true
        return undefined
      }
      this.tokens = tokens
      const car = await this.getCar()
      if (!car) {
        // Multiple cars and no VIN configured — loginFailure stays false, carOptions populated
        if (this.carOptions.length > 0) return undefined
        this.loginFailure = true
        return undefined
      }
      cache = {
        token: this.tokens,
        car: car,
        status: await this.getCarStatus(car.id, false),
      }
    }
    this.cache = cache
    await this.saveCache()
    return this.cache
  }

  protected tokenValid(): boolean {
    return Boolean(this.cache?.token?.expiry - 30 > Math.floor(Date.now() / 1000))
  }

  // Parse cookies from response headers (for Canada session cookie)
  protected parseCookiesFromHeader(setCookieHeader: string | null): Array<{ name: string; value: string }> {
    if (!setCookieHeader) return []
    return setCookieHeader.split(',').map((part) => {
      const cookiePart = part.split(';')[0]?.trim() ?? ''
      const eqIdx = cookiePart.indexOf('=')
      if (eqIdx === -1) return { name: cookiePart, value: '' }
      return {
        name: cookiePart.slice(0, eqIdx).trim(),
        value: cookiePart.slice(eqIdx + 1).trim(),
      }
    })
  }

  protected async request(props: RequestProps): Promise<{ resp: Record<string, any>; json: any; cookies: string }> {
    let requestTokens: BluelinkTokens | undefined = undefined
    if (!props.noAuth) {
      requestTokens = this.tokens ?? this.cache?.token
    }
    if (!props.noAuth && !requestTokens) {
      throw Error('No tokens available for request')
    }

    const method = props.method ?? (props.data ? 'POST' : 'GET')

    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      ...(props.data &&
        !(props.headers && props.headers['Content-Type']) && {
          'Content-Type': 'application/json',
        }),
      ...(!props.noAuth &&
        requestTokens?.accessToken && {
          [this.authHeader]: props.authTokenOverride ? props.authTokenOverride : requestTokens.accessToken,
        }),
      ...(!props.noAuth &&
        requestTokens?.authCookie && {
          Cookie: requestTokens.authCookie,
        }),
      ...(!props.noAuth &&
        requestTokens?.authId &&
        this.authIdHeader && {
          [this.authIdHeader]: requestTokens.authId,
        }),
      ...(!props.disableAdditionalHeaders && this.getAdditionalHeaders()),
      ...props.headers,
    }

    this.debugLastRequest = {
      url: props.url,
      method,
      headers,
      ...(props.data && { data: props.data }),
    }

    console.log(`[Bluelink] ${method} ${props.url}`, JSON.stringify(this.debugLastRequest))

    try {
      const response = await fetch(props.url, {
        method,
        headers,
        ...(props.data && { body: props.data }),
        ...(props.noRedirect && { redirect: 'manual' }),
      })

      // Normalise response headers to lowercase keys
      const respHeaders: Record<string, string> = {}
      response.headers.forEach((value: string, key: string) => {
        respHeaders[key.toLowerCase()] = value
      })

      const resp: Record<string, any> = {
        statusCode: response.status,
        headers: respHeaders,
      }

      // Parse cookies from Set-Cookie header
      const cookies = respHeaders['set-cookie'] ?? ''

      let json: any
      if (!props.notJSON) {
        const text = await response.text()
        try {
          json = text ? JSON.parse(text) : {}
        } catch {
          json = {}
        }
      } else {
        json = await response.text()
      }

      console.log(`[Bluelink] response ${response.status}`, !props.notJSON ? JSON.stringify(json) : 'text')

      const checkResponse = props.validResponseFunction(resp, json)
      if (!props.noRetry && checkResponse.retry && !props.noAuth) {
        if (this.cache) await this.refreshLogin(true)
        return await this.request({ ...props, noRetry: true })
      }

      return { resp, json, cookies }
    } catch (error) {
      const errorString = `Request failed: ${props.url} — ${error}`
      console.error(errorString)
      throw Error(errorString)
    }
  }

  protected async sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
  }

  protected caseInsensitiveParamExtraction(key: string, data: Record<string, any>): string | undefined {
    if (Object.hasOwn(data, key)) return data[key]
    const lowerKey = key.toLowerCase()
    for (const [k, v] of Object.entries(data)) {
      if (lowerKey === k.toLowerCase()) return v
    }
    return undefined
  }

  // Methods implemented in region subclasses:
  protected async login(): Promise<BluelinkTokens | undefined> {
    throw Error('Not Implemented')
  }

  protected async getCarStatus(_id: string, _forceUpdate: boolean, _location = false): Promise<BluelinkStatus> {
    throw Error('Not Implemented')
  }

  protected async getCar(): Promise<BluelinkCar | undefined> {
    throw Error('Not Implemented')
  }

  protected async lock(_id: string): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    throw Error('Not Implemented')
  }

  protected async unlock(_id: string): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    throw Error('Not Implemented')
  }

  protected async startCharge(_id: string): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    throw Error('Not Implemented')
  }

  protected async stopCharge(_id: string): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    throw Error('Not Implemented')
  }

  protected async climateOn(_id: string, _config: ClimateRequest): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    throw Error('Not Implemented')
  }

  protected async climateOff(_id: string): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    throw Error('Not Implemented')
  }

  protected async setChargeLimit(_id: string, _config: ChargeLimit): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    throw Error('Not Implemented')
  }

  // Public command methods for the UI layer
  public async sendLock(): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    return await this.lock(this.cache.car.id)
  }

  public async sendUnlock(): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    return await this.unlock(this.cache.car.id)
  }

  public async sendStartCharge(): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    return await this.startCharge(this.cache.car.id)
  }

  public async sendStopCharge(): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    return await this.stopCharge(this.cache.car.id)
  }

  public async sendClimateOn(config: ClimateRequest): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    return await this.climateOn(this.cache.car.id, config)
  }

  public async sendClimateOff(): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    return await this.climateOff(this.cache.car.id)
  }

  public async sendSetChargeLimit(config: ChargeLimit): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    return await this.setChargeLimit(this.cache.car.id, config)
  }
}
