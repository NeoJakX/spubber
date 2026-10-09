import { useEffect, useRef } from 'react'
import type { Block } from '../../core/epub/types'
import type { TokenStream } from '../../core/rsvp/tokenize'

/**
 * Paragraph-level view shown while paused: the current block plus its
 * neighbours, with the current word highlighted. Any word can be tapped to
 * continue reading from it.
 */
export function ContextView({
  stream,
  blocks,
  index,
  onSeek,
  capturePointer = true,
}: {
  stream: TokenStream
  blocks: Block[]
  index: number
  onSeek: (i: number) => void
  /** When false, presses on words reach the stage (scroll/gesture modes). */
  capturePointer?: boolean
}) {
  const cur = stream.block[index] ?? 0
  const first = Math.max(0, cur - 1)
  const last = Math.min(blocks.length - 1, cur + 1)
  const currentRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    // Scroll only our own container: scrollIntoView would also shift the whole
    // reader layout (overflow:hidden ancestors are still scrollable by script).
    const el = currentRef.current
    const box = el?.closest<HTMLElement>('[data-context-scroll]')
    if (el && box) {
      const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
      box.scrollTop = Math.max(0, top - box.clientHeight / 2)
    }
  }, [index])

  const out = []
  for (let b = first; b <= last; b++) {
    const start = stream.blockStart[b]
    const end = stream.blockStart[b + 1]
    const words = []
    for (let i = start; i < end; i++) {
      const isCur = i === index
      words.push(
        <span
          key={i}
          ref={isCur ? currentRef : undefined}
          className={`w${isCur ? ' current' : ''}`}
          onPointerDown={capturePointer ? (e) => e.stopPropagation() : undefined}
          onClick={(e) => {
            e.stopPropagation()
            onSeek(i)
          }}
        >
          {stream.words[i]}
        </span>,
        ' ',
      )
    }
    out.push(
      <p key={b} data-kind={blocks[b].kind} className={b === cur ? '' : 'dim'}>
        {words}
      </p>,
    )
  }
  return <div className="context">{out}</div>
}
