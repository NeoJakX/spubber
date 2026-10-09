import { useEffect } from 'react'
import type { RsvpPlayer } from '../../core/rsvp/player'
import type { TokenStream } from '../../core/rsvp/tokenize'
import { haptic, sound, unlockAudio } from '../../platform/feedback'

/**
 * Fires a haptic tick and/or a soft paper sound each time the reader moves
 * one word (playing or scrolling), and a page-turn swish on new paragraphs.
 * Big jumps (TOC, progress bar, bookmarks) stay silent.
 */
export function useWordFeedback(player: RsvpPlayer, stream: TokenStream, opts: { haptics: boolean; sound: boolean }) {
  const { haptics: useHaptics, sound: useSound } = opts

  // Audio may only start after a user gesture.
  useEffect(() => {
    if (!useSound) return
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('keydown', unlock, true)
    return () => {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
  }, [useSound])

  useEffect(() => {
    if (!useHaptics && !useSound) return
    let prev = player.getState()
    if (useHaptics) haptic.start()
    const unsub = player.subscribe(() => {
      const cur = player.getState()
      const d = cur.index - prev.index
      if (d === 1 || d === -1) {
        if (useHaptics) haptic.tick()
        if (useSound) {
          if (stream.block[cur.index] !== stream.block[prev.index]) sound.page()
          else sound.flick()
        }
      }
      prev = cur
    })
    return () => {
      unsub()
      if (useHaptics) haptic.end()
    }
  }, [player, stream, useHaptics, useSound])
}
