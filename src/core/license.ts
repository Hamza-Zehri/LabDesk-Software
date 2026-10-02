/**
 * Commercial Licensing Abstraction.
 *
 * Integrates commercial Firebase Cloud licensing with local offline laboratory operations.
 * Operational data remains 100% local; Firebase is used strictly for key activation,
 * status heartbeats, expiration checks, and developer remote deactivation/reactivation.
 */

import {
  activateCommercialLicense,
  initializeLicenseState,
  isLicenseOperatingAllowed,
  summarizeCommercialLicense,
} from "./licenseService"
import type { LabDatabase, LicenseInfo, LicenseSummary } from "./types"

export interface LicenseProvider {
  readonly id: string
  readonly name: string
  readonly requiresNetwork: boolean
  read(db: LabDatabase): LicenseInfo
  summarize(db: LabDatabase): LicenseSummary
  allows(db: LabDatabase, feature: string): boolean
}

export const cloudLicenseProvider: LicenseProvider = {
  id: "firebase-cloud",
  name: "Firebase Cloud Licensing",
  requiresNetwork: true,
  read: (db) => db.license,
  summarize: (db) => summarizeCommercialLicense(db),
  allows: (db) => isLicenseOperatingAllowed(db.license),
}

export const summarizeLicense = summarizeCommercialLicense
export const licenseAllows = (db: LabDatabase) => isLicenseOperatingAllowed(db.license)

export {
  activateCommercialLicense,
  initializeLicenseState,
  isLicenseOperatingAllowed,
  summarizeCommercialLicense,
}
