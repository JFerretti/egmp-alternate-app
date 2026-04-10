/**
 * Europe API tests using recorded fixtures.
 *
 * These tests exercise the real BluelinkEurope class against intercepted
 * fetch calls that return fixture data. No network calls are made.
 * Command endpoints (lock/unlock/charge/climate) are never called.
 */

import { installFetchMock } from '../helpers/fetchMock'
import { BluelinkEurope } from '@/src/api/regions/europe'
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

const TEST_CONFIG: Config = {
  manufacturer: 'hyundai',
  auth: {
    username: '',
    password: '',
    pin: '1234',
    region: 'europe',
    refreshToken: 'fixture-refresh-token',
  },
  tempType: 'C',
  distanceUnit: 'km',
  climateTempWarm: 21.5,
  climateTempCold: 19,
  climateSeatLevel: 'Off',
  mfaPreference: 'sms',
  carColor: 'white',
}

describe('BluelinkEurope (fixtures)', () => {
  let fetchMock: ReturnType<typeof installFetchMock>
  let bluelink: BluelinkEurope

  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock = installFetchMock()
    bluelink = await BluelinkEurope.init(TEST_CONFIG, true)
  })

  afterEach(() => {
    fetchMock.restore()
    jest.restoreAllMocks()
  })

  describe('authentication', () => {
    it('refreshes token using the provided refresh token', () => {
      const tokenCalls = fetchMock.callsTo(/oauth2\/token/)
      expect(tokenCalls.length).toBeGreaterThanOrEqual(1)
      const body = tokenCalls[0]!.init?.body as string
      expect(body).toContain('grant_type=refresh_token')
      expect(body).toContain('refresh_token=fixture-refresh-token')
    })

    it('registers for notifications to obtain a device ID', () => {
      const registerCalls = fetchMock.callsTo(/notifications\/register/)
      expect(registerCalls.length).toBeGreaterThanOrEqual(1)
    })

    it('does not report login failure after successful auth', () => {
      expect(bluelink.loginFailed()).toBe(false)
    })
  })

  describe('vehicle retrieval', () => {
    it('fetches the vehicle list', () => {
      const vehicleCalls = fetchMock.callsTo(/\/api\/v1\/spa\/vehicles$/)
      expect(vehicleCalls.length).toBeGreaterThanOrEqual(1)
    })

    it('returns the correct car data from cache', () => {
      const cached = bluelink.getCachedStatus()
      expect(cached.car).toBeDefined()
      expect(cached.car.vin).toBe('KMXXXXXXXXXXXXXXX')
      expect(cached.car.nickName).toBe('My IONIQ 5')
      expect(cached.car.modelName).toBe('IONIQ 5')
      expect(cached.car.modelYear).toBe('2024')
      expect(cached.car.europeccs2).toBe(1)
    })
  })

  describe('status parsing', () => {
    it('parses battery SOC from fixture', () => {
      const cached = bluelink.getCachedStatus()
      expect(cached.status.soc).toBe(78)
    })

    it('parses 12V battery level', () => {
      const cached = bluelink.getCachedStatus()
      expect(cached.status.twelveSoc).toBe(92)
    })

    it('parses charging state', () => {
      const cached = bluelink.getCachedStatus()
      expect(cached.status.isCharging).toBe(true)
      expect(cached.status.isPluggedIn).toBe(true)
      expect(cached.status.chargingPower).toBe(7.2)
      expect(cached.status.remainingChargeTimeMins).toBe(45)
    })

    it('parses odometer in km', () => {
      const cached = bluelink.getCachedStatus()
      expect(cached.status.odometer).toBe(12500)
    })

    it('parses range in km', () => {
      const cached = bluelink.getCachedStatus()
      expect(cached.status.range).toBe(320)
    })

    it('parses charge limits', () => {
      const cached = bluelink.getCachedStatus()
      expect(cached.status.chargeLimit).toEqual({ acPercent: 80, dcPercent: 80 })
    })

    it('parses door lock status', () => {
      const cached = bluelink.getCachedStatus()
      // All doors have Open=0, so locked should be true
      expect(cached.status.locked).toBe(true)
    })

    it('parses climate status', () => {
      const cached = bluelink.getCachedStatus()
      // Blower speed is 0, so climate should be off
      expect(cached.status.climate).toBe(false)
    })

    it('parses location', () => {
      const cached = bluelink.getCachedStatus()
      expect(cached.status.location).toEqual({
        latitude: '51.5074',
        longitude: '-0.1278',
      })
    })
  })

  describe('distance unit conversion', () => {
    it('converts odometer to miles when configured', async () => {
      fetchMock.restore()
      const milesFetchMock = installFetchMock()
      const milesConfig = { ...TEST_CONFIG, distanceUnit: 'mi' as const }
      const milesBluelink = await BluelinkEurope.init(milesConfig, true)

      const cached = milesBluelink.getCachedStatus()
      // 12500 km * 0.621371 = 7766.something, floored
      expect(cached.status.odometer).toBe(Math.floor(12500 * 0.621371))
      expect(cached.status.range).toBe(Math.floor(320 * 0.621371))

      milesFetchMock.restore()
    })
  })

  describe('getStatus (non-force)', () => {
    it('fetches latest status from the API', async () => {
      const result = await bluelink.getStatus(false, true)
      expect(result.car).toBeDefined()
      expect(result.status).toBeDefined()
      expect(result.status.soc).toBe(78)

      const statusCalls = fetchMock.callsTo(/carstatus\/latest/)
      // One from init + one from getStatus
      expect(statusCalls.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('no write endpoints called', () => {
    it('never calls command endpoints during read operations', () => {
      const commandPatterns = [
        /control\/door/,
        /control\/charge/,
        /control\/temperature/,
        /charge\/target/,
        /user\/pin/,
      ]
      for (const pattern of commandPatterns) {
        const calls = fetchMock.callsTo(pattern)
        expect(calls).toHaveLength(0)
      }
    })
  })
})
