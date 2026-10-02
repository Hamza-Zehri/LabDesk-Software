/**
 * Pure record logic for patients, samples, results and payments.
 *
 * Everything here is a plain function over the domain types so the same rules
 * can be unit tested and reused by any front end. Nothing in this file reads
 * from storage or contains customer data.
 */

import type {
  CatalogTest,
  PaymentState,
  Patient,
  SampleStatus,
  TestParameter,
} from "./types"

/* -------------------------------------------------------------------------- */
/* Pricing                                                                     */
/* -------------------------------------------------------------------------- */

/** Sums the catalog price of every selected test code. */
export const subtotalFor = (tests: CatalogTest[], codes: string[]): number =>
  codes.reduce((sum, code) => sum + (tests.find((t) => t.code === code)?.price ?? 0), 0)

/**
 * Final payable amount. The discount can never exceed the subtotal, and a
 * laboratory that does not allow discounts always charges full price.
 */
export const totalFor = (subtotal: number, discount: number, allowDiscount: boolean): number => {
  if (!allowDiscount) return Math.max(0, subtotal)
  return Math.max(0, subtotal - Math.max(0, discount))
}

/** Clamps a recorded payment into the 0..total range. */
export const clampPaid = (paid: number, total: number): number =>
  Math.min(Math.max(0, Math.round(paid * 100) / 100), Math.max(0, total))

/* -------------------------------------------------------------------------- */
/* Payment state                                                               */
/* -------------------------------------------------------------------------- */

export const paymentStateOf = (patient: Pick<Patient, "total" | "paid">): PaymentState => {
  if (patient.paid >= patient.total) return "Paid"
  return patient.paid > 0 ? "Partial" : "Unpaid"
}

export const balanceOf = (patient: Pick<Patient, "total" | "paid">): number =>
  Math.max(0, Math.round((patient.total - patient.paid) * 100) / 100)

/**
 * Applies a new discount or price change to an existing patient.
 *
 * `codes` overrides the tests being priced, so a caller that is changing the
 * ordered tests prices the *new* selection instead of the stored one. Payments
 * are never reduced here: an overpaid patient keeps the money that was already
 * taken and simply shows a zero balance.
 */
export const reprice = (
  patient: Pick<Patient, "paid" | "testCodes">,
  tests: CatalogTest[],
  discount: number,
  allowDiscount: boolean,
  codes?: string[],
): Pick<Patient, "discount" | "total" | "paid"> => {
  const subtotal = subtotalFor(tests, codes ?? patient.testCodes)
  const applied = allowDiscount ? Math.max(0, discount) : 0
  const total = totalFor(subtotal, applied, allowDiscount)
  return {
    discount: applied,
    total,
    paid: Math.max(0, Math.round((Number.isFinite(patient.paid) ? patient.paid : 0) * 100) / 100),
  }
}

/* -------------------------------------------------------------------------- */
/* Sample lifecycle                                                            */
/* -------------------------------------------------------------------------- */

export const SAMPLE_ORDER: SampleStatus[] = [
  "Pending",
  "Collected",
  "Processing",
  "Completed",
]

/** The next step in the collection workflow, or null when it is finished. */
export const nextSampleStatus = (status: SampleStatus): SampleStatus | null => {
  const index = SAMPLE_ORDER.indexOf(status)
  if (index < 0 || index >= SAMPLE_ORDER.length - 1) return null
  return SAMPLE_ORDER[index + 1]
}

export const isSampleClosed = (status: SampleStatus): boolean =>
  status === "Completed" || status === "Rejected"

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

/** The parameters a technician must fill in for one test. */
export const requiredParameters = (test: CatalogTest | null | undefined): TestParameter[] =>
  (test?.parameters ?? [])
    .filter((parameter) => parameter.active)
    .sort((a, b) => a.displayOrder - b.displayOrder)

export const missingParameters = (
  patient: Pick<Patient, "results">,
  test: CatalogTest | null | undefined,
): TestParameter[] => requiredParameters(test).filter((parameter) => !patient.results[parameter.id]?.trim())

/** Every active parameter across every ordered test. */
export const allMissingParameters = (
  patient: Pick<Patient, "results" | "testCodes">,
  tests: CatalogTest[],
): { test: CatalogTest; parameters: TestParameter[] }[] =>
  patient.testCodes
    .map((code) => tests.find((t) => t.code === code))
    .filter((test): test is CatalogTest => Boolean(test))
    .map((test) => ({ test, parameters: missingParameters(patient, test) }))
    .filter((entry) => entry.parameters.length > 0)

export const canFinalize = (
  patient: Pick<Patient, "results" | "testCodes">,
  tests: CatalogTest[],
): boolean => allMissingParameters(patient, tests).length === 0

/** Percentage of required result fields that have a value, 0..100. */
export const resultProgress = (
  patient: Pick<Patient, "results" | "testCodes">,
  tests: CatalogTest[],
): number => {
  let total = 0
  let filled = 0
  for (const code of patient.testCodes) {
    for (const parameter of requiredParameters(tests.find((t) => t.code === code))) {
      total += 1
      if (patient.results[parameter.id]?.trim()) filled += 1
    }
  }
  return total === 0 ? 100 : Math.round((filled / total) * 100)
}

/** Removes stored values for parameters that no longer exist in the catalog. */
export const pruneResults = (
  results: Record<string, string>,
  tests: CatalogTest[],
  codes: string[],
): Record<string, string> => {
  const live = new Set(
    codes
      .map((code) => tests.find((t) => t.code === code))
      .flatMap((test) => requiredParameters(test))
      .map((parameter) => parameter.id),
  )
  return Object.fromEntries(Object.entries(results).filter(([id]) => live.has(id)))
}
