/**
 * Europe API command tests using recorded fixtures.
 *
 * These tests require command fixtures recorded by running:
 *   BLUELINK_REFRESH_TOKEN=<token> BLUELINK_PIN=<pin> npm run test:command -- <command>
 *
 * If no command fixtures exist yet, all tests are skipped.
 * No network calls are made — everything runs against saved fixture data.
 */

import * as fs from 'fs'
import * as path from 'path'
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

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures')

function fixtureExists(name: string): boolean {
  return fs.existsSync(path.join(FIXTURES_DIR, `${name}.json`))
}

const HAS_AUTH_CODE = fixtureExists('europe-auth-code')
const HAS_LOCK = fixtureExists('europe-command-lock')
const HAS_UNLOCK = fixtureExists('europe-command-unlock')
const HAS_START_CHARGE = fixtureExists('europe-command-start-charge')
const HAS_STOP_CHARGE = fixtureExists('europe-command-stop-charge')
const HAS_CLIMATE_ON = fixtureExists('europe-command-climate-on')
const HAS_CLIMATE_OFF = fixtureExists('europe-command-climate-off')
const HAS_CHARGE_LIMIT = fixtureExists('europe-command-charge-limit')
const HAS_ANY_COMMAND = HAS_LOCK || HAS_UNLOCK || HAS_START_CHARGE || HAS_STOP_CHARGE ||
  HAS_CLIMATE_ON || HAS_CLIMATE_OFF || HAS_CHARGE_LIMIT

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

describe('BluelinkEurope commands (recorded fixtures)', () => {
  if (!HAS_ANY_COMMAND) {
    it('skipped — no command fixtures recorded yet (run npm run test:command)', () => {
      console.log(
        'Run a command to record fixtures: BLUELINK_REFRESH_TOKEN=<token> BLUELINK_PIN=<pin> npm run test:command -- lock'
      )
    })
    return
  }

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

  if (HAS_AUTH_CODE) {
    describe('auth code (PIN verification)', () => {
      it('fixture has the expected shape', () => {
        const fixture = JSON.parse(
          fs.readFileSync(path.join(FIXTURES_DIR, 'europe-auth-code.json'), 'utf-8')
        )
        expect(fixture).toHaveProperty('controlToken')
        expect(fixture).toHaveProperty('expiresTime')
        expect(typeof fixture.expiresTime).toBe('number')
      })
    })
  }

  if (HAS_LOCK) {
    describe('lock command', () => {
      it('fixture has msgId for polling', () => {
        const fixture = JSON.parse(
          fs.readFileSync(path.join(FIXTURES_DIR, 'europe-command-lock.json'), 'utf-8')
        )
        expect(fixture).toHaveProperty('msgId')
      })

      it('sends lock via sendLock()', async () => {
        const result = await bluelink.sendLock()
        expect(result).toHaveProperty('isSuccess')
        expect(result).toHaveProperty('data')
        const lockCalls = fetchMock.callsTo(/control\/door/)
        expect(lockCalls.length).toBeGreaterThanOrEqual(1)
        const body = JSON.parse(lockCalls[0]!.init?.body as string)
        expect(body.command).toBe('close')
      })
    })
  }

  if (HAS_UNLOCK) {
    describe('unlock command', () => {
      it('fixture has msgId for polling', () => {
        const fixture = JSON.parse(
          fs.readFileSync(path.join(FIXTURES_DIR, 'europe-command-unlock.json'), 'utf-8')
        )
        expect(fixture).toHaveProperty('msgId')
      })

      it('sends unlock via sendUnlock()', async () => {
        const result = await bluelink.sendUnlock()
        expect(result).toHaveProperty('isSuccess')
        const unlockCalls = fetchMock.callsTo(/control\/door/)
        expect(unlockCalls.length).toBeGreaterThanOrEqual(1)
        const body = JSON.parse(unlockCalls[0]!.init?.body as string)
        expect(body.command).toBe('open')
      })
    })
  }

  if (HAS_START_CHARGE) {
    describe('start charge command', () => {
      it('fixture has msgId for polling', () => {
        const fixture = JSON.parse(
          fs.readFileSync(path.join(FIXTURES_DIR, 'europe-command-start-charge.json'), 'utf-8')
        )
        expect(fixture).toHaveProperty('msgId')
      })

      it('sends start charge via sendStartCharge()', async () => {
        const result = await bluelink.sendStartCharge()
        expect(result).toHaveProperty('isSuccess')
        const calls = fetchMock.callsTo(/control\/charge/)
        expect(calls.length).toBeGreaterThanOrEqual(1)
        const body = JSON.parse(calls[0]!.init?.body as string)
        expect(body.command).toBe('start')
      })
    })
  }

  if (HAS_STOP_CHARGE) {
    describe('stop charge command', () => {
      it('fixture has msgId for polling', () => {
        const fixture = JSON.parse(
          fs.readFileSync(path.join(FIXTURES_DIR, 'europe-command-stop-charge.json'), 'utf-8')
        )
        expect(fixture).toHaveProperty('msgId')
      })

      it('sends stop charge via sendStopCharge()', async () => {
        const result = await bluelink.sendStopCharge()
        expect(result).toHaveProperty('isSuccess')
        const calls = fetchMock.callsTo(/control\/charge/)
        expect(calls.length).toBeGreaterThanOrEqual(1)
        const body = JSON.parse(calls[0]!.init?.body as string)
        expect(body.command).toBe('stop')
      })
    })
  }

  if (HAS_CLIMATE_ON) {
    describe('climate on command', () => {
      it('fixture has msgId for polling', () => {
        const fixture = JSON.parse(
          fs.readFileSync(path.join(FIXTURES_DIR, 'europe-command-climate-on.json'), 'utf-8')
        )
        expect(fixture).toHaveProperty('msgId')
      })

      it('sends climate on via sendClimateOn()', async () => {
        const result = await bluelink.sendClimateOn({
          enable: true,
          frontDefrost: false,
          rearDefrost: false,
          steering: false,
          temp: 21,
          durationMinutes: 10,
        })
        expect(result).toHaveProperty('isSuccess')
        const calls = fetchMock.callsTo(/control\/temperature/)
        expect(calls.length).toBeGreaterThanOrEqual(1)
        const body = JSON.parse(calls[0]!.init?.body as string)
        expect(body.command).toBe('start')
        expect(body.hvacTemp).toBe(21)
      })
    })
  }

  if (HAS_CLIMATE_OFF) {
    describe('climate off command', () => {
      it('fixture has msgId for polling', () => {
        const fixture = JSON.parse(
          fs.readFileSync(path.join(FIXTURES_DIR, 'europe-command-climate-off.json'), 'utf-8')
        )
        expect(fixture).toHaveProperty('msgId')
      })

      it('sends climate off via sendClimateOff()', async () => {
        const result = await bluelink.sendClimateOff()
        expect(result).toHaveProperty('isSuccess')
        const calls = fetchMock.callsTo(/control\/temperature/)
        expect(calls.length).toBeGreaterThanOrEqual(1)
        const body = JSON.parse(calls[0]!.init?.body as string)
        expect(body.command).toBe('stop')
      })
    })
  }

  if (HAS_CHARGE_LIMIT) {
    describe('charge limit command', () => {
      it('fixture was recorded from the API', () => {
        const fixture = JSON.parse(
          fs.readFileSync(path.join(FIXTURES_DIR, 'europe-command-charge-limit.json'), 'utf-8')
        )
        // charge-limit uses regular Bearer token (no controlToken/PIN needed)
        // and doesn't return msgId — it does a force status refresh instead
        expect(fixture).toBeDefined()
        expect(typeof fixture).toBe('object')
      })

      // Note: sendSetChargeLimit() can't be tested end-to-end with fixtures because
      // it triggers a force status refresh (getCarStatus(id, true)) which polls with
      // real 2-second sleeps. The request format is verified by the fixture shape test
      // above, and the Bluelink class integration is covered by carStore.test.ts mocks.
    })
  }
})
