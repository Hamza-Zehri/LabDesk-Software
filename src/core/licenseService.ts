/**
 * Commercial License Service Layer for LabDesk.
 *
 * Handles license initialization, local state validation, daily heartbeat scheduling,
 * offline grace period evaluation, activation, tamper protection, and summary reporting.
 */

import {
  activateLicenseOnline,
  calculateGraceUntil,
  checkLicenseStatusOnline,
  ensureSeatReserved,
  type CloudCheckResponse,
} from "./cloudLicense"
import { getOrCreateInstallationId } from "./installationId"
import { computeLicenseSignature, isLocalLicenseSignatureValid, maskLicenseKey } from "./licenseCrypto"
import type { LabDatabase, LicenseInfo, LicenseStatus, LicenseSummary } from "./types"

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

export function createDefaultLicenseInfo(installationId?: string): LicenseInfo {
  const instId = installationId || getOrCreateInstallationId()
  const defaultObj: LicenseInfo = {
    status: "NOT_ACTIVATED",
    licenseId: "",
    licenseKeyMasked: "",
    customerId: "",
    customerName: "",
    licensedTo: "",
    plan: "PROFESSIONAL",
    issuedAt: "",
    activatedAt: "",
    expiresAt: "",
    lastCheckInAt: "",
    serverTimeAtCheck: "",
    graceUntil: "",
    maxInstallations: 1,
    installationId: instId,
    signature: "",
    seatLimit: 1,
    features: ["patient_management", "test_reporting", "billing_receipts", "thermal_printing"],
  }
  return defaultObj
}

/**
 * Turns an authoritative cloud answer into local license state.
 *
 * Shared by the automatic boot/periodic check and by a manual refresh so the two
 * can never disagree about what the cloud said.
 */
async function applyCloudCheckResult(
  license: LicenseInfo,
  checkResult: Extract<CloudCheckResponse, { ok: true }>,
  installationId: string,
): Promise<LicenseInfo> {
  const cloudStatus = checkResult.status
  let newStatus: LicenseStatus = "ACTIVE"

  if (cloudStatus === "DEACTIVATED") {
    newStatus = "DEACTIVATED"
  } else if (cloudStatus === "SUSPENDED") {
    newStatus = "SUSPENDED"
  } else if (cloudStatus === "REVOKED") {
    newStatus = "REVOKED"
  } else if (cloudStatus === "EXPIRED") {
    newStatus = "EXPIRED"
  } else {
    // Check if expiration is near
    const expiryTime = new Date(checkResult.expiresAt).getTime()
    const nowTime = new Date(checkResult.serverTime).getTime()
    if (expiryTime < nowTime) {
      newStatus = "EXPIRED"
    } else if (expiryTime - nowTime <= 30 * 86400000) {
      newStatus = "EXPIRING_SOON"
    } else {
      newStatus = "ACTIVE"
    }
  }

  const updated: LicenseInfo = {
    ...license,
    status: newStatus,
    expiresAt: checkResult.expiresAt || license.expiresAt,
    lastCheckInAt: checkResult.serverTime,
    serverTimeAtCheck: checkResult.serverTime,
    graceUntil: checkResult.graceUntil || calculateGraceUntil(checkResult.serverTime),
    deactivationReason: checkResult.deactivationReason || license.deactivationReason,
  }

  updated.signature = await computeLicenseSignature(updated, installationId)
  return updated
}

/**
 * Applies the offline-grace rules when the cloud could not be reached.
 */
async function applyOfflineResult(license: LicenseInfo, installationId: string): Promise<LicenseInfo> {
  const graceTime = license.graceUntil ? new Date(license.graceUntil).getTime() : 0
  if (Date.now() <= graceTime) {
    // Within 7-day offline grace period -> Continue operation
    if (license.status === "ACTIVE") {
      const updated: LicenseInfo = { ...license, status: "OFFLINE_GRACE" }
      updated.signature = await computeLicenseSignature(updated, installationId)
      return updated
    }
  } else {
    // Grace period expired
    if (license.status === "ACTIVE" || license.status === "OFFLINE_GRACE") {
      const updated: LicenseInfo = {
        ...license,
        status: "VERIFICATION_ERROR",
        deactivationReason: "Offline grace period expired. Internet connection required to re-verify license.",
      }
      updated.signature = await computeLicenseSignature(updated, installationId)
      return updated
    }
  }
  return license
}

/**
 * Registers an installation that predates seat reservation.
 *
 * Installs activated before seats existed hold a valid license but were never
 * written into `installationIds`, so the vendor's portal showed 0 of 1 seats in
 * use for a customer who was demonstrably licensed and running. Those machines
 * claim their seat once, on the first check after upgrading, and record that
 * they have done so: a machine that already holds a seat is never re-claimed
 * automatically, because the vendor may have freed it on purpose.
 */
async function claimSeatForLegacyInstall(license: LicenseInfo, installationId: string): Promise<LicenseInfo> {
  if (!license.licenseId || license.seatClaimedAt) return license
  if (!isLicenseOperatingAllowed(license)) return license

  const limit = license.maxInstallations || license.seatLimit || 1
  const claimed = await ensureSeatReserved(license.licenseId, installationId, limit)
  if (!claimed) return license

  const updated: LicenseInfo = { ...license, seatClaimedAt: new Date().toISOString() }
  updated.signature = await computeLicenseSignature(updated, installationId)
  return updated
}

/**
 * Initializes and evaluates the application's license status.
 */
export async function initializeLicenseState(db: LabDatabase): Promise<LicenseInfo> {
  const installationId = getOrCreateInstallationId()
  let license = db.license || createDefaultLicenseInfo(installationId)

  // Ensure installationId is attached
  if (!license.installationId) {
    license = { ...license, installationId }
  }

  // Handle legacy status conversion if present
  if (license.status === "licensed") {
    license.status = "ACTIVE"
  } else if (license.status === "unlicensed") {
    license.status = "NOT_ACTIVATED"
  }

  // Verify tamper-evident signature if activated
  if (license.status === "ACTIVE" || license.status === "OFFLINE_GRACE" || license.status === "EXPIRING_SOON") {
    const isTamperFree = await isLocalLicenseSignatureValid(license, installationId)
    if (!isTamperFree && license.signature) {
      // Signature mismatch -> Tampering detected
      license = {
        ...license,
        status: "VERIFICATION_ERROR",
        deactivationReason: "Local license state signature verification failed.",
      }
      return license
    }
  }

  // If not activated, return as is
  if (license.status === "NOT_ACTIVATED" || !license.licenseId) {
    return license
  }

  // Check if a cloud check is due
  const lastCheck = license.lastCheckInAt ? new Date(license.lastCheckInAt).getTime() : 0
  const isDue = Date.now() - lastCheck >= CHECK_INTERVAL_MS || !license.lastCheckInAt

  if (isDue) {
    const checkResult = await checkLicenseStatusOnline(license.licenseId, installationId)

    if (checkResult.ok) {
      license = await applyCloudCheckResult(license, checkResult, installationId)
    } else {
      license = await applyOfflineResult(license, installationId)
    }
  }

  // Deliberately outside the 24-hour throttle: an install upgrading from a build
  // that had no seat reservation must not have to wait a day to register.
  return await claimSeatForLegacyInstall(license, installationId)
}

export interface LicenseRefreshResult {
  license: LicenseInfo
  /** True only when the cloud actually answered. */
  contactedCloud: boolean
  error?: string
}

/**
 * Contacts the cloud immediately, ignoring the 24-hour throttle.
 *
 * The "Refresh license" button has to mean what it says. It previously reused
 * the scheduled boot check, so pressing it within a day of the last check
 * returned the cached ACTIVE state, reported "updated from cloud server" and let
 * a deactivated customer keep working.
 */
export async function refreshLicenseFromCloud(db: LabDatabase): Promise<LicenseRefreshResult> {
  const installationId = getOrCreateInstallationId()
  let license = db.license || createDefaultLicenseInfo(installationId)

  if (!license.installationId) license = { ...license, installationId }
  if (license.status === "licensed") license = { ...license, status: "ACTIVE" as LicenseStatus }
  if (license.status === "unlicensed") license = { ...license, status: "NOT_ACTIVATED" as LicenseStatus }

  if (license.status === "NOT_ACTIVATED" || !license.licenseId) {
    return {
      license,
      contactedCloud: false,
      error: "This installation has no activated license key, so there is nothing to refresh from the cloud.",
    }
  }

  const checkResult = await checkLicenseStatusOnline(license.licenseId, installationId)

  if (checkResult.ok) {
    const checked = await applyCloudCheckResult(license, checkResult, installationId)
    return {
      license: await claimSeatForLegacyInstall(checked, installationId),
      contactedCloud: true,
    }
  }

  return {
    license: await applyOfflineResult(license, installationId),
    contactedCloud: false,
    error: checkResult.error || "The cloud server could not be reached, so the license status is unconfirmed.",
  }
}

/**
 * Activates a license key for this installation.
 */
export async function activateCommercialLicense(
  key: string,
  db: LabDatabase,
): Promise<{ ok: boolean; message?: string; error?: string; license?: LicenseInfo }> {
  const installationId = getOrCreateInstallationId()
  const labName = db.profile.name || "Diagnostic Laboratory"

  const result = await activateLicenseOnline(key, installationId, labName)

  if (!result.ok) {
    return { ok: false, error: result.error, message: result.error }
  }

  const nowIso = new Date().toISOString()
  const newLicense: LicenseInfo = {
    status: "ACTIVE",
    licenseId: result.licenseId,
    licenseKeyMasked: result.licenseKeyMasked || maskLicenseKey(key),
    customerId: result.customerId,
    customerName: result.customerName,
    licensedTo: result.laboratoryName || result.customerName,
    plan: result.plan,
    issuedAt: result.serverTime || nowIso,
    activatedAt: result.serverTime || nowIso,
    expiresAt: result.expiresAt,
    lastCheckInAt: result.serverTime || nowIso,
    serverTimeAtCheck: result.serverTime || nowIso,
    graceUntil: result.graceUntil || calculateGraceUntil(result.serverTime || nowIso),
    maxInstallations: result.maxInstallations || 1,
    installationId,
    signature: "",
    seatLimit: result.maxInstallations || 1,
    seatClaimedAt: nowIso,
    features: ["patient_management", "test_reporting", "billing_receipts", "thermal_printing"],
  }

  newLicense.signature = await computeLicenseSignature(newLicense, installationId)

  return {
    ok: true,
    message: result.message || "LabDesk license successfully activated.",
    license: newLicense,
  }
}

/**
 * Determines if normal laboratory operations are permitted under the current license.
 */
export function isLicenseOperatingAllowed(license?: LicenseInfo): boolean {
  if (!license) return false
  const s = license.status
  return (
    s === "ACTIVE" ||
    s === "OFFLINE_GRACE" ||
    s === "EXPIRING_SOON" ||
    s === "licensed" ||
    s === "trial"
  )
}

/**
 * Generates a customer-facing summary of the current license state.
 */
export function summarizeCommercialLicense(db: LabDatabase): LicenseSummary {
  const installationId = getOrCreateInstallationId()
  const license = db.license || createDefaultLicenseInfo(installationId)
  const status = license.status || "NOT_ACTIVATED"
  const allowed = isLicenseOperatingAllowed(license)

  const labels: Record<LicenseStatus, string> = {
    ACTIVE: "Active",
    OFFLINE_GRACE: "Active (Offline Mode)",
    EXPIRING_SOON: "Expiring Soon",
    EXPIRED: "Expired",
    SUSPENDED: "Suspended",
    DEACTIVATED: "Deactivated",
    REVOKED: "Revoked",
    NOT_ACTIVATED: "Not Activated",
    ACTIVATING: "Activating...",
    VERIFICATION_ERROR: "Verification Required",
    licensed: "Active",
    unlicensed: "Not Activated",
    trial: "Trial",
  }

  const details: Record<LicenseStatus, string> = {
    ACTIVE: `Licensed to ${license.licensedTo || "this laboratory"}. Full commercial edition active.`,
    OFFLINE_GRACE: `License active in offline grace mode. License verification will retry when internet is available.`,
    EXPIRING_SOON: `Your LabDesk license will expire on ${formatDisplayDate(license.expiresAt)}. Please contact your software provider to renew.`,
    EXPIRED: `Your LabDesk license expired on ${formatDisplayDate(license.expiresAt)}. Please contact your software provider to renew.`,
    SUSPENDED: `Your LabDesk license has been temporarily suspended by the software provider.`,
    DEACTIVATED: `Your LabDesk license has been deactivated by the software provider. ${license.deactivationReason ? "Reason: " + license.deactivationReason : ""}`,
    REVOKED: `Your LabDesk license has been revoked. Please contact your software provider.`,
    NOT_ACTIVATED: `This installation requires a valid LabDesk commercial license key.`,
    ACTIVATING: `Connecting to Firebase cloud server for activation...`,
    VERIFICATION_ERROR: license.deactivationReason || `License verification is required. Please connect to the internet to check license status.`,
    licensed: `Licensed to ${license.licensedTo || "this laboratory"}.`,
    unlicensed: `This installation requires a valid LabDesk commercial license key.`,
    trial: `This installation is running in trial mode.`,
  }

  return {
    status,
    label: labels[status] || "Unknown",
    licenseId: license.licenseId || "—",
    licenseKeyMasked: license.licenseKeyMasked || "—",
    customerId: license.customerId || "—",
    licensedTo: license.licensedTo || db.profile.name || "—",
    plan: license.plan || "PROFESSIONAL",
    expiresAt: license.expiresAt ? formatDisplayDate(license.expiresAt) : "—",
    lastCheckInAt: license.lastCheckInAt ? formatDisplayDateTime(license.lastCheckInAt) : "—",
    graceUntil: license.graceUntil ? formatDisplayDate(license.graceUntil) : "—",
    installationId: license.installationId || installationId,
    isOperatingAllowed: allowed,
    detail: details[status] || "License verification required.",
  }
}

function formatDisplayDate(isoString: string): string {
  if (!isoString) return "—"
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return isoString
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  } catch {
    return isoString
  }
}

function formatDisplayDateTime(isoString: string): string {
  if (!isoString) return "—"
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return isoString
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return isoString
  }
}
