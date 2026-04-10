// Australia region — ported from egmp-bluelink-scriptable/src/lib/bluelink-regions/australia.ts
// Key changes: UUID.string() → crypto.randomUUID(), Url.parse → parseUrlParams, isNotEmptyObject from base

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
  isNotEmptyObject,
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
  clientId: string
  pushType: string
  authBasic: string
}

const API_CONFIG: Record<string, APIConfig> = {
  hyundai: {
    apiDomain: 'au-apigw.ccs.hyundai.com.au',
    apiPort: 8080,
    ccspServiceId: '855c72df-dfd7-4230-ab03-67cbf902bb1c',
    appId: 'f9ccfdac-a48d-4c57-bd32-9116963c24ed',
    authCfb: 'nGDHng3k4Cg9gWV+C+A6Yk/ecDopUNTkGmDpr2qVKAQXx9bvY2/YLoHPfObliK32F2g=',
    clientId: '855c72df-dfd7-4230-ab03-67cbf902bb1c',
    authBasic:
      'Basic ODU1YzcyZGYtZGZkNy00MjMwLWFiMDMtNjdjYmY5MDJiYjFjOmU2ZmJ3SE0zMllOYmhRbDBwdmlhUHAzcmY0dDNTNms5MWVjZUEzTUpMZGJkVGhDTw==',
    pushType: 'GCM',
  },
  kia: {
    apiDomain: 'au-apigw.ccs.kia.com.au',
    apiPort: 8082,
    ccspServiceId: '8acb778a-b918-4a8d-8624-73a0beb64289',
    appId: '4ad4dcde-be23-48a8-bc1c-91b94f5c06f8',
    authCfb: 'IDbMgWBXgic4MAyMgf5PFFRAdGX5O3IyC3uvN3scCs0gDpTFDuyvBorlAH9JMM2/wMc=',
    clientId: 'fdc85c00-0a2f-4c64-bcb4-2cfb1500730a',
    authBasic:
      'Basic OGFjYjc3OGEtYjkxOC00YThkLTg2MjQtNzNhMGJlYjY0Mjg5OjdTY01NbTZmRVlYZGlFUEN4YVBhUW1nZVlkbFVyZndvaDRBZlhHT3pZSVMyQ3U5VA==',
    pushType: 'GCM',
  },
}

export class BluelinkAustralia extends Bluelink {
  private lang = 'en'
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
      'User-Agent': 'okhttp/4.10.0',
      'X-Requested-With': 'com.hyundai.bluelink.aus',
      offset: this.getTimeZone().slice(0, 3),
      'ccsp-service-id': this.apiConfig.ccspServiceId,
      'ccsp-application-id': this.apiConfig.appId,
      country: 'au',
    }
    this.authIdHeader = 'ccsp-device-id'
    this.authHeader = 'Authorization'
    this.controlToken = undefined
    this.europeccs2 = undefined
  }

  static async init(config: Config, refreshAuth: boolean, statusCheckInterval?: number) {
    const obj = new BluelinkAustralia(config, statusCheckInterval)
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

  protected async login(): Promise<BluelinkTokens | undefined> {
    // Start OAuth flow
    const respReset = await this.request({
      url: `${this.apiDomain}/api/v1/user/oauth2/authorize?response_type=code&state=test&client_id=${this.apiConfig.clientId}&redirect_uri=${this.apiDomain}/api/v1/user/oauth2/redirect&lang=${this.lang}`,
      noAuth: true,
      notJSON: true,
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    if (!this.requestResponseValid(respReset.resp, respReset.json).valid) {
      console.error(`[AU] Failed to reset session ${JSON.stringify(respReset.resp)}`)
      throw Error(`Failed to reset session`)
    }

    // Reset session
    const respSession = await this.request({
      method: 'DELETE',
      url: `${this.apiDomain}/api/v1/user/session`,
      noAuth: true,
      notJSON: true,
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    if (!this.requestResponseValid(respSession.resp, respSession.json).valid) {
      console.error(`[AU] Failed to reset session ${JSON.stringify(respSession.resp)}`)
      throw Error(`Failed to reset session`)
    }

    // Perform login to get redirectUrl / code
    const respLogin = await this.request({
      url: `${this.apiDomain}/api/v1/user/signin`,
      noAuth: true,
      validResponseFunction: this.requestResponseValid.bind(this),
      method: 'POST',
      data: JSON.stringify({
        email: this.config.auth.username,
        password: this.config.auth.password,
        mobileNum: '',
      }),
    })

    if (!this.requestResponseValid(respLogin.resp, respLogin.json).valid) {
      console.error(`[AU] Failed to login`)
      return undefined
    }

    const loginRedirectUrl = respLogin.json.redirectUrl
    if (!loginRedirectUrl) {
      throw Error(`Failed to get redirectUrl from login response`)
    }

    const loginParams = parseUrlParams(loginRedirectUrl)
    const loginAuthCode = loginParams.code
    if (!loginAuthCode) {
      throw Error(`Failed to extract auth code from redirect URL`)
    }

    // Get tokens
    const tokenData = `client_id=${this.apiConfig.clientId}&grant_type=authorization_code&code=${loginAuthCode}&redirect_uri=${this.apiDomain}/api/v1/user/oauth2/redirect`
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

  protected async refreshTokens(): Promise<BluelinkTokens | undefined> {
    if (!this.cache.token.refreshToken) {
      console.log('[AU] No refresh token - cannot refresh')
      return undefined
    }
    const refreshData = `client_id=${this.apiConfig.clientId}&grant_type=refresh_token&refresh_token=${this.cache.token.refreshToken}&redirect_uri=${this.apiDomain}/api/v1/user/oauth2/redirect`

    console.log('[AU] Refreshing tokens')
    const resp = await this.request({
      url: `${this.apiDomain}/api/v1/user/oauth2/token`,
      data: refreshData,
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
        refreshToken: this.cache.token.refreshToken,
        expiry: Math.floor(Date.now() / 1000) + Number(resp.json.expires_in),
        authId: await this.getDeviceId(),
      }
    }

    console.error(`[AU] Refresh Failed: ${JSON.stringify(resp.json)}`)
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

    console.error(`[AU] Failed to fetch Device ID: ${JSON.stringify(resp.json)}`)
    return undefined
  }

  protected async getCar(): Promise<BluelinkCar | undefined> {
    let vin = this.vin
    if (!vin && this.cache) vin = this.cache.car.vin

    const resp = await this.request({
      url: this.apiDomain + `/api/v1/spa/vehicles`,
      validResponseFunction: this.requestResponseValid.bind(this),
      headers: {
        Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb),
      },
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

  protected returnCarStatus(status: any, updateTime: number): BluelinkStatus {
    const newOdometer =
      this.distanceUnit === 'mi'
        ? Math.floor(status.Drivetrain.Odometer * 0.621371)
        : Math.floor(status.Drivetrain.Odometer)

    let isCharging = false
    let chargingPower = 0
    if (
      status.Green.ChargingInformation.ConnectorFastening.State &&
      status.Green.ChargingInformation.Charging.RemainTime > 0
    ) {
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
      location = {
        latitude: status.Location.GeoCoord.Latitude,
        longitude: status.Location.GeoCoord.Longitude,
      }
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
          ? Math.floor(status.Drivetrain.FuelSystem.DTE.Total)
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
      odometer: newOdometer || this.cache?.status.odometer || 0,
      location: location ?? this.cache?.status.location,
      chargeLimit: chargeLimit.acPercent > 0 ? chargeLimit : this.cache?.status.chargeLimit,
    }
  }

  protected async getCarStatus(id: string, forceUpdate: boolean, _location = false): Promise<BluelinkStatus> {
    if (!forceUpdate) {
      const resp = await this.request({
        url: `${this.apiDomain}/api/v1/spa/vehicles/${id}/ccs2/carstatus/latest`,
        headers: {
          Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb),
          ccuCCS2ProtocolSupport: this.getCCS2Header(),
        },
        validResponseFunction: this.requestResponseValid.bind(this),
      })

      if (this.requestResponseValid(resp.resp, resp.json).valid) {
        return this.returnCarStatus(resp.json.resMsg.state.Vehicle, resp.json.resMsg.lastUpdateTime)
      }
      throw Error(`Failed to retrieve vehicle status: ${JSON.stringify(resp.json)}`)
    }

    // Force update: send command then poll cached status until it updates
    const currentTime = Date.now()
    const resp = await this.request({
      url: `${this.apiDomain}/api/v1/spa/vehicles/${id}/ccs2/carstatus`,
      headers: {
        Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb),
        ccuCCS2ProtocolSupport: this.getCCS2Header(),
      },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      let attempts = 0
      while (attempts <= MAX_COMPLETION_POLLS) {
        attempts += 1
        await this.sleep(2000)
        const status = await this.getCarStatus(id, false)
        if (currentTime < status.lastRemoteStatusCheck) {
          return status
        }
      }
    }

    throw Error(`Failed to retrieve remote vehicle status: ${JSON.stringify(resp.json)}`)
  }

  protected async getAuthCode(id: string): Promise<string> {
    if (this.controlToken && this.controlToken.expiry > Date.now()) {
      return this.controlToken.token
    }
    const resp = await this.request({
      url: `${this.apiDomain}/api/v1/user/pin`,
      method: 'PUT',
      data: JSON.stringify({
        pin: this.config.auth.pin,
        deviceId: this.cache.token.authId,
      }),
      headers: {
        vehicleId: id,
        Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb),
        ccuCCS2ProtocolSupport: this.getCCS2Header(),
      },
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

  protected async pollForCommandCompletion(
    id: string,
    transactionId: string,
    maxPolls: number = MAX_COMPLETION_POLLS,
  ): Promise<{ isSuccess: boolean; data: any }> {
    let attempts = 0
    while (attempts <= maxPolls) {
      const resp = await this.request({
        url: `${this.apiDomain}/api/v1/spa/notifications/${id}/records`,
        headers: {
          Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb),
          ccuCCS2ProtocolSupport: this.getCCS2Header(),
        },
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
                console.log(`[AU] Waiting for command completion: ${JSON.stringify(record)}`)
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
      url: `${this.apiDomain}/api/v2/spa/vehicles/${id}/ccs2/control/door`,
      method: 'POST',
      data: JSON.stringify({ command: shouldLock ? 'close' : 'open' }),
      headers: {
        Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb),
        ccuCCS2ProtocolSupport: this.getCCS2Header(),
      },
      authTokenOverride: await this.getAuthCode(id),
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
      url: `${this.apiDomain}/api/v2/spa/vehicles/${id}/ccs2/control/charge`,
      method: 'POST',
      data: JSON.stringify({
        command: shouldCharge ? 'start' : 'stop',
        ccuCCS2ProtocolSupport: this.getCCS2Header(),
      }),
      headers: {
        Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb),
        ccuCCS2ProtocolSupport: this.getCCS2Header(),
      },
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
    return await this.climateStartStop(id, {
      command: 'start',
      windshieldFrontDefogState: config.frontDefrost,
      hvacTempType: 1,
      heating1: this.getHeatingValue(config.rearDefrost, config.steering),
      tempUnit: this.config.tempType,
      drvSeatLoc: 'R', // Australia uses RHD cars
      hvacTemp: config.temp,
      ...(config.seatClimateOption &&
        isNotEmptyObject(config.seatClimateOption) && {
          seatClimateInfo: {
            drvSeatClimateState: config.seatClimateOption.driver,
            psgSeatClimateState: config.seatClimateOption.passenger,
            rlSeatClimateState: config.seatClimateOption.rearLeft,
            rrSeatClimateState: config.seatClimateOption.rearRight,
          },
        }),
    })
  }

  protected async climateOff(id: string): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    return await this.climateStartStop(id, { command: 'stop' })
  }

  protected async climateStartStop(id: string, climateRequest: any): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: `${this.apiDomain}/api/v2/spa/vehicles/${id}/ccs2/control/temperature`,
      method: 'POST',
      data: JSON.stringify(climateRequest),
      headers: {
        Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb),
        ccuCCS2ProtocolSupport: this.getCCS2Header(),
      },
      authTokenOverride: await this.getAuthCode(id),
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = resp.json.msgId
      if (transactionId) return await this.pollForCommandCompletion(id, transactionId)
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
      headers: {
        Stamp: this.getStamp(this.apiConfig.appId, this.apiConfig.authCfb),
        ccuCCS2ProtocolSupport: this.getCCS2Header(),
      },
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
}
