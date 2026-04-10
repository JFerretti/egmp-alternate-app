import { useColorScheme } from 'react-native'
import { md3 } from '@/constants/Colors'

export type MD3Colors = typeof md3.dark

export function useTheme(): MD3Colors {
  const scheme = useColorScheme()
  return scheme === 'light' ? md3.light : md3.dark
}
