// Europe region — based on bluelinky's EuropeanBrandAuthStrategy + EuropeanController.
// Hyundai uses a user-provided refresh token (no WebView). Kia uses WebView-based OAuth.

import {
  Bluelink,
  BluelinkTokens,
  BluelinkCar,
  BluelinkStatus,
  ClimateRequest,
  ChargeLimit,
  Location,
  DEFAULT_STATUS_CHECK_INTERVAL,
  MAX_COMPLETION_POLLS,
  isNotEmptyObject,
  parseUrlParams,
} from '../base'
import { Config } from '../../config/types'
import { storageGet, storageSet, storageRemove, storageContains } from '../../storage/secureStore'
import { saveConfig } from '../../storage/configStore'

interface ControlToken {
  expiry: number
  token: string
}

interface APIConfig {
  apiDomain: string
  newApiDomain?: string
  apiPort: number
  appId: string
  authCfb: string
  authBasic: string
  authHost: string
  authClientSecret?: string
  clientId: string
  pushType: string
}

const API_CONFIG: Record<string, APIConfig> = {
  hyundai: {
    apiDomain: 'prd.eu-ccapi.hyundai.com',
    apiPort: 8080,
    appId: '014d2225-8495-4735-812d-2616334fd15d',
    authCfb: 'RFtoRq/vDXJmRndoZaZQyfOot7OrIqGVFj96iY2WL3yyH5Z/pUvlUhqmCxD2t+D65SQ=',
    authBasic:
      'Basic NmQ0NzdjMzgtM2NhNC00Y2YzLTk1NTctMmExOTI5YTk0NjU0OktVeTQ5WHhQekxwTHVvSzB4aEJDNzdXNlZYaG10UVI5aVFobUlGampvWTRJcHhzVg==',
    authHost: 'idpconnect-eu.hyundai.com',
    clientId: '6d477c38-3ca4-4cf3-9557-2a1929a94654',
    authClientSecret: 'KUy49XxPzLpLuoK0xhBC77W6VXhmtQR9iQhmIFjjoY4IpxsV',
    pushType: 'GCM',
  },
  kia: {
    apiDomain: 'prd.eu-ccapi.kia.com',
    newApiDomain: 'cci-api-eu.kia.com',
    apiPort: 8080,
    appId: 'a2b8469b-30a3-4361-8e13-6fceea8fbe74',
    authCfb: 'wLTVxwidmH8CfJYBWSnHD6E0huk0ozdiuygB4hLkM5XCgzAL1Dk5sE36d/bx5PFMbZs=',
    authBasic: 'Basic ZmRjODVjMDAtMGEyZi00YzY0LWJjYjQtMmNmYjE1MDA3MzBhOnNlY3JldA==',
    authHost: 'idpconnect-eu.kia.com',
    clientId: 'fdc85c00-0a2f-4c64-bcb4-2cfb1500730a',
    pushType: 'APNS',
  },
}

const WEBVIEW_AUTH_STORE_KEY = 'egmp-bl-webview-auth'
const WEBVIEW_AUTH_MAX_AGE_MS = 5 * 60 * 1000

// Auth URLs for WebView-based login (Kia only — Hyundai uses refresh token).
export interface EuropeAuthUrls {
  startUrl: string
  callbackUrl: string
}

export function getEuropeAuthUrls(manufacturer: string): EuropeAuthUrls | null {
  const cfg = API_CONFIG[manufacturer]
  if (!cfg) return null

  if (manufacturer === 'kia') {
    return {
      startUrl:
        `https://${cfg.authHost}/auth/api/v2/user/oauth2/authorize?` +
        [
          'client_id=01b36c86-79e8-486c-8009-15f2ad88d670',
          'redirect_uri=https://oneapp.kia.com/redirect',
          'response_type=code',
          'scope=account.token.transfer%20account.id.generate%20account.puid.userinfos%20account.userinfo%20read%20account.userinfos%20puid%20email%20name%20mobileNum%20birthdate%20lang%20country%20signUpDate%20gender%20nationInfo%20certProfile%20offline',
          'state=hmgoneapp',
          'ui_locales=en-GB',
        ].join('&'),
      callbackUrl: 'https://oneapp.kia.com/redirect',
    }
  }

  return null
}

// Store the OAuth redirect URL after the WebView intercepts it
export async function storeWebviewAuthResult(redirectUrl: string) {
  await storageSet(WEBVIEW_AUTH_STORE_KEY, JSON.stringify({ redirectUrl, timestamp: Date.now() }))
}

export async function getStoredWebviewAuthResult(): Promise<string | null> {
  if (!(await storageContains(WEBVIEW_AUTH_STORE_KEY))) return null
  try {
    const raw = await storageGet(WEBVIEW_AUTH_STORE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (Date.now() - data.timestamp > WEBVIEW_AUTH_MAX_AGE_MS) {
      await clearStoredWebviewAuthResult()
      return null
    }
    return data.redirectUrl
  } catch {
    await clearStoredWebviewAuthResult()
    return null
  }
}

export async function clearStoredWebviewAuthResult() {
  if (await storageContains(WEBVIEW_AUTH_STORE_KEY)) {
    await storageRemove(WEBVIEW_AUTH_STORE_KEY)
  }
}

export class BluelinkEurope extends Bluelink {
  private lang = 'en'
  private apiConfig: APIConfig
  private controlToken: ControlToken | undefined
  private europeccs2: number | undefined
  private additionalAuthHeaders: Record<string, string>

  constructor(config: Config, statusCheckInterval?: number) {
    super(config)
    this.distanceUnit = config.distanceUnit
    if (!(config.manufacturer in API_CONFIG)) {
      throw Error(`Manufacturer ${config.manufacturer} not supported in Europe`)
    }
    this.apiConfig = API_CONFIG[config.manufacturer]!
    this.apiDomain = `https://${this.apiConfig.apiDomain}:${this.apiConfig.apiPort}`
    this.statusCheckInterval = statusCheckInterval || DEFAULT_STATUS_CHECK_INTERVAL
    this.additionalHeaders = {
      'User-Agent': 'okhttp/3.14.9',
      offset: this.getTimeZone().slice(0, 3),
      'ccsp-service-id': this.apiConfig.clientId,
      'ccsp-application-id': this.apiConfig.appId,
    }
    this.additionalAuthHeaders = {
      'client-id': 'com.kia.oneapp.eu',
      'client-name': 'Kia',
      'client-os-code': 'AOS',
      'client-os-version': '36',
      'client-version': '1.0.13',
      'User-Agent': 'Ktor client',
      'Accept-Language': 'en-GB',
      'Accept-Charset': 'UTF-8',
      Accept: 'application/json',
      timezone: this.getTimeZoneFull(),
      locale: 'GB',
    }
    this.authIdHeader = 'ccsp-device-id'
    this.authHeader = 'Authorization'
    this.controlToken = undefined
    this.europeccs2 = undefined
  }

  static async init(config: Config, refreshAuth: boolean, statusCheckInterval?: number) {
    const obj = new BluelinkEurope(config, statusCheckInterval)
    await obj.superInit(config, refreshAuth)
    return obj
  }

  private getCCS2Header(): string {
    return typeof this.europeccs2 !== 'undefined'
      ? this.europeccs2.toString()
      : this.cache?.car.europeccs2
        ? this.cache.car.europeccs2.toString()
        : '0'
  }

  private requestResponseValid(resp: Record<string, any>, _data: Record<string, any>): { valid: boolean; retry: boolean } {
    if (Object.hasOwn(resp, 'statusCode') && (resp.statusCode === 200 || resp.statusCode === 204 || resp.statusCode === 302)) {
      return { valid: true, retry: false }
    }
    return { valid: false, retry: true }
  }

  protected async login(): Promise<BluelinkTokens | undefined> {
    if (this.config.manufacturer !== 'hyundai') {
      // Reset session for Kia
      await this.request({
        url: `${this.apiDomain}/api/v1/user/oauth2/authorize?response_type=code&state=test&client_id=${this.apiConfig.clientId}&redirect_uri=${this.apiDomain}/api/v1/user/oauth2/redirect&lang=${this.lang}`,
        noAuth: true,
        notJSON: true,
        validResponseFunction: this.requestResponseValid.bind(this),
      })
    }
    return this.config.manufacturer === 'kia' ? await this.KiaLogin() : await this.HyundaiLogin()
  }

  protected async HyundaiLogin(): Promise<BluelinkTokens | undefined> {
    // Refresh-token-only flow: user provided a refresh token in config
    if (this.config.auth.refreshToken) {
      console.log('[Europe] Using provided refresh token for initial login')
      return await this.refreshHyundaiToken(this.config.auth.refreshToken)
    }

    console.log('[Europe] No refresh token provided for Hyundai Europe')
    return undefined
  }

  private async refreshHyundaiToken(refreshToken: string): Promise<BluelinkTokens | undefined> {
    const resp = await this.request({
      url: `https://${this.apiConfig.authHost}/auth/api/v2/user/oauth2/token`,
      data: [
        'grant_type=refresh_token',
        `refresh_token=${refreshToken}`,
        `client_id=${this.apiConfig.clientId}`,
        `client_secret=${this.apiConfig.authClientSecret}`,
      ].join('&'),
      noAuth: true,
      disableAdditionalHeaders: true,
      validResponseFunction: this.requestResponseValid.bind(this),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })

    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      const newRefreshToken = resp.json.refresh_token || refreshToken
      // Persist rotated refresh token back to config for resilience
      if (this.config.auth.refreshToken && newRefreshToken !== this.config.auth.refreshToken) {
        this.config.auth.refreshToken = newRefreshToken
        saveConfig(this.config).catch(() => {})
      }
      // Reuse cached deviceId on refresh; only fetch a new one on initial login
      let authId = this.cache?.token?.authId
      if (!authId) {
        console.log('[Europe] No cached deviceId, fetching new one via notifications/register')
        authId = await this.getDeviceId()
        if (!authId) {
          console.error('[Europe] Failed to obtain deviceId — commands will fail until reconnect')
        }
      }
      return {
        accessToken: `Bearer ${resp.json.access_token}`,
        refreshToken: newRefreshToken,
        expiry: Math.floor(Date.now() / 1000) + Number(resp.json.expires_in),
        authId,
      }
    }
    return undefined
  }

  protected async KiaLogin(): Promise<BluelinkTokens | undefined> {
    const storedRedirect = await getStoredWebviewAuthResult()
    if (!storedRedirect) {
      this.loginRequiredWebview = true
      return undefined
    }
    await clearStoredWebviewAuthResult()

    const codeParams = parseUrlParams(storedRedirect)
    const code = codeParams['code']
    if (!code) {
      console.error('[Europe Kia] Failed to extract code from redirect', storedRedirect)
      return undefined
    }

    const respTokens = await this.request({
      url: `https://${this.apiConfig.newApiDomain}/domain/api/v1/auth/token?code=${code}`,
      method: 'POST',
      noAuth: true,
      disableAdditionalHeaders: true,
      validResponseFunction: this.requestResponseValid.bind(this),
      headers: {
        ...this.additionalAuthHeaders,
        'app-request-id': this.generateUUID(),
      },
    })

    if (!this.requestResponseValid(respTokens.resp, respTokens.json).valid) {
      throw Error(`Failed to login (Kia): ${JSON.stringify(respTokens.resp)}`)
    }

    const tokens: BluelinkTokens = {
      accessToken: '',
      refreshToken: '',
      expiry: Math.floor(Date.now() / 1000) + Number(respTokens.json.expiresIn),
      authId: await this.getDeviceId(),
      additionalTokens: {
        access: respTokens.json.accessToken,
        refresh: respTokens.json.refreshToken,
        exchangeableAccess: respTokens.json.exchangeableAccessToken,
        exchangeableRefresh: respTokens.json.exchangeableRefreshToken,
        nonCcsToken: respTokens.json.nonCcsToken,
        nonCcsRefreshToken: respTokens.json.nonCcsRefreshToken,
        idToken: respTokens.json.idToken,
      },
    }

    await this.KiaDeviceRegistration(tokens)
    await this.initKiaSession(tokens)
    return await this.tokenExchange(tokens)
  }

  protected async KiaDeviceRegistration(tokens: BluelinkTokens): Promise<boolean | undefined> {
    if (!tokens?.additionalTokens || !isNotEmptyObject(tokens.additionalTokens)) return undefined

    const resp = await this.request({
      url: `https://${this.apiConfig.newApiDomain}/domain/api/v1/notifications/bases/devices`,
      noAuth: true,
      disableAdditionalHeaders: true,
      validResponseFunction: this.requestResponseValid.bind(this),
      data: JSON.stringify({
        appToken: `${this.genRanHex(22)}:${this.genRanHex(44)}_${this.genRanHex(11)}_${this.genRanHex(62)}`,
        deviceToken: this.generateUUID(),
        providerType: 'AOS',
        deviceModel: 'sdk_gphone64_arm64',
        deviceOsVer: '36',
        deviceAppVer: '1.0.11',
      }),
      headers: {
        ...this.additionalAuthHeaders,
        'app-request-id': this.generateUUID(),
        Authentication: tokens.additionalTokens['idToken'] ?? '',
        Authorization: `Bearer ${tokens.additionalTokens['access'] ?? ''}`,
        'exchangeable-token': tokens.additionalTokens['exchangeableAccess'] ?? '',
        'non-ccs-token': tokens.additionalTokens['nonCcsToken'] ?? '',
      },
    })

    if (!this.requestResponseValid(resp.resp, resp.json).valid) return undefined

    const deviceId = resp.json.deviceId
    await this.request({
      url: `https://${this.apiConfig.newApiDomain}/domain/api/v1/notifications/settings/preferences/language`,
      method: 'PUT',
      noAuth: true,
      disableAdditionalHeaders: true,
      validResponseFunction: this.requestResponseValid.bind(this),
      data: JSON.stringify({ deviceId, countryCd: 'GB', langCd: 'en' }),
      headers: {
        ...this.additionalAuthHeaders,
        'app-request-id': this.generateUUID(),
        Authentication: tokens.additionalTokens['idToken'] ?? '',
        Authorization: `Bearer ${tokens.additionalTokens['access'] ?? ''}`,
        'exchangeable-token': tokens.additionalTokens['exchangeableAccess'] ?? '',
        'non-ccs-token': tokens.additionalTokens['nonCcsToken'] ?? '',
      },
    })

    return true
  }

  protected async initKiaSession(tokens: BluelinkTokens): Promise<boolean | undefined> {
    if (!tokens?.additionalTokens || !isNotEmptyObject(tokens.additionalTokens)) return undefined

    const headers = {
      ...this.additionalAuthHeaders,
      'app-request-id': this.generateUUID(),
      Authentication: tokens.additionalTokens['idToken'] ?? '',
      Authorization: `Bearer ${tokens.additionalTokens['access'] ?? ''}`,
      'exchangeable-token': tokens.additionalTokens['exchangeableAccess'] ?? '',
      'non-ccs-token': tokens.additionalTokens['nonCcsToken'] ?? '',
    }

    await this.request({
      url: `https://${this.apiConfig.newApiDomain}/oneapp/api/v1/initialize`,
      noAuth: true,
      disableAdditionalHeaders: true,
      validResponseFunction: this.requestResponseValid.bind(this),
      headers,
    })

    await this.request({
      url: `https://${this.apiConfig.newApiDomain}/oneapp/api/v1/initialize/vehicle`,
      noAuth: true,
      disableAdditionalHeaders: true,
      validResponseFunction: this.requestResponseValid.bind(this),
      headers,
    })

    return true
  }

  protected async tokenExchange(tokens: BluelinkTokens): Promise<BluelinkTokens | undefined> {
    if (!tokens?.additionalTokens || !isNotEmptyObject(tokens.additionalTokens)) return undefined

    const respToken = await this.request({
      url: `https://${this.apiConfig.newApiDomain}/domain/api/v1/auth/token-exchange?serviceType=CCS`,
      method: 'POST',
      noAuth: true,
      disableAdditionalHeaders: true,
      validResponseFunction: this.requestResponseValid.bind(this),
      headers: {
        ...this.additionalAuthHeaders,
        'app-request-id': this.generateUUID(),
        Authentication: tokens.additionalTokens['idToken'] ?? '',
        Authorization: `Bearer ${tokens.additionalTokens['access'] ?? ''}`,
        'exchangeable-token': tokens.additionalTokens['exchangeableAccess'] ?? '',
        'non-ccs-token': tokens.additionalTokens['nonCcsToken'] ?? '',
      },
    })

    if (!this.requestResponseValid(respToken.resp, respToken.json).valid) return undefined

    tokens.accessToken = `Bearer ${respToken.json.accessToken}`
    return tokens
  }

  protected async newRefreshTokens(): Promise<BluelinkTokens | undefined> {
    if (!this.cache?.token.additionalTokens || !isNotEmptyObject(this.cache.token.additionalTokens)) return undefined

    const respTokens = await this.request({
      url: `https://${this.apiConfig.newApiDomain}/domain/api/v2/auth/token-refresh`,
      data: JSON.stringify({
        accessToken: this.cache.token.additionalTokens['access'],
        refreshToken: this.cache.token.additionalTokens['refresh'],
        exchangeableAccessToken: this.cache.token.additionalTokens['exchangeableAccess'],
        exchangeableRefreshToken: this.cache.token.additionalTokens['exchangeableRefresh'],
        nonCcsToken: this.cache.token.additionalTokens['nonCcsToken'],
        nonCcsRefreshToken: this.cache.token.additionalTokens['nonCcsRefreshToken'],
      }),
      noAuth: true,
      validResponseFunction: this.requestResponseValid.bind(this),
      headers: {
        'client-id': 'com.kia.oneapp.eu',
        Authentication: this.cache.token.additionalTokens['idToken'] ?? '',
        Authorization: `Bearer ${this.cache.token.additionalTokens['access'] ?? ''}`,
        'exchangeable-token': this.cache.token.additionalTokens['exchangeableAccess'] ?? '',
        'non-ccs-token': this.cache.token.additionalTokens['nonCcsToken'] ?? '',
      },
    })

    if (this.requestResponseValid(respTokens.resp, respTokens.json).valid) {
      return this.tokenExchange({
        accessToken: '',
        refreshToken: '',
        expiry: Math.floor(Date.now() / 1000) + Number(respTokens.json.expiresIn),
        authId: await this.getDeviceId(),
        additionalTokens: {
          access: respTokens.json.accessToken,
          refresh: respTokens.json.refreshToken,
          exchangeableAccess: respTokens.json.exchangeableAccessToken,
          exchangeableRefresh: respTokens.json.exchangeableRefreshToken,
          nonCcsToken: respTokens.json.nonCcsToken,
          nonCcsRefreshToken: respTokens.json.nonCcsRefreshToken,
          idToken: respTokens.json.idToken,
        },
      })
    }

    return undefined
  }

  protected async refreshTokens(): Promise<BluelinkTokens | undefined> {
    if (this.cache?.token.additionalTokens) {
      return await this.newRefreshTokens()
    }

    if (!this.cache?.token.refreshToken) return undefined

    // Hyundai uses IDP endpoint for refresh
    if (this.apiConfig.authClientSecret) {
      return await this.hyundaiRefreshTokens()
    }

    const resp = await this.request({
      url: `${this.apiDomain}/api/v1/user/oauth2/token`,
      data: [
        `client_id=${this.apiConfig.clientId}`,
        'grant_type=refresh_token',
        `refresh_token=${this.cache.token.refreshToken}`,
        `redirect_uri=${this.apiDomain}/api/v1/user/oauth2/redirect`,
      ].join('&'),
      noAuth: true,
      validResponseFunction: this.requestResponseValid.bind(this),
      headers: {
        Authorization: this.apiConfig.authBasic,
        Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      return {
        authCookie: '',
        accessToken: `Bearer ${resp.json.access_token}`,
        refreshToken: resp.json.refresh_token || this.cache.token.refreshToken,
        expiry: Math.floor(Date.now() / 1000) + Number(resp.json.expires_in),
        authId: await this.getDeviceId(),
      }
    }
    return undefined
  }

  protected async hyundaiRefreshTokens(): Promise<BluelinkTokens | undefined> {
    if (!this.cache?.token.refreshToken) return undefined
    return await this.refreshHyundaiToken(this.cache.token.refreshToken)
  }

  protected async getDeviceId(): Promise<string | undefined> {
    const resp = await this.request({
      url: `${this.apiDomain}/api/v1/spa/notifications/register`,
      data: JSON.stringify({
        pushRegId: `${this.genRanHex(22)}:${this.genRanHex(63)}-${this.genRanHex(55)}`,
        pushType: this.apiConfig.pushType,
        uuid: this.generateUUID(),
      }),
      noAuth: true,
      validResponseFunction: this.requestResponseValid.bind(this),
      headers: { Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb) },
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      const deviceId = resp.json.resMsg?.deviceId
      if (deviceId) {
        console.log('[Europe] Obtained deviceId from notifications/register')
      } else {
        console.error('[Europe] notifications/register succeeded but deviceId missing from response')
      }
      return deviceId
    }
    console.error(`[Europe] Failed to register for notifications (deviceId): status=${resp.resp.statusCode}`)
    return undefined
  }

  protected async getCar(): Promise<BluelinkCar | undefined> {
    let vin = this.vin
    if (!vin && this.cache) vin = this.cache.car.vin

    const resp = await this.request({
      url: this.apiDomain + '/api/v1/spa/vehicles',
      validResponseFunction: this.requestResponseValid.bind(this),
      headers: { Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb) },
    })

    if (!this.requestResponseValid(resp.resp, resp.json).valid) {
      throw Error(`Failed to retrieve vehicles: ${JSON.stringify(resp.json)}`)
    }

    if (resp.json.resMsg.vehicles.length > 1 && !vin) {
      for (const vehicle of resp.json.resMsg.vehicles) {
        this.carOptions.push({ vin: vehicle.vin, nickName: vehicle.nickname, modelName: vehicle.vehicleName, modelYear: vehicle.year })
      }
      return undefined
    }

    if (resp.json.resMsg.vehicles.length > 0) {
      let vehicle = resp.json.resMsg.vehicles[0]
      if (vin) {
        for (const v of resp.json.resMsg.vehicles) {
          if (v.vin === vin) { vehicle = v; break }
        }
      }
      this.europeccs2 = vehicle.ccuCCS2ProtocolSupport
      return {
        id: vehicle.vehicleId,
        vin: vehicle.vin,
        nickName: vehicle.nickname,
        modelName: vehicle.vehicleName,
        modelYear: vehicle.year,
        odometer: 0,
        modelColour: vehicle.detailInfo?.outColor,
        modelTrim: vehicle.detailInfo?.saleCarmdlCd,
        europeccs2: vehicle.ccuCCS2ProtocolSupport,
      }
    }
    throw Error(`Failed to retrieve vehicle list: ${JSON.stringify(resp.json)}`)
  }

  protected returnCarStatus(status: any, updateTime: number): BluelinkStatus {
    const newOdometer =
      this.distanceUnit === 'mi'
        ? Math.floor(status.Drivetrain.Odometer * 0.621371)
        : Math.floor(status.Drivetrain.Odometer)

    let isCharging = false
    let chargingPower = 0
    if (status.Green.ChargingInformation.ConnectorFastening.State && status.Green.ChargingInformation.Charging.RemainTime > 0) {
      isCharging = true
      if (status.Green.Electric?.SmartGrid?.RealTimePower) {
        chargingPower = status.Green.Electric.SmartGrid.RealTimePower
      }
    }

    const chargeLimit: ChargeLimit = { dcPercent: 0, acPercent: 0 }
    if (status.Green.ChargingInformation?.TargetSoC) {
      chargeLimit.acPercent = status.Green.ChargingInformation.TargetSoC.Standard
      chargeLimit.dcPercent = status.Green.ChargingInformation.TargetSoC.Quick
    }

    let location: Location | undefined = undefined
    if (status.Location?.GeoCoord) {
      location = { latitude: status.Location.GeoCoord.Latitude, longitude: status.Location.GeoCoord.Longitude }
    }

    return {
      lastStatusCheck: Date.now(),
      lastRemoteStatusCheck: Number(updateTime),
      isCharging,
      isPluggedIn: status.Green.ChargingInformation.ConnectorFastening.State > 0,
      chargingPower,
      remainingChargeTimeMins: status.Green.ChargingInformation.Charging.RemainTime,
      range:
        status.Drivetrain.FuelSystem.DTE.Total > 0
          ? Math.floor(this.distanceUnit === 'mi'
              ? status.Drivetrain.FuelSystem.DTE.Total * 0.621371
              : status.Drivetrain.FuelSystem.DTE.Total)
          : this.cache?.status.range ?? 0,
      locked: !(
        Boolean(status.Cabin.Door.Row1.Driver.Open) &&
        Boolean(status.Cabin.Door.Row1.Passenger.Open) &&
        Boolean(status.Cabin.Door.Row2.Driver.Open) &&
        Boolean(status.Cabin.Door.Row2.Passenger.Open)
      ),
      climate: Boolean(status.Cabin.HVAC.Row1.Driver.Blower.SpeedLevel > 0),
      soc: status.Green.BatteryManagement.BatteryRemain.Ratio,
      twelveSoc: status.Electronics?.Battery?.Level ?? 0,
      odometer: newOdometer || (this.cache?.status.odometer ?? 0),
      location: location ?? this.cache?.status.location,
      chargeLimit: chargeLimit.acPercent > 0 ? chargeLimit : this.cache?.status.chargeLimit,
    }
  }

  protected async getCarStatus(id: string, forceUpdate: boolean, _location = false): Promise<BluelinkStatus> {
    if (!forceUpdate) {
      const resp = await this.request({
        url: `${this.apiDomain}/api/v1/spa/vehicles/${id}/ccs2/carstatus/latest`,
        headers: { Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb), ccuCCS2ProtocolSupport: this.getCCS2Header() },
        validResponseFunction: this.requestResponseValid.bind(this),
      })
      if (this.requestResponseValid(resp.resp, resp.json).valid) {
        return this.returnCarStatus(resp.json.resMsg.state.Vehicle, resp.json.resMsg.lastUpdateTime)
      }
      throw Error(`Failed to retrieve vehicle status: ${JSON.stringify(resp.json)}`)
    }

    const currentTime = Date.now()
    await this.request({
      url: `${this.apiDomain}/api/v1/spa/vehicles/${id}/ccs2/carstatus`,
      headers: { Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb), ccuCCS2ProtocolSupport: this.getCCS2Header() },
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    let attempts = 0
    while (attempts <= MAX_COMPLETION_POLLS) {
      attempts++
      await this.sleep(2000)
      const status = await this.getCarStatus(id, false)
      if (currentTime < status.lastRemoteStatusCheck) return status
    }

    throw Error('Failed to retrieve remote vehicle status: timed out polling')
  }

  protected async getAuthCode(id: string): Promise<string> {
    if (this.controlToken && this.controlToken.expiry > Date.now()) {
      return this.controlToken.token
    }

    // Ensure deviceId exists — if missing from cache, attempt to obtain one
    let deviceId = this.cache?.token?.authId
    if (!deviceId) {
      console.error('[Europe] getAuthCode: deviceId missing from cache, attempting to obtain one')
      deviceId = await this.getDeviceId()
      if (deviceId && this.cache?.token) {
        this.cache.token.authId = deviceId
        await this.saveCache()
      }
    }

    console.error('[Europe] getAuthCode: deviceId=' + (deviceId ? 'present' : 'MISSING') + ', pin=' + (this.config.auth.pin ? 'present' : 'MISSING'))

    if (!deviceId || !this.config.auth.pin) {
      throw Error(`Cannot send command: ${!deviceId ? 'deviceId is missing' : 'PIN is missing'}. Please reconnect your vehicle.`)
    }

    const resp = await this.request({
      url: `${this.apiDomain}/api/v1/user/pin`,
      method: 'PUT',
      data: JSON.stringify({ pin: this.config.auth.pin, deviceId }),
      headers: { vehicleId: id, Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb), ccuCCS2ProtocolSupport: this.getCCS2Header() },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.controlToken = {
        expiry: Date.now() + Number(resp.json.expiresTime) * 1000,
        token: `Bearer ${resp.json.controlToken}`,
      }
      return this.controlToken.token
    }
    throw Error(`Failed to get auth code: ${JSON.stringify(resp.json)}`)
  }

  protected async pollForCommandCompletion(id: string, transactionId: string): Promise<{ isSuccess: boolean; data: any }> {
    let attempts = 0
    while (attempts <= MAX_COMPLETION_POLLS) {
      const resp = await this.request({
        url: `${this.apiDomain}/api/v1/spa/notifications/${id}/records`,
        headers: { Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb), ccuCCS2ProtocolSupport: this.getCCS2Header() },
        validResponseFunction: this.requestResponseValid.bind(this),
      })

      if (!this.requestResponseValid(resp.resp, resp.json).valid) {
        throw Error(`Poll failed: ${JSON.stringify(resp.json)}`)
      }

      for (const record of resp.json.resMsg) {
        if (record.recordId === transactionId) {
          const result = record.result
          if (result) {
            switch (result) {
              case 'success':
                return { isSuccess: true, data: (await this.getStatus(false, true)).status }
              case 'fail':
              case 'non-response':
                return { isSuccess: false, data: record }
            }
          }
        }
      }

      attempts++
      await this.sleep(2000)
    }
    return { isSuccess: false, data: undefined }
  }

  protected async lock(id: string) { return await this.lockUnlock(id, true) }
  protected async unlock(id: string) { return await this.lockUnlock(id, false) }

  protected async lockUnlock(id: string, shouldLock: boolean): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: `${this.apiDomain}/api/v2/spa/vehicles/${id}/ccs2/control/door`,
      method: 'POST',
      data: JSON.stringify({ command: shouldLock ? 'close' : 'open', ccuCCS2ProtocolSupport: this.getCCS2Header() }),
      headers: { Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb), ccuCCS2ProtocolSupport: this.getCCS2Header() },
      authTokenOverride: await this.getAuthCode(id),
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = resp.json.msgId
      if (transactionId) return await this.pollForCommandCompletion(id, transactionId)
    }
    throw Error(`Failed to send lockUnlock: ${JSON.stringify(resp.json)}`)
  }

  protected async startCharge(id: string) { return await this.chargeStopCharge(id, true) }
  protected async stopCharge(id: string) { return await this.chargeStopCharge(id, false) }

  protected async chargeStopCharge(id: string, shouldCharge: boolean): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: `${this.apiDomain}/api/v2/spa/vehicles/${id}/ccs2/control/charge`,
      method: 'POST',
      data: JSON.stringify({ command: shouldCharge ? 'start' : 'stop', ccuCCS2ProtocolSupport: this.getCCS2Header() }),
      headers: { Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb), ccuCCS2ProtocolSupport: this.getCCS2Header() },
      authTokenOverride: await this.getAuthCode(id),
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = resp.json.msgId
      if (transactionId) return await this.pollForCommandCompletion(id, transactionId)
    }
    throw Error(`Failed to send charge command: ${JSON.stringify(resp.json)}`)
  }

  protected async climateOn(id: string, config: ClimateRequest): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    return await this.climateStartStop(id, {
      command: 'start',
      windshieldFrontDefogState: config.frontDefrost,
      hvacTempType: 1,
      heating1: this.getHeatingValue(config.rearDefrost, config.steering),
      tempUnit: this.config.tempType,
      drvSeatLoc: this.distanceUnit === 'mi' ? 'R' : 'L',
      hvacTemp: config.temp,
      ...(config.seatClimateOption &&
        isNotEmptyObject(config.seatClimateOption) && {
          seatClimateInfo: {
            drvSeatClimateState: config.seatClimateOption!.driver,
            psgSeatClimateState: config.seatClimateOption!.passenger,
            rlSeatClimateState: config.seatClimateOption!.rearLeft,
            rrSeatClimateState: config.seatClimateOption!.rearRight,
          },
        }),
    })
  }

  protected async climateOff(id: string): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    return await this.climateStartStop(id, { command: 'stop' })
  }

  protected async climateStartStop(id: string, climateRequest: any, retryWithNoSeat = false): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: `${this.apiDomain}/api/v2/spa/vehicles/${id}/ccs2/control/temperature`,
      method: 'POST',
      data: JSON.stringify(climateRequest),
      headers: { Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb), ccuCCS2ProtocolSupport: this.getCCS2Header() },
      authTokenOverride: await this.getAuthCode(id),
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = resp.json.msgId
      if (transactionId) return await this.pollForCommandCompletion(id, transactionId)
    } else {
      if (!retryWithNoSeat && climateRequest.seatClimateInfo) {
        delete climateRequest.seatClimateInfo
        return this.climateStartStop(id, climateRequest, true)
      }
    }
    throw Error(`Failed to send climate command: ${JSON.stringify(resp.json)}`)
  }

  protected async setChargeLimit(id: string, config: ChargeLimit): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: `${this.apiDomain}/api/v1/spa/vehicles/${id}/charge/target`,
      method: 'POST',
      data: JSON.stringify({
        targetSOClist: [
          { plugType: 0, targetSOClevel: config.dcPercent },
          { plugType: 1, targetSOClevel: config.acPercent },
        ],
      }),
      headers: { Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb), ccuCCS2ProtocolSupport: this.getCCS2Header() },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      return { isSuccess: true, data: await this.getCarStatus(id, true) }
    }
    throw Error(`Failed to send chargeLimit: ${JSON.stringify(resp.json)}`)
  }
}
