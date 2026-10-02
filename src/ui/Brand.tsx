/**
 * Laboratory brand mark.
 *
 * Renders the customer's logo and name, or the product mark when the customer
 * has not uploaded a logo. Every decision comes from configuration: nothing
 * here knows any laboratory's name.
 */

import { FlaskConical } from "lucide-react"
import { useLab } from "../app/LabProvider"
import type { LabDatabase } from "../core/types"

export type BrandSize = "sm" | "md" | "lg"

const iconSize: Record<BrandSize, number> = { sm: 19, md: 25, lg: 34 }

/** Product mark used when the customer has not uploaded a logo. */
export const ProductMark = ({ size = "md" }: { size?: BrandSize }) => (
  <div className="brand-mark" aria-hidden="true">
    <FlaskConical size={iconSize[size]} strokeWidth={2.1} />
    <span className="brand-mark-plus">+</span>
  </div>
)

export const customerLogo = (db: LabDatabase) => db.profile.logo.trim()

type BrandProps = {
  size?: BrandSize
  /** Icon only, for a collapsed sidebar. */
  compact?: boolean
  /** `app` respects the in-app branding settings; `print` forces the customer name. */
  context?: "app" | "print" | "login"
  /** Hide the product name even when the laboratory is the primary brand. */
  showTagline?: boolean
  className?: string
}

export default function Brand({
  size = "md",
  compact = false,
  context = "app",
  showTagline = true,
  className = "",
}: BrandProps) {
  const { db } = useLab()
  const { profile, branding } = db
  const logo = customerLogo(db)
  const isHeaderContext = context === "login"

  const inAppNameVisible =
    context !== "app" ||
    branding.showNameInApp === "everywhere" ||
    (branding.showNameInApp === "header" && isHeaderContext)
  const inAppLogoVisible =
    context !== "app" ||
    branding.showLogoInApp === "everywhere" ||
    (branding.showLogoInApp === "header" && isHeaderContext)

  const hasLogo = Boolean(logo) && inAppLogoVisible
  const name = profile.name.trim() || profile.shortName.trim()

  if (compact) {
    return (
      <div className={`brand brand-compact brand-${size} ${className}`}>
        {hasLogo ? (
          <img className="brand-logo" src={logo} alt="" />
        ) : (
          <ProductMark size={size} />
        )}
      </div>
    )
  }

  return (
    <div className={`brand brand-${size} ${className}`}>
      {hasLogo && <img className="brand-logo" src={logo} alt="" />}
      {!hasLogo && <ProductMark size={size} />}
      {inAppNameVisible && name && (
        <div className="brand-copy">
          <strong title={name}>{name}</strong>
          {showTagline && (profile.tagline || profile.type) && (
            <small>{profile.tagline || profile.type}</small>
          )}
        </div>
      )}
    </div>
  )
}
