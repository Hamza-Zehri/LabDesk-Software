/**
 * Backup and restore.
 *
 * A backup is a single self-describing JSON file that contains the complete
 * laboratory environment: laboratory identity, logo, branding, report and
 * receipt configuration, printer and payment settings, tests with this
 * laboratory's parameters and prices, doctors, staff accounts, patients,
 * results, payments and the audit trail.
 *
 * Restoring it reproduces the laboratory exactly as it was at export time.
 */

import { migrateDatabase } from "./database"
import { PRODUCT_NAME, PRODUCT_VERSION, VENDOR } from "./product"
import { SCHEMA_VERSION, now } from "./defaults"
import type { AuditEntry, InstallationMode, LabDatabase } from "./types"

export const BACKUP_KIND = "labdesk-backup"
export const BACKUP_FORMAT_VERSION = 1

export type BackupBundle = {
  kind: typeof BACKUP_KIND
  formatVersion: number
  product: string
  productVersion: string
  schemaVersion: number
  exportedAt: string
  laboratoryName: string
  installationCode: string
  mode: InstallationMode
  vendor: string
  database: LabDatabase
}

export const createBackupBundle = (db: LabDatabase): BackupBundle => ({
  kind: BACKUP_KIND,
  formatVersion: BACKUP_FORMAT_VERSION,
  product: PRODUCT_NAME,
  productVersion: PRODUCT_VERSION,
  schemaVersion: SCHEMA_VERSION,
  exportedAt: now(),
  laboratoryName: db.profile.name,
  installationCode: db.installation.code,
  mode: db.installation.mode,
  vendor: VENDOR.credit,
  database: db,
})

export const serializeBackup = (db: LabDatabase): string =>
  JSON.stringify(createBackupBundle(db), null, 2)

export const backupFileName = (db: LabDatabase, stamp: string): string => {
  const date = (stamp || now()).slice(0, 10)
  const name = (db.profile.name || "laboratory")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return `${name || "laboratory"}-backup-${date}.json`
}

export type BackupParseResult =
  | { ok: true; bundle: BackupBundle; database: LabDatabase }
  | { ok: false; error: string }

const REQUIRED_TABLES = [
  "patients",
  "tests",
  "doctors",
  "users",
  "audit",
] as const

/**
 * Validates a candidate backup file. Rejects anything that is not a complete
 * backup so a truncated or unrelated file can never overwrite live data.
 */
export const parseBackup = (contents: string): BackupParseResult => {
  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch {
    return { ok: false, error: "This file is not valid JSON." }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "This file does not contain a backup." }
  }
  const bundle = parsed as Partial<BackupBundle>
  if (bundle.kind !== BACKUP_KIND) {
    return {
      ok: false,
      error: "This file was not produced by a LabDesk backup. Choose a .json backup file.",
    }
  }
  const database = bundle.database
  if (typeof database !== "object" || database === null) {
    return { ok: false, error: "The backup is missing its database." }
  }
  const missing = REQUIRED_TABLES.filter(
    (table) => !Array.isArray((database as Record<string, unknown>)[table]),
  )
  if (missing.length) {
    return {
      ok: false,
      error: `The backup is incomplete. Missing: ${missing.join(", ")}.`,
    }
  }
  return {
    ok: true,
    bundle: bundle as BackupBundle,
    // Backups produced by older demo builds are accepted; their records are
    // restored as this installation's own production data.
    database: migrateDatabase(database, "production"),
  }
}

/** One-line description of a backup, used in the restore dialog. */
export const describeBackup = (bundle: BackupBundle): string => {
  const tables = [
    `${bundle.database.patients.length} patient${bundle.database.patients.length === 1 ? "" : "s"}`,
    `${bundle.database.tests.length} test${bundle.database.tests.length === 1 ? "" : "s"}`,
    `${bundle.database.doctors.length} doctor${bundle.database.doctors.length === 1 ? "" : "s"}`,
    `${bundle.database.users.length} staff`,
  ]
  return `${bundle.laboratoryName || "Unnamed laboratory"} · exported ${new Date(
    bundle.exportedAt,
  ).toLocaleString("en-GB")} · ${tables.join(", ")}`
}

export const downloadTextFile = (fileName: string, contents: string, type = "application/json") => {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/* -------------------------------------------------------------------------- */
/* Audit export                                                                */
/* -------------------------------------------------------------------------- */

const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`

/** Flattens the audit trail into a spreadsheet-friendly CSV. */
export const auditCsv = (entries: AuditEntry[]): string => {
  const header = ["Date & time", "User", "Action", "Record", "Detail"]
  const rows = entries.map((entry) =>
    [entry.time, entry.userName, entry.action, entry.record, entry.detail]
      .map((value) => csvCell(String(value ?? "")))
      .join(","),
  )
  return [header.map(csvCell).join(","), ...rows].join("\r\n")
}
