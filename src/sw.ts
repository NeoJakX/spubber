/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

/** Cache where EPUBs shared from other apps (Android share sheet) wait to be imported. */
const SHARE_CACHE = 'spubber-share'

// App shell: every built file is cached at install so the app opens offline.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// First install: take control of the open page right away so it works offline
// without a reload. Updates still wait for the user's "Update" tap (SKIP_WAITING).
clientsClaim()

// Any in-app URL opens the cached index.html.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// "Share to Spubber" (Android): the share sheet POSTs the files here.
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) return
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData()
        const cache = await caches.open(SHARE_CACHE)
        let n = 0
        for (const entry of form.getAll('books')) {
          if (!(entry instanceof File)) continue
          await cache.put(
            new Request(`shared/${Date.now()}-${n++}`),
            new Response(entry, { headers: { 'x-file-name': encodeURIComponent(entry.name), 'content-type': entry.type || 'application/epub+zip' } }),
          )
        }
      } catch {
        /* fall through to the app; it will simply find nothing to import */
      }
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303)
    })(),
  )
})

// The page asks the waiting worker to take over when the user taps "Update".
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
