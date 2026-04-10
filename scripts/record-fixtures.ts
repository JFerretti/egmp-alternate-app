#!/usr/bin/env npx tsx
/**
 * Record real API responses as test fixtures.
 *
 * Usage:
 *   BLUELINK_REFRESH_TOKEN=<token> npx tsx scripts/record-fixtures.ts
 *
 * This script:
 * 1. Authenticates with the Hyundai Europe API using your refresh token
 * 2. Fetches vehicle list and car status (READ-ONLY operations only)
 * 3. Saves sanitized responses as JSON fixtures
 * 4. If the API rotates your refresh token, prints the new one
 *
 * SAFETY: This script NEVER calls write endpoints (lock, unlock, charge, climate).
 */

import * as fs from 'fs'
import * as path from 'path'

const REFRESH_TOKEN = process.env.BLUELINK_REFRESH_TOKEN
if (!REFRESH_TOKEN) {
  console.error('Error: BLUELINK_REFRESH_TOKEN must be set')
  console.error('Usage: BLUELINK_REFRESH_TOKEN=<token> npx tsx scripts/record-fixtures.ts')
  process.exit(1)
}

const FIXTURES_DIR = path.join(__dirname, '..', '__tests__', 'fixtures')

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

function saveFixture(name: string, data: any) {
  const filePath = path.join(FIXTURES_DIR, `${name}.json`)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
  console.log(`  Saved: ${filePath}`)
}

function sanitizeVehicles(data: any): any {
  if (!data?.resMsg?.vehicles) return data
  return {
    ...data,
    resMsg: {
      ...data.resMsg,
      vehicles: data.resMsg.vehicles.map((v: any) => ({
        ...v,
        vin: 'KMXXXXXXXXXXXXXXX',
        nickname: v.nickname ? 'My ' + (v.vehicleName || 'Vehicle') : v.nickname,
        vehicleId: 'fixture-vehicle-id-001',
      })),
    },
  }
}

function sanitizeTokens(data: any): any {
  return {
    ...data,
    access_token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.fixture-access-token',
    refresh_token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.fixture-refresh-token',
  }
}

function sanitizeLocation(data: any): any {
  if (!data?.resMsg?.state?.Vehicle?.Location?.GeoCoord) return data
  const result = JSON.parse(JSON.stringify(data))
  result.resMsg.state.Vehicle.Location.GeoCoord = {
    Latitude: '51.5074',
    Longitude: '-0.1278',
  }
  return result
}

async function main() {
  console.log('Recording API fixtures from Hyundai Europe API...\n')

  // Step 1: Token refresh
  console.log('1. Refreshing token...')
  const tokenResp = await fetch(
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
  const tokenData = await tokenResp.json()
  if (!tokenResp.ok) {
    console.error('Token refresh failed:', tokenData)
    process.exit(1)
  }
  const accessToken = `Bearer ${tokenData.access_token}`
  const newRefreshToken = tokenData.refresh_token
  saveFixture('europe-token-refresh', sanitizeTokens(tokenData))

  if (newRefreshToken && newRefreshToken !== REFRESH_TOKEN) {
    console.log('\n  ** Token was rotated! New refresh token:')
    console.log(`  ${newRefreshToken}`)
    console.log('  Update your .env.local with this new token.\n')
  }

  // Step 2: Device registration
  console.log('2. Registering device...')
  const deviceResp = await fetch(
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
  const deviceData = await deviceResp.json()
  saveFixture('europe-device-register', deviceData)
  const deviceId = deviceData.resMsg?.deviceId

  // Step 3: Get vehicles
  console.log('3. Fetching vehicles...')
  const vehiclesResp = await fetch(
    `${API_CONFIG.apiDomain}/api/v1/spa/vehicles`,
    {
      headers: {
        Authorization: accessToken,
        Stamp: getStamp(),
        'ccsp-device-id': deviceId || '',
        'ccsp-application-id': API_CONFIG.appId,
        'ccsp-service-id': API_CONFIG.clientId,
        'User-Agent': 'okhttp/3.14.9',
      },
    }
  )
  const vehiclesData = await vehiclesResp.json()
  saveFixture('europe-vehicles', sanitizeVehicles(vehiclesData))

  const vehicleId = vehiclesData.resMsg?.vehicles?.[0]?.vehicleId
  const ccs2 = vehiclesData.resMsg?.vehicles?.[0]?.ccuCCS2ProtocolSupport ?? 0
  if (!vehicleId) {
    console.error('No vehicles found!')
    process.exit(1)
  }

  // Step 4: Get car status (latest — READ ONLY)
  console.log('4. Fetching car status (latest, non-force)...')
  const statusResp = await fetch(
    `${API_CONFIG.apiDomain}/api/v1/spa/vehicles/${vehicleId}/ccs2/carstatus/latest`,
    {
      headers: {
        Authorization: accessToken,
        Stamp: getStamp(),
        'ccsp-device-id': deviceId || '',
        ccuCCS2ProtocolSupport: ccs2.toString(),
        'ccsp-application-id': API_CONFIG.appId,
        'ccsp-service-id': API_CONFIG.clientId,
        'User-Agent': 'okhttp/3.14.9',
      },
    }
  )
  const statusData = await statusResp.json()
  saveFixture('europe-car-status', sanitizeLocation(statusData))

  console.log('\nDone! Fixtures recorded and sanitized (VIN, location, tokens redacted).')
  console.log('Run tests with: npm test')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
