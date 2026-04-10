/**
 * Fetch mock for API tests — intercepts global.fetch and returns fixture data
 * based on URL pattern matching. Commands (lock/unlock/charge/climate) are never
 * sent to the real API.
 */

import * as fs from 'fs'
import * as path from 'path'

import tokenRefreshFixture from '../fixtures/europe-token-refresh.json'
import deviceRegisterFixture from '../fixtures/europe-device-register.json'
import vehiclesFixture from '../fixtures/europe-vehicles.json'
import carStatusFixture from '../fixtures/europe-car-status.json'

export interface FetchRoute {
  pattern: RegExp
  response: any
  status?: number
}

/** Try to load a fixture file, returning undefined if it doesn't exist yet. */
function loadOptionalFixture(name: string): any | undefined {
  const filePath = path.join(__dirname, '..', 'fixtures', `${name}.json`)
  if (!fs.existsSync(filePath)) return undefined
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

/** Read-only routes — always available. */
const europeRoutes: FetchRoute[] = [
  {
    pattern: /\/auth\/api\/v2\/user\/oauth2\/token/,
    response: tokenRefreshFixture,
  },
  {
    pattern: /\/api\/v1\/spa\/notifications\/register/,
    response: deviceRegisterFixture,
  },
  {
    pattern: /\/api\/v1\/spa\/vehicles\/[^/]+\/ccs2\/carstatus\/latest/,
    response: carStatusFixture,
  },
  {
    pattern: /\/api\/v1\/spa\/vehicles$/,
    response: vehiclesFixture,
  },
]

/**
 * Build command routes from recorded fixtures (if they exist).
 * These are created by running: npm run test:command -- <command>
 */
function buildCommandRoutes(): FetchRoute[] {
  const routes: FetchRoute[] = []

  const authCode = loadOptionalFixture('europe-auth-code')
  if (authCode) {
    routes.push({ pattern: /\/api\/v1\/user\/pin/, response: authCode })
  }

  // Command fixtures: europe-command-lock, europe-command-unlock, etc.
  const commandMap: Record<string, RegExp> = {
    'lock': /\/ccs2\/control\/door/,
    'unlock': /\/ccs2\/control\/door/,
    'start-charge': /\/ccs2\/control\/charge/,
    'stop-charge': /\/ccs2\/control\/charge/,
    'climate-on': /\/ccs2\/control\/temperature/,
    'climate-off': /\/ccs2\/control\/temperature/,
    'charge-limit': /\/charge\/target/,
  }

  for (const [cmd, pattern] of Object.entries(commandMap)) {
    const fixture = loadOptionalFixture(`europe-command-${cmd}`)
    if (fixture) {
      routes.push({ pattern, response: fixture })
      break // Only one command fixture per endpoint pattern
    }
  }

  // Poll fixtures: europe-poll-lock-success, etc.
  const pollFixture =
    loadOptionalFixture('europe-poll-lock-success') ||
    loadOptionalFixture('europe-poll-unlock-success') ||
    loadOptionalFixture('europe-poll-start-charge-success') ||
    loadOptionalFixture('europe-poll-stop-charge-success') ||
    loadOptionalFixture('europe-poll-climate-on-success') ||
    loadOptionalFixture('europe-poll-climate-off-success') ||
    loadOptionalFixture('europe-poll-charge-limit-success')

  if (pollFixture) {
    routes.push({ pattern: /\/notifications\/[^/]+\/records/, response: pollFixture })
  }

  return routes
}

function createFetchResponse(body: any, status = 200): Response {
  const json = JSON.stringify(body)
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(json),
    json: () => Promise.resolve(body),
  } as unknown as Response
}

/**
 * Install the fetch mock. Returns a handle with utilities for assertions
 * and cleanup.
 *
 * @param extraRoutes  Additional routes prepended (highest priority)
 * @param includeCommands  Load command fixtures if they exist (default: false)
 */
export function installFetchMock(extraRoutes: FetchRoute[] = [], includeCommands = false) {
  const commandRoutes = includeCommands ? buildCommandRoutes() : []
  const routes = [...extraRoutes, ...commandRoutes, ...europeRoutes]
  const calls: { url: string; init?: RequestInit }[] = []

  const mockFetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    calls.push({ url, init })

    for (const route of routes) {
      if (route.pattern.test(url)) {
        return createFetchResponse(route.response, route.status ?? 200)
      }
    }

    throw new Error(`[fetchMock] No route matched: ${url}`)
  }) as jest.MockedFunction<typeof fetch>

  const originalFetch = global.fetch
  global.fetch = mockFetch

  return {
    mock: mockFetch,
    calls,
    /** Get all calls to a URL matching a pattern */
    callsTo: (pattern: RegExp) => calls.filter((c) => pattern.test(c.url)),
    /** Check if command fixtures are available */
    hasCommandFixtures: commandRoutes.length > 0,
    /** Restore the original fetch */
    restore: () => {
      global.fetch = originalFetch
    },
  }
}
