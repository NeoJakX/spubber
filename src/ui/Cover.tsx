import { useEffect, useState } from 'react'
import type { BookRecord } from '../db/db'

export function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) {
      setUrl(undefined)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export function Cover({ book, className = '' }: { book: Pick<BookRecord, 'cover' | 'title' | 'author'>; className?: string }) {
  const url = useObjectUrl(book.cover)
  const [broken, setBroken] = useState(false)
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        className={`w-full h-full object-cover ${className}`}
        draggable={false}
      />
    )
  }
  return (
    <div className={`cover-fallback w-full h-full flex flex-col justify-between p-3 ${className}`}>
      <span className="text-[0.95rem] leading-snug font-semibold line-clamp-5" style={{ textWrap: 'balance' }}>
        {book.title}
      </span>
      <span className="text-xs text-muted line-clamp-2 font-ui">{book.author}</span>
    </div>
  )
}
