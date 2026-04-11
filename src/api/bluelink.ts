// Region router — ported from egmp-bluelink-scriptable/src/lib/bluelink.ts

import { Bluelink } from './base'
import { Config } from '../config/types'
import { BluelinkCanada } from './regions/canada'
import { BluelinkUSA } from './regions/usa'
import { BluelinkUSAKia, MFAInputCallback } from './regions/usa-kia'
import { BluelinkEurope } from './regions/europe'
import { BluelinkIndia } from './regions/india'
import { BluelinkAustralia } from './regions/australia'
import { BluelinkDemo } from './demo/BluelinkDemo'

const regionSupport: Record<string, string[]> = {
  kia: ['canada', 'usa', 'europe', 'australia'],
  hyundai: ['canada', 'usa', 'europe', 'india', 'australia'],
  genesis: ['canada', 'usa'],
}

export async function initRegionalBluelink(
  config: Config,
  refreshAuth = true,
  mfaInputCallback?: MFAInputCallback,
): Promise<Bluelink | undefined> {
  if (config.auth.refreshToken === 'DEMO') {
    return await BluelinkDemo.init(config)
  }

  for (const [manufacturer, regions] of Object.entries(regionSupport)) {
    if (config.manufacturer.toLowerCase() === manufacturer) {
      if (!regions.includes(config.auth.region)) {
        throw new Error(`${config.manufacturer} is not supported in this region`)
      }
    }
  }

  switch (config.auth.region) {
    case 'canada':
      return await BluelinkCanada.init(config, refreshAuth)
    case 'usa':
      return config.manufacturer === 'kia'
        ? await BluelinkUSAKia.init(config, refreshAuth, undefined, mfaInputCallback)
        : await BluelinkUSA.init(config, refreshAuth)
    case 'europe':
      return await BluelinkEurope.init(config, refreshAuth)
    case 'india':
      return await BluelinkIndia.init(config, refreshAuth)
    case 'australia':
      return await BluelinkAustralia.init(config, refreshAuth)
    default:
      throw new Error(
        `Something went wrong determining bluelink region! Please raise an issue on GitHub with details of your vehicle and region.`,
      )
  }
}
