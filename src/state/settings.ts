import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

export type ThemeName = 'system' | 'light' | 'dark' | 'sepia'
export type ReaderFont = 'serif' | 'sans' | 'mono'
export type ReadMode = 'hold' | 'tap' | 'scroll' | 'gesture'
export type PivotColor = 'coral' | 'blue' | 'green' | 'violet' | 'ink'
export type Lang = 'auto' | 'es' | 'en'
export type { PivotMode } from '../core/rsvp/orp'
import type { PivotMode } from '../core/rsvp/orp'

export interface Settings {
  theme: ThemeName
  font: ReaderFont
  /** Multiplier for the RSVP word size. */
  wordScale: number
  pivot: PivotColor
  /** Which letter is the focus letter: optimal recognition point or the middle one. */
  pivotMode: PivotMode
  mode: ReadMode
  wpm: number
  smartPauses: boolean
  guides: boolean
  contextOnPause: boolean
  rewindWords: number
  lang: Lang
  /** Vibration tick per word (phones). */
  haptics: boolean
  /** Soft paper sound per word and page-turn per paragraph. */
  sound: boolean
  /** Reading sessions started per mode; the on-screen hint hides after a few. */
  hintCounts: Partial<Record<ReadMode, number>>
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  font: 'serif',
  wordScale: 1,
  pivot: 'coral',
  pivotMode: 'orp',
  mode: 'hold',
  wpm: 300,
  smartPauses: true,
  guides: true,
  contextOnPause: true,
  rewindWords: 3,
  lang: 'auto',
  haptics: false,
  sound: false,
  hintCounts: {},
}

/** The hint under the word is shown for the first sessions in each mode. */
export const HINT_SESSIONS = 3

/** localStorage can throw (private mode, sandboxed frames): never let that break the app. */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* ignore */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  },
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
    }),
    {
      name: 'spubber.settings',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ set: _set, ...rest }) => rest,
    },
  ),
)
