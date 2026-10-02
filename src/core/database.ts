/**
 * Persistent installation database.
 *
 * Responsibilities:
 *  - resolve which installation a device is running,
 *  - read and write the whole `LabDatabase` document,
 *  - migrate older documents forward by filling every field from defaults,
 *  - delete an installation completely for factory reset.
 *
 * Every key is namespaced by installation id, so one laboratory's data can
 * never be mixed with another installation's data.
 */

import {
  ACTIVE_INSTALLATION_KEY,
  KINDS,
  SCHEMA_VERSION,
  createEmptyDatabase,
  createInstallation,
  now,
  storageKey,
} from "./defaults"
import type { StorageAdapter } from "./storage"
import type { InstallationInfo, LabDatabase } from "./types"

/* -------------------------------------------------------------------------- */
/* Migration                                                                   */
/* -------------------------------------------------------------------------- */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Fills anything missing from `defaults` and repairs the types the core modules
 * rely on. This is what makes an older or hand-edited document safe to load.
 */
export const migrateDatabase = (
  raw: unknown,
  expectedMode: InstallationInfo["mode"] = "production",
  expectedId?: string,
): LabDatabase => {
  const base = createEmptyDatabase(createInstallation(expectedMode))
  if (expectedId) {
    base.installation.id = expectedId
    base.installation.mode = expectedMode
  }
  if (!isRecord(raw)) return base

  const document = raw as Record<string, unknown>
  const pick = <T,>(key: string, fallback: T): T =>
    document[key] === undefined || document[key] === null ? fallback : (document[key] as T)

  const merged: LabDatabase = {
    ...base,
    ...document,
    schemaVersion: SCHEMA_VERSION,
    buildVersion:
      typeof document.buildVersion === "string" ? document.buildVersion : base.buildVersion,
    setupCompleted: Boolean(document.setupCompleted),
    installation: {
      ...base.installation,
      ...(isRecord(document.installation) ? document.installation : {}),
      ...(expectedId ? { id: expectedId } : {}),
      mode: expectedMode,
    } as InstallationInfo,
    profile: { ...base.profile, ...(isRecord(document.profile) ? document.profile : {}) },
    branding: { ...base.branding, ...(isRecord(document.branding) ? document.branding : {}) },
    reportSettings: {
      ...base.reportSettings,
      ...(isRecord(document.reportSettings) ? document.reportSettings : {}),
    },
    receiptSettings: {
      ...base.receiptSettings,
      ...(isRecord(document.receiptSettings) ? document.receiptSettings : {}),
    },
    printerSettings: {
      ...base.printerSettings,
      ...(isRecord(document.printerSettings) ? document.printerSettings : {}),
    },
    testSettings: { ...base.testSettings, ...(isRecord(document.testSettings) ? document.testSettings : {}) },
    paymentSettings: {
      ...base.paymentSettings,
      ...(isRecord(document.paymentSettings) ? document.paymentSettings : {}),
    },
    securitySettings: {
      ...base.securitySettings,
      ...(isRecord(document.securitySettings) ? document.securitySettings : {}),
    },
    backupSettings: {
      ...base.backupSettings,
      ...(isRecord(document.backupSettings) ? document.backupSettings : {}),
    },
    license: { ...base.license, ...(isRecord(document.license) ? document.license : {}) },
    users: Array.isArray(document.users) ? (document.users as LabDatabase["users"]) : [],
    doctors: Array.isArray(document.doctors) ? (document.doctors as LabDatabase["doctors"]) : [],
    tests: Array.isArray(document.tests) ? (document.tests as LabDatabase["tests"]) : [],
    patients: Array.isArray(document.patients) ? (document.patients as LabDatabase["patients"]) : [],
    audit: Array.isArray(document.audit) ? (document.audit as LabDatabase["audit"]) : [],
    createdAt: pick("createdAt", base.createdAt),
    updatedAt: pick("updatedAt", base.updatedAt),
  }

  // Nested objects the core modules index directly.
  merged.profile.idPrefixes = {
    ...base.profile.idPrefixes,
    ...(isRecord(merged.profile.idPrefixes) ? merged.profile.idPrefixes : {}),
  }
  merged.reportSettings.signatureLabels = {
    ...base.reportSettings.signatureLabels,
    ...(isRecord(merged.reportSettings.signatureLabels)
      ? merged.reportSettings.signatureLabels
      : {}),
  }
  merged.reportSettings.resultColumns = {
    ...base.reportSettings.resultColumns,
    ...(isRecord(merged.reportSettings.resultColumns) ? merged.reportSettings.resultColumns : {}),
  }
  if (!Array.isArray(merged.reportSettings.showSignatures)) {
    merged.reportSettings.showSignatures = [...base.reportSettings.showSignatures]
  }

  return merged
}

/* -------------------------------------------------------------------------- */
/* Installation resolution                                                     */
/* -------------------------------------------------------------------------- */

export type ActiveInstallations = {
  productionId: string
}

/** Returns the installation id this device uses, creating it if needed. */
export const ensureInstallations = (storage: StorageAdapter): ActiveInstallations => {
  let productionId = storage.getItem(ACTIVE_INSTALLATION_KEY)
  if (!productionId) {
    productionId = createInstallation("production").id
    storage.setItem(ACTIVE_INSTALLATION_KEY, productionId)
  }
  return { productionId }
}

/* -------------------------------------------------------------------------- */
/* Read and write                                                              */
/* -------------------------------------------------------------------------- */

export const readDatabase = (storage: StorageAdapter, installationId: string): LabDatabase => {
  const raw = storage.getItem(storageKey(installationId, KINDS.database))
  return migrateDatabase(raw ? safeParse(raw) : null, "production", installationId)
}

const safeParse = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export const writeDatabase = (
  storage: StorageAdapter,
  db: LabDatabase,
): { ok: boolean; reason?: string } => {
  const document: LabDatabase = {
    ...db,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now(),
  }
  try {
    storage.setItem(storageKey(db.installation.id, KINDS.database), JSON.stringify(document))
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: (error as Error).message }
  }
}

/** Stores a rollback snapshot of the installation. */
export const writeSnapshot = (storage: StorageAdapter, db: LabDatabase): boolean => {
  try {
    storage.setItem(
      storageKey(db.installation.id, KINDS.snapshot),
      JSON.stringify({ takenAt: now(), database: db }),
    )
    return true
  } catch {
    return false
  }
}

export const readSnapshot = (
  storage: StorageAdapter,
  installationId: string,
): { takenAt: string; database: LabDatabase } | null => {
  const raw = storage.getItem(storageKey(installationId, KINDS.snapshot))
  if (!raw) return null
  const parsed = safeParse(raw) as
    | { takenAt?: string; database?: unknown }
    | null
  if (!parsed || !isRecord(parsed)) return null
  return {
    takenAt: parsed.takenAt ?? "",
    database: migrateDatabase(parsed.database ?? null, "production", installationId),
  }
}

/** Deletes everything belonging to one installation. */
export const deleteInstallation = (storage: StorageAdapter, installationId: string): void => {
  for (const kind of Object.values(KINDS)) {
    storage.removeItem(storageKey(installationId, kind))
  }
  if (storage.getItem(ACTIVE_INSTALLATION_KEY) === installationId) {
    storage.removeItem(ACTIVE_INSTALLATION_KEY)
  }
}

/**
 * Installs a document as a brand new installation.
 * Used by factory reset and by "install backup as a fresh laboratory".
 */
export const replaceInstallation = (storage: StorageAdapter, incoming: LabDatabase): LabDatabase => {
  const { productionId } = ensureInstallations(storage)
  deleteInstallation(storage, productionId)
  const fresh = migrateDatabase(
    { ...incoming, installation: { ...incoming.installation, id: productionId, mode: "production" } },
    "production",
    productionId,
  )
  writeDatabase(storage, fresh)
  // `deleteInstallation` clears the pointer that pointed at this id. It has to
  // be re-established, or the next start would mint a new id and the document we
  // just restored would look like it had vanished.
  storage.setItem(ACTIVE_INSTALLATION_KEY, productionId)
  return fresh
}

/** Human-readable summary of where this installation's data lives. */
export const describeDatabase = (db: LabDatabase, storage: StorageAdapter): string => {
  const size = new Blob([JSON.stringify(db)]).size
  const kb = Math.max(1, Math.round(size / 1024))
  return `${storage.describe()} · ${kb} KB · ${db.installation.code}`
}
