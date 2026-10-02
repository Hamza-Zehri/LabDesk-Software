import { describe, expect, it } from "vitest"

import {
  SAMPLE_ORDER,
  allMissingParameters,
  balanceOf,
  canFinalize,
  clampPaid,
  isSampleClosed,
  missingParameters,
  nextSampleStatus,
  paymentStateOf,
  pruneResults,
  reprice,
  requiredParameters,
  resultProgress,
  subtotalFor,
  totalFor,
} from "./records"
import { catalogTest, parameter, patient } from "./testFixtures"

const cbc = catalogTest({ code: "CBC", price: 1500, parameters: [parameter({ id: "hgb" }), parameter({ id: "wbc", displayOrder: 1 })] })
const lft = catalogTest({
  code: "LFT",
  price: 2200,
  displayOrder: 1,
  parameters: [parameter({ id: "alt" })],
})
const tests = [cbc, lft]

describe("subtotalFor", () => {
  it("sums the catalog price of every selected code", () => {
    expect(subtotalFor(tests, ["CBC", "LFT"])).toBe(3700)
  })

  it("ignores unknown codes and duplicates", () => {
    expect(subtotalFor(tests, ["CBC", "NOPE", "CBC"])).toBe(3000)
  })

  it("is zero for an empty selection", () => {
    expect(subtotalFor(tests, [])).toBe(0)
  })
})

describe("totalFor", () => {
  it("applies a discount when one is allowed", () => {
    expect(totalFor(3700, 700, true)).toBe(3000)
  })

  it("ignores the discount when the laboratory forbids it", () => {
    expect(totalFor(3700, 700, false)).toBe(3700)
  })

  it("never goes below zero", () => {
    expect(totalFor(1000, 5000, true)).toBe(0)
    expect(totalFor(-100, 0, true)).toBe(0)
  })
})

describe("clampPaid", () => {
  it("keeps payments inside the 0..total range", () => {
    expect(clampPaid(-50, 1000)).toBe(0)
    expect(clampPaid(2500, 1000)).toBe(1000)
    expect(clampPaid(500, 1000)).toBe(500)
  })

  it("rounds to two decimals", () => {
    expect(clampPaid(333.333, 1000)).toBe(333.33)
  })
})

describe("paymentStateOf and balanceOf", () => {
  it("derives the state from the totals", () => {
    expect(paymentStateOf({ total: 1000, paid: 0 })).toBe("Unpaid")
    expect(paymentStateOf({ total: 1000, paid: 400 })).toBe("Partial")
    expect(paymentStateOf({ total: 1000, paid: 1000 })).toBe("Paid")
  })

  it("treats a zero-total order as paid with no balance", () => {
    expect(paymentStateOf({ total: 0, paid: 0 })).toBe("Paid")
    expect(balanceOf({ total: 0, paid: 0 })).toBe(0)
  })

  it("never reports a negative balance", () => {
    expect(balanceOf({ total: 500, paid: 800 })).toBe(0)
  })
})

describe("reprice", () => {
  it("prices the selection stored on the patient", () => {
    const result = reprice(patient({ testCodes: ["CBC", "LFT"] }), tests, 700, true)
    expect(result).toEqual({ discount: 700, total: 3000, paid: 0 })
  })

  it("prices an explicitly supplied selection, ignoring the stored codes", () => {
    const result = reprice(patient({ testCodes: ["CBC"] }), tests, 0, true, ["LFT"])
    expect(result.total).toBe(2200)
  })

  it("preserves payments already taken when the total falls", () => {
    const result = reprice(patient({ testCodes: ["CBC", "LFT"], paid: 3500 }), tests, 0, true, ["CBC"])
    expect(result.total).toBe(1500)
    expect(result.paid).toBe(3500)
    expect(balanceOf({ total: result.total, paid: result.paid })).toBe(0)
  })

  it("never records a negative payment", () => {
    expect(reprice(patient({ testCodes: ["CBC"], paid: -20 }), tests, 0, true).paid).toBe(0)
  })

  it("drops the discount when discounts are not permitted", () => {
    const result = reprice(patient({ testCodes: ["CBC"] }), tests, 500, false)
    expect(result.discount).toBe(0)
    expect(result.total).toBe(1500)
  })
})

describe("sample lifecycle", () => {
  it("walks the workflow in order", () => {
    expect(nextSampleStatus("Pending")).toBe("Collected")
    expect(nextSampleStatus("Collected")).toBe("Processing")
    expect(nextSampleStatus("Processing")).toBe("Completed")
  })

  it("stops at a closed or unknown status", () => {
    expect(nextSampleStatus("Completed")).toBeNull()
    expect(nextSampleStatus("Rejected")).toBeNull()
    expect(nextSampleStatus("Nonsense" as never)).toBeNull()
    expect(nextSampleStatus(SAMPLE_ORDER[0])).toBe("Collected")
  })

  it("treats completed and rejected as closed", () => {
    expect(isSampleClosed("Completed")).toBe(true)
    expect(isSampleClosed("Rejected")).toBe(true)
    expect(isSampleClosed("Processing")).toBe(false)
  })
})

describe("requiredParameters", () => {
  it("returns active parameters in display order", () => {
    const unordered = catalogTest({
      parameters: [
        parameter({ id: "z", displayOrder: 5 }),
        parameter({ id: "a", displayOrder: 1 }),
        parameter({ id: "off", active: false, displayOrder: 0 }),
      ],
    })
    expect(requiredParameters(unordered).map((p) => p.id)).toEqual(["a", "z"])
  })

  it("tolerates a missing test", () => {
    expect(requiredParameters(null)).toEqual([])
    expect(requiredParameters(undefined)).toEqual([])
  })
})

describe("missingParameters and allMissingParameters", () => {
  it("treats whitespace as missing", () => {
    expect(missingParameters({ results: { hgb: "  " } }, cbc).map((p) => p.id)).toEqual(["hgb", "wbc"])
  })

  it("reports nothing once every value is filled", () => {
    expect(missingParameters({ results: { hgb: "14", wbc: "7" } }, cbc)).toEqual([])
  })

  it("groups the gaps by test and skips unknown codes", () => {
    const entry = patient({ testCodes: ["CBC", "LFT", "GONE"], results: { hgb: "14" } })
    const missing = allMissingParameters(entry, tests)
    expect(missing.map((m) => [m.test.code, m.parameters.map((p) => p.id)])).toEqual([
      ["CBC", ["wbc"]],
      ["LFT", ["alt"]],
    ])
  })
})

describe("canFinalize and resultProgress", () => {
  it("blocks finalization while a value is missing", () => {
    expect(canFinalize(patient({ testCodes: ["CBC"], results: { hgb: "14" } }), tests)).toBe(false)
  })

  it("allows finalization once everything is entered", () => {
    expect(canFinalize(patient({ testCodes: ["CBC"], results: { hgb: "14", wbc: "7" } }), tests)).toBe(true)
  })

  it("reports completion as a percentage", () => {
    expect(resultProgress(patient({ testCodes: ["CBC", "LFT"], results: { hgb: "14" } }), tests)).toBe(33)
    expect(resultProgress(patient({ testCodes: ["CBC"], results: { hgb: "1", wbc: "2" } }), tests)).toBe(100)
  })

  it("treats a test with no active parameters as fully complete", () => {
    const empty = catalogTest({ code: "EMPTY", parameters: [] })
    expect(resultProgress(patient({ testCodes: ["EMPTY"] }), [...tests, empty])).toBe(100)
  })
})

describe("pruneResults", () => {
  it("drops values for parameters no longer on the order", () => {
    const results = { hgb: "14", wbc: "7", alt: "9" }
    expect(pruneResults(results, tests, ["CBC"])).toEqual({ hgb: "14", wbc: "7" })
  })

  it("drops values for parameters that were deactivated", () => {
    const deactivated = catalogTest({ code: "CBC", parameters: [parameter({ id: "hgb", active: false })] })
    expect(pruneResults({ hgb: "14" }, [deactivated], ["CBC"])).toEqual({})
  })

  it("keeps the original object untouched", () => {
    const results = { hgb: "14", alt: "9" }
    pruneResults(results, tests, ["CBC"])
    expect(results).toEqual({ hgb: "14", alt: "9" })
  })
})
