/**
 * Printed output acceptance tests.
 *
 * The report and the thermal receipt are the only artefacts a customer ever
 * physically hands to a patient, so they are the most visible surface of the
 * white-label work. These tests pin down that a renamed laboratory's own words
 * and identity are what appear on paper, that the software's name does not leak
 * in unless the customer opted in, and that the money on the receipt is
 * arithmetically honest.
 *
 * The models are pure functions, so none of this needs a browser.
 */

import { describe, expect, it } from "vitest"

import { PRODUCT_NAME, VENDOR } from "../core/product"
import { catalogTest, configuredDatabase, parameter, patient, staffUser } from "../core/testFixtures"
import type { LabDatabase } from "../core/types"
import { buildReceiptModel } from "./receiptModel"
import { buildReportModel, reportSummary } from "./reportModel"

const options = {
  productName: PRODUCT_NAME,
  vendorCredit: VENDOR.credit,
  vendorWebsite: VENDOR.website,
}

const receiptOptions = { vendorCredit: VENDOR.credit, vendorWebsite: VENDOR.website }

const cbc = catalogTest({
  code: "CBC",
  name: "Complete Blood Count",
  price: 1500,
  turnaroundHours: 24,
  parameters: [
    parameter({ id: "prm_hb", name: "Haemoglobin", low: 12, high: 16, displayOrder: 0 }),
    parameter({ id: "prm_wbc", name: "Total Leucocytes", low: 4, high: 11, displayOrder: 1 }),
    parameter({ id: "prm_old", name: "Retired Analyte", active: false, displayOrder: 2 }),
  ],
})

const lft = catalogTest({ id: "tst_2", code: "LFT", name: "Liver Function Tests", price: 2500, turnaroundHours: 48 })

const db = (overrides: Partial<LabDatabase> = {}): LabDatabase =>
  configuredDatabase({
    tests: [cbc, lft],
    users: [
      staffUser(),
      staffUser({ id: "usr_path", name: "Dr Omar Siddiqui", role: "Pathologist" }),
      staffUser({ id: "usr_off", name: "Retired User", role: "Technician", status: "Disabled" }),
    ],
    ...overrides,
  })

describe("report model", () => {
  it("prints the laboratory's own identity", () => {
    const model = buildReportModel(db(), patient({ reportStatus: "Ready" }), options)

    expect(model.laboratoryName).toBe("Northside Diagnostics")
    expect(model.tagline).toBe("Accurate results, faster decisions")
    expect(model.addressLines.join(" ")).toContain("12 Market Road")
    expect(model.phoneLine).toContain("03001234567")
  })

  it("does not print the software name when the customer has not opted in", () => {
    const model = buildReportModel(db(), patient(), options)

    // The model carries the product name so the document can decide, but the
    // display switch must default to off for a customer-owned document.
    expect(model.showProductName).toBe(false)
    expect(model.showVendorCredit).toBe(false)

    const printable = [
      model.laboratoryName,
      model.documentTitle,
      model.documentSubtitle,
      model.disclaimer,
      model.footerText,
    ].join(" ")

    expect(printable).not.toContain(PRODUCT_NAME)
    expect(printable).not.toContain(VENDOR.credit)
  })

  it("surfaces the opt-in switches so an opted-in customer sees the credit", () => {
    const model = buildReportModel(
      db({
        branding: {
          ...configuredDatabase().branding,
          showProductNameOnPrint: true,
          showVendorCreditOnPrint: true,
        },
      }),
      patient(),
      options,
    )

    expect(model.showProductName).toBe(true)
    expect(model.showVendorCredit).toBe(true)
    expect(model.productName).toBe(PRODUCT_NAME)
    expect(model.vendorCredit).toBe(VENDOR.credit)
  })

  it("resolves laboratory tokens in the disclaimer and footer", () => {
    const model = buildReportModel(
      db({
        reportSettings: {
          ...configuredDatabase().reportSettings,
          disclaimer: "{{laboratoryName}} is an accredited laboratory in {{city}}.",
          footerText: "Call {{phone}} or email {{email}}.",
        },
      }),
      patient(),
      options,
    )

    expect(model.disclaimer).toBe("Northside Diagnostics is an accredited laboratory in Springfield.")
    expect(model.footerText).toBe("Call 03001234567 or email hello@northside.test.")
    expect(model.disclaimer).not.toContain("{{")
  })

  it("follows a laboratory rename on printed output", () => {
    const renamed = db({
      profile: { ...configuredDatabase().profile, name: "Riverside Path Lab", city: "Lakeside" },
      reportSettings: {
        ...configuredDatabase().reportSettings,
        footerText: "Issued by {{laboratoryName}}.",
      },
    })

    const model = buildReportModel(renamed, patient(), options)

    expect(model.laboratoryName).toBe("Riverside Path Lab")
    expect(model.footerText).toBe("Issued by Riverside Path Lab.")
    expect(JSON.stringify(model)).not.toContain("Northside")
  })

  it("does not rewrite the customer's own free text on rename", () => {
    // A laboratory that typed its old name into the disclaimer keeps it: the
    // app cannot guess which words were meant as identity and which as prose.
    // Pinned here so a future "helpful" find-and-replace is a deliberate change.
    const renamed = db({
      profile: { ...configuredDatabase().profile, name: "Riverside Path Lab" },
      reportSettings: {
        ...configuredDatabase().reportSettings,
        disclaimer: "Northside Diagnostics is an accredited laboratory.",
      },
    })

    const model = buildReportModel(renamed, patient(), options)
    expect(model.disclaimer).toBe("Northside Diagnostics is an accredited laboratory.")
  })

  it("keeps an unknown token instead of printing a blank space", () => {
    const model = buildReportModel(
      db({
        reportSettings: {
          ...configuredDatabase().reportSettings,
          footerText: "Reference scheme {{notAField}} applies.",
        },
      }),
      patient(),
      options,
    )

    expect(model.footerText).toBe("Reference scheme {{notAField}} applies.")
  })

  it("lists parameters in display order and drops retired ones", () => {
    const model = buildReportModel(
      db(),
      patient({ testCodes: ["CBC"], results: { prm_hb: "13.4", prm_wbc: "7.1" } }),
      options,
    )

    expect(model.sections).toHaveLength(1)
    expect(model.sections[0].parameters.map((row) => row.parameter.name)).toEqual([
      "Haemoglobin",
      "Total Leucocytes",
    ])
    expect(model.sections[0].hasResults).toBe(true)
  })

  it("flags results against the laboratory's own reference ranges", () => {
    const model = buildReportModel(
      db(),
      patient({ testCodes: ["CBC"], results: { prm_hb: "9.1", prm_wbc: "7.1" } }),
      options,
    )

    const rows = model.sections[0].parameters
    expect(rows.find((r) => r.parameter.name === "Haemoglobin")?.flag).toBe("Low")
    expect(rows.find((r) => r.parameter.name === "Total Leucocytes")?.flag).toBe("Normal")
  })

  it("reports a section with no results rather than pretending it is complete", () => {
    const model = buildReportModel(db(), patient({ testCodes: ["CBC"], results: {} }), options)

    expect(model.sections[0].hasResults).toBe(false)
    expect(model.sections[0].parameters[0].value).toBe("")
    expect(reportSummary(model)).toMatchObject({ total: 2, entered: 0, flagged: [] })
  })

  it("summarises entered and flagged parameters across every test", () => {
    const model = buildReportModel(
      db(),
      patient({ testCodes: ["CBC", "LFT"], results: { prm_hb: "13.4", prm_wbc: "18.0" } }),
      options,
    )

    const summary = reportSummary(model)
    expect(summary.total).toBe(3)
    expect(summary.entered).toBe(2)
    expect(summary.flagged.map((row) => row.parameter.name)).toEqual(["Total Leucocytes"])
  })

  it("skips a test code that is no longer in the catalog instead of crashing", () => {
    const model = buildReportModel(
      db(),
      patient({ testCodes: ["CBC", "REMOVED_TEST"] }),
      options,
    )

    expect(model.sections.map((s) => s.test.code)).toEqual(["CBC"])
  })

  it("signs from active staff only", () => {
    const model = buildReportModel(
      db({
        reportSettings: {
          ...configuredDatabase().reportSettings,
          showSignatures: ["technician", "pathologist", "director"],
        },
      }),
      patient(),
      options,
    )

    const bySlot = Object.fromEntries(model.signatures.map((s) => [s.slot, s.label]))

    expect(bySlot.technician).toBe("Lab Technician: Nadia Rehman")
    expect(bySlot.pathologist).toBe("Pathologist: Dr Omar Siddiqui")
    // No administrator is active in the fixture, so the director line is kept
    // but left unsigned rather than naming a disabled or absent user.
    expect(bySlot.director).toBe("Director")
    expect(JSON.stringify(model)).not.toContain("Retired User")
  })

  it("hides licence and tax lines unless the customer turned them on", () => {
    const base = configuredDatabase()

    const hidden = buildReportModel(db(), patient(), options)
    expect(hidden.licenseLine).toBe("")
    expect(hidden.taxLine).toBe("")

    const shown = buildReportModel(
      db({
        reportSettings: {
          ...base.reportSettings,
          showLicenseNumber: true,
          showTaxNumber: true,
        },
        profile: { ...base.profile, licenseNumber: "DL-99887", taxNumber: "TAX-5566" },
      }),
      patient(),
      options,
    )
    expect(shown.licenseLine).toBe("Licence: DL-99887")
    expect(shown.taxLine).toBe("Tax: TAX-5566")
  })

  it("carries the patient's clinical note under the customer's own label", () => {
    const model = buildReportModel(
      db({
        reportSettings: { ...configuredDatabase().reportSettings, notesLabel: "Observations" },
      }),
      patient({ technicianNote: "Sample slightly haemolysed." }),
      options,
    )

    expect(model.notesLabel).toBe("Observations")
    expect(model.technicianNote).toBe("Sample slightly haemolysed.")
  })
})

describe("receipt model", () => {
  it("prints the laboratory's own identity and the customer's reference numbers", () => {
    const model = buildReceiptModel(db(), patient({ id: "NSD-0001" }), receiptOptions)

    expect(model.laboratoryName).toBe("Northside Diagnostics")
    expect(model.receiptNumber).toBe("RPT-0001")
    expect(model.sampleId).toBe("SMP-0001")
    expect(model.customer).toEqual({
      name: "Sample Patient",
      code: "NSD-0001",
      phone: "03000000000",
      referredBy: "Walk-in",
    })
  })

  it("keeps the money on the receipt arithmetically honest", () => {
    const model = buildReceiptModel(
      db(),
      patient({ testCodes: ["CBC", "LFT"], total: 3500, paid: 1500, discount: 500 }),
      receiptOptions,
    )

    // Subtotal is the catalog price sum (4000); the charged total is 3500.
    expect(model.subtotal).toBe(4000)
    expect(model.total).toBe(3500)
    expect(model.discount).toBe(500)
    expect(model.paid).toBe(1500)
    expect(model.balance).toBe(2000)
    expect(model.totalText).toBe("Rs. 3,500")
    expect(model.paidText).toBe("Rs. 1,500")
    expect(model.balanceText).toBe("Rs. 2,000")
  })

  it("prices each test line and counts abnormal parameters", () => {
    const model = buildReceiptModel(
      db(),
      patient({ testCodes: ["CBC", "LFT"], results: { prm_hb: "9.1", prm_wbc: "7.1" } }),
      receiptOptions,
    )

    expect(model.lines).toEqual([
      { code: "CBC", name: "Complete Blood Count", price: 1500, priceText: "Rs. 1,500", status: "Pending", flagCount: 1 },
      { code: "LFT", name: "Liver Function Tests", price: 2500, priceText: "Rs. 2,500", status: "Pending", flagCount: 0 },
    ])
  })

  it("labels the payment state from what has actually been received", () => {
    const paid = buildReceiptModel(db(), patient({ total: 1500, paid: 1500 }), receiptOptions)
    const partial = buildReceiptModel(db(), patient({ total: 1500, paid: 500 }), receiptOptions)
    const unpaid = buildReceiptModel(db(), patient({ total: 1500, paid: 0 }), receiptOptions)

    expect(paid.paymentState).toBe("PAID")
    expect(partial.paymentState).toBe("PARTIAL")
    expect(unpaid.paymentState).toBe("UNPAID")
  })

  it("never shows a negative balance when the customer overpays", () => {
    const model = buildReceiptModel(db(), patient({ total: 1500, paid: 2000 }), receiptOptions)

    expect(model.balance).toBe(0)
    expect(model.balanceText).toBe("Rs. 0")
    expect(model.paymentState).toBe("PAID")
  })

  it("promises the longest turnaround on the order, not the shortest", () => {
    const model = buildReceiptModel(
      db(),
      patient({ testCodes: ["CBC", "LFT"], createdAt: "2026-01-01T09:00:00.000Z" }),
      receiptOptions,
    )

    // LFT is 48h, so the patient must not be promised the CBC's 24h.
    expect(model.expectedReport).toBe("03 Jan 2026")
  })

  it("resolves the customer's own tokens in receipt wording", () => {
    const base = configuredDatabase()
    const model = buildReceiptModel(
      db({
        receiptSettings: {
          ...base.receiptSettings,
          collectionInstructions: "Collect from {{laboratoryName}}, {{city}}.",
          thankYouText: "Thank you for choosing {{laboratoryName}}.",
        },
      }),
      patient(),
      receiptOptions,
    )

    expect(model.collectionInstructions).toBe("Collect from Northside Diagnostics, Springfield.")
    expect(model.thankYou).toBe("Thank you for choosing Northside Diagnostics.")
  })

  it("suppresses sections the customer turned off", () => {
    const base = configuredDatabase()
    const model = buildReceiptModel(
      db({
        printerSettings: { ...base.printerSettings, receiptPaper: "58mm" },
        receiptSettings: {
          ...base.receiptSettings,
          showAddress: false,
          showPhone: false,
          showLicenseNumber: false,
          showThankYou: false,
          showTests: false,
          showPaymentSummary: false,
        },
        profile: { ...base.profile, licenseNumber: "" },
      }),
      patient(),
      receiptOptions,
    )

    expect(model.paper).toBe("58mm")
    expect(model.showAddress).toBe(false)
    expect(model.showPhone).toBe(false)
    expect(model.showLicenseNumber).toBe(false)
    expect(model.showThankYou).toBe(false)
    expect(model.showTests).toBe(false)
    expect(model.showPaymentSummary).toBe(false)
  })

  it("hides the payment method when the order has none", () => {
    const model = buildReceiptModel(db(), patient({ paymentMethod: "" }), receiptOptions)
    expect(model.showPaymentMethod).toBe(false)
  })

  it("keeps the vendor credit off the receipt unless the customer opted in", () => {
    const base = configuredDatabase()
    const off = buildReceiptModel(db(), patient(), receiptOptions)
    expect(off.showVendorCredit).toBe(false)

    const on = buildReceiptModel(
      db({ receiptSettings: { ...base.receiptSettings, showVendorCredit: true } }),
      patient(),
      receiptOptions,
    )
    expect(on.showVendorCredit).toBe(true)
    expect(on.vendorCredit).toContain(VENDOR.credit)
  })

  it("falls back to the code when a test has been removed from the catalog", () => {
    const model = buildReceiptModel(db(), patient({ testCodes: ["GONE"] }), receiptOptions)

    expect(model.lines).toEqual([
      { code: "GONE", name: "GONE", price: 0, priceText: "Rs. 0", status: "Pending", flagCount: 0 },
    ])
  })
})
