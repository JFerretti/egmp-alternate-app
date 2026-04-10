#!/usr/bin/env npx tsx
/**
 * Manual command testing script — sends REAL commands to your car.
 *
 * Usage:
 *   BLUELINK_REFRESH_TOKEN=<token> BLUELINK_PIN=<pin> npx tsx scripts/test-commands.ts <command>
 *
 * Commands:
 *   lock            Lock the car
 *   unlock          Unlock the car
 *   start-charge    Start charging
 *   stop-charge     Stop charging
 *   climate-on      Turn on climate (21°C, no defrost)
 *   climate-off     Turn off climate
 *   charge-limit    Set charge limit (AC 80%, DC 80%)
 *   status          Just fetch status (safe, read-only)
 *
 * This script sends REAL commands to your vehicle. Use with care.
 * Each command is confirmed with a prompt before sending.
 */

import * as readline from 'readline'
import * as fs from 'fs'
import * as path from 'path'

const FIXTURES_DIR = path.join(__dirname, '..', '__tests__', 'fixtures')

const REFRESH_TOKEN = process.env.BLUELINK_REFRESH_TOKEN
const PIN = process.env.BLUELINK_PIN
const COMMAND = process.argv[2]

if (!REFRESH_TOKEN) {
  console.error('Error: BLUELINK_REFRESH_TOKEN must be set')
  process.exit(1)
}

const VALID_COMMANDS = [
  'lock', 'unlock', 'start-charge', 'stop-charge',
  'climate-on', 'climate-off', 'charge-limit', 'status',
] as const
type Command = typeof VALID_COMMANDS[number]

if (!COMMAND || !VALID_COMMANDS.includes(COMMAND as Command)) {
  console.error(`Usage: BLUELINK_REFRESH_TOKEN=<token> BLUELINK_PIN=<pin> npx tsx scripts/test-commands.ts <command>`)
  console.error(`\nCommands: ${VALID_COMMANDS.join(', ')}`)
  process.exit(1)
}

if (COMMAND !== 'status' && !PIN) {
  console.error('Error: BLUELINK_PIN must be set for command operations')
  process.exit(1)
}

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
  }
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

async function apiRequest(url: string, opts: RequestInit = {}): Promise<any> {
  const resp = await fetch(url, opts)
  const text = await resp.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    json = { _raw: text }
  }
  return { status: resp.status, json }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function saveFixture(name: string, data: any) {
  const filePath = path.join(FIXTURES_DIR, `${name}.json`)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
  console.log(`   [fixture saved: ${name}.json]`)
}

function sanitizeControlToken(data: any): any {
  if (!data?.controlToken) return data
  return {
    ...data,
    controlToken: 'fixture-control-token',
  }
}

function sanitizeCommandResponse(data: any): any {
  if (!data?.msgId) return data
  return {
    ...data,
    msgId: 'fixture-transaction-id',
  }
}

function sanitizePollRecords(data: any): any {
  if (!Array.isArray(data?.resMsg)) return data
  return {
    ...data,
    resMsg: data.resMsg.map((record: any) => ({
      ...record,
      recordId: record.recordId ? 'fixture-transaction-id' : record.recordId,
    })),
  }
}

async function main() {
  const command = COMMAND as Command
  console.log(`\n=== Bluelink Command Tester ===`)
  console.log(`Command: ${command}\n`)

  // Step 1: Auth
  console.log('1. Refreshing token...')
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
  console.log('   OK — token acquired')

  if (tokenResult.json.refresh_token && tokenResult.json.refresh_token !== REFRESH_TOKEN) {
    console.log(`\n   ** Token rotated! New refresh token:\n   ${tokenResult.json.refresh_token}\n`)
  }

  // Step 2: Device registration
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

  // Step 3: Get vehicle ID
  console.log('3. Fetching vehicles...')
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
  console.log(`   OK — ${vehicle.nickname} (${vehicle.vehicleName} ${vehicle.year})`)

  // Step 4: Status (always)
  console.log('4. Fetching current status...')
  const statusResult = await apiRequest(
    `${API_CONFIG.apiDomain}/api/v1/spa/vehicles/${vehicleId}/ccs2/carstatus/latest`,
    {
      headers: {
        ...commonHeaders(accessToken, deviceId),
        ccuCCS2ProtocolSupport: ccs2.toString(),
      },
    }
  )
  if (statusResult.status === 200) {
    const v = statusResult.json.resMsg?.state?.Vehicle
    if (v) {
      console.log(`   SOC: ${v.Green?.BatteryManagement?.BatteryRemain?.Ratio}%`)
      console.log(`   Odometer: ${Math.floor(v.Drivetrain?.Odometer || 0)} km`)
      console.log(`   Charging: ${v.Green?.ChargingInformation?.ConnectorFastening?.State > 0 ? 'Yes' : 'No'}`)
      console.log(`   Charge limit: AC ${v.Green?.ChargingInformation?.TargetSoC?.Standard}% / DC ${v.Green?.ChargingInformation?.TargetSoC?.Quick}%`)
      console.log(`   Range: ${Math.floor(v.Drivetrain?.FuelSystem?.DTE?.Total || 0)} km`)
    }
  } else {
    console.log(`   Status fetch returned ${statusResult.status}`)
  }

  if (command === 'status') {
    console.log('\nDone (read-only).')
    console.log('\nFull response saved to: /tmp/bluelink-status.json')
    const fs = await import('fs')
    fs.writeFileSync('/tmp/bluelink-status.json', JSON.stringify(statusResult.json, null, 2))
    return
  }

  // Step 5: Get auth code (PIN verification)
  console.log('5. Getting auth code (PIN verification)...')
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
  console.log(`   OK — control token acquired (expires in ${pinResult.json.expiresTime}s)`)
  saveFixture('europe-auth-code', sanitizeControlToken(pinResult.json))

  // Step 6: Build and send command
  let commandUrl: string
  let commandBody: any

  switch (command) {
    case 'lock':
      commandUrl = `${API_CONFIG.apiDomain}/api/v2/spa/vehicles/${vehicleId}/ccs2/control/door`
      commandBody = { command: 'close', ccuCCS2ProtocolSupport: ccs2 }
      break
    case 'unlock':
      commandUrl = `${API_CONFIG.apiDomain}/api/v2/spa/vehicles/${vehicleId}/ccs2/control/door`
      commandBody = { command: 'open', ccuCCS2ProtocolSupport: ccs2 }
      break
    case 'start-charge':
      commandUrl = `${API_CONFIG.apiDomain}/api/v2/spa/vehicles/${vehicleId}/ccs2/control/charge`
      commandBody = { command: 'start', ccuCCS2ProtocolSupport: ccs2 }
      break
    case 'stop-charge':
      commandUrl = `${API_CONFIG.apiDomain}/api/v2/spa/vehicles/${vehicleId}/ccs2/control/charge`
      commandBody = { command: 'stop', ccuCCS2ProtocolSupport: ccs2 }
      break
    case 'climate-on':
      commandUrl = `${API_CONFIG.apiDomain}/api/v2/spa/vehicles/${vehicleId}/ccs2/control/temperature`
      commandBody = {
        command: 'start',
        windshieldFrontDefogState: false,
        hvacTempType: 1,
        heating1: 0,
        tempUnit: 'C',
        drvSeatLoc: 'L',
        hvacTemp: 21,
      }
      break
    case 'climate-off':
      commandUrl = `${API_CONFIG.apiDomain}/api/v2/spa/vehicles/${vehicleId}/ccs2/control/temperature`
      commandBody = { command: 'stop' }
      break
    case 'charge-limit':
      commandUrl = `${API_CONFIG.apiDomain}/api/v1/spa/vehicles/${vehicleId}/charge/target`
      commandBody = {
        targetSOClist: [
          { plugType: 0, targetSOClevel: 80 },
          { plugType: 1, targetSOClevel: 80 },
        ],
      }
      break
  }

  console.log(`\n6. Sending command: ${command}`)
  console.log(`   URL: ${commandUrl}`)
  console.log(`   Body: ${JSON.stringify(commandBody)}`)

  const proceed = await confirm(`Send "${command}" to ${vehicle.nickname}?`)
  if (!proceed) {
    console.log('   Cancelled.')
    return
  }

  const commandResult = await apiRequest(commandUrl!, {
    method: 'POST',
    headers: {
      ...commonHeaders(controlToken, deviceId),
      Stamp: getStamp(),
      ccuCCS2ProtocolSupport: ccs2.toString(),
    },
    body: JSON.stringify(commandBody),
  })

  console.log(`   Response (${commandResult.status}):`)
  console.log(`   ${JSON.stringify(commandResult.json, null, 2)}`)
  saveFixture(`europe-command-${command}`, sanitizeCommandResponse(commandResult.json))

  const transactionId = commandResult.json.msgId
  if (!transactionId) {
    console.log('\n   No msgId returned — cannot poll for completion.')
    return
  }

  // Step 7: Poll for completion
  console.log(`\n7. Polling for completion (msgId: ${transactionId})...`)
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
            saveFixture(`europe-poll-${command}-success`, sanitizePollRecords(pollResult.json))
            return
          } else if (record.result === 'fail' || record.result === 'non-response') {
            console.log(`   FAILED: ${record.result}`)
            console.log(`   ${JSON.stringify(record, null, 2)}`)
            saveFixture(`europe-poll-${command}-fail`, sanitizePollRecords(pollResult.json))
            return
          }
        }
      }
    }
    process.stdout.write(`   Poll ${i + 1}/${MAX_POLLS}...\r`)
  }
  console.log(`   Timed out after ${MAX_POLLS * 2}s — command may still be processing.`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
