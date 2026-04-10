// Canada region — ported from egmp-bluelink-scriptable/src/lib/bluelink-regions/canada.ts
// Changes: Keychain→SecureStore, Scriptable Request→fetch, DateFormatter→manual parsing, UUID→crypto

import { Bluelink, BluelinkTokens, BluelinkCar, BluelinkStatus, ClimateRequest, ChargeLimit, Location, DEFAULT_STATUS_CHECK_INTERVAL, MAX_COMPLETION_POLLS, isNotEmptyObject } from '../base'
import { Config } from '../../config/types'

const DEFAULT_API_DOMAIN = 'mybluelink.ca'
const API_DOMAINS: Record<string, string> = {
  hyundai: 'mybluelink.ca',
  kia: 'kiaconnect.ca',
  genesis: 'genesisconnect.ca',
}

// Parse Canada date format: "20250118165212" → Date
function parseCanadaDate(dateString: string): Date {
  const year = dateString.slice(0, 4)
  const month = dateString.slice(4, 6)
  const day = dateString.slice(6, 8)
  const hour = dateString.slice(8, 10)
  const min = dateString.slice(10, 12)
  const sec = dateString.slice(12, 14)
  return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`)
}

export class BluelinkCanada extends Bluelink {
  constructor(config: Config, statusCheckInterval?: number) {
    super(config)
    this.distanceUnit = 'km'
    this.apiHost = config.manufacturer
      ? this.getApiDomain(config.manufacturer, API_DOMAINS, DEFAULT_API_DOMAIN)
      : DEFAULT_API_DOMAIN
    this.apiDomain = `https://${this.apiHost}/tods/api/`
    this.statusCheckInterval = statusCheckInterval || DEFAULT_STATUS_CHECK_INTERVAL
    this.additionalHeaders = {
      deviceid: this.generateUUID(),
      from: config.manufacturer === 'hyundai' ? 'SPA' : 'CWP',
      client_id: 'HATAHSPACA0232141ED9722C67715A0B',
      client_secret: 'CLISCR01AHSPA',
      language: '0',
      offset: this.getTimeZone().slice(0, 3),
      'User-Agent':
        config.manufacturer === 'hyundai'
          ? 'MyHyundai/2.0.25 (iPhone; iOS 18.3; Scale/3.00)'
          : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    }
    this.authHeader = 'Accesstoken'
    this.tempLookup = {
      F: [62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82],
      C: [17, 17.5, 18, 18.5, 19, 19.5, 20, 20.5, 21, 21.5, 22, 22.5, 23, 23.5, 24, 24.5, 25, 25.5, 26, 26.5, 27],
      H: ['06H', '07H', '08H', '09H', '0AH', '0BH', '0CH', '0DH', '0EH', '0FH', '10H', '11H', '12H', '13H', '14H', '15H', '16H', '17H', '18H', '19H', '1AH'],
    }
  }

  static async init(config: Config, refreshAuth: boolean, statusCheckInterval?: number) {
    const obj = new BluelinkCanada(config, statusCheckInterval)
    await obj.superInit(config, refreshAuth)
    return obj
  }

  private requestResponseValid(resp: Record<string, any>, payload: Record<string, any>): { valid: boolean; retry: boolean } {
    if (Object.hasOwn(payload, 'responseHeader') && payload.responseHeader.responseCode == 0) {
      return { valid: true, retry: false }
    }
    if (Object.hasOwn(payload, 'responseHeader') && payload.responseHeader.responseCode == 1) {
      if (
        Object.hasOwn(payload, 'error') &&
        Object.hasOwn(payload.error, 'errorDesc') &&
        (payload.error.errorDesc.toString().includes('expired') ||
          payload.error.errorDesc.toString().includes('deleted') ||
          payload.error.errorDesc.toString().includes('ip validation'))
      ) {
        return { valid: false, retry: true }
      }
    }
    return { valid: false, retry: false }
  }

  protected async getSessionCookie(): Promise<string> {
    try {
      const response = await fetch(`https://${this.apiHost}/login`, {
        method: 'GET',
        headers: this.getAdditionalHeaders(),
      })
      const setCookie = response.headers.get('set-cookie') ?? ''
      // Parse __cf_bm cookie
      for (const part of setCookie.split(',')) {
        const cookiePart = part.split(';')[0]?.trim() ?? ''
        if (cookiePart.toLowerCase().startsWith('__cf_bm=')) {
          return cookiePart
        }
      }
    } catch {
      // ignore — proceed without cookie
    }
    return ''
  }

  protected async login(): Promise<BluelinkTokens | undefined> {
    const cookieValue = await this.getSessionCookie()
    const resp = await this.request({
      url: this.apiDomain + 'v2/login',
      data: JSON.stringify({
        loginId: this.config.auth.username,
        password: this.config.auth.password,
      }),
      headers: {
        ...(cookieValue && { Cookie: cookieValue }),
      },
      noAuth: true,
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      return {
        accessToken: resp.json.result.token.accessToken,
        expiry: Math.floor(Date.now() / 1000) + Number(resp.json.result.token.expireIn),
        authCookie: cookieValue,
      }
    }
    if (this.config.debugLogging) console.error('[Canada] Login failed', JSON.stringify(resp.json))
    return undefined
  }

  protected async setCar(id: string) {
    await this.request({
      url: this.apiDomain + 'vhcllst',
      data: JSON.stringify({ vehicleId: id }),
      validResponseFunction: this.requestResponseValid.bind(this),
    })
  }

  protected async getCar(): Promise<BluelinkCar | undefined> {
    let vin = this.vin
    if (!vin && this.cache) vin = this.cache.car.vin

    const resp = await this.request({
      url: this.apiDomain + 'vhcllst',
      method: 'POST',
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    if (!this.requestResponseValid(resp.resp, resp.json).valid) {
      throw Error(`Failed to retrieve vehicles: ${JSON.stringify(resp.json)}`)
    }

    if (resp.json.result.vehicles.length > 1 && !vin) {
      for (const vehicle of resp.json.result.vehicles) {
        this.carOptions.push({ vin: vehicle.vin, nickName: vehicle.nickName, modelName: vehicle.modelName, modelYear: vehicle.modelYear })
      }
      return undefined
    }

    if (resp.json.result.vehicles.length > 0) {
      let vehicle = resp.json.result.vehicles[0]
      if (vin) {
        for (const v of resp.json.result.vehicles) {
          if (v.vin === vin) { vehicle = v; break }
        }
      }
      await this.setCar(vehicle.vehicleId)
      return {
        id: vehicle.vehicleId,
        vin: vehicle.vin,
        nickName: vehicle.nickName,
        modelName: vehicle.modelName,
        modelYear: vehicle.modelYear,
        modelColour: vehicle.exteriorColor,
        modelTrim: vehicle.trim,
      }
    }
    throw Error(`Failed to retrieve vehicle list: ${JSON.stringify(resp.json)}`)
  }

  protected returnCarStatus(status: any, forceUpdate: boolean, odometer?: number, chargeLimit?: ChargeLimit, location?: Location): BluelinkStatus {
    const lastRemoteCheck = parseCanadaDate(status.lastStatusDate + 'Z')

    if (!status.evStatus) return this.defaultNoEVStatus(lastRemoteCheck, status, forceUpdate, odometer, chargeLimit, location)

    let chargingPower = 0
    let isCharging = false
    if (status.evStatus.batteryCharge) {
      isCharging = true
      if (status.evStatus.batteryPower?.batteryFstChrgPower > 0) {
        chargingPower = status.evStatus.batteryPower.batteryFstChrgPower
      } else if (status.evStatus.batteryPower?.batteryStndChrgPower > 0) {
        chargingPower = status.evStatus.batteryPower.batteryStndChrgPower
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
      odometer: odometer ?? (this.cache?.status.odometer ?? 0),
      location: location ?? this.cache?.status.location,
      chargeLimit: chargeLimit && chargeLimit.acPercent > 0 ? chargeLimit : this.cache?.status.chargeLimit,
    }
  }

  protected async getCarStatus(id: string, forceUpdate: boolean, location = false): Promise<BluelinkStatus> {
    const api = forceUpdate ? 'rltmvhclsts' : 'sltvhcl'
    const status = await this.request({
      url: this.apiDomain + api,
      method: 'POST',
      ...(!forceUpdate && { data: JSON.stringify({ vehicleId: id }) }),
      headers: { Vehicleid: id },
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    if (!this.requestResponseValid(status.resp, status.json).valid) {
      throw Error(`Failed to retrieve vehicle status: ${JSON.stringify(status.json)}`)
    }

    let chargeLimitStatus: ChargeLimit | undefined = undefined
    let locationStatus: Location | undefined = undefined
    if (forceUpdate) chargeLimitStatus = await this.getChargeLimit(id)
    if (location) locationStatus = await this.getLocation(id)

    return this.returnCarStatus(
      status.json.result.status,
      forceUpdate,
      forceUpdate ? status.json.result.status.odometer : status.json.result.vehicle?.odometer,
      chargeLimitStatus,
      locationStatus,
    )
  }

  protected async getAuthCode(): Promise<string> {
    const resp = await this.request({
      url: this.apiDomain + 'vrfypin',
      method: 'POST',
      data: JSON.stringify({ pin: this.config.auth.pin }),
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      return resp.json.result.pAuth
    }
    throw Error(`Failed to get auth code: ${JSON.stringify(resp.json)}`)
  }

  protected async pollForCommandCompletion(id: string, authCode: string, transactionId: string, chargeLimit?: ChargeLimit): Promise<{ isSuccess: boolean; data: any }> {
    let attempts = 0
    while (attempts <= MAX_COMPLETION_POLLS) {
      const resp = await this.request({
        url: this.apiDomain + 'rmtsts',
        method: 'POST',
        headers: { Vehicleid: id, Pauth: authCode, TransactionId: transactionId },
        validResponseFunction: this.requestResponseValid.bind(this),
      })

      if (!this.requestResponseValid(resp.resp, resp.json).valid) {
        throw Error(`Poll failed: ${JSON.stringify(resp.json)}`)
      }

      if (resp.json.result.transaction.apiResult === 'C') {
        if (resp.json.result.vehicle) {
          if (!chargeLimit) chargeLimit = await this.getChargeLimit(id)
          this.cache.status = this.returnCarStatus(resp.json.result.vehicle, true, undefined, chargeLimit)
          await this.saveCache()
        }
        return { isSuccess: true, data: this.cache.status }
      }
      attempts++
      await this.sleep(2000)
    }
    return { isSuccess: false, data: undefined }
  }

  protected async lock(id: string) { return await this.lockUnlock(id, true) }
  protected async unlock(id: string) { return await this.lockUnlock(id, false) }

  protected async lockUnlock(id: string, shouldLock: boolean): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const authCode = await this.getAuthCode()
    const resp = await this.request({
      url: this.apiDomain + (shouldLock ? 'drlck' : 'drulck'),
      method: 'POST',
      data: JSON.stringify({ pin: this.config.auth.pin }),
      headers: { Vehicleid: id, Pauth: authCode },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = this.caseInsensitiveParamExtraction('transactionid', resp.resp.headers)
      if (transactionId) return await this.pollForCommandCompletion(id, authCode, transactionId)
    }
    throw Error(`Failed to send lockUnlock: ${JSON.stringify(resp.json)}`)
  }

  protected async startCharge(id: string) { return await this.chargeStopCharge(id, true) }
  protected async stopCharge(id: string) { return await this.chargeStopCharge(id, false) }

  protected async chargeStopCharge(id: string, shouldCharge: boolean): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const authCode = await this.getAuthCode()
    const resp = await this.request({
      url: this.apiDomain + (shouldCharge ? 'evc/rcstrt' : 'evc/rcstp'),
      method: 'POST',
      data: JSON.stringify({ pin: this.config.auth.pin }),
      headers: { Vehicleid: id, Pauth: authCode },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = this.caseInsensitiveParamExtraction('transactionid', resp.resp.headers)
      if (transactionId) return await this.pollForCommandCompletion(id, authCode, transactionId)
    }
    throw Error(`Failed to send charge command: ${JSON.stringify(resp.json)}`)
  }

  protected async climateOn(id: string, config: ClimateRequest, newPayloadType = false): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    if (!this.tempLookup) throw Error('No temp lookup')
    const tempIndex = this.tempLookup[this.config.tempType].indexOf(config.temp)
    if (tempIndex === -1) throw Error(`Failed to convert temp ${config.temp}`)

    const authCode = await this.getAuthCode()
    const resp = await this.request({
      url: this.apiDomain + 'evc/rfon',
      method: 'POST',
      data: JSON.stringify({
        pin: this.config.auth.pin,
        [newPayloadType ? 'remoteControl' : 'hvacInfo']: {
          airCtrl: 1,
          defrost: config.frontDefrost,
          airTemp: { value: this.tempLookup.H[tempIndex], unit: 0, hvacTempType: 1 },
          igniOnDuration: config.durationMinutes,
          heating1: this.getHeatingValue(config.rearDefrost, config.steering),
          ...(config.seatClimateOption && isNotEmptyObject(config.seatClimateOption) && {
            seatHeaterVentCMD: {
              drvSeatOptCmd: config.seatClimateOption.driver,
              astSeatOptCmd: config.seatClimateOption.passenger,
              rlSeatOptCmd: config.seatClimateOption.rearLeft,
              rrSeatOptCmd: config.seatClimateOption.rearRight,
            },
          }),
        },
      }),
      headers: { Vehicleid: id, Pauth: authCode },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = this.caseInsensitiveParamExtraction('transactionid', resp.resp.headers)
      if (transactionId) return await this.pollForCommandCompletion(id, authCode, transactionId)
    }
    if (!newPayloadType) return await this.climateOn(id, config, true)
    throw Error(`Failed to send climateOn: ${JSON.stringify(resp.json)}`)
  }

  protected async climateOff(id: string): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const authCode = await this.getAuthCode()
    const resp = await this.request({
      url: this.apiDomain + 'evc/rfoff',
      method: 'POST',
      data: JSON.stringify({ pin: this.config.auth.pin }),
      headers: { Vehicleid: id, Pauth: authCode },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = this.caseInsensitiveParamExtraction('transactionid', resp.resp.headers)
      if (transactionId) return await this.pollForCommandCompletion(id, authCode, transactionId)
    }
    throw Error(`Failed to send climateOff: ${JSON.stringify(resp.json)}`)
  }

  protected async getLocation(id: string): Promise<Location | undefined> {
    const authCode = await this.getAuthCode()
    const resp = await this.request({
      method: 'POST',
      url: this.apiDomain + 'fndmcr',
      data: JSON.stringify({ pin: this.config.auth.pin }),
      headers: { Vehicleid: id, Pauth: authCode },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid && resp.json.result) {
      return { latitude: resp.json.result.coord.lat, longitude: resp.json.result.coord.lon }
    }
    return undefined
  }

  protected async getChargeLimit(id: string): Promise<ChargeLimit> {
    const resp = await this.request({
      method: 'POST',
      url: this.apiDomain + 'evc/selsoc',
      headers: { Vehicleid: id },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    const chargeLimit = { dcPercent: 0, acPercent: 0 }
    if (this.requestResponseValid(resp.resp, resp.json).valid && resp.json.result) {
      for (const soc of resp.json.result) {
        if (soc.plugType === 0) chargeLimit.dcPercent = soc.level
        else if (soc.plugType === 1) chargeLimit.acPercent = soc.level
      }
    }
    return chargeLimit
  }

  protected async setChargeLimit(id: string, config: ChargeLimit): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const authCode = await this.getAuthCode()
    const resp = await this.request({
      url: this.apiDomain + 'evc/setsoc',
      method: 'POST',
      data: JSON.stringify({
        pin: this.config.auth.pin,
        tsoc: [{ plugType: 0, level: config.dcPercent }, { plugType: 1, level: config.acPercent }],
      }),
      headers: { Vehicleid: id, Pauth: authCode },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = this.caseInsensitiveParamExtraction('transactionid', resp.resp.headers)
      if (transactionId) return await this.pollForCommandCompletion(id, authCode, transactionId, config)
    }
    throw Error(`Failed to send chargeLimit: ${JSON.stringify(resp.json)}`)
  }
}
