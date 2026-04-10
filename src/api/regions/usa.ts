// USA (Hyundai) region — ported from egmp-bluelink-scriptable/src/lib/bluelink-regions/usa.ts

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
} from '../base'
import { Config } from '../../config/types'

const DEFAULT_API_DOMAIN = 'https://api.telematics.hyundaiusa.com/'
const API_DOMAINS: Record<string, string> = {
  hyundai: 'https://api.telematics.hyundaiusa.com/',
  kia: 'https://api.owners.kia.com/apigw/v1/',
}

export class BluelinkUSA extends Bluelink {
  private carVin: string | undefined
  private carId: string | undefined

  constructor(config: Config, statusCheckInterval?: number) {
    super(config)
    this.distanceUnit = 'mi'
    this.apiDomain = config.manufacturer
      ? this.getApiDomain(config.manufacturer, API_DOMAINS, DEFAULT_API_DOMAIN)
      : DEFAULT_API_DOMAIN
    this.statusCheckInterval = statusCheckInterval || DEFAULT_STATUS_CHECK_INTERVAL
    this.additionalHeaders = {
      from: 'SPA',
      to: 'ISS',
      language: '0',
      offset: this.getTimeZone().slice(0, 3),
      client_id: config.manufacturer === 'kia' ? 'MWAMOBILE' : 'm66129Bb-em93-SPAHYN-bZ91-am4540zp19920',
      clientSecret: config.manufacturer === 'kia' ? '98er-w34rf-ibf3-3f6h' : 'v558o935-6nne-423i-baa8',
      username: this.config.auth.username,
      blueLinkServicePin: `${this.config.auth.pin}`,
      brandIndicator: 'H',
      'User-Agent': 'okhttp/3.14.9',
    }
    this.authHeader = 'accessToken'
  }

  static async init(config: Config, refreshAuth: boolean, statusCheckInterval?: number) {
    const obj = new BluelinkUSA(config, statusCheckInterval)
    await obj.superInit(config, refreshAuth)
    return obj
  }

  private requestResponseValid(resp: Record<string, any>, _data: Record<string, any>): { valid: boolean; retry: boolean } {
    if (Object.hasOwn(resp, 'statusCode') && resp.statusCode === 200) {
      return { valid: true, retry: false }
    }
    return { valid: false, retry: true }
  }

  private carHeaders(): Record<string, string> {
    return {
      registrationId: this.cache ? this.cache.car.id : (this.carId ?? ''),
      VIN: this.cache ? this.cache.car.vin : (this.carVin ?? ''),
      'APPCLOUD-VIN': this.cache ? this.cache.car.vin : (this.carVin ?? ''),
      gen: this.cache?.car ? (Number(this.cache.car.modelYear) >= 2025 ? '3' : '2') : '2',
    }
  }

  protected async login(): Promise<BluelinkTokens | undefined> {
    const resp = await this.request({
      url: this.apiDomain + 'v2/ac/oauth/token',
      data: JSON.stringify({ username: this.config.auth.username, password: this.config.auth.password }),
      noAuth: true,
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      return {
        accessToken: resp.json.access_token,
        refreshToken: resp.json.refresh_token,
        expiry: Math.floor(Date.now() / 1000) + Number(resp.json.expires_in),
      }
    }
    console.error('[USA] Login failed', JSON.stringify(resp.json))
    return undefined
  }

  protected async refreshTokens(): Promise<BluelinkTokens | undefined> {
    const resp = await this.request({
      url: this.apiDomain + 'v2/ac/oauth/token/refresh',
      data: JSON.stringify({ refresh_token: this.cache.token.refreshToken }),
      noAuth: true,
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      return {
        accessToken: resp.json.access_token,
        refreshToken: resp.json.refresh_token,
        expiry: Math.floor(Date.now() / 1000) + resp.json.expires_in,
      }
    }
    return undefined
  }

  protected async getCar(): Promise<BluelinkCar | undefined> {
    let vin = this.vin
    if (!vin && this.cache) vin = this.cache.car.vin

    const resp = await this.request({
      url: this.apiDomain + `ac/v2/enrollment/details/${this.config.auth.username}`,
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    if (!this.requestResponseValid(resp.resp, resp.json).valid) {
      throw Error(`Failed to retrieve vehicles: ${JSON.stringify(resp.json)}`)
    }

    if (resp.json.enrolledVehicleDetails.length > 1 && !vin) {
      for (const vehicle of resp.json.enrolledVehicleDetails) {
        this.carOptions.push({ vin: vehicle.vehicleDetails.vin, nickName: vehicle.vehicleDetails.nickName, modelName: vehicle.vehicleDetails.modelCode, modelYear: vehicle.vehicleDetails.modelYear })
      }
      return undefined
    }

    if (resp.json.enrolledVehicleDetails.length > 0) {
      let vehicle = resp.json.enrolledVehicleDetails[0].vehicleDetails
      if (vin) {
        for (const v of resp.json.enrolledVehicleDetails) {
          if (v.vehicleDetails.vin === vin) { vehicle = v.vehicleDetails; break }
        }
      }
      this.carVin = vehicle.vin
      this.carId = vehicle.regid
      return {
        id: vehicle.regid,
        vin: vehicle.vin,
        nickName: vehicle.nickName,
        modelName: vehicle.modelCode,
        modelYear: vehicle.modelYear,
        odometer: vehicle.odometer ?? 0,
      }
    }
    throw Error(`Failed to retrieve vehicle list: ${JSON.stringify(resp.json)}`)
  }

  protected returnCarStatus(status: any, forceUpdate: boolean, location?: Location): BluelinkStatus {
    const lastRemoteCheck = new Date(status.dateTime)

    if (!status.evStatus) return this.defaultNoEVStatus(lastRemoteCheck, status, forceUpdate, undefined, undefined, location)

    let chargingPower = 0
    let isCharging = false
    if (status.evStatus.batteryCharge) {
      isCharging = true
      if (status.evStatus.batteryFstChrgPower > 0) {
        chargingPower = status.evStatus.batteryFstChrgPower
      } else if (status.evStatus.batteryStndChrgPower > 0) {
        chargingPower = status.evStatus.batteryStndChrgPower
      }
    }

    const chargeLimit: ChargeLimit = { dcPercent: 0, acPercent: 0 }
    if (status.evStatus.reservChargeInfos?.targetSOClist) {
      for (const limit of status.evStatus.reservChargeInfos.targetSOClist) {
        if (limit.plugType === 0) chargeLimit.dcPercent = limit.targetSOClevel
        else if (limit.plugType === 1) chargeLimit.acPercent = limit.targetSOClevel
      }
    }

    return {
      lastStatusCheck: Date.now(),
      lastRemoteStatusCheck: forceUpdate ? Date.now() : lastRemoteCheck.getTime(),
      isCharging,
      isPluggedIn: status.evStatus.batteryPlugin > 0,
      chargingPower,
      remainingChargeTimeMins: status.evStatus.remainTime2.atc.value,
      range:
        status.evStatus.drvDistance[0].rangeByFuel.evModeRange.value > 0
          ? status.evStatus.drvDistance[0].rangeByFuel.evModeRange.value
          : this.cache?.status.range ?? 0,
      locked: status.doorLock,
      climate: status.airCtrlOn,
      soc: status.evStatus.batteryStatus,
      twelveSoc: status.battery?.batSoc ?? 0,
      odometer: status.odometer ?? 0,
      location: location ?? this.cache?.status.location,
      chargeLimit: chargeLimit.acPercent > 0 ? chargeLimit : this.cache?.status.chargeLimit,
    }
  }

  protected async getCarStatus(id: string, forceUpdate: boolean, location = false): Promise<BluelinkStatus> {
    const resp = await this.request({
      url: this.apiDomain + 'ac/v2/rcs/rvs/vehicleStatus',
      headers: { ...this.carHeaders(), refresh: forceUpdate ? 'true' : 'false' },
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      let locationStatus: Location | undefined = undefined
      if (location) locationStatus = await this.getLocation(id)
      return this.returnCarStatus(resp.json.vehicleStatus, forceUpdate, locationStatus)
    }

    throw Error(`Failed to retrieve vehicle status: ${JSON.stringify(resp.json)}`)
  }

  protected async pollForCommandCompletion(transactionId: string): Promise<{ isSuccess: boolean; data: any }> {
    let attempts = 0
    while (attempts <= MAX_COMPLETION_POLLS) {
      const resp = await this.request({
        url: this.apiDomain + 'ac/v2/rmt/getRunningStatus',
        headers: { ...this.carHeaders(), tid: transactionId, login_id: this.config.auth.username, service_type: 'REMOTE_POLL' },
        validResponseFunction: this.requestResponseValid.bind(this),
      })

      if (!this.requestResponseValid(resp.resp, resp.json).valid || resp.json.status === 'ERROR') {
        throw Error(`Poll failed: ${JSON.stringify(resp.json)}`)
      }

      if (resp.json.status === 'SUCCESS') {
        const status = await this.getCarStatus(this.cache.car.id, false)
        this.cache.status = status
        await this.saveCache()
        return { isSuccess: true, data: this.cache.status }
      }
      attempts++
      await this.sleep(2000)
    }
    return { isSuccess: false, data: undefined }
  }

  protected async lock(id: string) { return await this.lockUnlock(id, true) }
  protected async unlock(id: string) { return await this.lockUnlock(id, false) }

  protected async lockUnlock(_id: string, shouldLock: boolean): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: this.apiDomain + (shouldLock ? 'ac/v2/rcs/rdo/off' : 'ac/v2/rcs/rdo/on'),
      method: 'POST',
      data: JSON.stringify({ userName: this.config.auth.username, vin: this.cache.car.vin }),
      headers: { ...this.carHeaders() },
      notJSON: true,
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = this.caseInsensitiveParamExtraction('tmsTid', resp.resp.headers)
      if (transactionId) return await this.pollForCommandCompletion(transactionId)
    }
    throw Error(`Failed to send lockUnlock: ${JSON.stringify(resp.json)}`)
  }

  protected async startCharge(id: string) { return await this.chargeStopCharge(id, true) }
  protected async stopCharge(id: string) { return await this.chargeStopCharge(id, false) }

  protected async chargeStopCharge(_id: string, shouldCharge: boolean): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: this.apiDomain + (shouldCharge ? 'ac/v2/evc/charge/start' : 'ac/v2/evc/charge/stop'),
      method: 'POST',
      data: JSON.stringify({ userName: this.config.auth.username, vin: this.cache.car.vin }),
      notJSON: true,
      headers: { ...this.carHeaders() },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = this.caseInsensitiveParamExtraction('tmsTid', resp.resp.headers)
      if (transactionId) return await this.pollForCommandCompletion(transactionId)
    }
    throw Error(`Failed to send charge command: ${JSON.stringify(resp.json)}`)
  }

  protected async climateOn(_id: string, config: ClimateRequest, retryWithNoSeat = false): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: this.apiDomain + 'ac/v2/evc/fatc/start',
      method: 'POST',
      data: JSON.stringify({
        airCtrl: 1,
        defrost: config.frontDefrost,
        airTemp: { value: config.temp.toString(), unit: this.config.tempType === 'F' ? 1 : 0 },
        ...(!retryWithNoSeat && { igniOnDuration: config.durationMinutes }),
        heating1: this.getHeatingValue(config.rearDefrost, config.steering),
        ...(config.seatClimateOption && isNotEmptyObject(config.seatClimateOption) && !retryWithNoSeat && {
          seatHeaterVentInfo: {
            drvSeatHeatState: config.seatClimateOption!.driver,
            astSeatHeatState: config.seatClimateOption!.passenger,
            rlSeatHeatState: config.seatClimateOption!.rearLeft,
            rrSeatHeatState: config.seatClimateOption!.rearRight,
          },
        }),
      }),
      notJSON: true,
      headers: { ...this.carHeaders() },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = this.caseInsensitiveParamExtraction('tmsTid', resp.resp.headers)
      if (transactionId) return await this.pollForCommandCompletion(transactionId)
    } else {
      if (!retryWithNoSeat) return this.climateOn(_id, config, true)
    }
    throw Error(`Failed to send climateOn: ${JSON.stringify(resp.json)}`)
  }

  protected async climateOff(_id: string): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: this.apiDomain + 'ac/v2/evc/fatc/stop',
      method: 'POST',
      headers: { ...this.carHeaders() },
      notJSON: true,
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = this.caseInsensitiveParamExtraction('tmsTid', resp.resp.headers)
      if (transactionId) return await this.pollForCommandCompletion(transactionId)
    }
    throw Error(`Failed to send climateOff: ${JSON.stringify(resp.json)}`)
  }

  protected async setChargeLimit(_id: string, config: ChargeLimit): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: this.apiDomain + 'ac/v2/evc/charge/targetsoc/set',
      method: 'POST',
      data: JSON.stringify({
        targetSOClist: [
          { plugType: 0, targetSOClevel: config.dcPercent },
          { plugType: 1, targetSOClevel: config.acPercent },
        ],
      }),
      notJSON: true,
      headers: { ...this.carHeaders() },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = this.caseInsensitiveParamExtraction('tmsTid', resp.resp.headers)
      if (transactionId) return await this.pollForCommandCompletion(transactionId)
    }
    throw Error(`Failed to send chargeLimit: ${JSON.stringify(resp.json)}`)
  }

  protected async getLocation(_id: string): Promise<Location | undefined> {
    const resp = await this.request({
      url: this.apiDomain + 'ac/v2/rcs/rfc/findMyCar',
      headers: { ...this.carHeaders() },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid && resp.json.coord) {
      return { latitude: resp.json.coord.lat, longitude: resp.json.coord.lon }
    }
    return undefined
  }
}
