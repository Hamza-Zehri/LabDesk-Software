import { defineConfig, devices } from "@playwright/test"

/**
 * Real-browser end-to-end configuration.
 *
 * These specs run against the production build served by `vite preview`, not
 * the dev server, so what is verified is the artefact that would actually ship.
 * The unit and jsdom suites cannot catch a crash on load, a CSS import that
 * fails to resolve at runtime, or a storage write the browser refuses.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:4319",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm run build && pnpm exec vite preview --port 4319 --strictPort",
    url: "http://127.0.0.1:4319",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
