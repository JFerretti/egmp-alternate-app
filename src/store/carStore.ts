// Zustand store for car state management

import { create } from 'zustand'
import { Bluelink, BluelinkStatus, BluelinkCar, CarOption, ClimateRequest, ChargeLimit } from '../api/base'
import { Config } from '../config/types'
import { initRegionalBluelink } from '../api/bluelink'
import { storageRemove } from '../storage/secureStore'
import { clearConfig } from '../storage/configStore'
import { clearStoredWebviewAuthResult } from '../api/regions/europe'
import type { MFAInputCallback } from '../api/regions/usa-kia'
import { friendlyError } from '../utils/errorMessages'

interface CarStore {
  // State
  bluelink: Bluelink | null
  car: BluelinkCar | null
  status: BluelinkStatus | null
  carOptions: CarOption[]
  isLoading: boolean
  isCommandLoading: boolean
  error: string | null
  commandError: string | null
  needsWebviewAuth: boolean

  // Actions
  connect: (config: Config, mfaInputCallback?: MFAInputCallback) => Promise<void>
  selectCar: (vin: string, config: Config) => Promise<void>
  switchVehicle: (config: Config) => Promise<void>
  disconnect: () => void
  resetAll: () => Promise<void>
  refreshStatus: (forceUpdate?: boolean, location?: boolean) => Promise<void>
  sendLock: () => Promise<boolean>
  sendUnlock: () => Promise<boolean>
  sendStartCharge: () => Promise<boolean>
  sendStopCharge: () => Promise<boolean>
  sendClimateOn: (config: ClimateRequest) => Promise<boolean>
  sendClimateOff: () => Promise<boolean>
  sendSetChargeLimit: (config: ChargeLimit) => Promise<boolean>
  updateConfig: (config: Config) => Promise<void>
  clearError: () => void
  clearCommandError: () => void
}

export const useCarStore = create<CarStore>((set, get) => ({
  bluelink: null,
  car: null,
  status: null,
  carOptions: [],
  isLoading: false,
  isCommandLoading: false,
  error: null,
  commandError: null,
  needsWebviewAuth: false,

  connect: async (config, mfaInputCallback) => {
    set({ isLoading: true, error: null, needsWebviewAuth: false })
    try {
      const bluelink = await initRegionalBluelink(config, true, mfaInputCallback)
      if (!bluelink) {
        set({ isLoading: false, error: 'Could not connect. Please check your credentials.' })
        return
      }

      if (bluelink.needRestart()) {
        set({ isLoading: false, needsWebviewAuth: true, bluelink })
        return
      }

      if (bluelink.loginFailed()) {
        set({ isLoading: false, error: 'Authentication failed. Please check your credentials.' })
        return
      }

      const options = bluelink.getCarOptions()
      if (options.length > 0) {
        set({ isLoading: false, carOptions: options, bluelink })
        return
      }

      const { car, status } = bluelink.getCachedStatus()
      if (!car) {
        set({ isLoading: false, error: 'No vehicle found on your account.' })
        return
      }
      set({ bluelink, car, status, isLoading: false })
    } catch (e: any) {
      console.error('[Bluelink] Connect failed:', e)
      set({ isLoading: false, error: friendlyError(e) })
    }
  },

  selectCar: async (vin, config) => {
    set({ isLoading: true, error: null, carOptions: [] })
    try {
      const configWithVin = { ...config, vin }
      const bluelink = await initRegionalBluelink(configWithVin, true)
      if (!bluelink) {
        set({ isLoading: false, error: 'Could not connect to the selected vehicle.' })
        return
      }
      if (bluelink.loginFailed()) {
        set({ isLoading: false, error: 'Authentication failed. Please check your credentials.' })
        return
      }
      const { car, status } = bluelink.getCachedStatus()
      if (!car) {
        set({ isLoading: false, error: 'No vehicle found on your account.' })
        return
      }
      set({ bluelink, car, status, isLoading: false })
    } catch (e: any) {
      console.error('[Bluelink] Select car failed:', e)
      set({ isLoading: false, error: friendlyError(e) })
    }
  },

  switchVehicle: async (config) => {
    const configWithoutVin = { ...config, vin: undefined }
    set({ car: null, status: null, carOptions: [], isLoading: true, error: null })
    try {
      const bluelink = await initRegionalBluelink(configWithoutVin, true)
      if (!bluelink) {
        set({ isLoading: false, error: 'Could not load your vehicles. Please try again.' })
        return
      }
      const options = bluelink.getCarOptions()
      if (options.length > 0) {
        set({ isLoading: false, carOptions: options, bluelink })
      } else {
        // Only one car on account — re-select it
        const { car, status } = bluelink.getCachedStatus()
        if (!car) {
          set({ isLoading: false, error: 'No vehicle found on your account.' })
          return
        }
        set({ bluelink, car, status, isLoading: false })
      }
    } catch (e: any) {
      console.error('[Bluelink] Switch vehicle failed:', e)
      set({ isLoading: false, error: friendlyError(e) })
    }
  },

  disconnect: () => {
    set({
      bluelink: null,
      car: null,
      status: null,
      carOptions: [],
      error: null,
      commandError: null,
      needsWebviewAuth: false,
    })
  },

  resetAll: async () => {
    await storageRemove('egmp-bl-cache-egmp-alternate-app')
    await clearConfig()
    await clearStoredWebviewAuthResult()
    set({
      bluelink: null,
      car: null,
      status: null,
      carOptions: [],
      error: null,
      commandError: null,
      needsWebviewAuth: false,
      isLoading: false,
      isCommandLoading: false,
    })
  },

  refreshStatus: async (forceUpdate = false, location = false) => {
    const { bluelink, car } = get()
    if (!bluelink || !car) return
    set({ isLoading: true, error: null })
    try {
      const { car, status } = await bluelink.getStatus(forceUpdate, true, location)
      set({ car, status, isLoading: false })
    } catch (e: any) {
      console.error('[Bluelink] Refresh status failed:', e)
      set({ isLoading: false, error: friendlyError(e) })
    }
  },

  sendLock: async () => {
    const { bluelink } = get()
    if (!bluelink) return false
    set({ isCommandLoading: true, commandError: null })
    try {
      const result = await bluelink.sendLock()
      if (result.data) set({ status: result.data })
      set({ isCommandLoading: false })
      return result.isSuccess
    } catch (e: any) {
      console.error('[Bluelink] Lock command failed:', e)
      set({ isCommandLoading: false, commandError: friendlyError(e) })
      return false
    }
  },

  sendUnlock: async () => {
    const { bluelink } = get()
    if (!bluelink) return false
    set({ isCommandLoading: true, commandError: null })
    try {
      const result = await bluelink.sendUnlock()
      if (result.data) set({ status: result.data })
      set({ isCommandLoading: false })
      return result.isSuccess
    } catch (e: any) {
      console.error('[Bluelink] Unlock command failed:', e)
      set({ isCommandLoading: false, commandError: friendlyError(e) })
      return false
    }
  },

  sendStartCharge: async () => {
    const { bluelink } = get()
    if (!bluelink) return false
    set({ isCommandLoading: true, commandError: null })
    try {
      const result = await bluelink.sendStartCharge()
      if (result.data) set({ status: result.data })
      set({ isCommandLoading: false })
      return result.isSuccess
    } catch (e: any) {
      console.error('[Bluelink] Start charge failed:', e)
      set({ isCommandLoading: false, commandError: friendlyError(e) })
      return false
    }
  },

  sendStopCharge: async () => {
    const { bluelink } = get()
    if (!bluelink) return false
    set({ isCommandLoading: true, commandError: null })
    try {
      const result = await bluelink.sendStopCharge()
      if (result.data) set({ status: result.data })
      set({ isCommandLoading: false })
      return result.isSuccess
    } catch (e: any) {
      console.error('[Bluelink] Stop charge failed:', e)
      set({ isCommandLoading: false, commandError: friendlyError(e) })
      return false
    }
  },

  sendClimateOn: async (config) => {
    const { bluelink } = get()
    if (!bluelink) return false
    set({ isCommandLoading: true, commandError: null })
    try {
      const result = await bluelink.sendClimateOn(config)
      if (result.data) set({ status: result.data })
      set({ isCommandLoading: false })
      return result.isSuccess
    } catch (e: any) {
      console.error('[Bluelink] Climate on failed:', e)
      set({ isCommandLoading: false, commandError: friendlyError(e) })
      return false
    }
  },

  sendClimateOff: async () => {
    const { bluelink } = get()
    if (!bluelink) return false
    set({ isCommandLoading: true, commandError: null })
    try {
      const result = await bluelink.sendClimateOff()
      if (result.data) set({ status: result.data })
      set({ isCommandLoading: false })
      return result.isSuccess
    } catch (e: any) {
      console.error('[Bluelink] Climate off failed:', e)
      set({ isCommandLoading: false, commandError: friendlyError(e) })
      return false
    }
  },

  sendSetChargeLimit: async (config) => {
    const { bluelink } = get()
    if (!bluelink) return false
    set({ isCommandLoading: true, commandError: null })
    try {
      const result = await bluelink.sendSetChargeLimit(config)
      if (result.data) set({ status: result.data })
      set({ isCommandLoading: false })
      return result.isSuccess
    } catch (e: any) {
      console.error('[Bluelink] Set charge limit failed:', e)
      set({ isCommandLoading: false, commandError: friendlyError(e) })
      return false
    }
  },

  updateConfig: async (config) => {
    const { bluelink } = get()
    if (!bluelink) return
    bluelink.updateConfig(config)
    // Force refresh to re-convert values (e.g. range) with new units
    try {
      set({ isLoading: true, error: null })
      const { car, status } = await bluelink.getStatus(true, true)
      set({ car, status, isLoading: false })
    } catch (e: any) {
      console.error('[Bluelink] Refresh after config update failed:', e)
      set({ isLoading: false, error: friendlyError(e) })
    }
  },

  clearError: () => set({ error: null }),
  clearCommandError: () => set({ commandError: null }),
}))
