#!/usr/bin/env npx tsx
/**
 * Climate parameter validation script — sends specific climate payloads to the
 * real API and captures the resulting car state.
 *
 * Usage:
 *   BLUELINK_REFRESH_TOKEN=<token> BLUELINK_PIN=<pin> npx tsx scripts/test-climate.ts <scenario>
 *   BLUELINK_REFRESH_TOKEN=<token> BLUELINK_PIN=<pin> npx tsx scripts/test-climate.ts list
 *
 * Each scenario sends a known payload, waits for completion, then captures the
 * climate-relevant status fields. Results are saved to __tests__/fixtures/climate/.
 *
 * Run "climate-off" between tests to reset the car to a clean state.
 */

import * as readline from 'readline'
import * as fs from 'fs'
import * as path from 'path'

const FIXTURES_DIR = path.join(__dirname, '..', '__tests__', 'fixtures', 'climate')
if (!fs.existsSync(FIXTURES_DIR)) fs.mkdirSync(FIXTURES_DIR, { recursive: true })

const REFRESH_TOKEN = process.env.BLUELINK_REFRESH_TOKEN
const PIN = process.env.BLUELINK_PIN
const SCENARIO_NAME = process.argv[2]

// --- Scenarios ---

interface Scenario {
  description: string
  payload: Record<string, any>
  expect: string
}

const SCENARIOS: Record<string, Scenario> = {
  // Phase 1: heating1 values (controls rear defog + steering)
  'baseline': {
    description: 'Minimal climate — 21°C, everything off',
    expect: 'Climate ON, 21°C, no defog, no seats, no steering',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 0,
      drvSeatLoc: 'L',
    },
  },
  'front-defog': {
    description: 'Front defog only (windshieldFrontDefogState=true)',
    expect: 'Front defog ON, rear defog OFF, steering OFF',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: true,
      heating1: 0,
      drvSeatLoc: 'L',
    },
  },
  'heating1-1': {
    description: 'heating1=1 (unknown mapping)',
    expect: 'Unknown — probing value',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 1,
      drvSeatLoc: 'L',
    },
  },
  'heating1-2': {
    description: 'heating1=2 (current code: rear defrost only)',
    expect: 'Rear defog ON, steering OFF',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 2,
      drvSeatLoc: 'L',
    },
  },
  'heating1-3': {
    description: 'heating1=3 (current code: steering only)',
    expect: 'Rear defog OFF, steering ON',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 3,
      drvSeatLoc: 'L',
    },
  },
  'heating1-4': {
    description: 'heating1=4 (current code: rear defrost + steering)',
    expect: 'Rear defog ON, steering ON',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 4,
      drvSeatLoc: 'L',
    },
  },

  // Phase 2: seat climate values (driver only, to isolate the mapping)
  'seat-val-2': {
    description: 'Driver seat climate state = 2',
    expect: 'Observe seat heat level on car',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 0,
      drvSeatLoc: 'L',
      seatClimateInfo: {
        drvSeatClimateState: 2,
        psgSeatClimateState: 0,
        rlSeatClimateState: 0,
        rrSeatClimateState: 0,
      },
    },
  },
  'seat-val-4': {
    description: 'Driver seat climate state = 4',
    expect: 'Observe seat heat level on car',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 0,
      drvSeatLoc: 'L',
      seatClimateInfo: {
        drvSeatClimateState: 4,
        psgSeatClimateState: 0,
        rlSeatClimateState: 0,
        rrSeatClimateState: 0,
      },
    },
  },
  'seat-val-6': {
    description: 'Driver seat climate state = 6',
    expect: 'Observe seat heat level on car',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 0,
      drvSeatLoc: 'L',
      seatClimateInfo: {
        drvSeatClimateState: 6,
        psgSeatClimateState: 0,
        rlSeatClimateState: 0,
        rrSeatClimateState: 0,
      },
    },
  },
  'seat-val-8': {
    description: 'Driver seat climate state = 8',
    expect: 'Observe seat heat level on car (may be highest or may fail)',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 0,
      drvSeatLoc: 'L',
      seatClimateInfo: {
        drvSeatClimateState: 8,
        psgSeatClimateState: 0,
        rlSeatClimateState: 0,
        rrSeatClimateState: 0,
      },
    },
  },

  // Phase 2b: probe higher seat values
  'seat-val-10': {
    description: 'Driver seat climate state = 10',
    expect: 'Observe seat heat level on car',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 0,
      drvSeatLoc: 'L',
      seatClimateInfo: {
        drvSeatClimateState: 10,
        psgSeatClimateState: 0,
        rlSeatClimateState: 0,
        rrSeatClimateState: 0,
      },
    },
  },

  // Phase 2c: CCS2-specific field probes for rear defog and steering
  'rear-defog-bool': {
    description: 'Probe: windshieldRearDefogState=true (CCS2 field name guess)',
    expect: 'Rear defog ON?',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 0,
      drvSeatLoc: 'L',
      windshieldRearDefogState: true,
    },
  },
  'steering-heat-1': {
    description: 'Probe: steeringWheelHeat=1 (CCS2 field name guess)',
    expect: 'Steering ON?',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 0,
      drvSeatLoc: 'L',
      steeringWheelHeat: 1,
    },
  },
  'steering-state-1': {
    description: 'Probe: steeringWheelHeatState=1',
    expect: 'Steering ON?',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 0,
      drvSeatLoc: 'L',
      steeringWheelHeatState: 1,
    },
  },
  'defrost-rearwindow': {
    description: 'Probe: defrost=true (some APIs use a single defrost field)',
    expect: 'Any defog change?',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 0,
      drvSeatLoc: 'L',
      defrost: true,
    },
  },

  // Phase 2d: heatingAccessory object (CCS2-specific)
  'heating-accessory-all': {
    description: 'Probe: heatingAccessory object with steeringWheel + rearWindow',
    expect: 'Rear defog ON, steering ON?',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 0,
      drvSeatLoc: 'L',
      heatingAccessory: {
        steeringWheel: 1,
        rearWindow: 1,
        sideMirror: 1,
      },
    },
  },
  'heating-accessory-steering': {
    description: 'Probe: heatingAccessory with steeringWheel only',
    expect: 'Steering ON, rear defog OFF?',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 0,
      drvSeatLoc: 'L',
      heatingAccessory: {
        steeringWheel: 1,
        rearWindow: 0,
        sideMirror: 0,
      },
    },
  },
  'heating-accessory-rear': {
    description: 'Probe: heatingAccessory with rearWindow only',
    expect: 'Rear defog ON, steering OFF?',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      heating1: 0,
      drvSeatLoc: 'L',
      heatingAccessory: {
        steeringWheel: 0,
        rearWindow: 1,
        sideMirror: 0,
      },
    },
  },

  // Phase 2e: CCS2 correct fields (from HA hyundai_kia_connect_api)
  'ccs2-steering': {
    description: 'CCS2: strgWhlHeating=1 (steering wheel heater)',
    expect: 'Steering wheel heat ON',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      strgWhlHeating: 1,
      sideRearMirrorHeating: 0,
      drvSeatLoc: 'L',
    },
  },
  'ccs2-mirrors': {
    description: 'CCS2: sideRearMirrorHeating=1 (mirrors + possibly rear defog)',
    expect: 'Rear defog and/or mirror heat ON',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21,
      windshieldFrontDefogState: false,
      strgWhlHeating: 0,
      sideRearMirrorHeating: 1,
      drvSeatLoc: 'L',
    },
  },
  'ccs2-all-heat': {
    description: 'CCS2: front defog + strgWhlHeating + sideRearMirrorHeating',
    expect: 'Front defog, rear defog, steering all ON',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21.5,
      windshieldFrontDefogState: true,
      strgWhlHeating: 1,
      sideRearMirrorHeating: 1,
      drvSeatLoc: 'L',
    },
  },

  // Phase 3: corrected warm preset (CCS2 validated fields)
  'warm-corrected': {
    description: 'Corrected Warm preset with CCS2 fields',
    expect: '21.5°C, front+rear defog ON, steering ON, driver+passenger seats high',
    payload: {
      command: 'start',
      hvacTempType: 1,
      tempUnit: 'C',
      hvacTemp: 21.5,
      windshieldFrontDefogState: true,
      strgWhlHeating: 1,
      sideRearMirrorHeating: 1,
      drvSeatLoc: 'L',
      seatClimateInfo: {
        drvSeatClimateState: 8,
        psgSeatClimateState: 8,
        rlSeatClimateState: 0,
        rrSeatClimateState: 0,
      },
    },
  },

  // Reset
  'climate-off': {
    description: 'Turn climate off (reset between tests)',
    expect: 'Climate OFF, all features disabled',
    payload: { command: 'stop' },
  },
}

// --- API helpers (shared with test-commands.ts) ---

const API_CONFIG = {
  apiDomain: 'https://prd.eu-ccapi.hyundai.com:8080',
  authHost: 'idpconnect-eu.hyundai.com',
  clientId: '6d477c38-3ca4-4cf3-9557-2a1929a94654',
  clientSecret: 'KUy49XxPzLpLuoK0xhBC77W6VXhmtQR9iQhmIFjjoY4IpxsV',
  appId: '014d2225-8495-4735-812d-2616334fd15d',
  authCfb: 'RFtoRq/vDXJmRndoZaZQyfOot7OrIqGVFj96iY2WL3yyH5Z/pUvlUhqmCxD2t+D65SQ=',
  pushType: 'GCM',
}

function getStamp(): string {
  const rawData = `${API_CONFIG.appId}:${Math.floor(Date.now() / 1000)}`
  const rawBytes = new TextEncoder().encode(rawData)
  const cfbBytes = Uint8Array.from(atob(API_CONFIG.authCfb), (c) => c.charCodeAt(0))
  const minLen = Math.min(rawBytes.length, cfbBytes.length)
  const result = new Uint8Array(minLen)
  for (let i = 0; i < minLen; i++) {
    result[i] = rawBytes[i]! ^ cfbBytes[i]!
  }
  return btoa(String.fromCharCode(...Array.from(result)))
}

function genRanHex(size: number): string {
  return [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')
}

function generateUUID(): string {
  const h = (n: number) => genRanHex(n)
  return `${h(8)}-${h(4)}-4${h(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${h(3)}-${h(12)}`
}

function commonHeaders(accessToken: string, deviceId: string) {
  return {
    Authorization: accessToken,
    Stamp: getStamp(),
    'ccsp-device-id': deviceId,
    'ccsp-application-id': API_CONFIG.appId,
    'ccsp-service-id': API_CONFIG.clientId,
    'User-Agent': 'okhttp/3.14.9',
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-GB',
    'Accept-Charset': 'UTF-8',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: 'GB',
  }
}

async function apiRequest(url: string, opts: RequestInit = {}): Promise<any> {
  const resp = await fetch(url, opts)
  const text = await resp.text()
  let json: any
  try { json = JSON.parse(text) } catch { json = { _raw: text } }
  return { status: resp.status, json }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`\n⚠️  ${message} [y/N] `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y')
    })
  })
}

function extractClimateStatus(v: any): Record<string, any> {
  return {
    hvac: {
      blowerSpeed: v?.Cabin?.HVAC?.Row1?.Driver?.Blower?.SpeedLevel,
      tempValue: v?.Cabin?.HVAC?.Row1?.Driver?.Temperature?.Value,
      tempUnit: v?.Cabin?.HVAC?.Row1?.Driver?.Temperature?.Unit,
    },
    defog: {
      frontDefog: v?.Body?.Windshield?.Front?.Defog?.State,
      frontHeat: v?.Body?.Windshield?.Front?.Heat?.State,
      rearDefog: v?.Body?.Windshield?.Rear?.Defog?.State,
    },
    steeringWheel: {
      heatState: v?.Cabin?.SteeringWheel?.Heat?.State,
      remoteStep: v?.Cabin?.SteeringWheel?.Heat?.RemoteControl?.Step,
    },
    seats: {
      driverState: v?.Cabin?.Seat?.Row1?.Driver?.Climate?.State,
      passengerState: v?.Cabin?.Seat?.Row1?.Passenger?.Climate?.State,
      rearLeftState: v?.Cabin?.Seat?.Row2?.Left?.Climate?.State,
      rearRightState: v?.Cabin?.Seat?.Row2?.Right?.Climate?.State,
    },
  }
}

// --- Main ---

function printScenarioList() {
  console.log('\n=== Climate Test Scenarios ===\n')
  console.log('Phase 1: heating1 values (rear defog + steering encoding)')
  for (const name of ['baseline', 'front-defog', 'heating1-1', 'heating1-2', 'heating1-3', 'heating1-4']) {
    const s = SCENARIOS[name]!
    console.log(`  ${name.padEnd(16)} ${s.description}`)
  }
  console.log('\nPhase 2: seat climate values')
  for (const name of ['seat-val-2', 'seat-val-4', 'seat-val-6', 'seat-val-8']) {
    const s = SCENARIOS[name]!
    console.log(`  ${name.padEnd(16)} ${s.description}`)
  }
  console.log('\nPhase 3: full combo')
  for (const name of ['warm-current']) {
    const s = SCENARIOS[name]!
    console.log(`  ${name.padEnd(16)} ${s.description}`)
  }
  console.log('\nUtility:')
  console.log(`  ${'climate-off'.padEnd(16)} Turn climate off (run between tests)`)
  console.log('\nWorkflow:')
  console.log('  1. Run a scenario        → observe car behavior')
  console.log('  2. Run climate-off        → reset')
  console.log('  3. Repeat with next scenario')
  console.log('')
}

async function main() {
  if (!SCENARIO_NAME || SCENARIO_NAME === 'list') {
    printScenarioList()
    if (!SCENARIO_NAME) {
      console.error('Usage: BLUELINK_REFRESH_TOKEN=<token> BLUELINK_PIN=<pin> npx tsx scripts/test-climate.ts <scenario>')
    }
    process.exit(SCENARIO_NAME ? 0 : 1)
  }

  const scenario = SCENARIOS[SCENARIO_NAME]
  if (!scenario) {
    console.error(`Unknown scenario: ${SCENARIO_NAME}`)
    console.error(`Run with "list" to see available scenarios.`)
    process.exit(1)
  }

  if (!REFRESH_TOKEN) {
    console.error('Error: BLUELINK_REFRESH_TOKEN must be set')
    process.exit(1)
  }
  if (!PIN) {
    console.error('Error: BLUELINK_PIN must be set')
    process.exit(1)
  }

  console.log(`\n=== Climate Test: ${SCENARIO_NAME} ===`)
  console.log(`Description: ${scenario.description}`)
  console.log(`Expected:    ${scenario.expect}`)
  console.log(`Payload:     ${JSON.stringify(scenario.payload, null, 2)}`)

  // Auth
  console.log('\n1. Refreshing token...')
  const tokenResult = await apiRequest(
    `https://${API_CONFIG.authHost}/auth/api/v2/user/oauth2/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: [
        'grant_type=refresh_token',
        `refresh_token=${REFRESH_TOKEN}`,
        `client_id=${API_CONFIG.clientId}`,
        `client_secret=${API_CONFIG.clientSecret}`,
      ].join('&'),
    }
  )
  if (tokenResult.status !== 200) {
    console.error('   FAILED:', JSON.stringify(tokenResult.json, null, 2))
    process.exit(1)
  }
  const accessToken = `Bearer ${tokenResult.json.access_token}`
  console.log('   OK')

  if (tokenResult.json.refresh_token && tokenResult.json.refresh_token !== REFRESH_TOKEN) {
    console.log(`\n   ** Token rotated! New refresh token:\n   ${tokenResult.json.refresh_token}\n`)
  }

  // Device registration
  console.log('2. Registering device...')
  const deviceResult = await apiRequest(
    `${API_CONFIG.apiDomain}/api/v1/spa/notifications/register`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Stamp: getStamp(),
        'ccsp-application-id': API_CONFIG.appId,
        'ccsp-service-id': API_CONFIG.clientId,
        'User-Agent': 'okhttp/3.14.9',
      },
      body: JSON.stringify({
        pushRegId: `${genRanHex(22)}:${genRanHex(63)}-${genRanHex(55)}`,
        pushType: API_CONFIG.pushType,
        uuid: generateUUID(),
      }),
    }
  )
  const deviceId = deviceResult.json.resMsg?.deviceId || ''
  console.log(`   OK — deviceId: ${deviceId.slice(0, 8)}...`)

  // Get vehicle
  console.log('3. Fetching vehicle...')
  const vehiclesResult = await apiRequest(
    `${API_CONFIG.apiDomain}/api/v1/spa/vehicles`,
    { headers: commonHeaders(accessToken, deviceId) }
  )
  const vehicle = vehiclesResult.json.resMsg?.vehicles?.[0]
  if (!vehicle) {
    console.error('   FAILED: No vehicles found')
    process.exit(1)
  }
  const vehicleId = vehicle.vehicleId
  const ccs2 = vehicle.ccuCCS2ProtocolSupport ?? 0
  console.log(`   OK — ${vehicle.nickname}`)

  // Pre-command status
  console.log('4. Capturing pre-command status...')
  const preStatusResult = await apiRequest(
    `${API_CONFIG.apiDomain}/api/v1/spa/vehicles/${vehicleId}/ccs2/carstatus/latest`,
    {
      headers: {
        ...commonHeaders(accessToken, deviceId),
        ccuCCS2ProtocolSupport: ccs2.toString(),
      },
    }
  )
  const preVehicle = preStatusResult.json?.resMsg?.state?.Vehicle
  if (preVehicle) {
    const pre = extractClimateStatus(preVehicle)
    console.log('   Pre-command climate state:')
    console.log(`   ${JSON.stringify(pre, null, 2).split('\n').join('\n   ')}`)
  }

  // PIN verification
  console.log('5. Getting control token (PIN)...')
  const pinResult = await apiRequest(
    `${API_CONFIG.apiDomain}/api/v1/user/pin`,
    {
      method: 'PUT',
      headers: {
        ...commonHeaders(accessToken, deviceId),
        vehicleId,
        ccuCCS2ProtocolSupport: ccs2.toString(),
      },
      body: JSON.stringify({ pin: PIN, deviceId }),
    }
  )
  if (pinResult.status !== 200 || !pinResult.json.controlToken) {
    console.error('   FAILED:', JSON.stringify(pinResult.json, null, 2))
    process.exit(1)
  }
  const controlToken = `Bearer ${pinResult.json.controlToken}`
  console.log(`   OK`)

  // Send climate command
  const commandUrl = `${API_CONFIG.apiDomain}/api/v2/spa/vehicles/${vehicleId}/ccs2/control/temperature`

  console.log(`\n6. Sending climate command: ${SCENARIO_NAME}`)
  console.log(`   URL:     ${commandUrl}`)
  console.log(`   Payload: ${JSON.stringify(scenario.payload)}`)

  const proceed = await confirm(`Send "${SCENARIO_NAME}" climate command to ${vehicle.nickname}?`)
  if (!proceed) {
    console.log('   Cancelled.')
    return
  }

  const commandResult = await apiRequest(commandUrl, {
    method: 'POST',
    headers: {
      ...commonHeaders(controlToken, deviceId),
      Stamp: getStamp(),
      ccuCCS2ProtocolSupport: ccs2.toString(),
    },
    body: JSON.stringify(scenario.payload),
  })

  console.log(`   Response (${commandResult.status}): ${JSON.stringify(commandResult.json)}`)

  const transactionId = commandResult.json.msgId
  if (!transactionId) {
    console.log('\n   No msgId — cannot poll for completion.')
    saveResult(SCENARIO_NAME, scenario.payload, null, null, commandResult.json)
    return
  }

  // Poll for completion
  console.log(`\n7. Polling for completion...`)
  let commandSucceeded = false
  const MAX_POLLS = 20
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(2000)
    const pollResult = await apiRequest(
      `${API_CONFIG.apiDomain}/api/v1/spa/notifications/${vehicleId}/records`,
      {
        headers: {
          ...commonHeaders(accessToken, deviceId),
          ccuCCS2ProtocolSupport: ccs2.toString(),
        },
      }
    )
    if (Array.isArray(pollResult.json.resMsg)) {
      for (const record of pollResult.json.resMsg) {
        if (record.recordId === transactionId) {
          if (record.result === 'success') {
            console.log(`   SUCCESS after ${(i + 1) * 2}s`)
            commandSucceeded = true
            break
          } else if (record.result === 'fail' || record.result === 'non-response') {
            console.log(`   FAILED: ${record.result}`)
            saveResult(SCENARIO_NAME, scenario.payload, null, null, commandResult.json)
            return
          }
        }
      }
    }
    if (commandSucceeded) break
    process.stdout.write(`   Poll ${i + 1}/${MAX_POLLS}...\r`)
  }
  if (!commandSucceeded) {
    console.log(`   Timed out after ${MAX_POLLS * 2}s`)
  }

  // Post-command status
  console.log(`\n8. Capturing post-command status (waiting 10s for state to settle)...`)
  await sleep(10000)
  const postStatusResult = await apiRequest(
    `${API_CONFIG.apiDomain}/api/v1/spa/vehicles/${vehicleId}/ccs2/carstatus/latest`,
    {
      headers: {
        ...commonHeaders(accessToken, deviceId),
        ccuCCS2ProtocolSupport: ccs2.toString(),
      },
    }
  )

  const postVehicle = postStatusResult.json?.resMsg?.state?.Vehicle
  let postClimate: any = null
  if (postVehicle) {
    postClimate = extractClimateStatus(postVehicle)
    console.log('\n   Post-command climate state:')
    console.log(`   ${JSON.stringify(postClimate, null, 2).split('\n').join('\n   ')}`)
  }

  const preClimate = preVehicle ? extractClimateStatus(preVehicle) : null
  saveResult(SCENARIO_NAME, scenario.payload, preClimate, postClimate, commandResult.json)

  console.log(`\n   ✓ Results saved to __tests__/fixtures/climate/${SCENARIO_NAME}.json`)
  console.log(`\n   Now check the car and record what you observe.`)
  console.log(`   Run "climate-off" when ready for the next test.\n`)
}

function saveResult(
  name: string,
  payload: any,
  preClimate: any,
  postClimate: any,
  apiResponse: any
) {
  const result = {
    scenario: name,
    timestamp: new Date().toISOString(),
    sentPayload: payload,
    apiResponse: { ...apiResponse, msgId: 'fixture-msg-id' },
    preClimateState: preClimate,
    postClimateState: postClimate,
    observed: '<<FILL IN: what did the car actually do?>>',
  }
  const filePath = path.join(FIXTURES_DIR, `${name}.json`)
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2) + '\n')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
