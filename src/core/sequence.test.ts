import { describe, expect, it } from "vitest"

import { formatNumberedId, nextRecordNumbers } from "./sequence"
import { createEmptyProfile } from "./defaults"
import type { LaboratoryProfile } from "./types"

const profile = (overrides: Partial<LaboratoryProfile> = {}): LaboratoryProfile => ({
  ...createEmptyProfile(),
  ...overrides,
})

describe("formatNumberedId", () => {
  it("pads the sequence to the requested width", () => {
    expect(formatNumberedId("LAB", 7)).toBe("LAB-0007")
    expect(formatNumberedId("LAB", 7, 6)).toBe("LAB-000007")
  })

  it("falls back to a default prefix when one is blank", () => {
    expect(formatNumberedId("", 1)).toBe("LAB-0001")
  })
})

describe("nextRecordNumbers", () => {
  it("starts each sequence at 1", () => {
    const numbers = nextRecordNumbers(profile(), [])
    expect(numbers.patientId).toBe("LAB-0001")
    expect(numbers.reportId).toBe("RPT-0001")
    expect(numbers.sampleId).toBe("SMP-0001")
  })

  it("uses the prefixes the laboratory configured", () => {
    const custom = profile({ idPrefixes: { patient: "NSD", report: "NDR", sample: "NSM" } })
    expect(nextRecordNumbers(custom, [])).toEqual({
      patientId: "NSD-0001",
      reportId: "NDR-0001",
      sampleId: "NSM-0001",
    })
  })

  it("shares the patient sequence with the sample number so they stay traceable", () => {
    const numbers = nextRecordNumbers(profile(), [
      { id: "LAB-0001", reportId: "RPT-0001" },
      { id: "LAB-0002", reportId: "RPT-0002" },
    ])
    expect(numbers.patientId).toBe("LAB-0003")
    expect(numbers.sampleId).toBe("SMP-0003")
  })

  it("continues past a gap and ignores the highest number, not the last", () => {
    const numbers = nextRecordNumbers(profile(), [
      { id: "LAB-0001", reportId: "RPT-0001" },
      { id: "LAB-0009", reportId: "RPT-0004" },
      { id: "LAB-0002", reportId: "RPT-0002" },
    ])
    expect(numbers.patientId).toBe("LAB-0010")
    expect(numbers.reportId).toBe("RPT-0005")
  })

  it("ignores ids from another installation's prefix scheme", () => {
    const numbers = nextRecordNumbers(profile(), [
      { id: "OTH-0500", reportId: "ORP-0500" },
      { id: "LAB-0002", reportId: "RPT-0002" },
    ])
    expect(numbers.patientId).toBe("LAB-0003")
    expect(numbers.reportId).toBe("RPT-0003")
  })

  it("does not count malformed or blank ids", () => {
    const numbers = nextRecordNumbers(profile(), [
      { id: "", reportId: "" },
      { id: "LAB-abc", reportId: "RPT-abc" },
      { id: "LAB-0004", reportId: "RPT-0004" },
    ])
    expect(numbers.patientId).toBe("LAB-0005")
  })

  it("keeps a laboratory's numbering independent of another's", () => {
    const a = nextRecordNumbers(profile({ idPrefixes: { patient: "AAA", report: "AAR", sample: "AAS" } }), [])
    const b = nextRecordNumbers(profile({ idPrefixes: { patient: "BBB", report: "BBR", sample: "BBS" } }), [])
    expect(a.patientId).toBe("AAA-0001")
    expect(b.patientId).toBe("BBB-0001")
  })
})
