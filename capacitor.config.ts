import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.spubber.reader',
  appName: 'Spubber',
  webDir: 'dist',
  android: {
    // The reader keeps everything local; no mixed content, no remote origins.
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
    },
  },
}

export default config
