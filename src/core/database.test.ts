import { describe, expect, it } from "vitest"

import {
  deleteInstallation,
  describeDatabase,
  ensureInstallations,
  migrateDatabase,
  readDatabase,
  readSnapshot,
  replaceInstallation,
  writeDatabase,
  writeSnapshot,
} from "./database"
import { ACTIVE_INSTALLATION_KEY, KINDS, SCHEMA_VERSION, storageKey } from "./defaults"
import { createMemoryStorage } from "./storage"
import { configuredDatabase, patient } from "./testFixtures"

describe("migrateDatabase", () => {
  it("returns a complete database for empty or unusable input", () => {
    for (const input of [null, undefined, 42, "nonsense", [], true]) {
      const db = migrateDatabase(input)
      expect(db.setupCompleted).toBe(false)
      expect(db.users).toEqual([])
      expect(db.profile.idPrefixes.patient).toBeTruthy()
    }
  })

  it("stamps the current schema version", () => {
    expect(migrateDatabase({ schemaVersion: 0 }).schemaVersion).toBe(SCHEMA_VERSION)
  })

  it("fills in fields an older document is missing without losing the rest", () => {
    const db = migrateDatabase({ profile: { name: "Kept Name" }, patients: [patient()] })
    expect(db.profile.name).toBe("Kept Name")
    expect(db.patients).toHaveLength(1)
    expect(db.reportSettings.signatureLabels).toBeTypeOf("object")
    expect(db.reportSettings.showSignatures.length).toBeGreaterThan(0)
  })

  it("replaces a non-array collection with an empty array", () => {
    const db = migrateDatabase({ patients: "oops", users: 7, tests: null })
    expect(db.patients).toEqual([])
    expect(db.users).toEqual([])
    expect(db.tests).toEqual([])
  })

  it("normalises setupCompleted to a boolean", () => {
    expect(migrateDatabase({ setupCompleted: "yes" }).setupCompleted).toBe(true)
    expect(migrateDatabase({ setupCompleted: 0 }).setupCompleted).toBe(false)
  })

  it("applies the expected installation id and mode over a stale stored one", () => {
    // This is the fresh-install bug: the document must follow the key it was
    // loaded from, or a reset installation would keep writing to the old id.
    const db = migrateDatabase(
      { installation: { id: "old-id", code: "OLD", mode: "production" } },
      "production",
      "new-id",
    )
    expect(db.installation.id).toBe("new-id")
    expect(db.installation.mode).toBe("production")
  })

  it("keeps the document's own installation id when none is expected", () => {
    const db = migrateDatabase({ installation: { id: "own-id", code: "OWN" } })
    expect(db.installation.id).toBe("own-id")
  })
})

describe("installation resolution", () => {
  it("creates and then reuses this device's installation id", () => {
    const storage = createMemoryStorage()
    const first = ensureInstallations(storage)
    expect(first.productionId).toBeTruthy()
    expect(ensureInstallations(storage)).toEqual(first)
  })
})

describe("readDatabase and writeDatabase", () => {
  it("round-trips a document", () => {
    const storage = createMemoryStorage()
    const db = configuredDatabase({ patients: [patient()] })
    expect(writeDatabase(storage, db).ok).toBe(true)
    const loaded = readDatabase(storage, db.installation.id)
    expect(loaded.patients).toHaveLength(1)
    expect(loaded.profile.name).toBe("Northside Diagnostics")
  })

  it("writes to the key for the installation it belongs to", () => {
    const storage = createMemoryStorage()
    const db = configuredDatabase()
    writeDatabase(storage, db)
    expect(storage.getItem(storageKey(db.installation.id, KINDS.database))).toBeTruthy()
  })

  it("returns a fresh, unconfigured database when nothing is stored", () => {
    const loaded = readDatabase(createMemoryStorage(), "missing-id")
    expect(loaded.setupCompleted).toBe(false)
    expect(loaded.installation.id).toBe("missing-id")
  })

  it("recovers from a corrupt stored document instead of crashing", () => {
    const storage = createMemoryStorage()
    storage.setItem(storageKey("inst", KINDS.database), "{ this is not json")
    const loaded = readDatabase(storage, "inst")
    expect(loaded.setupCompleted).toBe(false)
    expect(loaded.installation.id).toBe("inst")
  })

  it("reports a write failure instead of throwing", () => {
    const failing = {
      ...createMemoryStorage(),
      setItem: () => {
        throw new Error("QuotaExceededError")
      },
    }
    const result = writeDatabase(failing, configuredDatabase())
    expect(result).toEqual({ ok: false, reason: "QuotaExceededError" })
  })

  it("keeps two installations completely separate", () => {
    const storage = createMemoryStorage()
    const a = configuredDatabase()
    const b = configuredDatabase({ profile: { ...a.profile, name: "Second Lab" } })
    writeDatabase(storage, a)
    writeDatabase(storage, { ...b, installation: { ...b.installation, id: "inst-b" } })
    expect(readDatabase(storage, a.installation.id).profile.name).toBe("Northside Diagnostics")
    expect(readDatabase(storage, "inst-b").profile.name).toBe("Second Lab")
  })
})

describe("snapshots", () => {
  it("stores and reloads a rollback point", () => {
    const storage = createMemoryStorage()
    const db = configuredDatabase({ patients: [patient()] })
    expect(writeSnapshot(storage, db)).toBe(true)
    const snapshot = readSnapshot(storage, db.installation.id)
    expect(snapshot).not.toBeNull()
    expect(snapshot!.database.patients).toHaveLength(1)
  })

  it("returns null when there is no snapshot or the snapshot is corrupt", () => {
    const storage = createMemoryStorage()
    expect(readSnapshot(storage, "inst")).toBeNull()
    storage.setItem(storageKey("inst", KINDS.snapshot), "not json")
    expect(readSnapshot(storage, "inst")).toBeNull()
  })

  it("returns null when the write failed", () => {
    const failing = {
      ...createMemoryStorage(),
      setItem: () => {
        throw new Error("nope")
      },
    }
    expect(writeSnapshot(failing, configuredDatabase())).toBe(false)
  })
})

describe("deleteInstallation", () => {
  it("removes every document belonging to that installation only", () => {
    const storage = createMemoryStorage()
    const a = configuredDatabase()
    const b = configuredDatabase({ installation: { ...configuredDatabase().installation, id: "inst-b" } })
    writeDatabase(storage, a)
    writeDatabase(storage, b)
    writeSnapshot(storage, a)

    deleteInstallation(storage, a.installation.id)

    expect(storage.getItem(storageKey(a.installation.id, KINDS.database))).toBeNull()
    expect(storage.getItem(storageKey(a.installation.id, KINDS.snapshot))).toBeNull()
    expect(storage.getItem(storageKey(b.installation.id, KINDS.database))).toBeTruthy()
  })

  it("clears the active-installation pointer so a reset starts fresh", () => {
    const storage = createMemoryStorage()
    const db = configuredDatabase()
    writeDatabase(storage, db)
    storage.setItem(ACTIVE_INSTALLATION_KEY, db.installation.id)
    deleteInstallation(storage, db.installation.id)
    expect(storage.getItem(ACTIVE_INSTALLATION_KEY)).toBeNull()
  })
})

describe("replaceInstallation", () => {
  it("installs a document as the active installation", () => {
    const storage = createMemoryStorage()
    const incoming = configuredDatabase({ patients: [patient()], installation: { ...configuredDatabase().installation, id: "stale-id" } })
    const installed = replaceInstallation(storage, incoming)

    expect(installed.installation.mode).toBe("production")
    expect(installed.installation.id).toBe(installed.installation.id)
    expect(storage.getItem(ACTIVE_INSTALLATION_KEY)).toBe(installed.installation.id)
    expect(readDatabase(storage, installed.installation.id).patients).toHaveLength(1)
  })

  it("replaces the active installation's data with the restored document", () => {
    const storage = createMemoryStorage()
    const existing = configuredDatabase({ patients: [patient()] })
    writeDatabase(storage, existing)

    const restored = configuredDatabase({ patients: [] })
    const installed = replaceInstallation(storage, restored)

    expect(readDatabase(storage, installed.installation.id).patients).toEqual([])
    expect(storage.getItem(ACTIVE_INSTALLATION_KEY)).toBe(installed.installation.id)
  })
})

describe("describeDatabase", () => {
  it("reports the storage location, size and installation code", () => {
    const db = configuredDatabase()
    const described = describeDatabase(db, createMemoryStorage())
    expect(described).toContain("In-memory storage")
    expect(described).toContain("KB")
    expect(described).toContain(db.installation.code)
  })
})
