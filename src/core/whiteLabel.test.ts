/**
 * White-label acceptance checks.
 *
 * These tests encode the rules that make the product sellable to any laboratory:
 * the software identity never moves, the customer's identity always does, a
 * fresh installation ships no seeded records, and two installations can never
 * share data.
 */

import { describe, expect, it } from "vitest"

import {
  PRODUCT_DESCRIPTION,
  PRODUCT_NAME,
  PRODUCT_SUBTITLE,
  PRODUCT_VERSION,
  STORAGE_NAMESPACE,
  VENDOR,
} from "./product"
import { createEmptyDatabase, createInstallation, storageKey } from "./defaults"
import { ensureInstallations, readDatabase, replaceInstallation, writeDatabase } from "./database"
import { createBackupBundle, parseBackup, serializeBackup } from "./backup"
import { fullAddressToken, hasUnresolvedToken, laboratoryTokens, renderTemplate } from "./template"
import { createMemoryStorage } from "./storage"
import { configuredDatabase } from "./testFixtures"

describe("A. the software identity is permanent", () => {
  it("names the product itself", () => {
    expect(PRODUCT_NAME).toBe("LabDesk")
    expect(PRODUCT_SUBTITLE).toBe("Laboratory Management System")
    expect(PRODUCT_VERSION).toBe("1.0.0")
    expect(PRODUCT_DESCRIPTION).toBeTruthy()
  })

  it("keeps the vendor attribution intact", () => {
    expect(VENDOR.credit).toBe("Software by Engr. Hamza Asad")
    expect(VENDOR.developer).toBe("Engr. Hamza Asad")
    expect(VENDOR.website).toBe("Brightpixel.vercel.app")
  })

  it("never derives the product name from the customer's configuration", () => {
    const renamed = configuredDatabase()
    renamed.profile.name = "Totally Different Clinic"
    const bundle = createBackupBundle(renamed)
    expect(bundle.product).toBe(PRODUCT_NAME)
    expect(bundle.vendor).toBe(VENDOR.credit)
    // The customer's own name lives in its own field.
    expect(bundle.laboratoryName).toBe("Totally Different Clinic")
  })
})

describe("B. the customer identity is fully configurable", () => {
  const renamed = () => {
    const db = configuredDatabase()
    db.profile.name = "Riverside Pathology"
    db.profile.shortName = "Riverside"
    db.profile.tagline = "Answers you can act on"
    db.profile.address = "9 Harbour Street"
    db.profile.city = "Bristol"
    db.profile.province = ""
    db.profile.country = "UK"
    db.profile.phone = "01179460000"
    db.profile.licenseNumber = "UK-4471"
    db.reportSettings.disclaimer = "Accredited by UKAS 4471."
    return db
  }

  it("carries every identity field into a backup", () => {
    const result = parseBackup(serializeBackup(renamed()))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const restored = result.database
    expect(restored.profile.name).toBe("Riverside Pathology")
    expect(restored.profile.tagline).toBe("Answers you can act on")
    expect(restored.profile.licenseNumber).toBe("UK-4471")
    expect(restored.reportSettings.disclaimer).toBe("Accredited by UKAS 4471.")
  })

  it("resolves the customer's own details in author-written templates", () => {
    const db = renamed()
    const context = laboratoryTokens(db)
    expect(renderTemplate("Thank you for visiting {{laboratoryName}} in {{city}}.", context)).toBe(
      "Thank you for visiting Riverside Pathology in Bristol.",
    )
    expect(fullAddressToken(db)).toBe("9 Harbour Street, Bristol, UK")
  })

  it("still offers the product name as a token without making it the identity", () => {
    const db = renamed()
    const context = laboratoryTokens(db)
    expect(context.productName).toBe(PRODUCT_NAME)
    expect(context.version).toBe(PRODUCT_VERSION)
    expect(context.laboratoryName).toBe("Riverside Pathology")
  })

  it("leaves an unknown token visible rather than silently blanking it", () => {
    const rendered = renderTemplate("Call {{mysteryToken}} today.", {})
    expect(rendered).toBe("Call {{mysteryToken}} today.")
    expect(hasUnresolvedToken(rendered)).toBe(true)
    expect(hasUnresolvedToken(renderTemplate("Call {{phone}}.", laboratoryTokens(renamed())))).toBe(false)
  })

  it("supports whitespace inside the token braces", () => {
    expect(renderTemplate("{{  phone  }}", { phone: "0300" })).toBe("0300")
  })
})

describe("C. a fresh installation starts empty and neutral", () => {
  it("ships no seeded records", () => {
    const db = createEmptyDatabase(createInstallation("production"))
    expect(db.patients).toEqual([])
    expect(db.users).toEqual([])
    expect(db.tests).toEqual([])
    expect(db.doctors).toEqual([])
    expect(db.audit).toEqual([])
    expect(db.setupCompleted).toBe(false)
  })

  it("uses neutral default text that names no laboratory", () => {
    const db = createEmptyDatabase(createInstallation("production"))
    expect(db.profile.name).toBe("")
    expect(db.reportSettings.disclaimer).not.toMatch(/demonstration/i)
    expect(db.reportSettings.footerText).not.toMatch(/demonstration/i)
  })
})

describe("D. two customers can never share data", () => {
  it("gives every installation its own storage namespace", () => {
    const storage = createMemoryStorage()
    const installations = ensureInstallations(storage)
    const other = createInstallation("production")
    expect(other.id).not.toBe(installations.productionId)
    expect(storageKey(other.id, "database")).toContain(other.id)
    expect(storageKey(other.id, "database").startsWith(`${STORAGE_NAMESPACE}:`)).toBe(true)
  })

  it("keeps two production laboratories independent on one device", () => {
    const storage = createMemoryStorage()
    const a = configuredDatabase()
    a.profile.name = "Clinic A"
    const b = configuredDatabase()
    b.profile.name = "Clinic B"
    b.installation = { ...b.installation, id: "inst-clinic-b" }

    writeDatabase(storage, a)
    writeDatabase(storage, b)

    expect(readDatabase(storage, a.installation.id).profile.name).toBe("Clinic A")
    expect(readDatabase(storage, b.installation.id).profile.name).toBe("Clinic B")
  })
})

describe("E. a factory reset really starts over", () => {
  it("removes the records but keeps the installation addressable", () => {
    const storage = createMemoryStorage()
    const installations = ensureInstallations(storage)
    const before = configuredDatabase()
    // Put the seeded document at the id this device actually uses.
    writeDatabase(storage, { ...before, installation: { ...before.installation, id: installations.productionId } })
    expect(readDatabase(storage, installations.productionId).setupCompleted).toBe(true)

    const after = replaceInstallation(storage, createEmptyDatabase(createInstallation("production")))

    // Setup must run again, and the installation must not have been orphaned.
    expect(after.setupCompleted).toBe(false)
    expect(after.patients).toEqual([])
    expect(ensureInstallations(storage).productionId).toBe(after.installation.id)
    const reloaded = readDatabase(storage, after.installation.id)
    expect(reloaded.setupCompleted).toBe(false)
    expect(reloaded.patients).toEqual([])
  })

  it("leaves an unrelated installation untouched by a reset", () => {
    const storage = createMemoryStorage()
    const other = configuredDatabase({
      installation: { ...configuredDatabase().installation, id: "inst-other" },
    })
    other.profile.name = "Other Lab"
    writeDatabase(storage, other)

    replaceInstallation(storage, createEmptyDatabase(createInstallation("production")))

    expect(readDatabase(storage, "inst-other").profile.name).toBe("Other Lab")
  })
})
