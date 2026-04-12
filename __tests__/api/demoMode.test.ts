/**
 * Demo mode integration tests.
 *
 * These tests verify that BluelinkDemo and the DEMO routing in
 * initRegionalBluelink work correctly: no network calls are made,
 * fixture data is loaded, and commands mutate in-memory state.
 */

import { BluelinkDemo } from '@/src/api/demo/BluelinkDemo'
import { initRegionalBluelink } from '@/src/api/bluelink'
import type { Config } from '@/src/config/types'

jest.mock('@/src/storage/secureStore', () => ({
  storageGet: jest.fn().mockResolvedValue(null),
  storageSet: jest.fn().mockResolvedValue(undefined),
  storageContains: jest.fn().mockResolvedValue(false),
  storageRemove: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/src/storage/configStore', () => ({
  saveConfig: jest.fn().mockResolvedValue(undefined),
}))

const DEMO_CONFIG: Config = {
  manufacturer: 'hyundai',
  auth: {
    username: '',
    password: '',
    pin: '1234',
    region: 'europe',
    refreshToken: 'DEMO',
  },
  tempType: 'C',
  distanceUnit: 'km',
  climateTempWarm: 21.5,
  climateTempCold: 19,
  climateSeatLevel: 'Off',
  mfaPreference: 'sms',
  carColor: 'white',
}

let fetchSpy: jest.SpyInstance

beforeEach(() => {
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => {
    throw new Error('fetch should never be called in demo mode')
  })
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('Demo mode routing', () => {
  it('initRegionalBluelink with DEMO token returns a BluelinkDemo instance', async () => {
    const instance = await initRegionalBluelink(DEMO_CONFIG, false)
    expect(instance).toBeInstanceOf(BluelinkDemo)
  })

  it('returned instance has isDemo() === true', async () => {
    const instance = await initRegionalBluelink(DEMO_CONFIG, false)
    expect(instance!.isDemo()).toBe(true)
  })

  it('DEMO routing works regardless of region', async () => {
    const canadaConfig: Config = {
      ...DEMO_CONFIG,
      auth: { ...DEMO_CONFIG.auth, region: 'canada' },
    }
    const instance = await initRegionalBluelink(canadaConfig, false)
    expect(instance).toBeInstanceOf(BluelinkDemo)
    expect(instance!.isDemo()).toBe(true)
  })
})

describe('Demo mode fixture loading', () => {
  it('BluelinkDemo.init() does NOT call fetch', async () => {
    await BluelinkDemo.init(DEMO_CONFIG)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('getCachedStatus() returns the demo vehicle', async () => {
    const demo = await BluelinkDemo.init(DEMO_CONFIG)
    const { car } = demo.getCachedStatus()
    expect(car.nickName).toBe('Demo IONIQ 5')
    expect(car.vin).toBe('DEMOVIN0000000001')
    expect(car.modelName).toBe('IONIQ 5')
    expect(car.modelYear).toBe('2025')
  })

  it('getCachedStatus() returns the demo status', async () => {
    const demo = await BluelinkDemo.init(DEMO_CONFIG)
    const { status } = demo.getCachedStatus()
    expect(status.soc).toBe(75)
    expect(status.range).toBe(220)
    expect(status.locked).toBe(true)
    expect(status.isPluggedIn).toBe(true)
    expect(status.isCharging).toBe(false)
  })
})

describe('Demo mode command no-ops', () => {
  let demo: BluelinkDemo

  beforeEach(async () => {
    jest.useFakeTimers()
    demo = await BluelinkDemo.init(DEMO_CONFIG)
    fetchSpy.mockClear()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // Helper: advance fake timers so the sleep() inside commands resolves
  async function flushCommand<T>(promise: Promise<T>): Promise<T> {
    jest.advanceTimersByTime(1000)
    return promise
  }

  it('sendLock() returns success and sets locked to true', async () => {
    // First unlock so we can verify lock toggles it back
    await flushCommand(demo.sendUnlock())
    expect(demo.getCachedStatus().status.locked).toBe(false)

    const result = await flushCommand(demo.sendLock())
    expect(result.isSuccess).toBe(true)
    expect(demo.getCachedStatus().status.locked).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sendUnlock() returns success and sets locked to false', async () => {
    const result = await flushCommand(demo.sendUnlock())
    expect(result.isSuccess).toBe(true)
    expect(demo.getCachedStatus().status.locked).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sendStartCharge() flips isCharging to true and sets chargingPower non-zero', async () => {
    const result = await flushCommand(demo.sendStartCharge())
    expect(result.isSuccess).toBe(true)
    const { status } = demo.getCachedStatus()
    expect(status.isCharging).toBe(true)
    expect(status.chargingPower).toBeGreaterThan(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sendStopCharge() flips isCharging to false and sets chargingPower to 0', async () => {
    await flushCommand(demo.sendStartCharge())
    const result = await flushCommand(demo.sendStopCharge())
    expect(result.isSuccess).toBe(true)
    const { status } = demo.getCachedStatus()
    expect(status.isCharging).toBe(false)
    expect(status.chargingPower).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sendClimateOn() sets climate to true', async () => {
    const climateReq = {
      enable: true,
      frontDefrost: false,
      rearDefrost: false,
      steering: false,
      temp: 21.5,
      durationMinutes: 10,
    }
    const result = await flushCommand(demo.sendClimateOn(climateReq))
    expect(result.isSuccess).toBe(true)
    expect(demo.getCachedStatus().status.climate).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sendClimateOff() sets climate to false', async () => {
    // Turn on first
    await flushCommand(
      demo.sendClimateOn({
        enable: true,
        frontDefrost: false,
        rearDefrost: false,
        steering: false,
        temp: 21.5,
        durationMinutes: 10,
      }),
    )
    const result = await flushCommand(demo.sendClimateOff())
    expect(result.isSuccess).toBe(true)
    expect(demo.getCachedStatus().status.climate).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sendSetChargeLimit() updates cached limits', async () => {
    const result = await flushCommand(demo.sendSetChargeLimit({ acPercent: 50, dcPercent: 70 }))
    expect(result.isSuccess).toBe(true)
    const { status } = demo.getCachedStatus()
    expect(status.chargeLimit).toEqual({ acPercent: 50, dcPercent: 70 })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('Demo mode no network', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  async function flush<T>(promise: Promise<T>): Promise<T> {
    jest.advanceTimersByTime(1000)
    return promise
  }

  it('full flow (init + every command) never calls fetch', async () => {
    const demo = await BluelinkDemo.init(DEMO_CONFIG)

    await flush(demo.sendLock())
    await flush(demo.sendUnlock())
    await flush(demo.sendStartCharge())
    await flush(demo.sendStopCharge())
    await flush(
      demo.sendClimateOn({
        enable: true,
        frontDefrost: false,
        rearDefrost: false,
        steering: false,
        temp: 21.5,
        durationMinutes: 10,
      }),
    )
    await flush(demo.sendClimateOff())
    await flush(demo.sendSetChargeLimit({ acPercent: 50, dcPercent: 70 }))

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
