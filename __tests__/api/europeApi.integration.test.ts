/**
 * Integration tests for Europe API — hits the REAL Hyundai Bluelink API.
 *
 * SAFETY:
 * - Only READ-ONLY endpoints are called (vehicle list, car status)
 * - NEVER calls write endpoints (lock, unlock, charge, climate)
 * - Skipped entirely unless BLUELINK_INTEGRATION=true is set
 * - Requires BLUELINK_REFRESH_TOKEN in environment
 *
 * Run manually:
 *   BLUELINK_INTEGRATION=true BLUELINK_REFRESH_TOKEN=<token> npm test -- --testPathPattern=integration
 */

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

const INTEGRATION_ENABLED = process.env.BLUELINK_INTEGRATION === 'true'
const REFRESH_TOKEN = process.env.BLUELINK_REFRESH_TOKEN

const describeIntegration = INTEGRATION_ENABLED ? describe : describe.skip

describeIntegration('BluelinkEurope (integration — live API)', () => {
  let bluelink: BluelinkEurope

  beforeAll(async () => {
    if (!REFRESH_TOKEN) {
      throw new Error(
        'BLUELINK_REFRESH_TOKEN must be set when running integration tests'
      )
    }

    const config: Config = {
      manufacturer: 'hyundai',
      auth: {
        username: '',
        password: '',
        pin: '',
        region: 'europe',
        refreshToken: REFRESH_TOKEN,
      },
      tempType: 'C',
      distanceUnit: 'km',
      climateTempWarm: 21.5,
      climateTempCold: 19,
      climateSeatLevel: 'Off',
      mfaPreference: 'sms',
      carColor: 'white',
    }

    bluelink = await BluelinkEurope.init(config, true)
  }, 30000)

  it('authenticates successfully', () => {
    expect(bluelink.loginFailed()).toBe(false)
  })

  it('retrieves vehicle data', () => {
    const cached = bluelink.getCachedStatus()
    expect(cached.car).toBeDefined()
    expect(cached.car.vin).toBeTruthy()
    expect(cached.car.modelName).toBeTruthy()
  })

  it('retrieves valid battery SOC (0-100)', () => {
    const cached = bluelink.getCachedStatus()
    expect(cached.status.soc).toBeGreaterThanOrEqual(0)
    expect(cached.status.soc).toBeLessThanOrEqual(100)
  })

  it('retrieves valid 12V battery level', () => {
    const cached = bluelink.getCachedStatus()
    expect(cached.status.twelveSoc).toBeGreaterThanOrEqual(0)
    expect(cached.status.twelveSoc).toBeLessThanOrEqual(100)
  })

  it('retrieves odometer > 0', () => {
    const cached = bluelink.getCachedStatus()
    expect(cached.status.odometer).toBeGreaterThan(0)
  })

  it('retrieves a non-force status update', async () => {
    const result = await bluelink.getStatus(false, true)
    expect(result.car).toBeDefined()
    expect(result.status).toBeDefined()
    expect(result.status.soc).toBeGreaterThanOrEqual(0)
    expect(result.status.soc).toBeLessThanOrEqual(100)
  }, 15000)

  it('returns a status shape with all expected fields', () => {
    const cached = bluelink.getCachedStatus()
    const fields = [
      'lastStatusCheck', 'lastRemoteStatusCheck', 'isCharging', 'isPluggedIn',
      'chargingPower', 'remainingChargeTimeMins', 'range', 'locked',
      'climate', 'soc', 'twelveSoc', 'odometer',
    ]
    for (const field of fields) {
      expect(cached.status).toHaveProperty(field)
    }
  })
})
