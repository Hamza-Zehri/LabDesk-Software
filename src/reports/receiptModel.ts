/**
 * Thermal receipt model.
 *
 * Same separation as the report engine: layout lives in `ReceiptDocument`, the
 * customer's own words and fields come from `receiptSettings`, and the data
 * comes from the patient record and this laboratory's prices.
 */

import { evaluateResult, formatAddress, formatDate, formatTime } from "../core/format"
import { formatMoney } from "../core/format"
import { laboratoryTokens, renderTemplate } from "../core/template"
import type { LabDatabase, Patient } from "../core/types"

export type ReceiptLine = {
  code: string
  name: string
  price: number
  priceText: string
  status: string
  flagCount: number
}

export type ReceiptModel = {
  paper: "58mm" | "80mm"
  laboratoryName: string
  tagline: string
  logo: string
  address: string
  phoneLine: string
  licenseLine: string
  showLogo: boolean
  showLaboratoryName: boolean
  showTagline: boolean
  showAddress: boolean
  showPhone: boolean
  showLicenseNumber: boolean
  showTests: boolean
  showPaymentSummary: boolean
  showPaymentMethod: boolean
  showBarcode: boolean
  showExpectedReport: boolean
  showThankYou: boolean
  receiptNumber: string
  sampleId: string
  issuedAt: string
  customer: { name: string; code: string; phone: string; referredBy: string }
  lines: ReceiptLine[]
  subtotal: number
  discount: number
  discountText: string
  total: number
  paid: number
  balance: number
  totalText: string
  paidText: string
  balanceText: string
  paymentMethod: string
  paymentState: string
  expectedReport: string
  collectionInstructions: string
  thankYou: string
  footerText: string
  showVendorCredit: boolean
  vendorCredit: string
  vendorWebsite: string
}

export const buildReceiptModel = (
  db: LabDatabase,
  patient: Patient,
  options: { vendorCredit: string; vendorWebsite: string },
): ReceiptModel => {
  const { profile, receiptSettings, printerSettings, tests, branding } = db
  const tokens = laboratoryTokens(db)

  const lines: ReceiptLine[] = patient.testCodes.map((code) => {
    const test = tests.find((t) => t.code === code)
    const parameters = test?.parameters ?? []
    const flags = parameters.filter((parameter) => {
      const flag = evaluateResult(parameter, patient.results[parameter.id] ?? "")
      return flag === "High" || flag === "Low" || flag === "Critical"
    })
    return {
      code,
      name: test?.name ?? code,
      price: test?.price ?? 0,
      priceText: formatMoney(test?.price ?? 0, db.paymentSettings),
      status: patient.reportStatus,
      flagCount: flags.length,
    }
  })

  const subtotal = lines.reduce((sum, line) => sum + line.price, 0)
  const total = patient.total || subtotal
  const balance = Math.max(0, total - patient.paid)
  const turnaroundHours = Math.max(
    1,
    ...patient.testCodes.map(
      (code) => tests.find((t) => t.code === code)?.turnaroundHours || db.testSettings.defaultTurnaroundHours,
    ),
  )
  const expected = new Date(
    new Date(patient.createdAt || Date.now()).getTime() + turnaroundHours * 3_600_000,
  ).toISOString()

  return {
    paper: printerSettings.receiptPaper,
    laboratoryName: profile.name,
    tagline: profile.tagline || profile.type,
    logo: profile.logo,
    address: formatAddress(profile),
    phoneLine: [profile.phone, profile.phone2].filter(Boolean).join(" · "),
    licenseLine: profile.licenseNumber ? `Licence: ${profile.licenseNumber}` : "",
    showLogo: receiptSettings.showLogo,
    showLaboratoryName: receiptSettings.showLaboratoryName,
    showTagline: receiptSettings.showTagline,
    showAddress: receiptSettings.showAddress && Boolean(formatAddress(profile)),
    showPhone: receiptSettings.showPhone && Boolean(profile.phone || profile.phone2),
    showLicenseNumber: receiptSettings.showLicenseNumber && Boolean(profile.licenseNumber),
    showTests: receiptSettings.showTests,
    showPaymentSummary: receiptSettings.showPaymentSummary,
    showPaymentMethod: receiptSettings.showPaymentMethod && Boolean(patient.paymentMethod),
    showBarcode: receiptSettings.showBarcode,
    showExpectedReport: receiptSettings.showExpectedReport,
    showThankYou: receiptSettings.showThankYou,
    receiptNumber: patient.reportId,
    sampleId: patient.sampleId,
    issuedAt: `${formatDate(patient.createdAt)} ${formatTime(patient.createdAt)}`,
    customer: {
      name: patient.name,
      code: patient.id,
      phone: patient.phone,
      referredBy: patient.doctorName,
    },
    lines,
    subtotal,
    discount: Math.max(0, subtotal - total),
    discountText: formatMoney(Math.max(0, subtotal - total), db.paymentSettings),
    total,
    paid: patient.paid,
    balance,
    totalText: formatMoney(total, db.paymentSettings),
    paidText: formatMoney(patient.paid, db.paymentSettings),
    balanceText: formatMoney(balance, db.paymentSettings),
    paymentMethod: patient.paymentMethod,
    paymentState: patient.paid >= total ? "PAID" : patient.paid > 0 ? "PARTIAL" : "UNPAID",
    expectedReport: formatDate(expected),
    collectionInstructions: renderTemplate(receiptSettings.collectionInstructions, tokens),
    thankYou: renderTemplate(receiptSettings.thankYouText, tokens),
    footerText: renderTemplate(receiptSettings.footerText, tokens),
    showVendorCredit: receiptSettings.showVendorCredit,
    vendorCredit: branding.showProductNameOnPrint
      ? `${options.vendorCredit} · ${options.vendorWebsite}`
      : options.vendorCredit,
    vendorWebsite: options.vendorWebsite,
  }
}
