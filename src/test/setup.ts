/**
 * Test setup.
 *
 * Node 22+ exposes an experimental, partially implemented `localStorage`
 * global. It is picked up ahead of jsdom's `Storage`, and the built-in has no
 * `clear()`. Both the application and the tests address storage through the
 * global, so a complete in-memory `Storage` is installed here once, before any
 * module reads it.
 */

import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

class MemoryStorage implements Storage {
  private map = new Map<string, string>()

  get length(): number {
    return this.map.size
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null
  }

  setItem(key: string, value: string): void {
    this.map.set(String(key), String(value))
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }
}

const install = (name: "localStorage" | "sessionStorage") => {
  const existing = (globalThis as Record<string, unknown>)[name] as Storage | undefined
  if (existing && typeof existing.clear === "function") return
  Object.defineProperty(globalThis, name, {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
}

install("localStorage")
install("sessionStorage")

/*
 * jsdom ships `window.scrollTo` as a stub that reports "Not implemented" to the
 * virtual console. The app scrolls to the top whenever the view changes, so
 * without this every navigation test would print an alarming-looking error for
 * behaviour that is entirely correct. Replace it with a silent no-op.
 */
window.scrollTo = () => {}

/*
 * Unmount anything a test rendered. Testing Library can do this itself, but
 * only when Vitest exposes globals; doing it explicitly means a forgotten
 * `render` can never leak a mounted tree into the next test file.
 */
afterEach(() => {
  cleanup()
})
