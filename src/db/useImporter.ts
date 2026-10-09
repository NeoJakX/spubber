import { useCallback, useState } from 'react'
import sampleEn from '../assets/samples/welcome-to-spubber.epub?inline'
import sampleEs from '../assets/samples/bienvenido-a-spubber.epub?inline'
import { useLocale, useT, type MessageKey } from '../i18n'
import { useUi } from '../state/ui'
import { importEpub } from './books'
import type { BookRecord } from './db'

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: head.slice(5).split(';')[0] || 'application/epub+zip' })
}

export function useImporter() {
  const t = useT()
  const locale = useLocale()
  const toast = useUi((s) => s.toast)
  const [busy, setBusy] = useState<{ name: string; progress: number } | null>(null)

  const importFiles = useCallback(
    async (files: { blob: Blob; name: string }[]): Promise<BookRecord | undefined> => {
      let last: BookRecord | undefined
      for (const f of files) {
        setBusy({ name: f.name, progress: 0 })
        const res = await importEpub(f.blob, f.name, (p) => setBusy({ name: f.name, progress: p }))
        if (res.ok) {
          last = res.book
          toast(t(res.duplicate ? 'library.duplicate' : 'library.imported', { title: res.book.title }))
        } else {
          toast(t(`error.${res.code}` as MessageKey, { name: f.name }), { tone: 'error' })
        }
      }
      setBusy(null)
      return last
    },
    [t, toast],
  )

  const importSample = useCallback(() => {
    const es = locale === 'es'
    return importFiles([
      { blob: dataUrlToBlob(es ? sampleEs : sampleEn), name: es ? 'bienvenido-a-spubber.epub' : 'welcome-to-spubber.epub' },
    ])
  }, [importFiles, locale])

  return { importFiles, importSample, busy }
}
