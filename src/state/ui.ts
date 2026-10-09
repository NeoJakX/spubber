import { create } from 'zustand'

export type Route = { name: 'library' } | { name: 'reader'; bookId: string }

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'error'
  action?: { label: string; run: () => void }
}

interface UiStore {
  route: Route
  toasts: Toast[]
  go: (r: Route) => void
  toast: (text: string, opts?: { tone?: Toast['tone']; action?: Toast['action']; ms?: number }) => void
  dismiss: (id: number) => void
}

let seq = 0

export const useUi = create<UiStore>()((set, get) => ({
  route: { name: 'library' },
  toasts: [],
  go: (route) => {
    set({ route })
    try {
      if (route.name === 'reader') history.pushState({ spubber: route }, '')
    } catch {
      /* sandboxed frames may refuse history */
    }
  },
  toast: (text, opts = {}) => {
    const id = ++seq
    set({ toasts: [...get().toasts.slice(-2), { id, text, tone: opts.tone ?? 'info', action: opts.action }] })
    setTimeout(() => get().dismiss(id), opts.ms ?? (opts.tone === 'error' ? 6000 : 3500))
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))
