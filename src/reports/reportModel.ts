/**
 * Report model.
 *
 * Turns an installation's configuration plus one patient record into a flat
 * view model. This is the separation the report engine needs: layout lives in
 * `ReportDocument`, laboratory identity lives in configuration, patient data
 * comes from the record and result data comes from this laboratory's own test
 * definitions.
 *
 * The function is pure, so report content can be verified without a browser.
 */

import { evaluateResult, formatAddress, formatDate, joinLines } from "../core/format"
import { laboratoryTokens, renderTemplate } from "../core/template"
import type {
  CatalogTest,
  LabDatabase,
  Patient,
  ReportSettings,
  ResultFlag,
  StaffUser,
  TestParameter,
} from "../core/types"

export type ReportParameterRow = {
  parameter: TestParameter
  value: string
  flag: ResultFlag
}

export type ReportSection = {
  test: CatalogTest
  parameters: ReportParameterRow[]
  hasResults: boolean
}

export type ReportModel = {
  laboratoryName: string
  tagline: string
  logo: string
  addressLines: string[]
  phoneLine: string
  email: string
  website: string
  licenseLine: string
  taxLine: string
  documentTitle: string
  documentSubtitle: string
  headerAlignment: ReportSettings["headerAlignment"]
  patient: {
    name: string
    code: string
    reportId: string
    sampleId: string
    age: string
    gender: string
    bloodGroup: string
    phone: string
    referredBy: string
    collectedOn: string
    reportedOn: string
  }
  statusLabel: string
  sections: ReportSection[]
  resultColumns: ReportSettings["resultColumns"]
  notesLabel: string
  technicianNote: string
  disclaimer: string
  footerText: string
  signatures: { slot: string; label: string }[]
  showVendorCredit: boolean
  showProductName: boolean
  productName: string
  vendorCredit: string
  vendorWebsite: string
}

const signOff = (users: StaffUser[], role: StaffUser["role"]) =>
  users.find((u) => u.role === role && u.status === "Active")?.name ?? ""

/** Builds the printable report view model. */
export const buildReportModel = (
  db: LabDatabase,
  patient: Patient,
  options: { productName: string; vendorCredit: string; vendorWebsite: string },
): ReportModel => {
  const { profile, reportSettings, branding, tests, users } = db
  const tokens = laboratoryTokens(db)

  const sections: ReportSection[] = patient.testCodes
    .map((code) => {
      const test = tests.find((t) => t.code === code)
      if (!test) return null
      const parameters = [...test.parameters]
        .filter((p) => p.active)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map<ReportParameterRow>((parameter) => {
          const value = patient.results[parameter.id] ?? ""
          return { parameter, value, flag: evaluateResult(parameter, value) }
        })
      return { test, parameters, hasResults: parameters.some((p) => p.value) }
    })
    .filter((section): section is ReportSection => section !== null)

  return {
    laboratoryName: profile.name,
    tagline: profile.tagline || profile.type,
    logo: profile.logo,
    addressLines: [formatAddress(profile)].filter(Boolean),
    phoneLine: joinLines([profile.phone, profile.phone2]),
    email: profile.email,
    website: profile.website,
    licenseLine: reportSettings.showLicenseNumber
      ? joinLines([profile.licenseNumber ? `Licence: ${profile.licenseNumber}` : ""])
      : "",
    taxLine: reportSettings.showTaxNumber
      ? joinLines([profile.taxNumber ? `Tax: ${profile.taxNumber}` : ""])
      : "",
    documentTitle: reportSettings.documentTitle,
    documentSubtitle: reportSettings.documentSubtitle,
    headerAlignment: reportSettings.headerAlignment,
    patient: {
      name: patient.name,
      code: patient.id,
      reportId: patient.reportId,
      sampleId: patient.sampleId,
      age: patient.age,
      gender: patient.gender,
      bloodGroup: patient.bloodGroup,
      phone: patient.phone,
      referredBy: patient.doctorName,
      collectedOn: formatDate(patient.collectedAt || patient.createdAt),
      reportedOn: formatDate(patient.updatedAt || patient.createdAt),
    },
    statusLabel: patient.reportStatus,
    sections,
    resultColumns: reportSettings.resultColumns,
    notesLabel: reportSettings.notesLabel,
    technicianNote: patient.technicianNote,
    disclaimer: renderTemplate(reportSettings.disclaimer, tokens),
    footerText: renderTemplate(reportSettings.footerText, tokens),
    signatures: reportSettings.showSignatures.map((slot) => {
      const label = reportSettings.signatureLabels[slot] ?? slot
      const name = signOff(users, roleForSlot(slot))
      return { slot, label: name ? `${label}: ${name}` : label }
    }),
    showVendorCredit: branding.showVendorCreditOnPrint,
    showProductName: branding.showProductNameOnPrint,
    productName: options.productName,
    vendorCredit: options.vendorCredit,
    vendorWebsite: options.vendorWebsite,
  }
}

const roleForSlot = (slot: string): StaffUser["role"] =>
  slot === "technician"
    ? "Technician"
    : slot === "pathologist"
      ? "Pathologist"
      : slot === "director"
        ? "Administrator"
        : "Pathologist"

/** Flattens every parameter row of a report, for summary displays. */
export const reportSummary = (model: ReportModel) => {
  const all = model.sections.flatMap((section) => section.parameters)
  const flagged = all.filter((row) => row.flag === "High" || row.flag === "Low" || row.flag === "Critical")
  return { total: all.length, entered: all.filter((r) => r.value).length, flagged }
}
