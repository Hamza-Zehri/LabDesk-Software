import { describe, expect, it } from "vitest"

import { formatAddress, formatMoney, evaluateResult, initials, joinLines } from "./format"
import { defaultPaymentSettings } from "./defaults"
import { parameter } from "./testFixtures"

describe("formatMoney", () => {
  it("places the symbol before the amount by default", () => {
    expect(formatMoney(1500, defaultPaymentSettings())).toBe("Rs. 1,500")
  })

  it("places the symbol after the amount when configured", () => {
    const settings = { ...defaultPaymentSettings(), currencyPosition: "suffix" as const }
    expect(formatMoney(250.5, settings)).toBe("250.50 Rs.")
  })

  it("omits decimal places on whole amounts and shows two otherwise", () => {
    const settings = defaultPaymentSettings()
    expect(formatMoney(100, settings)).toBe("Rs. 100")
    expect(formatMoney(100.5, settings)).toBe("Rs. 100.50")
  })

  it("treats non-finite input as zero rather than printing NaN", () => {
    const settings = defaultPaymentSettings()
    expect(formatMoney(Number.NaN, settings)).toBe("Rs. 0")
    expect(formatMoney(Number.POSITIVE_INFINITY, settings)).toBe("Rs. 0")
  })
})

describe("evaluateResult", () => {
  const bounds = parameter({ low: 12, high: 16, criticalLow: 7, criticalHigh: 20 })

  it("flags values against the configured range", () => {
    expect(evaluateResult(bounds, "11")).toBe("Low")
    expect(evaluateResult(bounds, "14")).toBe("Normal")
    expect(evaluateResult(bounds, "17")).toBe("High")
  })

  it("treats the critical bounds as inclusive", () => {
    expect(evaluateResult(bounds, "7")).toBe("Critical")
    expect(evaluateResult(bounds, "20")).toBe("Critical")
  })

  it("reads qualitative results regardless of case or padding", () => {
    expect(evaluateResult(bounds, "  Positive ")).toBe("Positive")
    expect(evaluateResult(bounds, "not detected")).toBe("Negative")
  })

  it("leaves an empty or non-numeric value pending", () => {
    expect(evaluateResult(bounds, "   ")).toBe("Pending")
    expect(evaluateResult(bounds, "not measurable")).toBe("Pending")
  })

  it("supports a purely qualitative test with no bounds", () => {
    const qualitative = parameter({ low: null, high: null, criticalLow: null, criticalHigh: null })
    expect(evaluateResult(qualitative, "5")).toBe("Normal")
  })
})

describe("initials", () => {
  it("uses at most two initials", () => {
    expect(initials("Ada Lovelace King")).toBe("AL")
  })

  it("falls back for an empty name", () => {
    expect(initials("   ")).toBe("?")
  })
})

describe("formatAddress", () => {
  it("joins only the parts that are present", () => {
    expect(formatAddress({ address: "12 Market Road", city: "Springfield", province: "", country: "UK" })).toBe(
      "12 Market Road, Springfield, UK",
    )
  })

  it("returns an empty string when nothing is set", () => {
    expect(formatAddress({})).toBe("")
  })
})

describe("joinLines", () => {
  it("drops empty segments", () => {
    expect(joinLines(["A", "", "B", undefined, "C"])).toBe("A · B · C")
  })

  it("honours a custom separator", () => {
    expect(joinLines(["A", "B"], " / ")).toBe("A / B")
  })
})
