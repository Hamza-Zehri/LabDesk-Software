/**
 * Cloud License Engine for LabDesk using Firebase.
 *
 * Firebase Project ID: labdesk-85655
 * Project Number: 750773926472
 *
 * Communicates with Cloud Functions and Firestore REST APIs safely from the desktop app.
 * Contains NO admin secrets or private keys.
 */

import { computeLicenseSignature, maskLicenseKey, sha256 } from "./licenseCrypto"
import type { CloudLicenseRecord, CustomerRecord, LicenseInfo, LicensePlan, LicenseStatus } from "./types"

export const FIREBASE_CONFIG = {
  projectId: "labdesk-85655",
  projectNumber: "750773926472",
  region: "us-central1",
  functionsBaseUrl: "https://us-central1-labdesk-85655.cloudfunctions.net",
  firestoreRestBase: "https://firestore.googleapis.com/v1/projects/labdesk-85655/databases/(default)/documents",
} as const

export const DEFAULT_OFFLINE_GRACE_DAYS = 7

export type CloudActivationResponse =
  | {
      ok: true
      licenseId: string
      licenseKeyMasked: string
      customerId: string
      customerName: string
      laboratoryName: string
      plan: LicensePlan
      expiresAt: string
      serverTime: string
      graceUntil: string
      maxInstallations: number
      message?: string
    }
  | {
      ok: false
      error: string
      status?: LicenseStatus
    }

export type CloudCheckResponse =
  | {
      ok: true
      status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED" | "EXPIRED" | "REVOKED"
      licenseId: string
      expiresAt: string
      serverTime: string
      graceUntil: string
      deactivationReason?: string
      message?: string
    }
  | {
      ok: false
      error: string
      networkFailure?: boolean
    }

/**
 * Activates a license key with the cloud server.
 */
export async function activateLicenseOnline(
  licenseKey: string,
  installationId: string,
  laboratoryName: string = "Diagnostic Laboratory",
  appVersion: string = "1.0.0",
): Promise<CloudActivationResponse> {
  const cleanKey = licenseKey.trim().toUpperCase()
  if (!cleanKey) {
    return { ok: false, error: "Please enter a valid license key." }
  }

  try {
    const keyHash = await sha256(cleanKey)
    let response: Response
    try {
      response = await fetch(`${FIREBASE_CONFIG.functionsBaseUrl}/activateLicense`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseKey: cleanKey,
          licenseKeyHash: keyHash,
          installationId,
          laboratoryName,
          appVersion,
          platform: "win32",
        }),
      })
    } catch {
      /* Network failure: fall through to the Firestore path below. */
      return await fallbackFirestoreActivation(cleanKey, installationId, laboratoryName, keyHash, appVersion)
    }

    // The function answers in JSON even when it refuses a key. Any explicit
    // rejection has to be honoured whatever the status code, otherwise a
    // refusal such as SEAT_LIMIT could be replayed straight through the
    // Firestore fallback and activation would succeed anyway.
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    if (body && body.ok === false) {
      return {
        ok: false,
        error: String(body.error || "License activation failed."),
        status: body.status as LicenseStatus | undefined,
      }
    }

    if (response.ok && body && body.ok) {
      return {
        ok: true,
        licenseId: String(body.licenseId),
        licenseKeyMasked: maskLicenseKey(cleanKey),
        customerId: body.customerId ? String(body.customerId) : "CUST-ONLINE",
        customerName: body.customerName ? String(body.customerName) : laboratoryName,
        laboratoryName: body.laboratoryName ? String(body.laboratoryName) : laboratoryName,
        plan: (body.plan as LicensePlan) || "PROFESSIONAL",
        expiresAt: String(body.expiresAt),
        serverTime: body.serverTime ? String(body.serverTime) : new Date().toISOString(),
        graceUntil: calculateGraceUntil(body.serverTime ? String(body.serverTime) : new Date().toISOString()),
        maxInstallations: Number(body.maxInstallations) || 1,
        message: body.message ? String(body.message) : "License activated successfully.",
      }
    }
  } catch {
    /* Fall through to Firestore REST if the endpoint is not usable. */
  }

  // Reached only when the endpoint is genuinely absent or non-JSON (not yet
  // deployed). The key hash is recomputed below when it was not available.
  return await fallbackFirestoreActivation(cleanKey, installationId, laboratoryName, await sha256(cleanKey), appVersion)
}

/**
 * Checks authoritative license status with the cloud server (Heartbeat).
 */
export async function checkLicenseStatusOnline(
  licenseId: string,
  installationId: string,
): Promise<CloudCheckResponse> {
  if (!licenseId) {
    return { ok: false, error: "No license ID provided for verification." }
  }

  let response: Response
  try {
    response = await fetch(
      `${FIREBASE_CONFIG.functionsBaseUrl}/checkLicense?licenseId=${encodeURIComponent(
        licenseId,
      )}&installationId=${encodeURIComponent(installationId)}`,
      { method: "GET", headers: { Accept: "application/json" } },
    )
  } catch {
    /* Network timeout or offline */
    return await fallbackFirestoreCheck(licenseId, installationId)
  }

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (body && body.ok === true) {
    return {
      ok: true,
      status: body.status as CloudCheckResponse extends { ok: true } ? "ACTIVE" | "SUSPENDED" | "DEACTIVATED" | "EXPIRED" | "REVOKED" : never,
      licenseId: body.licenseId ? String(body.licenseId) : licenseId,
      expiresAt: String(body.expiresAt),
      serverTime: body.serverTime ? String(body.serverTime) : new Date().toISOString(),
      graceUntil: calculateGraceUntil(body.serverTime ? String(body.serverTime) : new Date().toISOString()),
      deactivationReason: body.deactivationReason ? String(body.deactivationReason) : undefined,
      message: body.message ? String(body.message) : undefined,
    }
  }

  // A refusal that names a status is authoritative: it must not be downgraded
  // into an offline event, otherwise the app would fall back to grace mode.
  if (body && typeof body.status === "string") {
    return {
      ok: true,
      status: body.status as "ACTIVE" | "SUSPENDED" | "DEACTIVATED" | "EXPIRED" | "REVOKED",
      licenseId,
      expiresAt: body.expiresAt ? String(body.expiresAt) : new Date().toISOString(),
      serverTime: new Date().toISOString(),
      graceUntil: calculateGraceUntil(new Date().toISOString()),
      deactivationReason: body.error ? String(body.error) : undefined,
    }
  }

  // Endpoint not deployed or unusable: fall back to reading the document.
  return await fallbackFirestoreCheck(licenseId, installationId)
}

/**
 * Helper to calculate grace until date (7 days from server timestamp).
 */
export function calculateGraceUntil(serverTimeIso: string, graceDays: number = DEFAULT_OFFLINE_GRACE_DAYS): string {
  const base = new Date(serverTimeIso).getTime()
  if (isNaN(base)) {
    return new Date(Date.now() + graceDays * 86400000).toISOString()
  }
  return new Date(base + graceDays * 86400000).toISOString()
}

/**
 * Reads the server's own clock from the HTTP `Date` response header.
 *
 * Expiry and offline-grace decisions must never be made against the local
 * system clock: rolling it back would otherwise keep an expired license alive
 * indefinitely and never let the grace period run out. The header is generated
 * by Google and cannot be spoofed by the customer.
 */
function serverTimeFromResponse(response: Response): string {
  const header = response.headers.get("date")
  if (header) {
    const parsed = new Date(header)
    if (!isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return new Date().toISOString()
}

/**
 * Reads a Firestore document over REST. Returns `null` when the document does
 * not exist, which for a license the app previously activated means it has been
 * deleted or revoked.
 */
type FirestoreFields = Record<string, { stringValue?: string; integerValue?: string; booleanValue?: boolean; arrayValue?: { values?: { stringValue?: string }[] } }>

async function readFirestoreLicense(licenseKey: string): Promise<{ fields: FirestoreFields; serverTime: string } | null> {
  const docUrl = `${FIREBASE_CONFIG.firestoreRestBase}/licenses/${encodeURIComponent(licenseKey)}`
  const response = await fetch(docUrl)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Firestore returned HTTP ${response.status}`)
  const body = await response.json()
  return { fields: (body.fields || {}) as FirestoreFields, serverTime: serverTimeFromResponse(response) }
}

function stringField(fields: FirestoreFields, name: string): string | undefined {
  return fields[name]?.stringValue
}

function numberField(fields: FirestoreFields, name: string): number | undefined {
  const field = fields[name]
  if (!field) return undefined
  const value = Number(field.integerValue ?? field.stringValue)
  return Number.isNaN(value) ? undefined : value
}

function stringArrayField(fields: FirestoreFields, name: string): string[] {
  return (fields[name]?.arrayValue?.values ?? []).map((entry) => String(entry.stringValue ?? "")).filter(Boolean)
}

/* -------------------------------------------------------------------------- */
/* Installation registration                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The installation record the developer portal lists under "computers".
 *
 * `activateLicense` normally writes this server-side, but that Cloud Function is
 * not deployed on this project (billing is off), so the Firestore fallback left
 * the portal permanently empty. The client registers itself instead, which the
 * Firestore rules already permit unauthenticated: it may only write the six
 * fields below to its own `installations/{installationId}` document, and it can
 * never touch the license, so seat enforcement is unaffected and remains based
 * on the vendor-written license document.
 *
 * These records are advisory. They are vendor-facing telemetry, so a failed
 * write must never block activation.
 */
type InstallationReport = {
  installationId: string
  licenseId: string
  laboratoryName: string
  appVersion: string
  lastSeenAt: string
  status: string
}

const INSTALLATION_FIELDS: (keyof InstallationReport)[] = [
  "installationId",
  "licenseId",
  "laboratoryName",
  "appVersion",
  "lastSeenAt",
  "status",
]

/** Firestore document fields are capped well above this; long names are truncated rather than rejected. */
function clip(value: string, max = 200): string {
  return value.length > max ? value.slice(0, max) : value
}

async function writeInstallationRecord(record: InstallationReport, mask: (keyof InstallationReport)[]): Promise<boolean> {
  const url = `${FIREBASE_CONFIG.firestoreRestBase}/installations/${encodeURIComponent(record.installationId)}`
  const fields = Object.fromEntries(
    mask.map((key) => [key, { stringValue: clip(String(record[key] ?? "")) }]),
  ) as Record<string, { stringValue: string }>
  const updateMask = mask.map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join("&")

  try {
    // Firestore's PATCH upserts, so the same request registers a machine on its
    // first contact and refreshes it afterwards.
    const response = await fetch(`${url}?${updateMask}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    })
    return response.ok
  } catch {
    return false
  }
}

/** Registers this computer, or refreshes it if it is already known. */
export async function registerInstallation(record: InstallationReport): Promise<boolean> {
  return writeInstallationRecord(record, INSTALLATION_FIELDS)
}

/**
 * Refreshes "last seen" for an already-registered computer.
 *
 * A masked update of an unregistered document is refused by the rules, because
 * the rules insist on `installationId` matching the document being written. That
 * refusal is the signal to publish the whole record, which is how a machine that
 * activated on an older build of the app still appears in the portal once it is
 * upgraded. The portal falls back to the license's own laboratory name when this
 * path has no name to send.
 */
async function touchInstallation(
  installationId: string,
  licenseId: string,
  status: string,
  lastSeenAt: string,
): Promise<boolean> {
  const record: InstallationReport = { installationId, licenseId, laboratoryName: "", appVersion: "", lastSeenAt, status }
  return (await writeInstallationRecord(record, ["lastSeenAt", "status"]))
    ? true
    : writeInstallationRecord(record, INSTALLATION_FIELDS)
}

/**
 * Claims this installation's seat on the license document.
 *
 * The Firestore rules allow exactly one thing here: appending this
 * installation's id to `installationIds`, never removing another machine,
 * never exceeding `maxInstallations`, never altering anything else, and only
 * while the license is active. The append is only made during an explicit
 * activation, never during a heartbeat, so a vendor who frees a seat is not
 * immediately undone by the machine that was sitting in it.
 */
async function reserveSeat(
  licenseKey: string,
  installationId: string,
  maxInstallations: number,
  alreadyClaimed: string[],
): Promise<{ reserved: boolean; seatsUsed: number }> {
  const claimed = new Set(alreadyClaimed.filter(Boolean))

  if (claimed.has(installationId)) {
    // Already seated; only the counter may need repairing.
    await syncSeatCounter(licenseKey, [...claimed])
    return { reserved: true, seatsUsed: claimed.size }
  }

  if (claimed.size >= maxInstallations) return { reserved: false, seatsUsed: claimed.size }

  const requested = [...claimed, installationId]
  const ok = await syncSeatCounter(licenseKey, requested)
  return { reserved: ok, seatsUsed: ok ? requested.length : claimed.size }
}

/**
 * Claims this installation's seat if it is not already recorded as holding one.
 *
 * The claim is only appended, so this is safe to call when the list already
 * contains this machine. Returns false when the seat list is full or the license
 * refuses the write.
 */
export async function ensureSeatReserved(
  licenseKey: string,
  installationId: string,
  maxInstallations: number,
): Promise<boolean> {
  try {
    const document = await readFirestoreLicense(licenseKey)
    if (!document) return false
    const claimed = stringArrayField(document.fields, "installationIds")
    if (claimed.includes(installationId)) return true
    if (claimed.length >= (numberField(document.fields, "maxInstallations") ?? maxInstallations)) return false
    const written = await syncSeatCounter(licenseKey, [...claimed, installationId])
    if (written) return true
    // Refused: another machine may have taken the last seat.
    const recheck = await readFirestoreLicense(licenseKey)
    return recheck ? stringArrayField(recheck.fields, "installationIds").includes(installationId) : false
  } catch {
    return false
  }
}

/** Writes the seat list and the counter that summarises it, atomically. */
async function syncSeatCounter(licenseKey: string, installationIds: string[]): Promise<boolean> {
  const docUrl = `${FIREBASE_CONFIG.firestoreRestBase}/licenses/${encodeURIComponent(licenseKey)}`
  try {
    const response = await fetch(
      `${docUrl}?updateMask.fieldPaths=installationIds&updateMask.fieldPaths=currentInstallations`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            installationIds: { arrayValue: { values: installationIds.map((id) => ({ stringValue: id })) } },
            currentInstallations: { integerValue: String(installationIds.length) },
          },
        }),
      },
    )
    return response.ok
  } catch {
    return false
  }
}

/**
 * Firestore REST API fallback for direct activation when Cloud Functions are offline or during offline testing.
 *
 * This path is reachable without a server-side writer, so it re-checks every
 * rule it can from the document itself: status, expiry against the server
 * clock, the key hash and the seat limit.
 */
async function fallbackFirestoreActivation(
  licenseKey: string,
  installationId: string,
  laboratoryName: string,
  licenseKeyHash: string,
  appVersion: string,
): Promise<CloudActivationResponse> {
  try {
    const document = await readFirestoreLicense(licenseKey)
    if (!document) {
      return { ok: false, error: "Invalid license key. License was not found in the cloud database." }
    }

    const fields = document.fields
    const status = stringField(fields, "status") || "ACTIVE"
    const expiresAt = stringField(fields, "expiresAt") || new Date(Date.now() + 365 * 86400000).toISOString()
    const maxInstallations = numberField(fields, "maxInstallations") ?? 1
    const customerName = stringField(fields, "customerName") || laboratoryName
    const customerId = stringField(fields, "customerId") || "CUST-OFFLINE"
    const plan = (stringField(fields, "plan") || "PROFESSIONAL") as LicensePlan
    const storedHash = stringField(fields, "licenseKeyHash")

    // Defence in depth: the document must be the one issued for this key.
    if (storedHash && storedHash !== licenseKeyHash) {
      return { ok: false, error: "Invalid license key. License was not found in the cloud database." }
    }

    if (status !== "ACTIVE") {
      return {
        ok: false,
        error: `This license key is currently ${status}. Please contact your software provider.`,
        status: status as LicenseStatus,
      }
    }

    if (new Date(expiresAt).getTime() < new Date(document.serverTime).getTime()) {
      return { ok: false, error: "This license key has expired.", status: "EXPIRED" }
    }

    // Without a server-side writer the seat list cannot be incremented from
    // here, so at least refuse a machine that has no seat reserved.
    const claimedIds = stringArrayField(fields, "installationIds")
    const seatsUsed = Math.max(claimedIds.length, numberField(fields, "currentInstallations") ?? 0)
    if (!claimedIds.includes(installationId) && seatsUsed >= maxInstallations) {
      return {
        ok: false,
        error: `This license key is already active on ${seatsUsed} of ${maxInstallations} permitted computer(s). Please contact your software provider.`,
        status: "DEACTIVATED",
      }
    }

    // Claim the seat for real, so a second machine is refused by the database
    // rather than by a counter that never moved. The document is re-read after a
    // refused claim: losing that race means the seat really is gone.
    const seat = await reserveSeat(licenseKey, installationId, maxInstallations, claimedIds)
    if (!seat.reserved && !claimedIds.includes(installationId)) {
      const recheck = await readFirestoreLicense(licenseKey)
      const nowClaimed = recheck ? stringArrayField(recheck.fields, "installationIds") : []
      if (!nowClaimed.includes(installationId) && nowClaimed.length >= maxInstallations) {
        return {
          ok: false,
          error: `This license key is already active on ${nowClaimed.length} of ${maxInstallations} permitted computer(s). Please contact your software provider.`,
          status: "DEACTIVATED",
        }
      }
    }

    const registeredLaboratory = stringField(fields, "laboratoryName") || laboratoryName

    // Publish this computer to the developer portal. Advisory only, so the
    // result is deliberately ignored.
    await registerInstallation({
      installationId,
      licenseId: licenseKey,
      laboratoryName: registeredLaboratory,
      appVersion,
      lastSeenAt: document.serverTime,
      status: "ACTIVE",
    })

    return {
      ok: true,
      licenseId: licenseKey,
      licenseKeyMasked: maskLicenseKey(licenseKey),
      customerId,
      customerName,
      laboratoryName: registeredLaboratory,
      plan,
      expiresAt,
      serverTime: document.serverTime,
      graceUntil: calculateGraceUntil(document.serverTime),
      maxInstallations,
    }
  } catch {
    /* Network offline */
  }

  return {
    ok: false,
    error: "Unable to connect to license verification server. Please check your internet connection.",
  }
}

/**
 * Firestore REST API fallback for status heartbeat check.
 */
async function fallbackFirestoreCheck(licenseId: string, installationId: string): Promise<CloudCheckResponse> {
  try {
    const document = await readFirestoreLicense(licenseId)
    if (!document) {
      // The license was deleted in the portal, so the install must stop.
      const serverTime = new Date().toISOString()
      return {
        ok: true,
        status: "REVOKED",
        licenseId,
        expiresAt: serverTime,
        serverTime,
        graceUntil: serverTime,
        deactivationReason: "This license was withdrawn by your software provider.",
      }
    }

    const fields = document.fields
    const storedStatus = (stringField(fields, "status") || "ACTIVE") as CloudCheckResponse extends {
      ok: true
    }
      ? "ACTIVE" | "SUSPENDED" | "DEACTIVATED" | "EXPIRED" | "REVOKED"
      : never
    const expiresAt = stringField(fields, "expiresAt") || new Date(Date.now() + 365 * 86400000).toISOString()
    const deactivationReason = stringField(fields, "deactivationReason")

    // Expiry has to be evaluated here: the stored status is not derived from the
    // expiry date, and trusting the local clock would let a rolled-back system
    // clock keep an expired license alive.
    const status =
      storedStatus === "ACTIVE" && new Date(expiresAt).getTime() < new Date(document.serverTime).getTime()
        ? "EXPIRED"
        : storedStatus

    // Keep the portal's "last seen" honest for this computer.
    await touchInstallation(installationId, licenseId, status, document.serverTime)

    return {
      ok: true,
      status,
      licenseId,
      expiresAt,
      serverTime: document.serverTime,
      graceUntil: calculateGraceUntil(document.serverTime),
      deactivationReason,
    }
  } catch {
    /* Network failure */
  }

  return {
    ok: false,
    error: "Network unavailable for license verification.",
    networkFailure: true,
  }
}
