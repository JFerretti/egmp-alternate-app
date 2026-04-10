// USA Kia region — ported from egmp-bluelink-scriptable/src/lib/bluelink-regions/usa-kia.ts
// Key change: textInput (Scriptable UI) replaced with mfaInputCallback passed at init time

import {
  Bluelink,
  BluelinkTokens,
  BluelinkCar,
  BluelinkStatus,
  ClimateRequest,
  DEFAULT_STATUS_CHECK_INTERVAL,
  MAX_COMPLETION_POLLS,
  CHARGE_COMPLETION_POLLS,
  ChargeLimit,
  Location,
  isNotEmptyObject,
} from '../base'
import { Config } from '../../config/types'

const DEFAULT_API_DOMAIN = 'api.owners.kia.com'
const LOGIN_EXPIRY = 24 * 60 * 60 // seconds

interface MFAResponse {
  rmtoken: string
  sid?: string
}

// Callback type for MFA code input — provided by the UI layer
export type MFAInputCallback = (type: 'SMS' | 'EMAIL') => Promise<string | null>

export class BluelinkUSAKia extends Bluelink {
  private mfaInputCallback: MFAInputCallback | undefined

  constructor(config: Config, statusCheckInterval?: number, mfaInputCallback?: MFAInputCallback) {
    super(config)
    this.distanceUnit = 'mi'
    this.apiDomain = `https://${DEFAULT_API_DOMAIN}/apigw/v1/`
    this.statusCheckInterval = statusCheckInterval || DEFAULT_STATUS_CHECK_INTERVAL
    this.additionalHeaders = {
      from: 'SPA',
      language: '0',
      offset: this.getTimeZone().slice(0, 3),
      appType: 'L',
      appVersion: '7.22.0',
      clientuuid: this.generateUUID(),
      clientId: 'SPACL716-APL',
      phonebrand: 'Android',
      osType: 'Android',
      osVersion: '14',
      secretKey: 'sydnat-9kykci-Kuhtep-h5nK',
      to: 'APIGW',
      tokentype: 'A',
      'User-Agent': 'okhttp/4.9.2',
      deviceId: this.generateDeviceId(),
      Host: DEFAULT_API_DOMAIN,
    }
    this.authHeader = 'sid'
    this.authIdHeader = 'vinkey'
    this.mfaInputCallback = mfaInputCallback
  }

  static async init(config: Config, refreshAuth: boolean, statusCheckInterval?: number, mfaInputCallback?: MFAInputCallback) {
    const obj = new BluelinkUSAKia(config, statusCheckInterval, mfaInputCallback)
    await obj.superInit(config, refreshAuth)
    return obj
  }

  protected generateDeviceId(): string {
    return `${this.genRanHex(22)}:${this.genRanHex(9)}_${this.genRanHex(10)}-${this.genRanHex(5)}_${this.genRanHex(22)}_${this.genRanHex(8)}-${this.genRanHex(18)}-_${this.genRanHex(22)}_${this.genRanHex(17)}`
  }

  protected getAdditionalHeaders(): Record<string, string> {
    if (this.cache?.token.additionalTokens?.deviceId) {
      this.additionalHeaders.deviceId = this.cache.token.additionalTokens.deviceId
    }
    if (this.cache?.token.additionalTokens?.clientuuid) {
      this.additionalHeaders.clientuuid = this.cache.token.additionalTokens.clientuuid
    }
    return this.additionalHeaders
  }

  private getDateString(): string {
    return new Date()
      .toLocaleDateString('en-GB', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        timeZone: 'Europe/London',
        timeZoneName: 'short',
      })
      .replace(' at', '')
  }

  private requestResponseValid(resp: Record<string, any>, data: Record<string, any>): { valid: boolean; retry: boolean } {
    if (Object.hasOwn(resp, 'statusCode') && resp.statusCode !== 200) {
      return { valid: false, retry: true }
    }
    if (Object.hasOwn(data, 'status') && Object.hasOwn(data.status, 'statusCode') && data.status.statusCode === 0) {
      return { valid: true, retry: false }
    }
    return { valid: false, retry: true }
  }

  protected async mfa(type: 'EMAIL' | 'SMS', code: string, xid: string): Promise<BluelinkTokens | undefined> {
    const mfaSendResp = await this.request({
      url: this.apiDomain + 'cmm/sendOTP',
      data: '{}',
      headers: { date: this.getDateString(), otpkey: code, notifytype: type, xid },
      noAuth: true,
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (!this.requestResponseValid(mfaSendResp.resp, mfaSendResp.json).valid) {
      return undefined
    }

    // Prompt the user for MFA code via callback
    if (!this.mfaInputCallback) {
      console.error('[USA-Kia] MFA required but no input callback provided')
      return undefined
    }

    const mfaCode = await this.mfaInputCallback(type)
    if (!mfaCode) return undefined

    const mfaVerifyResp = await this.request({
      url: this.apiDomain + 'cmm/verifyOTP',
      data: JSON.stringify({ otp: mfaCode }),
      headers: { date: this.getDateString(), otpkey: code, xid },
      noAuth: true,
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    if (this.requestResponseValid(mfaVerifyResp.resp, mfaVerifyResp.json).valid) {
      return await this.login({
        rmtoken: this.caseInsensitiveParamExtraction('rmtoken', mfaVerifyResp.resp.headers) ?? '',
        sid: this.caseInsensitiveParamExtraction('sid', mfaVerifyResp.resp.headers) ?? '',
      })
    }
    return undefined
  }

  protected async login(mfaToken: MFAResponse | undefined = undefined): Promise<BluelinkTokens | undefined> {
    if (!mfaToken && this.cache?.token.additionalTokens?.rmToken) {
      mfaToken = { rmtoken: this.cache.token.additionalTokens.rmToken }
    }

    const resp = await this.request({
      url: this.apiDomain + 'prof/authUser',
      data: JSON.stringify({
        deviceKey: this.getAdditionalHeaders().deviceId,
        deviceType: 2,
        tncFlag: 1,
        userCredential: { userId: this.config.auth.username, password: this.config.auth.password },
      }),
      headers: {
        date: this.getDateString(),
        ...(mfaToken?.rmtoken && { rmtoken: mfaToken.rmtoken }),
        ...(mfaToken?.sid && { sid: mfaToken.sid }),
      },
      noAuth: true,
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      const sid = this.caseInsensitiveParamExtraction('sid', resp.resp.headers)
      const xid = this.caseInsensitiveParamExtraction('xid', resp.resp.headers)
      if (!sid && xid && (!mfaToken || !mfaToken.sid)) {
        return await this.mfa(
          resp.json.payload.phoneVerifyStatus && this.config.mfaPreference === 'sms' ? 'SMS' : 'EMAIL',
          resp.json.payload.otpKey,
          xid,
        )
      }

      this.tokens = {
        accessToken: sid ?? '',
        refreshToken: '',
        expiry: Math.floor(Date.now() / 1000) + LOGIN_EXPIRY,
        ...(mfaToken && {
          additionalTokens: {
            rmToken: mfaToken.rmtoken,
            deviceId: this.getAdditionalHeaders().deviceId ?? '',
            clientuuid: this.getAdditionalHeaders().clientuuid ?? '',
          },
        }),
      }
      const car = await this.getCar(true)
      if (car) this.tokens.authId = car.id
      return this.tokens
    }

    if (this.cache?.token.additionalTokens?.deviceId) {
      this.cache.token.additionalTokens.deviceId = this.generateDeviceId()
      this.cache.token.additionalTokens.clientuuid = this.generateUUID()
      await this.saveCache()
    }
    return undefined
  }

  protected async getCar(noRetry = false): Promise<BluelinkCar | undefined> {
    let vin = this.vin
    if (!vin && this.cache) vin = this.cache.car.vin

    const resp = await this.request({
      url: this.apiDomain + 'ownr/gvl',
      headers: { date: this.getDateString(), 'Content-Type': 'application/json' },
      noRetry,
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    if (!this.requestResponseValid(resp.resp, resp.json).valid) {
      throw Error(`Failed to retrieve vehicles: ${JSON.stringify(resp.json)}`)
    }

    if (resp.json.payload.vehicleSummary.length > 1 && !vin) {
      for (const vehicle of resp.json.payload.vehicleSummary) {
        this.carOptions.push({ vin: vehicle.vin, nickName: vehicle.nickName, modelName: vehicle.modelName, modelYear: vehicle.modelYear })
      }
      return undefined
    }

    if (resp.json.payload.vehicleSummary.length > 0) {
      let vehicle = resp.json.payload.vehicleSummary[0]
      if (vin) {
        for (const v of resp.json.payload.vehicleSummary) {
          if (v.vin === vin) { vehicle = v; break }
        }
      }
      return {
        id: vehicle.vehicleKey,
        vin: vehicle.vin,
        nickName: vehicle.nickName,
        modelName: vehicle.modelName,
        modelYear: vehicle.modelYear,
        odometer: 0,
      }
    }
    throw Error(`Failed to retrieve vehicle list: ${JSON.stringify(resp.json)}`)
  }

  protected returnCarStatus(status: any, forceUpdate: boolean): BluelinkStatus {
    const lastRemoteCheck = new Date(status.lastStatusDate ?? Date.now())

    if (!status.evStatus) return this.defaultNoEVStatus(lastRemoteCheck, status, forceUpdate)

    let chargingPower = 0
    let isCharging = false
    if (status.evStatus.batteryCharge) {
      isCharging = true
      chargingPower = status.evStatus.batteryFstChrgPower ?? status.evStatus.batteryStndChrgPower ?? 0
    }

    return {
      lastStatusCheck: Date.now(),
      lastRemoteStatusCheck: forceUpdate ? Date.now() : lastRemoteCheck.getTime(),
      isCharging,
      isPluggedIn: status.evStatus.batteryPlugin > 0,
      chargingPower,
      remainingChargeTimeMins: status.evStatus.remainTime2?.atc?.value ?? 0,
      range: status.evStatus.drvDistance?.[0]?.rangeByFuel?.evModeRange?.value > 0
        ? status.evStatus.drvDistance[0].rangeByFuel.evModeRange.value
        : this.cache?.status.range ?? 0,
      locked: status.doorLock,
      climate: status.airCtrlOn,
      soc: status.evStatus.batteryStatus,
      twelveSoc: status.battery?.batSoc ?? 0,
      odometer: this.cache?.status.odometer ?? 0,
      chargeLimit: this.cache?.status.chargeLimit,
    }
  }

  protected async getCarStatus(id: string, forceUpdate: boolean, _location = false): Promise<BluelinkStatus> {
    const resp = await this.request({
      url: this.apiDomain + 'vhcl/vStatus',
      data: JSON.stringify({ vehicleKey: id }),
      headers: { date: this.getDateString(), vinKey: id },
      validResponseFunction: this.requestResponseValid.bind(this),
    })

    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      return this.returnCarStatus(resp.json.payload, forceUpdate)
    }
    throw Error(`Failed to retrieve vehicle status: ${JSON.stringify(resp.json)}`)
  }

  protected async pollForCommandCompletion(transactionId: string, maxPolls: number = MAX_COMPLETION_POLLS): Promise<{ isSuccess: boolean; data: any }> {
    let attempts = 0
    while (attempts <= maxPolls) {
      await this.sleep(2000)
      const resp = await this.request({
        url: this.apiDomain + 'rmts/getRunningStatus',
        headers: { date: this.getDateString(), transactionId },
        validResponseFunction: this.requestResponseValid.bind(this),
      })

      if (this.requestResponseValid(resp.resp, resp.json).valid) {
        const status = resp.json.payload?.remoteStatus
        if (status === 'SUCCESS') {
          return { isSuccess: true, data: this.cache.status }
        }
        if (status === 'FAILURE') {
          return { isSuccess: false, data: undefined }
        }
      }
      attempts++
    }
    return { isSuccess: false, data: undefined }
  }

  protected async lock(id: string) { return await this.lockUnlock(id, true) }
  protected async unlock(id: string) { return await this.lockUnlock(id, false) }

  protected async lockUnlock(id: string, shouldLock: boolean): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: this.apiDomain + (shouldLock ? 'vhcl/dLck' : 'vhcl/dUnLck'),
      data: JSON.stringify({ vehicleKey: id, pin: this.config.auth.pin }),
      headers: { date: this.getDateString() },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = this.caseInsensitiveParamExtraction('transactionid', resp.resp.headers)
      if (transactionId) return await this.pollForCommandCompletion(transactionId)
    }
    throw Error(`Failed to send lockUnlock: ${JSON.stringify(resp.json)}`)
  }

  protected async startCharge(id: string) { return await this.chargeStopCharge(id, true) }
  protected async stopCharge(id: string) { return await this.chargeStopCharge(id, false) }

  protected async chargeStopCharge(id: string, shouldCharge: boolean): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: this.apiDomain + (shouldCharge ? 'evc/rcstrt' : 'evc/rcstp'),
      data: JSON.stringify({ vehicleKey: id }),
      headers: { date: this.getDateString() },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = this.caseInsensitiveParamExtraction('transactionid', resp.resp.headers)
      if (transactionId) return await this.pollForCommandCompletion(transactionId, CHARGE_COMPLETION_POLLS)
    }
    throw Error(`Failed to send charge command: ${JSON.stringify(resp.json)}`)
  }

  protected async climateOn(id: string, config: ClimateRequest): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: this.apiDomain + 'evc/rFatcStart',
      data: JSON.stringify({
        vehicleKey: id,
        airCtrl: 1,
        airTemp: { value: config.temp.toString(), unit: this.config.tempType === 'F' ? 1 : 0 },
        defrost: config.frontDefrost,
        heating1: this.getHeatingValue(config.rearDefrost, config.steering),
      }),
      headers: { date: this.getDateString() },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = this.caseInsensitiveParamExtraction('transactionid', resp.resp.headers)
      if (transactionId) return await this.pollForCommandCompletion(transactionId)
    }
    throw Error(`Failed to send climateOn: ${JSON.stringify(resp.json)}`)
  }

  protected async climateOff(id: string): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: this.apiDomain + 'evc/rFatcStop',
      data: JSON.stringify({ vehicleKey: id }),
      headers: { date: this.getDateString() },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      const transactionId = this.caseInsensitiveParamExtraction('transactionid', resp.resp.headers)
      if (transactionId) return await this.pollForCommandCompletion(transactionId)
    }
    throw Error(`Failed to send climateOff: ${JSON.stringify(resp.json)}`)
  }

  protected async setChargeLimit(id: string, config: ChargeLimit): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    const resp = await this.request({
      url: this.apiDomain + 'evc/stsoc',
      data: JSON.stringify({
        vehicleKey: id,
        targetSOClist: [
          { plugType: 0, targetSOClevel: config.dcPercent },
          { plugType: 1, targetSOClevel: config.acPercent },
        ],
      }),
      headers: { date: this.getDateString() },
      validResponseFunction: this.requestResponseValid.bind(this),
    })
    if (this.requestResponseValid(resp.resp, resp.json).valid) {
      this.setLastCommandSent()
      return { isSuccess: true, data: this.cache.status }
    }
    throw Error(`Failed to send chargeLimit: ${JSON.stringify(resp.json)}`)
  }
}
