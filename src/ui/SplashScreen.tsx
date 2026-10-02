/**
 * Startup screen.
 *
 * Shows the product mark while the installation database loads, then hands over
 * to the setup wizard, the sign-in screen or the dashboard. The laboratory name
 * appears here only when this device is already configured.
 */

import { ShieldCheck } from "lucide-react"
import { useLab } from "../app/LabProvider"
import { PRODUCT_NAME, PRODUCT_VERSION } from "../core/product"

export default function SplashScreen() {
  const { db } = useLab()
  const labName = db.profile.name.trim()
  const configured = db.setupCompleted && Boolean(labName)

  return (
    <div className="splash-screen" role="status" aria-label={`Opening ${PRODUCT_NAME}`}>
      <div className="splash-topline">
        <span className="splash-symbol">+</span>
        <span>{PRODUCT_NAME}</span>
      </div>
      <div className="splash-center">
        <div className="splash-emblem">
          {db.profile.logo ? (
            <img src={db.profile.logo} alt="" />
          ) : (
            <div className="splash-emblem-inner">+</div>
          )}
        </div>
        <div className="splash-rule" />
        <h1>{configured ? labName : PRODUCT_NAME}</h1>
        <p>
          {configured
            ? db.profile.tagline || db.profile.type || "Laboratory Management System"
            : "Laboratory Management System"}
        </p>
        <div className="splash-progress" aria-hidden="true">
          <span />
        </div>
        <div className="splash-loading">
          {configured ? "Opening your workspace" : "Preparing first-run setup"}
        </div>
      </div>
      <div className="splash-footer">
        <span>
          <ShieldCheck size={16} /> Your local laboratory workspace
        </span>
        <span>
          {PRODUCT_NAME} {PRODUCT_VERSION}
        </span>
      </div>
    </div>
  )
}
