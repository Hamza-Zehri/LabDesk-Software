/**
 * Storage seam.
 *
 * The core modules never talk to `localStorage` directly. They read and write
 * through this interface, so the same laboratory logic can run against:
 *
 * - `browserStorage` in this web build (per-installation namespaced keys), and
 * - a SQLite-backed adapter in a future desktop build, without changing any
 *   laboratory, branding, report or receipt code.
 *
 * Every key is namespaced by installation id, which is what keeps one
 * customer's data isolated from another's and from demo data.
 */

import { STORAGE_NAMESPACE, STORAGE_SEPARATOR } from "./product"

export interface StorageAdapter {
  readonly name: string
  readonly persistent: boolean
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  keys(): string[]
  /** Human-readable location, shown on the About and Backup screens. */
  describe(): string
}

/** In-memory fallback, used when the browser denies persistent storage. */
export const createMemoryStorage = (): StorageAdapter => {
  const map = new Map<string, string>()
  return {
    name: "memory",
    persistent: false,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    keys: () => [...map.keys()],
    describe: () => "In-memory storage (this session only)",
  }
}

const hasLocalStorage = (): boolean => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false
    const probe = `${STORAGE_NAMESPACE}${STORAGE_SEPARATOR}probe`
    window.localStorage.setItem(probe, "1")
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

export const createBrowserStorage = (): StorageAdapter => ({
  name: "local",
  persistent: true,
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // A full or read-only store must not take the application down. The
      // caller keeps working from memory and the Backup screen warns the
      // operator to export a backup file.
    }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignored for the same reason as setItem */
    }
  },
  keys: () => {
    const prefix = `${STORAGE_NAMESPACE}${STORAGE_SEPARATOR}`
    const out: string[] = []
    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i)
        if (key && key.startsWith(prefix)) out.push(key)
      }
    } catch {
      return out
    }
    return out
  },
  describe: () => "This device (local installation storage)",
})

/** Picks the best available adapter for the current environment. */
export const resolveStorage = (): StorageAdapter =>
  hasLocalStorage() ? createBrowserStorage() : createMemoryStorage()
