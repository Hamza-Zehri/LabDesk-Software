/**
 * Empty, customer-neutral defaults.
 *
 * Every value here is a blank or a product-level default. No laboratory name,
 * address, phone number, price, doctor or test name from any real or demo
 * customer is present in this file.
 */

import { PRODUCT_VERSION, STORAGE_NAMESPACE, STORAGE_SEPARATOR } from "./product"
import type {
  BackupSettings,
  BrandingSettings,
  CatalogTest,
  Doctor,
  InstallationInfo,
  LabDatabase,
  LaboratoryProfile,
  LicenseInfo,
  Patient,
  PaymentSettings,
  PrinterSettings,
  ReportSettings,
  ReceiptSettings,
  SecuritySettings,
  StaffUser,
  TestSettings,
  AuditEntry,
} from "./types"

/** Bumped whenever the persisted shape changes. See `migrate.ts`. */
export const SCHEMA_VERSION = 1

export const now = () => new Date().toISOString()

/**
 * Identifier helpers. Kept dependency-free so the core layer can be reused by
 * a future desktop build that swaps the storage adapter.
 */
export function createId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  return `${prefix}_${random}`
}

export function createInstallationCode(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()
      : Math.random().toString(36).slice(2, 8).toUpperCase()
  return `INST-${random}`
}

/* -------------------------------------------------------------------------- */
/* Blank profile                                                               */
/* -------------------------------------------------------------------------- */

export const createEmptyProfile = (): LaboratoryProfile => {
  const timestamp = now()
  return {
    id: createId("lab"),
    name: "",
    shortName: "",
    tagline: "",
    type: "",
    licenseNumber: "",
    taxNumber: "",
    address: "",
    city: "",
    province: "",
    country: "",
    phone: "",
    phone2: "",
    whatsapp: "",
    email: "",
    website: "",
    logo: "",
    idPrefixes: { patient: "LAB", report: "RPT", sample: "SMP" },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

/* -------------------------------------------------------------------------- */
/* Product-level defaults                                                      */
/* -------------------------------------------------------------------------- */

export const defaultBranding = (): BrandingSettings => ({
  showLogoInApp: "everywhere",
  showNameInApp: "everywhere",
  showProductNameInApp: false,
  showProductNameOnPrint: false,
  showVendorCreditOnPrint: false,
  accentColor: "#0f766e",
})

export const defaultReportSettings = (): ReportSettings => ({
  documentTitle: "Laboratory Report",
  documentSubtitle: "Diagnostic Test Results",
  headerAlignment: "left",
  showLogo: true,
  showLaboratoryName: true,
  showTagline: true,
  showAddress: true,
  showPhone: true,
  showEmail: true,
  showWebsite: false,
  showLicenseNumber: false,
  showTaxNumber: false,
  showPatientQr: true,
  showReportFooter: true,
  footerText: "Computer generated report. No signature required.",
  disclaimer:
    "Results should be interpreted in the context of clinical findings. Please consult your physician for medical advice.",
  notesLabel: "Notes",
  signatureLabels: {
    technician: "Lab Technician",
    verifiedBy: "Verified By",
    pathologist: "Pathologist",
    director: "Director",
  },
  showSignatures: ["technician", "verifiedBy"],
  resultColumns: {
    parameter: true,
    result: true,
    unit: true,
    referenceRange: true,
    flag: true,
  },
})

export const defaultReceiptSettings = (): ReceiptSettings => ({
  showLogo: true,
  showLaboratoryName: true,
  showTagline: true,
  showAddress: true,
  showPhone: true,
  showWhatsapp: false,
  showLicenseNumber: false,
  showTests: true,
  showPaymentSummary: true,
  showPaymentMethod: true,
  showBarcode: true,
  showExpectedReport: true,
  collectionInstructions:
    "Please bring this receipt when collecting your report.",
  showThankYou: true,
  thankYouText: "Thank you for choosing {{laboratoryName}}",
  footerText: "",
  showVendorCredit: false,
})

export const defaultPrinterSettings = (): PrinterSettings => ({
  receiptPaper: "80mm",
  reportPaper: "A4",
  reportScale: 100,
  reportCopies: 1,
  receiptCopies: 1,
  thermalPrinterName: "",
  reportPrinterName: "",
})

export const defaultTestSettings = (): TestSettings => ({
  categories: [
    "Hematology",
    "Biochemistry",
    "Liver",
    "Kidney",
    "Diabetes",
    "Lipid",
    "Hormones",
    "Serology",
    "Urine",
    "Microbiology",
    "Immunology",
    "Other",
  ],
  sampleTypes: ["Blood", "Urine", "Stool", "Sputum", "Swab", "Serum", "Plasma", "Other"],
  defaultCategory: "Hematology",
  allowDiscount: true,
  maxDiscountPercent: 100,
  defaultTurnaroundHours: 24,
  defaultReferenceRange: "",
})

export const defaultPaymentSettings = (): PaymentSettings => ({
  currencyCode: "PKR",
  currencySymbol: "Rs.",
  currencyPosition: "prefix",
  paymentMethods: ["Cash", "Card", "Bank Transfer", "Mobile Wallet", "Other"],
  allowPartialPayment: true,
  taxPercent: 0,
})

export const defaultSecuritySettings = (): SecuritySettings => ({
  minimumPasswordLength: 8,
  requireMixedCharacterPassword: true,
  autoLockMinutes: 0,
  allowPasswordChange: true,
  logFailedLogins: true,
})

export const defaultBackupSettings = (): BackupSettings => ({
  autoSnapshot: true,
  lastSnapshotAt: "",
  lastExportAt: "",
})

import { createDefaultLicenseInfo } from "./licenseService"

export const defaultLicense = (): LicenseInfo => createDefaultLicenseInfo()

/* -------------------------------------------------------------------------- */
/* Empty collections                                                           */
/* -------------------------------------------------------------------------- */

export const emptyTests = (): CatalogTest[] => []
export const emptyDoctors = (): Doctor[] => []
export const emptyUsers = (): StaffUser[] => []
export const emptyPatients = (): Patient[] => []
export const emptyAudit = (): AuditEntry[] => []

/* -------------------------------------------------------------------------- */
/* Fresh database                                                              */
/* -------------------------------------------------------------------------- */

export const createInstallation = (mode: InstallationInfo["mode"] = "production"): InstallationInfo => {
  const timestamp = now()
  return {
    id: createId("inst"),
    code: createInstallationCode(),
    mode,
    createdAt: timestamp,
    lastOpenedAt: timestamp,
  }
}

/**
 * A brand new, unconfigured installation. `setupCompleted` is false, so the
 * application shows the first-run setup wizard instead of a dashboard.
 */
export const createEmptyDatabase = (
  installation: InstallationInfo = createInstallation("production"),
): LabDatabase => {
  const timestamp = now()
  return {
    schemaVersion: SCHEMA_VERSION,
    buildVersion: PRODUCT_VERSION,
    installation,
    setupCompleted: false,
    profile: createEmptyProfile(),
    branding: defaultBranding(),
    reportSettings: defaultReportSettings(),
    receiptSettings: defaultReceiptSettings(),
    printerSettings: defaultPrinterSettings(),
    testSettings: defaultTestSettings(),
    paymentSettings: defaultPaymentSettings(),
    securitySettings: defaultSecuritySettings(),
    backupSettings: defaultBackupSettings(),
    license: defaultLicense(),
    users: emptyUsers(),
    doctors: emptyDoctors(),
    tests: emptyTests(),
    patients: emptyPatients(),
    audit: emptyAudit(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

/* -------------------------------------------------------------------------- */
/* Storage keys                                                                */
/* -------------------------------------------------------------------------- */

export const storageKey = (installationId: string, kind: string) =>
  `${STORAGE_NAMESPACE}${STORAGE_SEPARATOR}${installationId}${STORAGE_SEPARATOR}${kind}`

/** Key holding the id of the installation on this device. */
export const ACTIVE_INSTALLATION_KEY = `${STORAGE_NAMESPACE}${STORAGE_SEPARATOR}active-installation`

export const KINDS = {
  database: "database",
  snapshot: "snapshot",
  lastBackup: "last-backup",
} as const
