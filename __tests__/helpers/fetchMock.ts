/**
 * Fetch mock for API tests — intercepts global.fetch and returns fixture data
 * based on URL pattern matching. Commands (lock/unlock/charge/climate) are never
 * sent to the real API.
 */

import tokenRefreshFixture from '../fixtures/europe-token-refresh.json'
import deviceRegisterFixture from '../fixtures/europe-device-register.json'
import vehiclesFixture from '../fixtures/europe-vehicles.json'
import carStatusFixture from '../fixtures/europe-car-status.json'

interface FetchRoute {
  pattern: RegExp
  response: any
  status?: number
}

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
 */
export function installFetchMock(extraRoutes: FetchRoute[] = []) {
  const routes = [...extraRoutes, ...europeRoutes]
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
    /** Restore the original fetch */
    restore: () => {
      global.fetch = originalFetch
    },
  }
}
