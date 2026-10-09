import { useEffect } from 'react'
import { translate, useLocale } from './i18n'
import { initNative, setSystemBarsDark } from './platform/native'
import { initWebApp, isStandalone } from './platform/webapp'
import { Library } from './screens/Library'
import { Reader } from './screens/Reader'
import { useSettings } from './state/settings'
import { useUi } from './state/ui'
import { Toasts } from './ui/primitives'

function useThemeSync() {
  const theme = useSettings((s) => s.theme)
  const pivot = useSettings((s) => s.pivot)
  const locale = useLocale()
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-app-theme')
    else root.setAttribute('data-app-theme', theme)
    root.style.setProperty('--pivot', `var(--pivot-${pivot})`)
    root.lang = locale
    // Keep the browser/OS chrome (mobile status bar) in tune with the page.
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = bg
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
    setSystemBarsDark(!!dark)
  }, [theme, pivot, locale])
}

export default function App() {
  useThemeSync()
  const route = useUi((s) => s.route)

  const locale = useLocale()
  useEffect(() => {
    void initNative()
  }, [])
  useEffect(() => {
    const t = (k: Parameters<typeof translate>[1]) => translate(locale, k)
    void initWebApp({
      onNeedRefresh: (update) =>
        useUi.getState().toast(t('pwa.update'), { action: { label: t('pwa.update.action'), run: update }, ms: 10 * 60 * 1000 }),
      // Only worth saying once it is installed; in the browser it would just be noise.
      onOfflineReady: () => isStandalone() && useUi.getState().toast(t('pwa.offline')),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- register once
  }, [])

  useEffect(() => {
    const onPop = () => useUi.setState({ route: { name: 'library' } })
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return (
    <>
      {route.name === 'library' ? <Library /> : <Reader key={route.bookId} bookId={route.bookId} />}
      <Toasts />
    </>
  )
}
