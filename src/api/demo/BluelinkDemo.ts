// Demo mode Bluelink implementation.
//
// Activated when the user supplies the literal refresh token value "DEMO".
// Skips all HTTP, auth, token refresh and caching — seeds an in-memory cache
// from fixture files so the UI behaves as if it were talking to a real car.
// Commands mutate the in-memory status and resolve after a short delay to
// simulate network latency.

import { Bluelink, BluelinkCar, BluelinkStatus, Cache, ChargeLimit, ClimateRequest } from '../base'
import { Config } from '../../config/types'
import vehicleFixture from './fixtures/vehicle.json'
import statusFixture from './fixtures/status.json'

const COMMAND_DELAY_MS = 800

export class BluelinkDemo extends Bluelink {
  private fixtureRange: number
  private fixtureOdometer: number

  constructor(config: Config) {
    super(config)
    this.distanceUnit = config.distanceUnit
    this.apiDistanceUnit = 'mi'
    this.fixtureRange = statusFixture.range
    this.fixtureOdometer = statusFixture.odometer
  }

  static async init(config: Config): Promise<BluelinkDemo> {
    const obj = new BluelinkDemo(config)
    const now = Date.now()
    const car: BluelinkCar = { ...(vehicleFixture as BluelinkCar) }
    const status: BluelinkStatus = {
      ...(statusFixture as BluelinkStatus),
      lastStatusCheck: now,
      lastRemoteStatusCheck: now,
    }
    const cache: Cache = {
      token: {
        accessToken: 'demo-access-token',
        refreshToken: 'DEMO',
        expiry: Math.floor(now / 1000) + 60 * 60 * 24 * 365,
      },
      car,
      status,
    }
    obj.cache = cache
    obj.vin = car.vin
    return obj
  }

  public isDemo(): boolean {
    return true
  }

  // Demo mode never needs to refresh anything — override to no-op.
  public async refreshAuth(_force = false): Promise<void> {
    return
  }

  // Override getStatus so demo mode never hits getCarStatus().
  public async getStatus(
    forceUpdate: boolean,
    _noCache: boolean,
    _location = false,
  ): Promise<{ car: BluelinkCar; status: BluelinkStatus }> {
    if (forceUpdate) {
      const now = Date.now()
      this.cache.status.lastStatusCheck = now
      this.cache.status.lastRemoteStatusCheck = now
      this.setLastCommandSent()
    } else {
      this.cache.status.lastStatusCheck = Date.now()
    }
    this.cache.status.range = this.convertDistance(this.fixtureRange)
    this.cache.status.odometer = this.convertDistance(this.fixtureOdometer)
    return { car: this.cache.car, status: this.cache.status }
  }

  private updateStatusTimestamps(): void {
    const now = Date.now()
    this.cache.status.lastStatusCheck = now
    this.cache.status.lastRemoteStatusCheck = now
  }

  protected async lock(_id: string): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    await this.sleep(COMMAND_DELAY_MS)
    this.cache.status.locked = true
    this.updateStatusTimestamps()
    this.setLastCommandSent()
    return { isSuccess: true, data: this.cache.status }
  }

  protected async unlock(_id: string): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    await this.sleep(COMMAND_DELAY_MS)
    this.cache.status.locked = false
    this.updateStatusTimestamps()
    this.setLastCommandSent()
    return { isSuccess: true, data: this.cache.status }
  }

  protected async startCharge(_id: string): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    return await this.chargeStopCharge(_id, true)
  }

  protected async stopCharge(_id: string): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    return await this.chargeStopCharge(_id, false)
  }

  protected async chargeStopCharge(
    _id: string,
    shouldCharge: boolean,
  ): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    await this.sleep(COMMAND_DELAY_MS)
    this.cache.status.isCharging = shouldCharge
    if (shouldCharge) {
      this.cache.status.isPluggedIn = true
      this.cache.status.chargingPower = 11
    } else {
      this.cache.status.chargingPower = 0
    }
    this.updateStatusTimestamps()
    this.setLastCommandSent()
    return { isSuccess: true, data: this.cache.status }
  }

  protected async climateOn(
    _id: string,
    _config: ClimateRequest,
  ): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    await this.sleep(COMMAND_DELAY_MS)
    this.cache.status.climate = true
    this.updateStatusTimestamps()
    this.setLastCommandSent()
    return { isSuccess: true, data: this.cache.status }
  }

  protected async climateOff(_id: string): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    await this.sleep(COMMAND_DELAY_MS)
    this.cache.status.climate = false
    this.updateStatusTimestamps()
    this.setLastCommandSent()
    return { isSuccess: true, data: this.cache.status }
  }

  protected async setChargeLimit(
    _id: string,
    config: ChargeLimit,
  ): Promise<{ isSuccess: boolean; data: BluelinkStatus }> {
    await this.sleep(COMMAND_DELAY_MS)
    this.cache.status.chargeLimit = { acPercent: config.acPercent, dcPercent: config.dcPercent }
    this.updateStatusTimestamps()
    this.setLastCommandSent()
    return { isSuccess: true, data: this.cache.status }
  }
}
