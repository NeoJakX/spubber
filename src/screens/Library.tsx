import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, MoreHorizontal, Settings2, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { deleteBook } from '../db/books'
import { db, type BookRecord } from '../db/db'
import { useImporter } from '../db/useImporter'
import { formatDuration, useT } from '../i18n'
import { useSettings } from '../state/settings'
import { useUi } from '../state/ui'
import { Cover } from '../ui/Cover'
import { InstallBanner } from '../ui/InstallBanner'
import { isIOS, isWebApp, takeSharedFiles } from '../platform/webapp'
import { Wordmark } from '../ui/primitives'
import { WordDisplay } from './reader/WordDisplay'
import { SettingsPanel } from './SettingsPanel'

function progressOf(b: BookRecord) {
  if (b.finished) return 1
  return b.totalWords > 1 ? b.position / (b.totalWords - 1) : 0
}

function timeLeftMs(b: BookRecord, wpm: number) {
  return (b.totalPause * (1 - progressOf(b)) * 60000) / wpm
}

export function Library() {
  const t = useT()
  const go = useUi((s) => s.go)
  const wpm = useSettings((s) => s.wpm)
  const books = useLiveQuery(() => db.books.orderBy('addedAt').reverse().toArray(), [])
  const { importFiles, importSample, busy } = useImporter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // EPUBs shared to the installed web app (Android share sheet).
  useEffect(() => {
    if (!isWebApp) return
    void takeSharedFiles().then((files) => {
      if (files.length) void importFiles(files)
    })
    if (location.search.includes('shared')) {
      try {
        history.replaceState(null, '', location.pathname)
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on start
  }, [])

  // Whole-window drag & drop.
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length) void importFiles(files.map((f) => ({ blob: f, name: f.name })))
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [importFiles])

  const open = (b: BookRecord) => go({ name: 'reader', bookId: b.id })
  const current = books
    ?.filter((b) => b.openedAt > 0 && !b.finished)
    .sort((a, b) => b.openedAt - a.openedAt)[0]

  return (
    <div className="min-h-full flex flex-col">
      <header
        className="sticky z-10 bg-bg/90 backdrop-blur border-b border-line"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center gap-3">
          <Wordmark />
          <span className="hidden sm:inline text-sm text-muted">{t('app.tagline')}</span>
          <div className="ml-auto flex items-center gap-1">
            <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label={t('settings.title')} title={t('settings.title')}>
              <Settings2 size={20} />
            </button>
            <button className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={!!busy}>
              <Upload size={18} />
              <span>{t('library.import')}</span>
            </button>
          </div>
          <input
            ref={fileInput}
            id="epub-input"
            type="file"
            // iOS greys out .epub files for some accept values: allow any file there and validate after.
            accept={isIOS() ? undefined : '.epub,application/epub+zip'}
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (files.length) void importFiles(files.map((f) => ({ blob: f, name: f.name })))
            }}
          />
        </div>
        {busy && (
          <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-3 -mt-1" role="status">
            <div className="text-sm text-muted mb-1.5 truncate">{t('library.importing', { name: busy.name })}</div>
            <div className="h-1 rounded-full bg-line overflow-hidden">
              <div className="h-full bg-fg transition-[width]" style={{ width: `${Math.max(4, busy.progress * 100)}%` }} />
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-8 flex-1 flex flex-col gap-10">
        <InstallBanner />
        {books === undefined ? null : books.length === 0 ? (
          <EmptyState onImport={() => fileInput.current?.click()} onSample={importSample} busy={!!busy} />
        ) : (
          <>
            {current && (
              <section aria-labelledby="continue-h">
                <h2 id="continue-h" className="label m-0 mb-3">
                  {t('library.continue')}
                </h2>
                <button
                  onClick={() => open(current)}
                  className="w-full text-left flex gap-4 sm:gap-5 items-center p-3 sm:p-4 rounded-[var(--radius)] bg-surface border border-line hover:border-faint transition-colors"
                >
                  <div className="w-16 sm:w-20 aspect-[2/3] rounded-md overflow-hidden flex-none shadow-sm">
                    <Cover book={current} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-lg sm:text-xl font-semibold leading-tight line-clamp-2">{current.title}</div>
                    <div className="text-sm text-muted truncate mt-0.5">{current.author}</div>
                    <ProgressLine book={current} wpm={wpm} className="mt-3 max-w-md" />
                  </div>
                </button>
              </section>
            )}
            <section aria-labelledby="all-h">
              <h2 id="all-h" className="label m-0 mb-4">
                {t('library.all')} · <span className="tabular">{books.length === 1 ? t('library.count.one') : t('library.count', { n: books.length })}</span>
              </h2>
              <ul
                className="grid gap-x-5 gap-y-8 list-none p-0 m-0"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(140px, 42vw), 1fr))' }}
              >
                {books.map((b) => (
                  <BookCard key={b.id} book={b} wpm={wpm} onOpen={() => open(b)} />
                ))}
              </ul>
            </section>
          </>
        )}
      </main>

      {dragging && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-bg/85 backdrop-blur-sm pointer-events-none">
          <div className="border-2 border-dashed border-fg rounded-3xl px-10 py-12 text-center">
            <Upload size={32} className="mx-auto mb-3" />
            <div className="text-xl font-bold">{t('library.drop')}</div>
          </div>
        </div>
      )}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function ProgressLine({ book, wpm, className = '' }: { book: BookRecord; wpm: number; className?: string }) {
  const t = useT()
  const p = progressOf(book)
  const status = book.finished
    ? t('library.finished')
    : book.openedAt === 0 && book.position === 0
      ? t('library.unread')
      : `${Math.floor(p * 100)} % · ${t('library.left', { time: formatDuration(timeLeftMs(book, wpm), t) })}`
  return (
    <div className={className}>
      <div className="h-1 rounded-full bg-line overflow-hidden">
        <div className="h-full bg-fg" style={{ width: `${p * 100}%` }} />
      </div>
      <div className="text-xs text-muted mt-1.5 tabular truncate">{status}</div>
    </div>
  )
}

function BookCard({ book, wpm, onOpen }: { book: BookRecord; wpm: number; onOpen: () => void }) {
  const t = useT()
  const toast = useUi((s) => s.toast)
  const [menu, setMenu] = useState<'closed' | 'open' | 'confirm'>('closed')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (menu === 'closed') return
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu('closed')
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  return (
    <li className="relative min-w-0">
      <button onClick={onOpen} className="block w-full text-left p-0 border-0 bg-transparent group">
        <div className="aspect-[2/3] rounded-[10px] overflow-hidden shadow-[var(--shadow)] border border-line transition-transform group-hover:-translate-y-0.5">
          <Cover book={book} />
        </div>
        <div className="mt-2.5 font-semibold leading-snug line-clamp-2 text-[0.95rem]">{book.title}</div>
        <div className="text-sm text-muted truncate">{book.author}</div>
      </button>
      <ProgressLine book={book} wpm={wpm} className="mt-2" />
      <div ref={menuRef} className="absolute top-1.5 right-1.5">
        <button
          className="icon-btn bg-surface/90 backdrop-blur shadow-sm"
          style={{ width: '2rem', height: '2rem' }}
          aria-label={t('library.more')}
          aria-expanded={menu !== 'closed'}
          onClick={() => setMenu(menu === 'closed' ? 'open' : 'closed')}
        >
          <MoreHorizontal size={18} />
        </button>
        {menu !== 'closed' && (
          <div className="absolute right-0 mt-1 w-56 z-20 rounded-xl bg-surface border border-line shadow-[var(--shadow)] p-1.5">
            {menu === 'open' ? (
              <button className="btn btn-ghost w-full justify-start text-[var(--accent)]" onClick={() => setMenu('confirm')}>
                <Trash2 size={16} />
                {t('library.delete')}
              </button>
            ) : (
              <div className="p-2 grid gap-2">
                <p className="m-0 text-sm">{t('library.delete.confirm')}</p>
                <div className="flex gap-2">
                  <button className="btn flex-1 h-9 px-3 text-sm" onClick={() => setMenu('closed')}>
                    {t('library.cancel')}
                  </button>
                  <button
                    className="btn btn-danger flex-1 h-9 px-3 text-sm"
                    onClick={async () => {
                      setMenu('closed')
                      await deleteBook(book.id)
                      toast(t('library.deleted'))
                    }}
                  >
                    {t('library.delete.yes')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

function EmptyState({ onImport, onSample, busy }: { onImport: () => void; onSample: () => void; busy: boolean }) {
  const t = useT()
  return (
    <div className="flex-1 grid place-items-center py-8">
      <div className="w-full max-w-xl rounded-3xl border-2 border-dashed border-line p-8 sm:p-12 text-center">
        <DemoWord />
        <BookOpen size={28} className="mx-auto mt-8 mb-3 text-muted" />
        <h1 className="text-2xl font-bold m-0">{t('library.empty.title')}</h1>
        <p className="text-muted mt-2 mb-6 mx-auto max-w-[44ch]">{t('library.empty.body')}</p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button className="btn btn-primary" onClick={onImport} disabled={busy}>
            <Upload size={18} />
            {t('library.import')}
          </button>
          <button className="btn" onClick={onSample} disabled={busy}>
            {t('library.empty.sample')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** A tiny live RSVP loop in the empty state: shows what the app does before any import. */
function DemoWord() {
  const t = useT()
  const words = t('app.tagline').split(' ')
  const [i, setI] = useState(0)
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const id = setInterval(() => setI((x) => (x + 1) % words.length), 420)
    return () => clearInterval(id)
  }, [words.length])
  const pivot = useSettings((s) => s.pivot)
  return (
    <div className="mx-auto max-w-sm" style={{ ['--pivot' as string]: `var(--pivot-${pivot})`, ['--word-size' as string]: '2.25rem' }} aria-hidden="true">
      <WordDisplay word={words[i] ?? ''} font="serif" />
    </div>
  )
}
