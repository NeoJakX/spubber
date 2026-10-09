import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { useUi } from '../state/ui'

export const isNative = Capacitor.isNativePlatform()

const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

/** Wire Android/iOS specifics. Safe to call on the web: it does nothing there. */
export async function initNative() {
  if (!isNative) return
  const { App } = await import('@capacitor/app')
  // Android back button: close the open sheet, then leave the reader, then exit.
  await App.addListener('backButton', () => {
    if (document.querySelector('.sheet') || useUi.getState().route.name === 'reader') escape()
    else void App.exitApp()
  })
}

export function setSystemBarsDark(dark: boolean) {
  if (!isNative) return
  // "Dark" style = light icons, for dark backgrounds.
  void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {})
}
