import { friendlyError } from '@/src/utils/errorMessages'

describe('friendlyError', () => {
  test('maps network errors', () => {
    expect(friendlyError(new Error('Network request failed'))).toContain('internet connection')
  })

  test('maps auth errors', () => {
    expect(friendlyError(new Error('Login failed'))).toContain('credentials')
  })

  test('maps timeout errors', () => {
    expect(friendlyError(new Error('Request timed out'))).toContain('timed out')
  })

  test('passes through short readable messages', () => {
    expect(friendlyError(new Error('Custom short error'))).toBe('Custom short error')
  })

  test('returns generic for long technical messages', () => {
    const longError = new Error('{"errCode":"500","data":{"internal":"some very long technical error with JSON and http://api.example.com/v1/endpoint"}}}')
    expect(friendlyError(longError)).toBe('Something went wrong. Please try again.')
  })

  test('handles non-Error values', () => {
    expect(friendlyError('string error')).toBe('string error')
    expect(friendlyError(null)).toBeTruthy()
  })
})
