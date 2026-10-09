/// <reference types="vite/client" />
declare module '*.epub?inline' {
  const src: string
  export default src
}

/** True in the GitHub Pages (installable web app) build. */
declare const __PWA__: boolean
