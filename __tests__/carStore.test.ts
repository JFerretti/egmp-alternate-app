import { useCarStore } from '@/src/store/carStore'
import { initRegionalBluelink } from '@/src/api/bluelink'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('@/src/api/bluelink')
jest.mock('@/src/storage/secureStore')
jest.mock('@/src/storage/configStore')
jest.mock('@/src/api/regions/europe')

const mockInitRegionalBluelink = initRegionalBluelink as jest.MockedFunction<
  typeof initRegionalBluelink
>

const mockCar = {
  id: 'vehicle-123',
  vin: 'KMXXXXXXXXXXXXXXX',
  nickName: 'Test Car',
  modelName: 'IONIQ 5',
  modelYear: '2024',
  odometer: 10000,
}

const mockStatus = {
  soc: 80,
  range: 300,
  locked: true,
  isCharging: false,
  isPluggedIn: false,
  climate: false,
  twelveSoc: 95,
  lastStatusCheck: Date.now(),
  lastRemoteStatusCheck: Date.now(),
  chargingPower: 0,
  remainingChargeTimeMins: 0,
}

const mockConfig = {
  manufacturer: 'hyundai',
  auth: { username: 'test', password: 'test', pin: '1234', region: 'europe' },
  tempType: 'C' as const,
  distanceUnit: 'km' as const,
  climateTempWarm: 21.5,
  climateTempCold: 19,
  climateSeatLevel: 'Off',
  mfaPreference: 'sms' as const,
  carColor: 'white',
}

const initialState = {
  bluelink: null,
  car: null,
  status: null,
  carOptions: [],
  isLoading: false,
  isCommandLoading: false,
  error: null,
  commandError: null,
  needsWebviewAuth: false,
}

function createMockBluelink(overrides: Record<string, any> = {}) {
  return {
    needRestart: jest.fn().mockReturnValue(false),
    loginFailed: jest.fn().mockReturnValue(false),
    getCarOptions: jest.fn().mockReturnValue([]),
    getCachedStatus: jest.fn().mockReturnValue({ car: mockCar, status: mockStatus }),
    getStatus: jest.fn().mockResolvedValue({ car: mockCar, status: mockStatus }),
    sendLock: jest.fn().mockResolvedValue({ isSuccess: true, data: mockStatus }),
    sendUnlock: jest.fn().mockResolvedValue({ isSuccess: true, data: mockStatus }),
    sendStartCharge: jest.fn().mockResolvedValue({ isSuccess: true, data: mockStatus }),
    sendStopCharge: jest.fn().mockResolvedValue({ isSuccess: true, data: mockStatus }),
    sendClimateOn: jest.fn().mockResolvedValue({ isSuccess: true, data: mockStatus }),
    sendClimateOff: jest.fn().mockResolvedValue({ isSuccess: true, data: mockStatus }),
    sendSetChargeLimit: jest.fn().mockResolvedValue({ isSuccess: true, data: mockStatus }),
    ...overrides,
  } as any
}

beforeEach(() => {
  jest.clearAllMocks()
  useCarStore.setState(initialState)
})

describe('carStore', () => {
  describe('initial state', () => {
    it('has correct default values', () => {
      const state = useCarStore.getState()
      expect(state.bluelink).toBeNull()
      expect(state.car).toBeNull()
      expect(state.status).toBeNull()
      expect(state.carOptions).toEqual([])
      expect(state.isLoading).toBe(false)
      expect(state.isCommandLoading).toBe(false)
      expect(state.error).toBeNull()
      expect(state.commandError).toBeNull()
      expect(state.needsWebviewAuth).toBe(false)
    })
  })

  describe('connect()', () => {
    it('connects successfully with a single car', async () => {
      const mockBl = createMockBluelink()
      mockInitRegionalBluelink.mockResolvedValue(mockBl)

      await useCarStore.getState().connect(mockConfig)

      const state = useCarStore.getState()
      expect(state.bluelink).toBe(mockBl)
      expect(state.car).toEqual(mockCar)
      expect(state.status).toEqual(mockStatus)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('sets error on login failure', async () => {
      const mockBl = createMockBluelink({ loginFailed: jest.fn().mockReturnValue(true) })
      mockInitRegionalBluelink.mockResolvedValue(mockBl)

      await useCarStore.getState().connect(mockConfig)

      const state = useCarStore.getState()
      expect(state.error).toBe('Authentication failed. Please check your credentials.')
      expect(state.bluelink).toBeNull()
      expect(state.isLoading).toBe(false)
    })

    it('sets carOptions when multiple vehicles are available', async () => {
      const carOptions = [
        { vin: 'VIN1', nickName: 'Car 1', modelName: 'IONIQ 5', modelYear: '2024' },
        { vin: 'VIN2', nickName: 'Car 2', modelName: 'EV6', modelYear: '2024' },
      ]
      const mockBl = createMockBluelink({
        getCarOptions: jest.fn().mockReturnValue(carOptions),
      })
      mockInitRegionalBluelink.mockResolvedValue(mockBl)

      await useCarStore.getState().connect(mockConfig)

      const state = useCarStore.getState()
      expect(state.carOptions).toEqual(carOptions)
      expect(state.car).toBeNull()
      expect(state.bluelink).toBe(mockBl)
      expect(state.isLoading).toBe(false)
    })

    it('sets error when initRegionalBluelink returns null', async () => {
      mockInitRegionalBluelink.mockResolvedValue(undefined)

      await useCarStore.getState().connect(mockConfig)

      const state = useCarStore.getState()
      expect(state.error).toBe('Could not connect. Please check your credentials.')
      expect(state.bluelink).toBeNull()
      expect(state.isLoading).toBe(false)
    })

    it('sets error when connect throws', async () => {
      mockInitRegionalBluelink.mockRejectedValue(new Error('network request failed'))

      await useCarStore.getState().connect(mockConfig)

      const state = useCarStore.getState()
      expect(state.error).toBe('Unable to reach server. Check your internet connection.')
      expect(state.isLoading).toBe(false)
    })
  })

  describe('disconnect()', () => {
    it('clears all state', () => {
      const mockBl = createMockBluelink()
      useCarStore.setState({
        bluelink: mockBl,
        car: mockCar as any,
        status: mockStatus as any,
        error: 'some error',
        commandError: 'cmd error',
        needsWebviewAuth: true,
      })

      useCarStore.getState().disconnect()

      const state = useCarStore.getState()
      expect(state.bluelink).toBeNull()
      expect(state.car).toBeNull()
      expect(state.status).toBeNull()
      expect(state.carOptions).toEqual([])
      expect(state.error).toBeNull()
      expect(state.commandError).toBeNull()
      expect(state.needsWebviewAuth).toBe(false)
    })
  })

  describe('refreshStatus()', () => {
    it('is a no-op when bluelink is null', async () => {
      await useCarStore.getState().refreshStatus()

      const state = useCarStore.getState()
      expect(state.isLoading).toBe(false)
    })

    it('is a no-op when car is null', async () => {
      const mockBl = createMockBluelink()
      useCarStore.setState({ bluelink: mockBl })

      await useCarStore.getState().refreshStatus()

      expect(mockBl.getStatus).not.toHaveBeenCalled()
      expect(useCarStore.getState().isLoading).toBe(false)
    })

    it('updates status on success', async () => {
      const updatedStatus = { ...mockStatus, soc: 90 }
      const mockBl = createMockBluelink({
        getStatus: jest.fn().mockResolvedValue({ car: mockCar, status: updatedStatus }),
      })
      useCarStore.setState({ bluelink: mockBl, car: mockCar as any })

      await useCarStore.getState().refreshStatus()

      const state = useCarStore.getState()
      expect(state.status).toEqual(updatedStatus)
      expect(state.isLoading).toBe(false)
    })
  })

  describe('sendLock()', () => {
    it('sends lock command and updates status', async () => {
      const lockedStatus = { ...mockStatus, locked: true }
      const mockBl = createMockBluelink({
        sendLock: jest.fn().mockResolvedValue({ isSuccess: true, data: lockedStatus }),
      })
      useCarStore.setState({ bluelink: mockBl })

      const result = await useCarStore.getState().sendLock()

      expect(result).toBe(true)
      expect(useCarStore.getState().status).toEqual(lockedStatus)
      expect(useCarStore.getState().isCommandLoading).toBe(false)
      expect(useCarStore.getState().commandError).toBeNull()
    })

    it('returns false and sets commandError on failure', async () => {
      const mockBl = createMockBluelink({
        sendLock: jest.fn().mockRejectedValue(new Error('failed to send lock')),
      })
      useCarStore.setState({ bluelink: mockBl })

      const result = await useCarStore.getState().sendLock()

      expect(result).toBe(false)
      expect(useCarStore.getState().commandError).toBe(
        'Command could not be sent. Please try again.'
      )
      expect(useCarStore.getState().isCommandLoading).toBe(false)
    })

    it('returns false when bluelink is null', async () => {
      const result = await useCarStore.getState().sendLock()
      expect(result).toBe(false)
    })
  })

  describe('clearError / clearCommandError', () => {
    it('clears error', () => {
      useCarStore.setState({ error: 'some error' })
      useCarStore.getState().clearError()
      expect(useCarStore.getState().error).toBeNull()
    })

    it('clears commandError', () => {
      useCarStore.setState({ commandError: 'some error' })
      useCarStore.getState().clearCommandError()
      expect(useCarStore.getState().commandError).toBeNull()
    })
  })
})
