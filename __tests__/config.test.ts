import { DEFAULT_CONFIG, getAuthMethod, SUPPORTED_REGIONS, SUPPORTED_MANUFACTURERS } from '@/src/config/types'

describe('Config', () => {
  test('DEFAULT_CONFIG has expected defaults', () => {
    expect(DEFAULT_CONFIG.manufacturer).toBe('hyundai')
    expect(DEFAULT_CONFIG.tempType).toBe('C')
    expect(DEFAULT_CONFIG.distanceUnit).toBe('km')
    expect(DEFAULT_CONFIG.auth.region).toBe('')
  })

  test('getAuthMethod returns correct method for each region/manufacturer', () => {
    expect(getAuthMethod('hyundai', 'europe')).toBe('refresh_token')
    expect(getAuthMethod('kia', 'europe')).toBe('webview')
    expect(getAuthMethod('hyundai', 'usa')).toBe('credentials')
    expect(getAuthMethod('kia', 'canada')).toBe('credentials')
  })

  test('SUPPORTED_REGIONS includes expected regions', () => {
    expect(SUPPORTED_REGIONS).toContain('europe')
    expect(SUPPORTED_REGIONS).toContain('usa')
    expect(SUPPORTED_REGIONS).toContain('canada')
  })

  test('SUPPORTED_MANUFACTURERS includes expected manufacturers', () => {
    expect(SUPPORTED_MANUFACTURERS).toContain('Hyundai')
    expect(SUPPORTED_MANUFACTURERS).toContain('Kia')
  })
})
