import { useLiveQuery } from 'dexie-react-hooks'
import { BookmarkPlus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { TokenStream } from '../../core/rsvp/tokenize'
import { addBookmark, deleteBookmark, restoreBookmark } from '../../db/books'
import { db, type BookRecord } from '../../db/db'
import { useT } from '../../i18n'
import { useUi } from '../../state/ui'
import { Sheet } from '../../ui/primitives'
import { chapterIndexAt, excerptAt } from './helpers'

export function TocPanel({
  book,
  stream,
  index,
  onSeek,
  onClose,
}: {
  book: BookRecord
  stream: TokenStream
  index: number
  onSeek: (i: number) => void
  onClose: () => void
}) {
  const t = useT()
  const entries = book.toc.length
    ? book.toc
    : book.chapters.map((c, i) => ({ label: c.title || t('reader.chapter', { n: i + 1 }), depth: 0, block: c.firstBlock }))
  const words = entries.map((e) => stream.blockStart[Math.min(e.block, stream.blockStart.length - 1)])
  let active = -1
  for (let i = 0; i < words.length; i++) if (words[i] <= index) active = i
  const total = Math.max(1, stream.words.length - 1)

  return (
    <Sheet title={t('reader.toc')} onClose={onClose} id="toc">
      <ol className="list-none m-0 p-0 grid gap-0.5">
        {entries.map((e, i) => (
          <li key={i}>
            <button
              onClick={() => {
                onSeek(words[i])
                onClose()
              }}
              aria-current={i === active ? 'location' : undefined}
              className={`w-full text-left flex items-baseline gap-3 rounded-lg border-0 py-2.5 pr-2 ${
                i === active ? 'bg-surface-2 font-bold' : 'bg-transparent hover:bg-surface-2'
              }`}
              style={{ paddingLeft: `${0.75 + e.depth * 1}rem` }}
            >
              <span className={`min-w-0 flex-1 ${e.depth > 0 ? 'text-[0.9375rem]' : ''}`}>{e.label}</span>
              <span className="text-xs text-muted tabular flex-none">{Math.round((words[i] / total) * 100)} %</span>
            </button>
          </li>
        ))}
      </ol>
    </Sheet>
  )
}

export function BookmarksPanel({
  book,
  stream,
  index,
  onSeek,
  onClose,
}: {
  book: BookRecord
  stream: TokenStream
  index: number
  onSeek: (i: number) => void
  onClose: () => void
}) {
  const t = useT()
  const toast = useUi((s) => s.toast)
  const [note, setNote] = useState('')
  const marks = useLiveQuery(() => db.bookmarks.where('bookId').equals(book.id).sortBy('word'), [book.id])
  const total = Math.max(1, stream.words.length - 1)

  return (
    <Sheet title={t('reader.bookmarks')} onClose={onClose} id="bookmarks">
      <form
        className="grid gap-2 p-3 rounded-xl bg-bg border border-line mb-5"
        onSubmit={async (e) => {
          e.preventDefault()
          await addBookmark(book.id, index, excerptAt(stream, index), note)
          setNote('')
          toast(t('reader.bookmarkSaved'))
        }}
      >
        <p className="m-0 text-sm font-serif text-muted line-clamp-2">“{excerptAt(stream, index)}…”</p>
        <div className="flex gap-2">
          <input
            id="bookmark-note"
            className="input"
            placeholder={t('bookmarks.note')}
            aria-label={t('bookmarks.note')}
            value={note}
            maxLength={280}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="submit" className="btn btn-primary flex-none" aria-label={t('bookmarks.save')}>
            <BookmarkPlus size={18} />
            <span className="hidden sm:inline">{t('bookmarks.save')}</span>
          </button>
        </div>
      </form>

      {marks && marks.length === 0 && <p className="text-muted text-sm">{t('bookmarks.empty')}</p>}
      <ul className="list-none m-0 p-0 grid gap-2">
        {marks?.map((m) => {
          const ch = book.chapters[chapterIndexAt(book, stream, Math.min(m.word, stream.words.length - 1))]
          return (
            <li key={m.id} className="flex gap-1 items-start rounded-xl border border-line bg-surface">
              <button
                className="flex-1 min-w-0 text-left border-0 bg-transparent p-3"
                onClick={() => {
                  onSeek(m.word)
                  onClose()
                }}
              >
                <div className="text-xs text-muted tabular flex gap-2">
                  <span className="truncate">{ch?.title}</span>
                  <span className="ml-auto flex-none">{Math.round((m.word / total) * 100)} %</span>
                </div>
                {m.note && <div className="font-semibold mt-1">{m.note}</div>}
                <div className="text-sm font-serif mt-1 line-clamp-2">{m.excerpt}…</div>
              </button>
              <button
                className="icon-btn m-1.5"
                aria-label={t('bookmarks.delete')}
                title={t('bookmarks.delete')}
                onClick={async () => {
                  await deleteBookmark(m.id)
                  toast(t('bookmarks.deleted'), { action: { label: t('common.undo'), run: () => void restoreBookmark(m) } })
                }}
              >
                <Trash2 size={16} />
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
