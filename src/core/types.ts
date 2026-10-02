/**
 * Domain and configuration types for the laboratory application.
 *
 * Nothing in this file contains customer data. The laboratory identity, its
 * branding, its tests, its prices, its doctors and its staff are all data that
 * a customer configures at run time (see `defaults.ts` for empty defaults).
 */

/* -------------------------------------------------------------------------- */
/* Installation boundary                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Identifies one installation of the software.
 *
 * In this offline edition a single installation represents a single
 * laboratory, and `id` is the tenant key. A future multi-tenant edition keeps
 * this same value as a column on every record and scopes every query by it, so
 * the core modules do not change.
 */
export type InstallationInfo = {
  /** Tenant key. Unique per installation. */
  id: string
  /** Human-readable installation code, shown on the About screen. */
  code: string
  /** This edition keeps real laboratory records only. */
  mode: InstallationMode
  createdAt: string
  lastOpenedAt: string
}

export type InstallationMode = "production"

/* -------------------------------------------------------------------------- */
/* Customer configuration                                                      */
/* -------------------------------------------------------------------------- */

export type LaboratoryTypeOption =
  | "Diagnostic Laboratory"
  | "Pathology Laboratory"
  | "Medical Laboratory"
  | "Hospital Laboratory"
  | "Diagnostic Center"
  | "Clinical Laboratory"
  | "Reference Laboratory"
  | "Other"

/** The laboratory's own identity. Configured by the customer, never by us. */
export type LaboratoryProfile = {
  id: string
  name: string
  shortName: string
  tagline: string
  type: LaboratoryTypeOption | ""
  licenseNumber: string
  taxNumber: string
  address: string
  city: string
  province: string
  country: string
  phone: string
  phone2: string
  whatsapp: string
  email: string
  website: string
  /** Data URL or object URL of the uploaded logo. Empty means "use the product mark". */
  logo: string
  /** Prefixes for generated record numbers, e.g. patient `LAB-0001`. */
  idPrefixes: {
    patient: string
    report: string
    sample: string
  }
  createdAt: string
  updatedAt: string
}

/** Where the logo and laboratory name are shown inside the application. */
export type BrandingPlacement = "off" | "header" | "everywhere"

export type BrandingSettings = {
  /** Logo visibility inside the application chrome. */
  showLogoInApp: BrandingPlacement
  /** Laboratory name visibility inside the application chrome. */
  showNameInApp: BrandingPlacement
  /** Print the product name under the laboratory name, e.g. "Powered by LabDesk". */
  showProductNameInApp: boolean
  /** Print the product name on reports and receipts. */
  showProductNameOnPrint: boolean
  /** Print the vendor credit on reports and receipts. Off by default. */
  showVendorCreditOnPrint: boolean
  /** Accent colour used by reports, receipts and print headers. */
  accentColor: string
}

export type HeaderAlignment = "left" | "center" | "right"

export type SignatureSlot = "technician" | "verifiedBy" | "pathologist" | "director"

/** Configurable A4 report output. */
export type ReportSettings = {
  documentTitle: string
  documentSubtitle: string
  headerAlignment: HeaderAlignment
  showLogo: boolean
  showLaboratoryName: boolean
  showTagline: boolean
  showAddress: boolean
  showPhone: boolean
  showEmail: boolean
  showWebsite: boolean
  showLicenseNumber: boolean
  showTaxNumber: boolean
  showPatientQr: boolean
  showReportFooter: boolean
  footerText: string
  disclaimer: string
  notesLabel: string
  signatureLabels: Record<SignatureSlot, string>
  showSignatures: SignatureSlot[]
  resultColumns: {
    parameter: boolean
    result: boolean
    unit: boolean
    referenceRange: boolean
    flag: boolean
  }
}

export type ReceiptPaperWidth = "58mm" | "80mm"

/** Configurable thermal receipt output. */
export type ReceiptSettings = {
  showLogo: boolean
  showLaboratoryName: boolean
  showTagline: boolean
  showAddress: boolean
  showPhone: boolean
  showWhatsapp: boolean
  showLicenseNumber: boolean
  showTests: boolean
  showPaymentSummary: boolean
  showPaymentMethod: boolean
  showBarcode: boolean
  showExpectedReport: boolean
  collectionInstructions: string
  showThankYou: boolean
  thankYouText: string
  footerText: string
  /** Receipts usually print the vendor credit only when the owner asks for it. */
  showVendorCredit: boolean
}

export type PrinterSettings = {
  receiptPaper: ReceiptPaperWidth
  reportPaper: "A4" | "Letter"
  reportScale: number
  reportCopies: number
  receiptCopies: number
  /** Thermal/receipt printer. Empty means the operating system default. */
  thermalPrinterName: string
  /** A4 report printer. Empty means the operating system default. */
  reportPrinterName: string
}

export type TestSettings = {
  categories: string[]
  sampleTypes: string[]
  defaultCategory: string
  allowDiscount: boolean
  maxDiscountPercent: number
  defaultTurnaroundHours: number
  /** Reference range defaults applied to newly created parameters. */
  defaultReferenceRange: string
}

export type PaymentSettings = {
  currencyCode: string
  currencySymbol: string
  /** Symbol placed before the amount, e.g. "Rs." */
  currencyPosition: "prefix" | "suffix"
  paymentMethods: string[]
  allowPartialPayment: boolean
  taxPercent: number
}

export type SecuritySettings = {
  minimumPasswordLength: number
  requireMixedCharacterPassword: boolean
  /** 0 disables automatic sign-out. */
  autoLockMinutes: number
  allowPasswordChange: boolean
  logFailedLogins: boolean
}

export type BackupSettings = {
  /** Keep a local snapshot of the database whenever records change. */
  autoSnapshot: boolean
  lastSnapshotAt: string
  lastExportAt: string
}

/* -------------------------------------------------------------------------- */
/* Licensing abstraction                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Licensing information.
 *
 * The offline edition reports `unlicensed` and works normally — there is no
 * online activation, no activation server and no update check. The type exists
 * so a future commercial edition can add licensing without touching the
 * laboratory, branding, report or receipt modules.
 */
export type LicenseStatus =
  | "NOT_ACTIVATED"
  | "ACTIVATING"
  | "ACTIVE"
  | "OFFLINE_GRACE"
  | "EXPIRING_SOON"
  | "EXPIRED"
  | "SUSPENDED"
  | "DEACTIVATED"
  | "REVOKED"
  | "VERIFICATION_ERROR"
  /* Legacy statuses for backwards compatibility */
  | "unlicensed"
  | "licensed"
  | "trial"

export type LicensePlan = "TRIAL" | "BASIC" | "PROFESSIONAL" | "ENTERPRISE"

export type LicenseInfo = {
  status: LicenseStatus
  licenseId: string
  licenseKeyMasked: string
  customerId: string
  customerName: string
  licensedTo: string
  plan: LicensePlan
  issuedAt: string
  activatedAt: string
  expiresAt: string
  lastCheckInAt: string
  serverTimeAtCheck: string
  graceUntil: string
  maxInstallations: number
  installationId: string
  signature: string
  deactivationReason?: string
  seatLimit: number
  features: string[]
  /**
   * When this installation first held a seat on the cloud license.
   *
   * Absent means it has never claimed one, which lets an installation that was
   * activated before seats existed register itself once. Present means the vendor
   * may have freed that seat deliberately, so it is never re-claimed silently and
   * the customer has to activate again.
   */
  seatClaimedAt?: string
}

export type LicenseSummary = {
  status: LicenseStatus
  label: string
  licenseId: string
  licenseKeyMasked: string
  customerId: string
  licensedTo: string
  plan: LicensePlan
  expiresAt: string
  lastCheckInAt: string
  graceUntil: string
  installationId: string
  isOperatingAllowed: boolean
  detail: string
}

export type CloudLicenseRecord = {
  licenseId: string
  licenseKeyHash: string
  licenseKeyMasked: string
  customerId: string
  customerName: string
  laboratoryName: string
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED" | "EXPIRED" | "REVOKED"
  plan: LicensePlan
  createdAt: string
  activatedAt?: string
  expiresAt: string
  lastCheckInAt?: string
  maxInstallations: number
  currentInstallations: number
  installationIds: string[]
  product: string
  notes?: string
  createdBy: string
  updatedAt: string
  deactivatedAt?: string
  deactivationReason?: string
}

export type CustomerRecord = {
  customerId: string
  laboratoryName: string
  contactPerson: string
  phone: string
  email: string
  address: string
  city: string
  country: string
  licenseId: string
  status: "ACTIVE" | "INACTIVE"
  createdAt: string
  updatedAt: string
  notes?: string
}

export type LicenseAuditLog = {
  logId: string
  action:
    | "LICENSE_CREATED"
    | "LICENSE_ACTIVATED"
    | "LICENSE_DEACTIVATED"
    | "LICENSE_REACTIVATED"
    | "LICENSE_SUSPENDED"
    | "LICENSE_REVOKED"
    | "LICENSE_EXTENDED"
    | "INSTALLATION_REMOVED"
  licenseId: string
  customerId: string
  developer: string
  timestamp: string
  reason?: string
  metadata?: Record<string, unknown>
}

/* -------------------------------------------------------------------------- */
/* Laboratory records                                                          */
/* -------------------------------------------------------------------------- */

export type StaffRole =
  | "Administrator"
  | "Receptionist"
  | "Technician"
  | "Pathologist"
  | "Accountant"

export type AccountStatus = "Active" | "Disabled"

/**
 * A staff account. Passwords are never stored in plain text — only a
 * PBKDF2 digest and its salt are persisted (see `password.ts`).
 */
export type StaffUser = {
  id: string
  name: string
  username: string
  role: StaffRole
  status: AccountStatus
  passwordHash: string
  passwordSalt: string
  mustChangePassword: boolean
  createdAt: string
  lastLoginAt: string
}

export type Doctor = {
  id: string
  name: string
  specialization: string
  phone: string
  clinic: string
  email: string
  active: boolean
  createdAt: string
}

export type TestParameter = {
  id: string
  name: string
  unit: string
  /** Display text, e.g. "12.0 - 16.0" or "70 - 110". */
  referenceRange: string
  /** Numeric low bound used for flagging. Null disables low flagging. */
  low: number | null
  /** Numeric high bound used for flagging. Null disables high flagging. */
  high: number | null
  criticalLow: number | null
  criticalHigh: number | null
  displayOrder: number
  active: boolean
}

export type ResultFlag = "Pending" | "Normal" | "Low" | "High" | "Critical" | "Positive" | "Negative"

/**
 * A test in this laboratory's catalog, including this laboratory's price.
 * Two laboratories running the same software can price CBC differently
 * without any code change.
 */
export type CatalogTest = {
  id: string
  code: string
  name: string
  category: string
  price: number
  sampleType: string
  container: string
  method: string
  active: boolean
  displayOrder: number
  turnaroundHours: number
  parameters: TestParameter[]
  createdAt: string
  updatedAt: string
}

export type ReportStatus = "Pending" | "Ready" | "Rejected"
export type SampleStatus = "Pending" | "Collected" | "Processing" | "Completed" | "Rejected"
export type PaymentState = "Paid" | "Partial" | "Unpaid"

export type Patient = {
  id: string
  reportId: string
  sampleId: string
  name: string
  age: string
  gender: string
  phone: string
  cnic: string
  bloodGroup: string
  address: string
  notes: string
  /** References a record in `doctors`, or empty for a walk-in patient. */
  doctorId: string
  /** Denormalised so historical reports stay correct after a doctor is renamed. */
  doctorName: string
  testCodes: string[]
  sampleType: string
  discount: number
  total: number
  paid: number
  paymentMethod: string
  reportStatus: ReportStatus
  sampleStatus: SampleStatus
  /** Parameter id to entered value. */
  results: Record<string, string>
  technicianNote: string
  collectedAt: string
  createdAt: string
  updatedAt: string
}

export type AuditEntry = {
  id: string
  time: string
  userId: string
  userName: string
  action: string
  record: string
  detail: string
}

/* -------------------------------------------------------------------------- */
/* Database root                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The complete persistent state of one installation.
 *
 * Customer identity, branding, report configuration, receipt configuration,
 * tests, prices, doctors, staff, patients, payments and audit history all live
 * here, so a single backup file can restore the laboratory exactly as it was.
 */
export type LabDatabase = {
  schemaVersion: number
  buildVersion: string
  installation: InstallationInfo
  setupCompleted: boolean
  profile: LaboratoryProfile
  branding: BrandingSettings
  reportSettings: ReportSettings
  receiptSettings: ReceiptSettings
  printerSettings: PrinterSettings
  testSettings: TestSettings
  paymentSettings: PaymentSettings
  securitySettings: SecuritySettings
  backupSettings: BackupSettings
  license: LicenseInfo
  users: StaffUser[]
  doctors: Doctor[]
  tests: CatalogTest[]
  patients: Patient[]
  audit: AuditEntry[]
  createdAt: string
  updatedAt: string
}

/** The user currently signed in to this installation. */
export type Session = {
  userId: string
  name: string
  username: string
  role: StaffRole
  signedInAt: string
}
