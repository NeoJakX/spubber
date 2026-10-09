// Stand-in for `virtual:pwa-register` in builds without the PWA plugin
// (Tauri, Capacitor, single-file preview, tests). Never called there.
export function registerSW(_opts?: unknown): (reload?: boolean) => Promise<void> {
  return async () => {}
}
