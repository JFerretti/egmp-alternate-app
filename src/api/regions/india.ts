// India region — ported from egmp-bluelink-scriptable/src/lib/bluelink-regions/india.ts
// Key changes: UUID.string() → crypto.randomUUID(), Url.parse → parseUrlParams,
// DateFormatter → parseIndiaDate helper, logger.log → console.log/error

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
  CHARGE_COMPLETION_POLLS,
  parseUrlParams,
} from '../base'
import { Config } from '../../config/types'

interface ControlToken {
  expiry: number
  token: string
}

interface APIConfig {
  apiDomain: string
  apiPort: number
  ccspServiceId: string
  appId: string
  authCfb: string
  authBasic: string
  authHost: string
  authParam: string
  clientId: string
  authClientID: string
  pushType: string
}

const API_CONFIG: Record<string, APIConfig> = {
  hyundai: {
    apiDomain: 'prd.in-ccapi.hyundai.connected-car.io',
    apiPort: 8080,
    ccspServiceId: 'e5b3f6d0-7f83-43c9-aff3-a254db7af368',
    appId: '5a27df80-4ca1-4154-8c09-6f4029d91cf7',
    authCfb: 'RFtoRq/vDXJmRndoZaZQyfOot7OrIqGVFj96iY2WL3yyH5Z/pUvlUhqmCxD2t+D65SQ=',
    authBasic:
      'Basic ZTViM2Y2ZDAtN2Y4My00M2M5LWFmZjMtYTI1NGRiN2FmMzY4OjVKRk9DcjZDMjRPZk96bERxWnA3RXdxcmtMMFd3MDRVYXhjRGlFNlVkM3FJNVNFNA==',
    authHost: 'prd.in-ccapi.hyundai.connected-car.io',
    authParam: 'euhyundaiidm',
    clientId: 'e5b3f6d0-7f83-43c9-aff3-a254db7af368',
    authClientID: '64621b96-0f0d-11ec-82a8-0242ac130003',
    pushType: 'GCM',
  },
}

// Parse date string in 'yyyyMMddHHmmss' format as IST (UTC+5:30)
function parseIndiaDate(dateStr: string): number {
  const y = parseInt(dateStr.slice(0, 4), 10)
  const m = parseInt(dateStr.slice(4, 6), 10) - 1
  const d = parseInt(dateStr.slice(6, 8), 10)
  const h = parseInt(dateStr.slice(8, 10), 10)
  const min = parseInt(dateStr.slice(10, 12), 10)
  const s = parseInt(dateStr.slice(12, 14), 10)
  // IST is UTC+5:30 → subtract 5h30m to get UTC
  const utcMs = Date.UTC(y, m, d, h, min, s) - (5 * 60 + 30) * 60 * 1000
  return utcMs
}

export class BluelinkIndia extends Bluelink {
  private apiConfig: APIConfig
  private controlToken: ControlToken | undefined
  private europeccs2: number | undefined

  constructor(config: Config, statusCheckInterval?: number) {
    super(config)
    this.distanceUnit = this.config.distanceUnit
    if (!(config.manufacturer in API_CONFIG)) {
      throw Error(`Region ${config.manufacturer} not supported`)
    }
    this.apiConfig = API_CONFIG[config.manufacturer]!
    this.apiDomain = `https://${this.apiConfig.apiDomain}:${this.apiConfig.apiPort}`

    this.statusCheckInterval = statusCheckInterval || DEFAULT_STATUS_CHECK_INTERVAL
    this.additionalHeaders = {
      'User-Agent': 'okhttp/3.14.9',
      Host: `${this.apiConfig.apiDomain}:${this.apiConfig.apiPort}`,
      'ccsp-service-id': this.apiConfig.ccspServiceId,
      'ccsp-application-id': this.apiConfig.appId,
    }
    this.authIdHeader = 'ccsp-device-id'
    this.authHeader = 'Authorization'
    this.controlToken = undefined
    this.europeccs2 = undefined
  }

  static async init(config: Config, refreshAuth: boolean, statusCheckInterval?: number) {
    const obj = new BluelinkIndia(config, statusCheckInterval)
    await obj.superInit(config, refreshAuth)
    return obj
  }

  private getCCS2Header(): string {
    return typeof this.europeccs2 !== 'undefined'
      ? this.europeccs2.toString()
      : this.cache.car.europeccs2
        ? this.cache.car.europeccs2.toString()
        : '0'
  }

  private requestResponseValid(
    resp: Record<string, any>,
    _data: Record<string, any>,
  ): { valid: boolean; retry: boolean } {
    if (
      Object.hasOwn(resp, 'statusCode') &&
      (resp.statusCode === 200 || resp.statusCode === 204 || resp.statusCode === 302)
    ) {
      return { valid: true, retry: false }
    }
    return { valid: false, retry: true }
  }

  private getTempCode(temp: number): string {
    const temperatureRange = Array.from({ length: 65 }, (_, i) => (i + 28) * 0.5)
    const tempIndex = temperatureRange.indexOf(temp)
    if (tempIndex === -1) {
      const defaultIndex = temperatureRange.indexOf(23)
      return defaultIndex.toString(16).padStart(2, '0') + 'H'
    }
    return tempIndex.toString(16).padStart(2, '0') + 'H'
  }

  protected async login(): Promise<BluelinkTokens | undefined> {
    // Get cookies first
    const cookies = await this._get_cookies()

    // Direct signin with username/password
    const respSignin = await this.request({
      url: `${this.apiDomain}/api/v1/user/signin`,
      noAuth: true,
      data: JSON.stringify({
        email: this.config.auth.username,
        password: this.config.auth.password,
      }),
      headers: {
        'Content-Type': 'application/json',
        ...cookies,
      },
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    if (!this.requestResponseValid(respSignin.resp, respSignin.json).valid) {
      console.error(`[IN] Failed to sign in`)
      return undefined
    }

    // Extract authorization code from redirect URL
    const redirectUrl = respSignin.json.redirectUrl
    if (!redirectUrl) {
      throw Error(`Failed to get redirectUrl from signin response`)
    }

    const params = parseUrlParams(redirectUrl)
    const authCode = params.code
    if (!authCode) {
      throw Error(`Failed to extract auth code from redirect URL`)
    }

    // Get access token
    const tokenData = `grant_type=authorization_code&redirect_uri=${this.apiDomain}/api/v1/user/oauth2/redirect&code=${authCode}`
    const respTokens = await this.request({
      url: `${this.apiDomain}/api/v1/user/oauth2/token`,
      noAuth: true,
      validResponseFunction: this.requestResponseValid.bind(this),
      data: tokenData,
      headers: {
        Authorization: this.apiConfig.authBasic,
        Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if (!this.requestResponseValid(respTokens.resp, respTokens.json).valid) {
      throw Error(`Failed to get tokens`)
    }

    return {
      accessToken: `Bearer ${respTokens.json.access_token}`,
      refreshToken: respTokens.json.refresh_token,
      expiry: Math.floor(Date.now() / 1000) + Number(respTokens.json.expires_in),
      authId: await this.getDeviceId(),
    }
  }

  private async _get_cookies(): Promise<Record<string, string>> {
    const url = `${this.apiDomain}/api/v1/user/oauth2/authorize?response_type=code&state=test&client_id=${this.apiConfig.clientId}&redirect_uri=${this.apiDomain}/api/v1/user/oauth2/redirect`

    const resp = await this.request({
      url,
      noAuth: true,
      notJSON: true,
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    if (!this.requestResponseValid(resp.resp, resp.json).valid) {
      throw Error(`Failed to get cookies`)
    }

    // Parse cookies from the response cookie string
    const cookieStr = resp.cookies
    if (!cookieStr) return {}

    const result: Record<string, string> = {}
    for (const part of cookieStr.split(',')) {
      const cookiePart = part.split(';')[0]?.trim() ?? ''
      const eqIdx = cookiePart.indexOf('=')
      if (eqIdx > 0) {
        result[cookiePart.slice(0, eqIdx).trim()] = cookiePart.slice(eqIdx + 1).trim()
      }
    }
    return result
  }

  protected async refreshTokens(): Promise<BluelinkTokens | undefined> {
    if (!this.cache.token.refreshToken) {
      console.log('[IN] No refresh token - cannot refresh')
      return undefined
    }

    const refreshData = `grant_type=refresh_token&redirect_uri=https%3A%2F%2Fwww.getpostman.com%2Foauth2%2Fcallback&refresh_token=${this.cache.token.refreshToken}`

    console.log('[IN] Refreshing tokens')
    const resp = await this.request({
      url: `${this.apiDomain}/api/v1/user/oauth2/token`,
      data: refreshData,
      noAuth: true,
      validResponseFunction: this.requestResponseValid.bind(this),
      headers: {
        Authorization: this.apiConfig.authBasic,
        Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb),
        'Content-Type': 'application/x-www-form-urlencoded',
        Host: this.apiConfig.apiDomain,
        Connection: 'close',
        'Accept-Encoding': 'gzip, deflate',
        'User-Agent': 'okhttp/3.14.9',
      },
    })

    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      const tokenType = resp.json.token_type
      const accessToken = `${tokenType} ${resp.json.access_token}`

      return {
        authCookie: '',
        accessToken,
        refreshToken: this.cache.token.refreshToken,
        expiry: Math.floor(Date.now() / 1000) + Number(resp.json.expires_in),
        authId: await this.getDeviceId(),
      }
    }

    console.error(`[IN] Refresh Failed: ${JSON.stringify(resp.json)}`)
    return undefined
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
      headers: {
        Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb),
      },
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      return resp.json.resMsg.deviceId
    }

    console.error(`[IN] Failed to fetch Device ID: ${JSON.stringify(resp.json)}`)
    return undefined
  }

  protected async getCar(): Promise<BluelinkCar | undefined> {
    let vin = this.vin
    if (!vin && this.cache) vin = this.cache.car.vin

    const resp = await this.request({
      url: this.apiDomain + `/api/v1/spa/vehicles`,
      validResponseFunction: this.requestResponseValid.bind(this),
      headers: {},
    })

    if (!this.requestResponseValid(resp.resp, resp.json).valid) {
      throw Error(`Failed to retrieve vehicles: ${JSON.stringify(resp.json)}`)
    }

    if (resp.json.resMsg.vehicles.length > 1 && !vin) {
      for (const vehicle of resp.json.resMsg.vehicles) {
        this.carOptions.push({
          vin: vehicle.vin,
          nickName: vehicle.nickname,
          modelName: vehicle.vehicleName,
          modelYear: vehicle.year,
        })
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
        modelColour: vehicle.detailInfo.outColor,
        modelTrim: vehicle.detailInfo.saleCarmdlCd,
        europeccs2: vehicle.ccuCCS2ProtocolSupport,
      }
    }
    throw Error(`Failed to retrieve vehicle list: ${JSON.stringify(resp.json)}`)
  }

  protected returnCarStatus(maint: any, loc: any, status: any, updateTime: number): BluelinkStatus {
    const newOdometer = this.distanceUnit === 'mi'
      ? Math.floor(maint.odometer * 0.621371)
      : Math.floor(maint.odometer)

    const isCharging = status.evStatus.batteryCharge
    const chargingPower = 0

    const chargeLimit: ChargeLimit = this.cache?.status.chargeLimit ?? { dcPercent: 100, acPercent: 100 }
    if (status.evStatus?.reservChargeInfos?.targetSOClist) {
      for (const target of status.evStatus.reservChargeInfos.targetSOClist) {
        if (target.plugType === 1) chargeLimit.acPercent = target.targetSOClevel
        else if (target.plugType === 0) chargeLimit.dcPercent = target.targetSOClevel
      }
    }

    let location: Location | undefined = undefined
    if (loc?.gpsDetail?.coord) {
      location = {
        latitude: loc.gpsDetail.coord.lat,
        longitude: loc.gpsDetail.coord.lon,
      }
    }

    return {
      lastStatusCheck: Date.now(),
      lastRemoteStatusCheck: updateTime,
      isCharging,
      isPluggedIn: status.evStatus.batteryPlugin > 0,
      chargingPower,
      remainingChargeTimeMins: status.evStatus.remainTime2.atc.value,
      range:
        status.evStatus.drvDistance[0].rangeByFuel.totalAvailableRange.value > 0
          ? Math.floor(status.evStatus.drvDistance[0].rangeByFuel.totalAvailableRange.value)
          : this.cache?.status.range ?? 0,
      locked: status.doorLock,
      climate: status.airCtrlOn,
      soc: status.evStatus.batteryStatus,
      twelveSoc: 0,
      odometer: newOdometer || this.cache?.status.odometer || 0,
      location: location ?? this.cache?.status.location,
      chargeLimit: chargeLimit.acPercent > 0 ? chargeLimit : this.cache?.status.chargeLimit,
    }
  }

  protected async getCarStatus(id: string, forceUpdate: boolean, _location = false): Promise<BluelinkStatus> {
    const url = forceUpdate
      ? `${this.apiDomain}/api/v1/spa/vehicles/${id}/status`
      : `${this.apiDomain}/api/v1/spa/vehicles/${id}/status/latest`

    const resp = await this.request({
      url,
      headers: { ccuCCS2ProtocolSupport: this.getCCS2Header() },
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      const respMaint = await this.getMaintenanceAlerts(id)
      const respLoc = await this.getLocation(id)
      const lastRemoteCheck = parseIndiaDate(String(resp.json.resMsg.time))

      return this.returnCarStatus(respMaint, respLoc, resp.json.resMsg, lastRemoteCheck)
    }

    throw Error(`Failed to retrieve vehicle status: ${JSON.stringify(resp.json)}`)
  }

  protected async getAuthCode(_id: string): Promise<string> {
    if (this.controlToken && this.controlToken.expiry > Date.now()) {
      return this.controlToken.token
    }
    const resp = await this.request({
      url: `${this.apiDomain}/api/v1/user/pin?token=`,
      method: 'PUT',
      data: JSON.stringify({
        pin: this.config.auth.pin,
        deviceId: this.cache.token.authId,
      }),
      headers: { Host: this.apiConfig.apiDomain },
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.controlToken = {
        expiry: Date.now() + Number(resp.json.expiresTime) * 1000,
        token: `Bearer ${resp.json.controlToken}`,
      }
      return this.controlToken.token
    }
    throw Error(`Failed to get control token: ${JSON.stringify(resp.json)}`)
  }

  protected async pollForCommandCompletion(
    id: string,
    transactionId: string,
    maxPolls: number = MAX_COMPLETION_POLLS,
  ): Promise<{ isSuccess: boolean; data: any }> {
    let attempts = 0
    while (attempts <= maxPolls) {
      const resp = await this.request({
        url: `${this.apiDomain}/api/v1/spa/notifications/${id}/records`,
        headers: {},
        validResponseFunction: this.requestResponseValid.bind(this),
      })

      if (!this.requestResponseValid(resp.resp, resp.json).valid) {
        throw Error(`Failed to poll for command completion: ${JSON.stringify(resp.json)}`)
      }

      for (const record of resp.json.resMsg) {
        if (record.recordId === transactionId) {
          const result = record.result
          if (result) {
            switch (result) {
              case 'success':
                return {
                  isSuccess: true,
                  data: (await this.getStatus(false, true)).status,
                }
              case 'fail':
              case 'non-response':
                return { isSuccess: false, data: record }
              default:
                console.log(`[IN] Waiting for command completion: ${JSON.stringify(record)}`)
                break
            }
          }
        }
      }

      attempts += 1
      await this.sleep(2000)
    }
    return { isSuccess: false, data: undefined }
  }

  protected async lock(id: string) { return await this.lockUnlock(id, true) }
  protected async unlock(id: string) { return await this.lockUnlock(id, false) }

  protected async lockUnlock(id: string, shouldLock: boolean): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: `${this.apiDomain}/api/v1/spa/vehicles/${id}/control/door`,
      method: 'POST',
      data: JSON.stringify({
        action: shouldLock ? 'close' : 'open',
        deviceId: this.cache.token.authId,
      }),
      headers: {},
      validResponseFunction: this.requestResponseValid.bind(this),
      noRetry: true,
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = resp.json.msgId
      if (transactionId) return await this.pollForCommandCompletion(id, transactionId)
    }
    throw Error(`Failed to send lockUnlock command: ${JSON.stringify(resp.json)}`)
  }

  protected async startCharge(id: string) { return await this.chargeStopCharge(id, true) }
  protected async stopCharge(id: string) { return await this.chargeStopCharge(id, false) }

  protected async chargeStopCharge(id: string, shouldCharge: boolean): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: `${this.apiDomain}/api/v2/spa/vehicles/${id}/control/charge`,
      method: 'POST',
      data: JSON.stringify({
        action: shouldCharge ? 'start' : 'stop',
        deviceId: this.cache.token.authId,
        ccuCCS2ProtocolSupport: this.getCCS2Header(),
      }),
      headers: { ccuCCS2ProtocolSupport: this.getCCS2Header() },
      authTokenOverride: await this.getAuthCode(id),
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = resp.json.msgId
      if (transactionId) return await this.pollForCommandCompletion(id, transactionId, CHARGE_COMPLETION_POLLS)
    }
    throw Error(`Failed to send chargeStartStop command: ${JSON.stringify(resp.json)}`)
  }

  protected async climateOn(id: string, config: ClimateRequest): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const temp = config.temp ?? 23
    const frontDefrost = config.frontDefrost ?? false
    const heating = this.getHeatingValue(config.rearDefrost, false)

    const payload = {
      action: 'start',
      hvacType: 1,
      options: {
        defrost: frontDefrost,
        heating1: heating,
      },
      tempCode: this.getTempCode(temp),
      unit: 'C',
    }

    const resp = await this.request({
      url: `${this.apiDomain}/api/v1/spa/vehicles/${id}/control/engine`,
      method: 'POST',
      data: JSON.stringify(payload),
      headers: {},
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = resp.json.msgId
      if (transactionId) return await this.pollForCommandCompletion(id, transactionId)
    }
    throw Error(`Failed to start climate: ${JSON.stringify(resp.json)}`)
  }

  protected async climateOff(id: string): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: `${this.apiDomain}/api/v2/spa/vehicles/${id}/control/engine`,
      method: 'POST',
      data: JSON.stringify({ action: 'stop' }),
      headers: {},
      authTokenOverride: await this.getAuthCode(id),
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = resp.json.msgId
      if (transactionId) return await this.pollForCommandCompletion(id, transactionId)
    }
    throw Error(`Failed to stop climate: ${JSON.stringify(resp.json)}`)
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
      headers: { ccuCCS2ProtocolSupport: this.getCCS2Header() },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      return {
        isSuccess: true,
        data: await this.getCarStatus(id, true),
      }
    }
    throw Error(`Failed to send chargeLimit command: ${JSON.stringify(resp.json)}`)
  }

  protected async getMaintenanceAlerts(id: string): Promise<any> {
    const resp = await this.request({
      url: `${this.apiDomain}/api/v1/spa/vehicles/${id}/setting/alert/maintenance`,
      validResponseFunction: this.requestResponseValid.bind(this),
      headers: {},
    })

    if (!this.requestResponseValid(resp.resp, resp.json).valid) {
      console.error(`[IN] Failed to get maintenance alerts: ${JSON.stringify(resp.json)}`)
      return []
    }
    return resp.json.resMsg
  }

  protected async getLocation(id: string): Promise<any> {
    const resp = await this.request({
      url: `${this.apiDomain}/api/v1/spa/vehicles/${id}/location/park`,
      validResponseFunction: this.requestResponseValid.bind(this),
      headers: {},
    })

    if (!this.requestResponseValid(resp.resp, resp.json).valid) {
      console.error(`[IN] Failed to get location: ${JSON.stringify(resp.json)}`)
      return undefined
    }
    return resp.json.resMsg
  }
}
