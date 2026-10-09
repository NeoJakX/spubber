import { defineConfig, devices } from '@playwright/test'

// End-to-end tests for the installable web app, served under a sub-path like GitHub Pages.
const executablePath = process.env.PW_CHROMIUM ?? (process.env.CI ? undefined : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')

export default defineConfig({
  testDir: 'e2e-pages',
  timeout: 45_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174/spubber/',
    locale: 'es-ES',
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: 'npx vite preview --mode pages --outDir dist-pages --base /spubber/ --port 4174 --strictPort',
    port: 4174,
    reuseExistingServer: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
