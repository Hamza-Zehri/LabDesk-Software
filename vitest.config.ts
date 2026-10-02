import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "node:path"

/**
 * Test configuration, kept separate from `vite.config.ts` so the Figma Make
 * build plugins never load during a test run.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    // Testing Library registers its automatic DOM cleanup through this flag.
    // Without it every render() is left mounted and later tests match elements
    // from earlier ones, which reads as "found multiple elements" failures.
    globals: true,
    restoreMocks: true,
  },
})
