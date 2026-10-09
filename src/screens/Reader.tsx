import { ArrowLeft, Bookmark, ChevronsLeft, ChevronsRight, ListTree, Minus, Pause, Play, Plus, ALargeSmall } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Block } from '../core/epub/types'
import { RsvpPlayer } from '../core/rsvp/player'
import { durationMs, nextSentence, prevSentence, tokenize, type TokenStream } from '../core/rsvp/tokenize'
import { addBookmark, loadBook, markOpened, savePosition } from '../db/books'
import type { BookRecord } from '../db/db'
import { formatDuration, useT, type MessageKey } from '../i18n'
import { HINT_SESSIONS, useSettings } from '../state/settings'
import { useUi } from '../state/ui'
import { ContextView } from './reader/ContextView'
import { chapterIndexAt, excerptAt } from './reader/helpers'
import { BookmarksPanel, TocPanel } from './reader/Panels'
import { useReaderInput } from './reader/useReaderInput'
import { useWordFeedback } from './reader/useWordFeedback'
import { WordDisplay } from './reader/WordDisplay'
import { SettingsPanel } from './SettingsPanel'

type Loaded = { book: BookRecord; blocks: Block[] }

export function Reader({ bookId }: { bookId: string }) {
  const t = useT()
  const go = useUi((s) => s.go)
  const [data, setData] = useState<Loaded | null | 'missing'>(null)

  useEffect(() => {
    let alive = true
    loadBook(bookId).then((d) => {
      if (!alive) return
      setData(d ?? 'missing')
      if (d) void markOpened(bookId)
    })
    return () => {
      alive = false
    }
  }, [bookId])

  if (data === null) {
    return <div className="h-full grid place-items-center text-muted">{t('reader.loading')}</div>
  }
  if (data === 'missing') {
    return (
      <div className="h-full grid place-items-center text-center p-6">
        <div>
          <p>{t('reader.notFound')}</p>
          <button className="btn mt-3" onClick={() => go({ name: 'library' })}>
            {t('reader.back')}
          </button>
        </div>
      </div>
    )
  }
  return <ReaderView book={data.book} blocks={data.blocks} />
}

type Panel = null | 'toc' | 'bookmarks' | 'settings'

function ReaderView({ book, blocks }: Loaded) {
  const t = useT()
  const go = useUi((s) => s.go)
  const toast = useUi((s) => s.toast)
  const settings = useSettings()
  const setSettings = useSettings((s) => s.set)
  const [panel, setPanel] = useState<Panel>(null)

  const stream: TokenStream = useMemo(
    () => tokenize(blocks, { language: book.language, smartPauses: settings.smartPauses }),
    [blocks, book.language, settings.smartPauses],
  )

  const [player] = useState(
    () =>
      new RsvpPlayer(stream, {
        wpm: settings.wpm,
        index: book.finished ? 0 : book.position,
        rewindWords: settings.rewindWords,
      }),
  )
  useEffect(() => () => player.destroy(), [player])
  useEffect(() => player.setStream(stream), [player, stream])
  useEffect(() => player.setWpm(settings.wpm), [player, settings.wpm])
  useEffect(() => player.setRewindWords(settings.rewindWords), [player, settings.rewindWords])

  const state = useSyncExternalStore(player.subscribe, player.getState)
  const { index, playing, wpm, finished, rate } = state
  const stageRef = useRef<HTMLElement>(null)
  const input = useReaderInput(player, stream, settings.mode, stageRef)
  const active = playing || input.scrubbing
  useWordFeedback(player, stream, { haptics: settings.haptics, sound: settings.sound })

  // Count reading sessions per mode so the hint can retire after a few.
  const countedMode = useRef<string | null>(null)
  useEffect(() => {
    if (!active || countedMode.current === settings.mode) return
    countedMode.current = settings.mode
    const counts = useSettings.getState().hintCounts
    setSettings({ hintCounts: { ...counts, [settings.mode]: (counts[settings.mode] ?? 0) + 1 } })
  }, [active, settings.mode, setSettings])
  const n = stream.words.length

  // ---------- persistence ----------
  const lastSaved = useRef(0)
  const save = useCallback(
    (force = false) => {
      const s = player.getState()
      const now = Date.now()
      if (!force && now - lastSaved.current < 3000) return
      lastSaved.current = now
      void savePosition(book.id, s.index, s.finished)
    },
    [player, book.id],
  )
  useEffect(() => {
    save(!playing)
  }, [index, playing, finished, save])
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        player.pause()
        save(true)
      }
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      save(true)
    }
  }, [player, save])

  // ---------- keep the screen awake while reading ----------
  useEffect(() => {
    if (!playing) return
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {})
    return () => {
      void lock?.release().catch(() => {})
    }
  }, [playing])

  // ---------- actions ----------
  const seek = useCallback((i: number) => player.seek(i), [player])
  const changeWpm = useCallback((delta: number) => setSettings({ wpm: Math.max(100, Math.min(1000, useSettings.getState().wpm + delta)) }), [setSettings])
  const quickBookmark = useCallback(async () => {
    const i = player.getState().index
    await addBookmark(book.id, i, excerptAt(stream, i))
    toast(t('reader.bookmarkSaved'))
  }, [player, book.id, stream, toast, t])
  const back = useCallback(() => {
    player.pause()
    save(true)
    go({ name: 'library' })
  }, [player, save, go])

  // ---------- keyboard ----------
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    const down = (e: KeyboardEvent) => {
      if (panel || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      const mode = useSettings.getState().mode
      switch (e.key) {
        case ' ':
        case 'Spacebar':
          e.preventDefault()
          if (e.repeat) return
          if (mode === 'hold' || mode === 'gesture') player.play()
          else player.toggle()
          break
        case 'ArrowLeft':
          e.preventDefault()
          player.seek(e.shiftKey ? prevSentence(stream, player.getState().index) : player.getState().index - 1)
          break
        case 'ArrowRight':
          e.preventDefault()
          player.seek(e.shiftKey ? nextSentence(stream, player.getState().index) : player.getState().index + 1)
          break
        case 'ArrowUp':
          e.preventDefault()
          changeWpm(25)
          break
        case 'ArrowDown':
          e.preventDefault()
          changeWpm(-25)
          break
        case 'b':
        case 'B':
          void quickBookmark()
          break
        case 't':
        case 'T':
          player.pause()
          setPanel('toc')
          break
        case 'Escape':
          back()
          break
      }
    }
    const up = (e: KeyboardEvent) => {
      const m = useSettings.getState().mode
      if ((e.key === ' ' || e.key === 'Spacebar') && (m === 'hold' || m === 'gesture')) {
        e.preventDefault()
        player.pause()
      }
    }
    const blur = () => player.pause()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [panel, player, stream, changeWpm, quickBookmark, back])

  // ---------- play button: press-and-hold in hold/gesture modes, toggle otherwise ----------
  const playButtonHandlers = useMemo(() => {
    if (settings.mode === 'hold' || settings.mode === 'gesture') {
      return {
        onPointerDown: (e: React.PointerEvent) => {
          if (e.button !== 0) return
          ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
          player.play()
        },
        onPointerUp: () => player.pause(),
        onPointerCancel: () => player.pause(),
        onLostPointerCapture: () => player.pause(),
      }
    }
    return { onClick: () => player.toggle() }
  }, [settings.mode, player])

  const seekFromContext = useCallback(
    (i: number) => {
      if (!input.shouldSuppressClick()) player.seek(i)
    },
    [player, input],
  )

  const openPanel = (p: Panel) => {
    player.pause()
    setPanel(p)
  }

  // ---------- derived ----------
  const chIdx = chapterIndexAt(book, stream, index)
  const chapter = book.chapters[chIdx]
  const nextChapter = book.chapters[chIdx + 1]
  const chapterEnd = nextChapter ? stream.blockStart[nextChapter.firstBlock] : n
  const pct = n > 1 ? (index / (n - 1)) * 100 : 0
  const leftBook = durationMs(stream, wpm, index)
  const leftChapter = durationMs(stream, wpm, index, chapterEnd)
  const showContext = !active && !finished && settings.contextOnPause
  const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const hintKey = `reader.hint.${settings.mode}${isTouch ? '' : 'Key'}` as MessageKey
  const showHint = settings.hints && (settings.hintCounts[settings.mode] ?? 0) < HINT_SESSIONS
  const hint = showHint && !finished && !active ? t(hintKey) : ''
  const ticks = book.chapters.length <= 80 ? book.chapters.slice(1).map((c) => stream.blockStart[c.firstBlock] / Math.max(1, n - 1)) : []

  return (
    <div
      className={`h-full flex flex-col overflow-hidden ${active ? 'is-playing' : ''}`}
      style={{ ['--pivot' as string]: `var(--pivot-${settings.pivot})` }}
    >
      {/* Top bar */}
      <header className="reader-header chrome flex items-center gap-1 px-2 sm:px-3 h-14 flex-none">
        <button className="icon-btn" onClick={back} aria-label={t('reader.back')} title={t('reader.back')}>
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <div className="text-sm font-bold truncate">{book.title}</div>
          <div className="text-xs text-muted truncate">{chapter?.title || t('reader.chapter', { n: chIdx + 1 })}</div>
        </div>
        <button className="icon-btn" onClick={() => openPanel('toc')} aria-label={t('reader.toc')} title={t('reader.toc')}>
          <ListTree size={20} />
        </button>
        <button className="icon-btn" onClick={() => openPanel('bookmarks')} aria-label={t('reader.bookmarks')} title={t('reader.bookmarks')}>
          <Bookmark size={20} />
        </button>
        <button className="icon-btn" onClick={() => openPanel('settings')} aria-label={t('reader.settings')} title={t('reader.settings')}>
          <ALargeSmall size={20} />
        </button>
      </header>

      {/* Stage: the whole area is the hold/tap target */}
      <main
        ref={stageRef}
        className={`relative flex-1 min-h-0 flex flex-col select-none ${settings.mode === 'scroll' ? 'cursor-ns-resize' : 'cursor-pointer'}`}
        style={{ touchAction: settings.mode === 'scroll' || settings.mode === 'gesture' ? 'none' : 'manipulation', WebkitTouchCallout: 'none' }}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="stage"
        data-mode={settings.mode}
        {...input.handlers}
      >
        {settings.mode === 'gesture' && playing && (
          <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none" aria-live="off">
            <div className="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold tabular" data-testid="gesture-rate">
              ×{rate.toFixed(2)} · {player.effectiveWpm} {t('reader.wpm')}
            </div>
          </div>
        )}
        <div className="flex-[1_1_0] min-h-6" />
        <div className="w-full max-w-3xl mx-auto px-4 flex-none">
          <WordDisplay word={stream.words[index] ?? ''} font={settings.font} scale={settings.wordScale} guides={settings.guides} />
          <div className="reader-hint chrome text-center text-sm text-muted min-h-6 mt-2 px-2" data-testid="hint" style={{ textWrap: 'balance' }}>
            {hint}
          </div>
        </div>
        <div className="flex-[1.4_1_0] min-h-0 overflow-y-auto px-4 pt-3 pb-2" data-context-scroll>
          {showContext && (
            <div className="max-w-2xl mx-auto chrome">
              <ContextView stream={stream} blocks={blocks} index={index} onSeek={seekFromContext} capturePointer={false} />
            </div>
          )}
          {finished && (
            <div className="max-w-sm mx-auto text-center grid gap-3 justify-items-center" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <h2 className="text-2xl font-bold m-0 font-serif">{t('reader.finished.title')}</h2>
              <div className="flex gap-2 flex-wrap justify-center">
                <button className="btn" onClick={() => player.seek(0)}>
                  {t('reader.finished.restart')}
                </button>
                <button className="btn btn-primary" onClick={back}>
                  {t('reader.finished.library')}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Bottom controls */}
      <footer className="reader-footer flex-none px-4 sm:px-6 pt-1" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="reader-footer-inner max-w-3xl mx-auto">
          <div className="rf-progress">
            <div className="chrome-soft relative transition-opacity">
              <input
                id="progress"
                className="range relative z-[1]"
                type="range"
                min={0}
                max={Math.max(0, n - 1)}
                value={index}
                aria-label={t('reader.progress')}
                aria-valuetext={`${Math.round(pct)} %`}
                style={{ ['--fill' as string]: `${pct}%` }}
                onChange={(e) => seek(Number(e.target.value))}
              />
              <div className="progress-ticks absolute inset-x-0 top-0 h-7 pointer-events-none" aria-hidden="true">
                {ticks.map((x, i) => (
                  <span key={i} style={{ left: `calc(${x * 100}% - 1px)` }} />
                ))}
              </div>
            </div>
            <div className="chrome flex justify-between gap-3 text-xs text-muted tabular -mt-0.5">
              <span className="truncate">
                {Math.floor(pct)} % · {t('reader.chapterLeft', { time: formatDuration(leftChapter, t) })}
              </span>
              <span className="flex-none">{t('reader.left', { time: formatDuration(leftBook, t) })}</span>
            </div>
          </div>
            <div className="rf-wpm chrome flex items-center gap-0.5" role="group" aria-label={t('reader.wpm.long')}>
              <button className="icon-btn" onClick={() => changeWpm(-25)} aria-label={t('reader.slower')} disabled={wpm <= 100}>
                <Minus size={18} />
              </button>
              <div className="text-center leading-none min-w-[3.25rem]">
                <div className="font-bold tabular text-lg" data-testid="wpm">
                  {wpm}
                </div>
                <div className="text-[0.6875rem] text-muted">{t('reader.wpm')}</div>
              </div>
              <button className="icon-btn" onClick={() => changeWpm(25)} aria-label={t('reader.faster')} disabled={wpm >= 1000}>
                <Plus size={18} />
              </button>
            </div>

            <div className="rf-transport chrome flex items-center gap-2">
              <button className="icon-btn" onClick={() => seek(prevSentence(stream, index))} aria-label={t('reader.prevSentence')} title={t('reader.prevSentence')}>
                <ChevronsLeft size={22} />
              </button>
              <button
                className="play-btn rounded-full grid place-items-center bg-fg text-bg border-0 shadow-[var(--shadow)] active:scale-95 transition-transform touch-none"
                aria-label={playing ? t('reader.pause') : t('reader.play')}
                data-testid="play"
                {...playButtonHandlers}
                onKeyDown={(e) => e.key === ' ' && e.preventDefault()}
              >
                {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="translate-x-[1px]" />}
              </button>
              <button className="icon-btn" onClick={() => seek(nextSentence(stream, index))} aria-label={t('reader.nextSentence')} title={t('reader.nextSentence')}>
                <ChevronsRight size={22} />
              </button>
            </div>
        </div>
      </footer>

      {playing && (settings.mode === 'tap' || settings.mode === 'scroll') && (
        <div className="fixed inset-0 z-30" onClick={() => player.pause()} aria-hidden="true" data-testid="tap-to-pause" />
      )}
      {panel === 'toc' && <TocPanel book={book} stream={stream} index={index} onSeek={seek} onClose={() => setPanel(null)} />}
      {panel === 'bookmarks' && <BookmarksPanel book={book} stream={stream} index={index} onSeek={seek} onClose={() => setPanel(null)} />}
      {panel === 'settings' && <SettingsPanel onClose={() => setPanel(null)} />}
    </div>
  )
}
