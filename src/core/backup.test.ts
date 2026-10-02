import { describe, expect, it } from "vitest"

import {
  BACKUP_FORMAT_VERSION,
  BACKUP_KIND,
  auditCsv,
  backupFileName,
  createBackupBundle,
  describeBackup,
  parseBackup,
  serializeBackup,
} from "./backup"
import { PRODUCT_NAME, PRODUCT_VERSION, VENDOR } from "./product"
import { configuredDatabase, auditEntry, patient } from "./testFixtures"

const db = () =>
  configuredDatabase({
    patients: [patient()],
    audit: [auditEntry()],
  })

describe("createBackupBundle", () => {
  it("describes itself and carries the whole database", () => {
    const bundle = createBackupBundle(db())
    expect(bundle.kind).toBe(BACKUP_KIND)
    expect(bundle.formatVersion).toBe(BACKUP_FORMAT_VERSION)
    expect(bundle.product).toBe(PRODUCT_NAME)
    expect(bundle.productVersion).toBe(PRODUCT_VERSION)
    expect(bundle.vendor).toBe(VENDOR.credit)
    expect(bundle.laboratoryName).toBe("Northside Diagnostics")
    expect(bundle.mode).toBe("production")
    expect(bundle.database.patients).toHaveLength(1)
  })

  it("round-trips through serialize and parse", () => {
    const result = parseBackup(serializeBackup(db()))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.database.profile.name).toBe("Northside Diagnostics")
    expect(result.database.patients).toHaveLength(1)
    expect(result.database.audit).toHaveLength(1)
  })

  it("carries the customer's own branding rather than a baked-in identity", () => {
    const base = configuredDatabase()
    const custom = {
      ...base,
      profile: { ...base.profile, name: "Riverside Labs", tagline: "Results you can trust" },
      reportSettings: { ...base.reportSettings, disclaimer: "Riverside is ISO 15189 accredited." },
    }
    const result = parseBackup(serializeBackup(custom))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.database.profile.tagline).toBe("Results you can trust")
    expect(result.database.reportSettings.disclaimer).toBe("Riverside is ISO 15189 accredited.")
  })
})

describe("parseBackup", () => {
  it("rejects invalid JSON", () => {
    expect(parseBackup("{ not json")).toEqual({ ok: false, error: "This file is not valid JSON." })
  })

  it("rejects JSON that is not a backup object", () => {
    expect(parseBackup("[]")).toEqual({ ok: false, error: "This file does not contain a backup." })
    expect(parseBackup('"a string"').ok).toBe(false)
  })

  it("rejects an unrelated JSON file", () => {
    const result = parseBackup(JSON.stringify({ note: "not a backup" }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("not produced by a LabDesk backup")
  })

  it("rejects a bundle with no database", () => {
    const result = parseBackup(JSON.stringify({ kind: BACKUP_KIND }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe("The backup is missing its database.")
  })

  it("rejects a truncated backup and names the missing tables", () => {
    const bundle = createBackupBundle(db()) as unknown as Record<string, unknown>
    const database = { ...(bundle.database as object) } as Record<string, unknown>
    delete database.tests
    delete database.audit
    const result = parseBackup(JSON.stringify({ ...bundle, database }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("tests")
    expect(result.error).toContain("audit")
  })

  it("repairs an older backup through the migration path", () => {
    const bundle = createBackupBundle(db()) as unknown as Record<string, unknown>
    const database = { ...(bundle.database as object), reportSettings: { signatureLabels: undefined } } as object
    const result = parseBackup(JSON.stringify({ ...bundle, database }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.database.reportSettings.signatureLabels).toBeTypeOf("object")
  })
})

describe("backupFileName", () => {
  it("slugs the laboratory name and stamps the date", () => {
    expect(backupFileName(configuredDatabase(), "2026-03-04T10:00:00.000Z")).toBe(
      "northside-diagnostics-backup-2026-03-04.json",
    )
  })

  it("falls back when the name has no usable characters", () => {
    const base = configuredDatabase()
    const unnamed = { ...base, profile: { ...base.profile, name: "!!!" } }
    expect(backupFileName(unnamed, "2026-03-04T10:00:00.000Z")).toBe("laboratory-backup-2026-03-04.json")
  })
})

describe("describeBackup", () => {
  it("pluralises the table counts", () => {
    const single = configuredDatabase({ patients: [patient()], tests: [], doctors: [], users: [] })
    expect(describeBackup(createBackupBundle(single))).toContain("1 patient,")
    expect(describeBackup(createBackupBundle(single))).toContain("0 tests,")
  })
})

describe("auditCsv", () => {
  it("writes a header and one row per entry", () => {
    const csv = auditCsv(db().audit)
    const lines = csv.split("\r\n")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('"Date & time","User","Action","Record","Detail"')
    expect(lines[1]).toBe('"2026-01-01T09:00:00.000Z","Reception","Patient Created","LAB-0001","Walk-in"')
  })

  it("escapes quotes and embedded newlines so a cell cannot break the file", () => {
    const csv = auditCsv([
      auditEntry({ userName: 'The "Front Desk"', action: "Note", record: "R1", detail: "line one\nline two" }),
    ])
    expect(csv).toContain('""Front Desk""')
    // A raw newline would split the record across two lines in a spreadsheet.
    expect(csv.split("\r\n")).toHaveLength(2)
  })

  it("emits only the header for an empty trail", () => {
    expect(auditCsv([]).split("\r\n")).toHaveLength(1)
  })

  it("tolerates missing fields", () => {
    const csv = auditCsv([{ time: "t" } as never])
    expect(csv.split("\r\n")[1]).toBe('"t","","","",""')
  })
})
