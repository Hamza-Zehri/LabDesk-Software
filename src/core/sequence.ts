/**
 * Record numbering.
 *
 * Numbers are derived from the prefixes the customer configured, so two
 * laboratories can number their records differently with no code change.
 */

import type { LaboratoryProfile } from "./types"

export type RecordSequences = {
  patient: number
  report: number
  sample: number
}

const nextFrom = (existing: string[], prefix: string, width: number): number => {
  let highest = 0
  for (const value of existing) {
    if (!value?.startsWith(prefix)) continue
    const tail = Number.parseInt(value.slice(prefix.length + 1), 10)
    if (Number.isFinite(tail) && tail > highest) highest = tail
  }
  return highest + 1
}

export const formatNumberedId = (prefix: string, sequence: number, width = 4): string =>
  `${prefix || "LAB"}-${String(sequence).padStart(width, "0")}`

/**
 * Allocates the next patient, report and sample numbers for a laboratory.
 * The sample number shares the patient sequence, so a sample and its patient
 * remain traceable, while report numbers run from a separate offset range.
 */
export const nextRecordNumbers = (
  profile: LaboratoryProfile,
  patients: { id: string; reportId: string }[],
): { patientId: string; reportId: string; sampleId: string } => {
  const patientPrefix = profile.idPrefixes.patient || "LAB"
  const reportPrefix = profile.idPrefixes.report || "RPT"
  const samplePrefix = profile.idPrefixes.sample || "SMP"

  const patientSequence = nextFrom(
    patients.map((p) => p.id),
    patientPrefix,
    4,
  )
  const reportSequence = nextFrom(
    patients.map((p) => p.reportId),
    reportPrefix,
    4,
  )

  return {
    patientId: formatNumberedId(patientPrefix, patientSequence),
    reportId: formatNumberedId(reportPrefix, reportSequence),
    sampleId: formatNumberedId(samplePrefix, patientSequence),
  }
}
