/**
 * Shared test fixtures.
 *
 * Every fixture is deliberately synthetic. No real or demo customer data is
 * used in tests so a test failure can never leak a customer's identity.
 */

import {
  createEmptyDatabase,
  createInstallation,
  defaultPaymentSettings,
} from "./defaults"
import { createMemoryStorage } from "./storage"
import type { AuditEntry, CatalogTest, LabDatabase, Patient, StaffUser, TestParameter } from "./types"

export const auditEntry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  id: overrides.id ?? "aud_1",
  time: overrides.time ?? "2026-01-01T09:00:00.000Z",
  userId: overrides.userId ?? "usr_1",
  userName: overrides.userName ?? "Reception",
  action: overrides.action ?? "Patient Created",
  record: overrides.record ?? "LAB-0001",
  detail: overrides.detail ?? "Walk-in",
})

/**
 * `low`/`high`/`criticalLow`/`criticalHigh` are nullable on purpose, so a
 * fixture that means "no bound" has to pass `null` explicitly. Using `??`
 * here would silently turn an explicit `null` back into the default bound.
 */
const pick = <T, K extends keyof T>(overrides: Partial<T>, key: K, fallback: T[K]): T[K] =>
  key in overrides ? (overrides[key] as T[K]) : fallback

export const parameter = (overrides: Partial<TestParameter> = {}): TestParameter => ({
  id: pick(overrides, "id", "prm_1"),
  name: pick(overrides, "name", "Haemoglobin"),
  unit: pick(overrides, "unit", "g/dL"),
  referenceRange: pick(overrides, "referenceRange", "12.0 - 16.0"),
  low: pick(overrides, "low", 12),
  high: pick(overrides, "high", 16),
  criticalLow: pick(overrides, "criticalLow", null),
  criticalHigh: pick(overrides, "criticalHigh", null),
  displayOrder: pick(overrides, "displayOrder", 0),
  active: pick(overrides, "active", true),
})

export const catalogTest = (overrides: Partial<CatalogTest> = {}): CatalogTest => ({
  id: overrides.id ?? "tst_1",
  code: overrides.code ?? "CBC",
  name: overrides.name ?? "Complete Blood Count",
  category: overrides.category ?? "Hematology",
  price: overrides.price ?? 1500,
  sampleType: overrides.sampleType ?? "Blood",
  container: overrides.container ?? "EDTA tube",
  method: overrides.method ?? "Automated analyser",
  active: overrides.active ?? true,
  displayOrder: overrides.displayOrder ?? 0,
  turnaroundHours: overrides.turnaroundHours ?? 24,
  parameters: overrides.parameters ?? [parameter()],
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
})

export const patient = (overrides: Partial<Patient> = {}): Patient => ({
  id: overrides.id ?? "LAB-0001",
  reportId: overrides.reportId ?? "RPT-0001",
  sampleId: overrides.sampleId ?? "SMP-0001",
  name: overrides.name ?? "Sample Patient",
  age: overrides.age ?? "35",
  gender: overrides.gender ?? "Female",
  phone: overrides.phone ?? "03000000000",
  cnic: overrides.cnic ?? "",
  bloodGroup: overrides.bloodGroup ?? "",
  address: overrides.address ?? "",
  notes: overrides.notes ?? "",
  doctorId: overrides.doctorId ?? "",
  doctorName: overrides.doctorName ?? "Walk-in",
  testCodes: overrides.testCodes ?? ["CBC"],
  sampleType: overrides.sampleType ?? "Blood",
  discount: overrides.discount ?? 0,
  total: overrides.total ?? 1500,
  paid: overrides.paid ?? 0,
  paymentMethod: overrides.paymentMethod ?? "Cash",
  reportStatus: overrides.reportStatus ?? "Pending",
  sampleStatus: overrides.sampleStatus ?? "Pending",
  results: overrides.results ?? {},
  technicianNote: overrides.technicianNote ?? "",
  collectedAt: overrides.collectedAt ?? "2026-01-01T09:00:00.000Z",
  createdAt: overrides.createdAt ?? "2026-01-01T09:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-01-01T09:00:00.000Z",
})

/**
 * A staff account. The password fields are inert placeholders: `passwordHash`
 * and `passwordSalt` are only ever produced by `hashPassword`, and no test here
 * needs to authenticate, only to occupy a role.
 */
export const staffUser = (overrides: Partial<StaffUser> = {}): StaffUser => ({
  id: overrides.id ?? "usr_1",
  name: overrides.name ?? "Nadia Rehman",
  username: overrides.username ?? "nadia",
  role: overrides.role ?? "Technician",
  status: overrides.status ?? "Active",
  passwordHash: overrides.passwordHash ?? "test-hash",
  passwordSalt: overrides.passwordSalt ?? "test-salt",
  mustChangePassword: overrides.mustChangePassword ?? false,
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  lastLoginAt: overrides.lastLoginAt ?? "",
})

/** A configured, setup-complete database for a fictional laboratory. */
export const configuredDatabase = (overrides: Partial<LabDatabase> = {}): LabDatabase => {
  const base = createEmptyDatabase(createInstallation("production"))
  return {
    ...base,
    setupCompleted: true,
    profile: {
      ...base.profile,
      name: "Northside Diagnostics",
      shortName: "Northside",
      tagline: "Accurate results, faster decisions",
      type: "Diagnostic Laboratory",
      licenseNumber: "DL-99887",
      address: "12 Market Road",
      city: "Springfield",
      province: "",
      country: "Country",
      phone: "03001234567",
      email: "hello@northside.test",
      website: "northside.test",
      idPrefixes: { patient: "NSD", report: "NDR", sample: "NSM" },
    },
    reportSettings: {
      ...base.reportSettings,
      // Deliberately name-free. A disclaimer is free text the customer owns, so
      // it is never rewritten on rename; see `printOutput.test.ts`.
      disclaimer: "This is an accredited medical laboratory.",
    },
    ...overrides,
  }
}

export const paymentSettings = (overrides: Partial<ReturnType<typeof defaultPaymentSettings>> = {}) => ({
  ...defaultPaymentSettings(),
  ...overrides,
})

export const memory = () => createMemoryStorage()
