/**
 * Presentation helpers.
 *
 * Currency, dates and result flags are all derived from configuration, so a
 * laboratory can change its currency or its reference ranges without a code
 * change.
 */

import type { PaymentSettings, ResultFlag, TestParameter } from "./types"

/** Formats an amount using the laboratory's own currency configuration. */
export const formatMoney = (amount: number, settings: PaymentSettings): string => {
  const value = Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100
  const grouped = value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return settings.currencyPosition === "suffix"
    ? `${grouped} ${settings.currencySymbol}`
    : `${settings.currencySymbol} ${grouped}`
}

export const formatDate = (iso: string): string => {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export const formatDateTime = (iso: string): string => {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${formatDate(iso)}, ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

export const formatTime = (iso: string): string => {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

export const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?"

/** Joins the non-empty parts of an address into a single printable line. */
export const formatAddress = (parts: {
  address?: string
  city?: string
  province?: string
  country?: string
}): string => [parts.address, parts.city, parts.province, parts.country].filter(Boolean).join(", ")

/**
 * Flags a measured value against a parameter's configured bounds.
 *
 * `low`, `high`, `criticalLow` and `criticalHigh` are all optional, so a
 * laboratory can define a purely qualitative test (no numeric bounds) and it
 * simply reports no automatic flag.
 */
export const evaluateResult = (
  parameter: Pick<TestParameter, "low" | "high" | "criticalLow" | "criticalHigh">,
  rawValue: string,
): ResultFlag => {
  const trimmed = (rawValue ?? "").trim()
  if (!trimmed) return "Pending"
  const text = trimmed.toLowerCase()
  if (text === "positive" || text === "detected" || text === "reactive") return "Positive"
  if (text === "negative" || text === "not detected" || text === "non reactive")
    return "Negative"

  const value = Number(trimmed)
  if (!Number.isFinite(value)) return "Pending"

  const { low, high, criticalLow, criticalHigh } = parameter
  if (criticalLow !== null && criticalLow !== undefined && value <= criticalLow) return "Critical"
  if (criticalHigh !== null && criticalHigh !== undefined && value >= criticalHigh)
    return "Critical"
  if (low !== null && low !== undefined && value < low) return "Low"
  if (high !== null && high !== undefined && value > high) return "High"
  return "Normal"
}

/** Combines non-empty lines for print output. */
export const joinLines = (lines: (string | undefined | null)[], separator = " · "): string =>
  lines
    .map((line) => (line ?? "").trim())
    .filter(Boolean)
    .join(separator)
