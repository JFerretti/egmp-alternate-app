/**
 * Climate payload construction tests — verifies that ClimateRequest inputs
 * produce the correct API payloads for the Europe endpoint.
 *
 * CCS2 vehicles use strgWhlHeating + sideRearMirrorHeating (validated against IONIQ 5).
 * Non-CCS2 vehicles use the legacy heating1 bitfield.
 *
 * Validate against a real car: npx tsx scripts/test-climate.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { installFetchMock, FetchRoute } from '../helpers/fetchMock'
import { BluelinkEurope } from '@/src/api/regions/europe'
import type { Config } from '@/src/config/types'
import type { ClimateRequest } from '@/src/api/types'

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
  vin: 'KMXXXXXXXXXXXXXXX',
  tempType: 'C',
  distanceUnit: 'km',
  climateTempWarm: 21.5,
  climateTempCold: 19,
  climateSeatLevel: 'Off',
  mfaPreference: 'sms',
  carColor: 'white',
}

function getClimatePayload(fetchMock: ReturnType<typeof installFetchMock>): any {
  const calls = fetchMock.callsTo(/control\/temperature/)
  if (calls.length === 0) throw new Error('No climate API call was made')
  return JSON.parse(calls[0]!.init?.body as string)
}

describe('Europe climate payload construction', () => {
  let fetchMock: ReturnType<typeof installFetchMock>
  let bluelink: BluelinkEurope

  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock = installFetchMock([], true)
    bluelink = await BluelinkEurope.init(TEST_CONFIG, true)
  })

  afterEach(() => {
    fetchMock.restore()
    jest.restoreAllMocks()
  })

  describe('CCS2 defog + steering fields', () => {
    it('sends strgWhlHeating=0 and sideRearMirrorHeating=0 when both off', async () => {
      await bluelink.sendClimateOn({
        enable: true, frontDefrost: false, rearDefrost: false,
        steering: false, temp: 21, durationMinutes: 10,
      })
      const payload = getClimatePayload(fetchMock)
      expect(payload.strgWhlHeating).toBe(0)
      expect(payload.sideRearMirrorHeating).toBe(0)
      expect(payload.windshieldFrontDefogState).toBe(false)
      expect(payload.heating1).toBeUndefined()
    })

    it('sends sideRearMirrorHeating=1 for rearDefrost only', async () => {
      await bluelink.sendClimateOn({
        enable: true, frontDefrost: false, rearDefrost: true,
        steering: false, temp: 21, durationMinutes: 10,
      })
      const payload = getClimatePayload(fetchMock)
      expect(payload.sideRearMirrorHeating).toBe(1)
      expect(payload.strgWhlHeating).toBe(0)
    })

    it('sends strgWhlHeating=1 for steering only', async () => {
      await bluelink.sendClimateOn({
        enable: true, frontDefrost: false, rearDefrost: false,
        steering: true, temp: 21, durationMinutes: 10,
      })
      const payload = getClimatePayload(fetchMock)
      expect(payload.strgWhlHeating).toBe(1)
      expect(payload.sideRearMirrorHeating).toBe(0)
    })

    it('sends both strgWhlHeating=1 and sideRearMirrorHeating=1', async () => {
      await bluelink.sendClimateOn({
        enable: true, frontDefrost: false, rearDefrost: true,
        steering: true, temp: 21, durationMinutes: 10,
      })
      const payload = getClimatePayload(fetchMock)
      expect(payload.strgWhlHeating).toBe(1)
      expect(payload.sideRearMirrorHeating).toBe(1)
    })

    it('sends windshieldFrontDefogState independently', async () => {
      await bluelink.sendClimateOn({
        enable: true, frontDefrost: true, rearDefrost: true,
        steering: true, temp: 21, durationMinutes: 10,
      })
      const payload = getClimatePayload(fetchMock)
      expect(payload.windshieldFrontDefogState).toBe(true)
      expect(payload.strgWhlHeating).toBe(1)
      expect(payload.sideRearMirrorHeating).toBe(1)
    })
  })

  describe('temperature', () => {
    it('sends hvacTemp and tempUnit from config', async () => {
      await bluelink.sendClimateOn({
        enable: true, frontDefrost: false, rearDefrost: false,
        steering: false, temp: 21.5, durationMinutes: 10,
      })
      const payload = getClimatePayload(fetchMock)
      expect(payload.hvacTemp).toBe(21.5)
      expect(payload.tempUnit).toBe('C')
      expect(payload.hvacTempType).toBe(1)
    })
  })

  describe('seat climate', () => {
    it('sends seatClimateInfo when seatClimateOption is provided', async () => {
      await bluelink.sendClimateOn({
        enable: true, frontDefrost: false, rearDefrost: false,
        steering: false, temp: 21, durationMinutes: 10,
        seatClimateOption: { driver: 6, passenger: 6, rearLeft: 0, rearRight: 0 },
      })
      const payload = getClimatePayload(fetchMock)
      expect(payload.seatClimateInfo).toEqual({
        drvSeatClimateState: 6,
        psgSeatClimateState: 6,
        rlSeatClimateState: 0,
        rrSeatClimateState: 0,
      })
    })

    it('omits seatClimateInfo when seatClimateOption is not provided', async () => {
      await bluelink.sendClimateOn({
        enable: true, frontDefrost: false, rearDefrost: false,
        steering: false, temp: 21, durationMinutes: 10,
      })
      const payload = getClimatePayload(fetchMock)
      expect(payload.seatClimateInfo).toBeUndefined()
    })

    it('sends seatClimateInfo even when all values are zero (explicit off)', async () => {
      await bluelink.sendClimateOn({
        enable: true, frontDefrost: false, rearDefrost: false,
        steering: false, temp: 21, durationMinutes: 10,
        seatClimateOption: { driver: 0, passenger: 0, rearLeft: 0, rearRight: 0 },
      })
      const payload = getClimatePayload(fetchMock)
      expect(payload.seatClimateInfo).toEqual({
        drvSeatClimateState: 0,
        psgSeatClimateState: 0,
        rlSeatClimateState: 0,
        rrSeatClimateState: 0,
      })
    })
  })

  describe('full warm preset payload', () => {
    it('constructs the correct payload for the warm preset', async () => {
      await bluelink.sendClimateOn({
        enable: true,
        frontDefrost: true,
        rearDefrost: true,
        steering: true,
        temp: 21.5,
        durationMinutes: 10,
        seatClimateOption: { driver: 8, passenger: 8, rearLeft: 0, rearRight: 0 },
      })
      const payload = getClimatePayload(fetchMock)
      expect(payload).toEqual({
        command: 'start',
        windshieldFrontDefogState: true,
        hvacTempType: 1,
        strgWhlHeating: 1,
        sideRearMirrorHeating: 1,
        tempUnit: 'C',
        drvSeatLoc: 'L',
        hvacTemp: 21.5,
        seatClimateInfo: {
          drvSeatClimateState: 8,
          psgSeatClimateState: 8,
          rlSeatClimateState: 0,
          rrSeatClimateState: 0,
        },
      })
    })
  })

  describe('drvSeatLoc by distance unit', () => {
    it('sends L for km (left-hand drive)', async () => {
      await bluelink.sendClimateOn({
        enable: true, frontDefrost: false, rearDefrost: false,
        steering: false, temp: 21, durationMinutes: 10,
      })
      const payload = getClimatePayload(fetchMock)
      expect(payload.drvSeatLoc).toBe('L')
    })

    it('sends R for mi (right-hand drive)', async () => {
      const rhConfig = { ...TEST_CONFIG, distanceUnit: 'mi' as const }
      const rhFetchMock = installFetchMock([], true)
      const rhBluelink = await BluelinkEurope.init(rhConfig, true)
      await rhBluelink.sendClimateOn({
        enable: true, frontDefrost: false, rearDefrost: false,
        steering: false, temp: 21, durationMinutes: 10,
      })
      const payload = getClimatePayload(rhFetchMock)
      expect(payload.drvSeatLoc).toBe('R')
      rhFetchMock.restore()
    })
  })
})

describe('Europe non-CCS2 climate payload (legacy heating1)', () => {
  let fetchMock: ReturnType<typeof installFetchMock>
  let bluelink: BluelinkEurope

  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})

    const vehiclesFixture = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'europe-vehicles.json'), 'utf-8')
    )
    const nonCCS2Vehicles = JSON.parse(JSON.stringify(vehiclesFixture))
    nonCCS2Vehicles.resMsg.vehicles[0].ccuCCS2ProtocolSupport = 0

    const nonCCS2Route: FetchRoute = {
      pattern: /\/api\/v1\/spa\/vehicles$/,
      response: nonCCS2Vehicles,
    }

    fetchMock = installFetchMock([nonCCS2Route], true)
    bluelink = await BluelinkEurope.init(TEST_CONFIG, true)
  })

  afterEach(() => {
    fetchMock.restore()
    jest.restoreAllMocks()
  })

  it('sends heating1=0 when both rearDefrost and steering are false', async () => {
    await bluelink.sendClimateOn({
      enable: true, frontDefrost: false, rearDefrost: false,
      steering: false, temp: 21, durationMinutes: 10,
    })
    const payload = getClimatePayload(fetchMock)
    expect(payload.heating1).toBe(0)
    expect(payload.strgWhlHeating).toBeUndefined()
    expect(payload.sideRearMirrorHeating).toBeUndefined()
  })

  it('sends heating1=2 for rearDefrost only', async () => {
    await bluelink.sendClimateOn({
      enable: true, frontDefrost: false, rearDefrost: true,
      steering: false, temp: 21, durationMinutes: 10,
    })
    const payload = getClimatePayload(fetchMock)
    expect(payload.heating1).toBe(2)
  })

  it('sends heating1=3 for steering only', async () => {
    await bluelink.sendClimateOn({
      enable: true, frontDefrost: false, rearDefrost: false,
      steering: true, temp: 21, durationMinutes: 10,
    })
    const payload = getClimatePayload(fetchMock)
    expect(payload.heating1).toBe(3)
  })

  it('sends heating1=4 for both rearDefrost and steering', async () => {
    await bluelink.sendClimateOn({
      enable: true, frontDefrost: false, rearDefrost: true,
      steering: true, temp: 21, durationMinutes: 10,
    })
    const payload = getClimatePayload(fetchMock)
    expect(payload.heating1).toBe(4)
  })
})
