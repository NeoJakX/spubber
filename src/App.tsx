import { useEffect } from 'react'
import { useLocale } from './i18n'
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
  }, [theme, pivot, locale])
}

export default function App() {
  useThemeSync()
  const route = useUi((s) => s.route)

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
