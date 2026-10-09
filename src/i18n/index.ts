import { useCallback } from 'react'
import { useSettings } from '../state/settings'
import { en } from './en'
import { es, type MessageKey } from './es'

export type { MessageKey }
export type Locale = 'es' | 'en'

const dictionaries: Record<Locale, Record<MessageKey, string>> = { es, en }

export function detectLocale(): Locale {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
    for (const l of langs) {
      if (l?.toLowerCase().startsWith('es')) return 'es'
      if (l?.toLowerCase().startsWith('en')) return 'en'
    }
  } catch {
    /* ignore */
  }
  return 'en'
}

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  let s = dictionaries[locale][key] ?? dictionaries.en[key] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

export function useLocale(): Locale {
  const lang = useSettings((s) => s.lang)
  return lang === 'auto' ? detectLocale() : lang
}

export function useT() {
  const locale = useLocale()
  return useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  )
}

/** "2 h 05 min", "12 min", "under 1 min" */
export function formatDuration(ms: number, t: ReturnType<typeof useT>): string {
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 1) return t('time.lessMin')
  if (totalMin < 60) return t('time.min', { m: totalMin })
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return t('time.hmin', { h, m: String(m).padStart(2, '0') })
}
