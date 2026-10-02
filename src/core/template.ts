/**
 * Template token resolver.
 *
 * Laboratory-authored text (receipt thank-you lines, footers, disclaimers)
 * supports `{{token}}` placeholders so a customer can refer to their own
 * details without a developer.
 */

import { formatAddress } from "./format"
import { PRODUCT_NAME, PRODUCT_SUBTITLE, PRODUCT_VERSION } from "./product"
import type { LabDatabase, StaffUser } from "./types"

export type TemplateContext = Partial<
  Record<
    | "laboratoryName"
    | "shortName"
    | "tagline"
    | "laboratoryType"
    | "address"
    | "city"
    | "province"
    | "country"
    | "phone"
    | "phone2"
    | "whatsapp"
    | "email"
    | "website"
    | "licenseNumber"
    | "taxNumber"
    | "productName"
    | "productSubtitle"
    | "version"
    | "patientName"
    | "patientId"
    | "reportId"
    | "sampleId"
    | "reportDate"
    | "total"
    | "paid"
    | "balance"
    | "currency"
    | "technician"
    | "verifiedBy"
    | "pathologist"
    | "director",
    string
  >
>

export const laboratoryTokens = (db: LabDatabase): TemplateContext => ({
  laboratoryName: db.profile.name,
  shortName: db.profile.shortName,
  tagline: db.profile.tagline,
  laboratoryType: db.profile.type,
  address: db.profile.address,
  city: db.profile.city,
  province: db.profile.province,
  country: db.profile.country,
  phone: db.profile.phone,
  phone2: db.profile.phone2,
  whatsapp: db.profile.whatsapp,
  email: db.profile.email,
  website: db.profile.website,
  licenseNumber: db.profile.licenseNumber,
  taxNumber: db.profile.taxNumber,
  productName: PRODUCT_NAME,
  productSubtitle: PRODUCT_SUBTITLE,
  version: PRODUCT_VERSION,
})

export const fullAddressToken = (db: LabDatabase): string => formatAddress(db.profile)

/** Resolves `{{token}}` placeholders, leaving unknown tokens untouched. */
export const renderTemplate = (
  template: string,
  context: TemplateContext,
): string =>
  (template ?? "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, token: string) => {
    const value = context[token as keyof TemplateContext]
    return typeof value === "string" ? value : match
  })

/** True when the template contains at least one unresolved token. */
export const hasUnresolvedToken = (rendered: string): boolean => /\{\{[^}]*\}\}/.test(rendered)

export const userDisplayName = (users: StaffUser[], userId: string): string =>
  users.find((u) => u.id === userId)?.name || "Unknown user"
