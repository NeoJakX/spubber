import { memo, useLayoutEffect, useRef } from 'react'
import { splitAtPivot } from '../../core/rsvp/orp'
import type { ReaderFont } from '../../state/settings'

interface Props {
  word: string
  font: ReaderFont
  scale?: number
  guides?: boolean
  className?: string
}

/**
 * Renders one word with its focus letter centred on the fixed axis.
 * If the word would overflow either side of the axis it is scaled down just
 * enough to fit (long compound words on narrow phones).
 */
export const WordDisplay = memo(function WordDisplay({ word, font, scale = 1, guides = true, className = '' }: Props) {
  const [left, pivot, right] = splitAtPivot(word)
  const box = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLSpanElement>(null)
  const rightRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el || !leftRef.current || !rightRef.current) return
    const fit = parseFloat(el.style.getPropertyValue('--fit') || '1')
    const width = el.clientWidth
    const axis = width * 0.38
    const pad = 8
    const naturalLeft = leftRef.current.offsetWidth / fit
    const naturalRight = rightRef.current.offsetWidth / fit
    const pivotHalf = (leftRef.current.parentElement?.offsetWidth ?? 0) / fit / 2
    const next = Math.min(
      1,
      naturalLeft > 0 ? (axis - pivotHalf - pad) / naturalLeft : 1,
      naturalRight > 0 ? (width - axis - pivotHalf - pad) / naturalRight : 1,
    )
    const rounded = Math.max(0.4, Math.floor(next * 100) / 100)
    if (Math.abs(rounded - fit) > 0.005) el.style.setProperty('--fit', String(rounded))
  }, [word, font, scale])

  return (
    <div className={`rsvp ${className}`}>
      {guides && <div className="rsvp-guide top" />}
      <div
        ref={box}
        className="rsvp-word my-4"
        data-font={font}
        style={{ ['--word-scale' as string]: scale }}
        aria-live="off"
      >
        <span className="rsvp-anchor">
          <span className="rsvp-left" ref={leftRef}>
            {left}
          </span>
          {pivot}
          <span className="rsvp-right" ref={rightRef}>
            {right}
          </span>
        </span>
      </div>
      {guides && <div className="rsvp-guide bottom" />}
    </div>
  )
})
