import { describe, expect, it } from "vitest"

import {
  PasswordCryptoUnavailableError,
  checkPassword,
  hashPassword,
  verifyPassword,
} from "./password"
import { defaultSecuritySettings } from "./defaults"

describe("hashPassword / verifyPassword", () => {
  it("accepts the correct password", async () => {
    const digest = await hashPassword("correct-horse-9")
    expect(await verifyPassword("correct-horse-9", digest)).toBe(true)
  })

  it("rejects a wrong password", async () => {
    const digest = await hashPassword("correct-horse-9")
    expect(await verifyPassword("correct-horse-8", digest)).toBe(false)
  })

  it("never stores the password itself", async () => {
    const password = "correct-horse-9"
    const digest = await hashPassword(password)
    expect(digest.hash).not.toContain(password)
    expect(digest.salt).not.toContain(password)
  })

  it("salts each hash, so equal passwords differ on disk", async () => {
    const a = await hashPassword("correct-horse-9")
    const b = await hashPassword("correct-horse-9")
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })

  it("rejects an empty or malformed digest instead of throwing", async () => {
    expect(await verifyPassword("anything", { hash: "", salt: "" })).toBe(false)
    expect(await verifyPassword("anything", {} as never)).toBe(false)
  })

  it("refuses to weaken security when crypto.subtle is unavailable", async () => {
    const original = globalThis.crypto
    // A browser in an insecure context exposes no `subtle`. LabDesk must fail
    // loudly rather than silently fall back to a weak hash.
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true })
    try {
      await expect(hashPassword("correct-horse-9")).rejects.toBeInstanceOf(PasswordCryptoUnavailableError)
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true })
    }
  })
})

describe("checkPassword", () => {
  const policy = defaultSecuritySettings()

  it("accepts a password that satisfies the policy", () => {
    expect(checkPassword("labdesk2026", policy)).toEqual({ ok: true, problems: [] })
  })

  it("reports a password that is too short", () => {
    const result = checkPassword("ab1", policy)
    expect(result.ok).toBe(false)
    expect(result.problems.join(" ")).toContain("at least")
  })

  it("requires a letter and a number when mixed characters are required", () => {
    expect(checkPassword("abcdefghij", policy).ok).toBe(false)
    expect(checkPassword("1234567890", policy).ok).toBe(false)
  })

  it("skips the mixed-character rule when it is turned off", () => {
    const relaxed = { ...policy, requireMixedCharacterPassword: false, minimumPasswordLength: 6 }
    expect(checkPassword("abcdef", relaxed)).toEqual({ ok: true, problems: [] })
  })

  it("falls back to a safe minimum when the setting is missing or invalid", () => {
    const broken = { minimumPasswordLength: 0, requireMixedCharacterPassword: false }
    expect(checkPassword("abcdefg", broken).ok).toBe(false)
    expect(checkPassword("abcdefgh", broken).ok).toBe(true)
  })

  it("collects every problem instead of stopping at the first", () => {
    const result = checkPassword("ab", policy)
    expect(result.problems.length).toBeGreaterThan(1)
  })
})
