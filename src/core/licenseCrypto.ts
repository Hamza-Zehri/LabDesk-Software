/**
 * Cryptographic utilities for LabDesk Licensing.
 *
 * Provides tamper-evident signatures, key hashing, key masking, and key generation.
 */

import type { LicenseInfo } from "./types"

const LICENSE_SECRET_SALT = "LABDESK-SECURITY-SALT-v1-PROD-2026"

/**
 * Generates a SHA-256 hash of string input using Web Crypto API.
 */
export async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Masks a license key for customer display.
 * Example: "LDK-A1B2-C3D4-E5F6-7890" -> "LDK-****-****-****-7890"
 */
export function maskLicenseKey(key: string): string {
  const clean = key.trim().toUpperCase()
  if (!clean) return "—"
  const parts = clean.split("-")
  if (parts.length >= 4) {
    const lastPart = parts[parts.length - 1]
    return `${parts[0]}-****-****-****-${lastPart}`
  }
  return clean.slice(0, 4) + "****" + clean.slice(-4)
}

/**
 * Generates a new secure random license key format.
 * Example: "LDK-A9F2-3B7D-8E11-904C"
 */
export function generateRandomLicenseKey(): string {
  const randomChunk = () => Math.random().toString(36).substring(2, 6).toUpperCase()
  return `LDK-${randomChunk()}-${randomChunk()}-${randomChunk()}-${randomChunk()}`
}

/**
 * Generates a tamper-evident cryptographic signature for local license state.
 */
export async function computeLicenseSignature(
  license: Partial<LicenseInfo>,
  installationId: string,
): Promise<string> {
  const raw = [
    license.licenseId || "",
    license.status || "",
    license.customerId || "",
    license.licensedTo || "",
    license.expiresAt || "",
    license.lastCheckInAt || "",
    installationId,
    LICENSE_SECRET_SALT,
  ].join("|")

  return await sha256(raw)
}

/**
 * Validates whether local license state has been tampered with.
 */
export async function isLocalLicenseSignatureValid(
  license: LicenseInfo,
  installationId: string,
): Promise<boolean> {
  if (!license.signature) return false
  const expected = await computeLicenseSignature(license, installationId)
  return expected === license.signature
}
