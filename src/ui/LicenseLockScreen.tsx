/**
 * Full-screen License Lock for LabDesk.
 *
 * Shown whenever the current license does not permit operation: never activated,
 * expired, deactivated, suspended, revoked, or unverifiable. Local laboratory
 * data (patients, tests, reports, billing, etc.) remains 100% intact, and a
 * valid key entered here restores full functionality immediately.
 */

import { useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  ShieldAlert,
} from "lucide-react"
import { useLab } from "../app/LabProvider"
import { activateCommercialLicense, refreshLicenseFromCloud, summarizeCommercialLicense } from "../core/licenseService"
import { VENDOR } from "../core/product"
import { ProductMark } from "./Brand"
import { Badge, Button } from "./controls"

type LockCopy = {
  title: string
  body: string
  /** A key can be entered when no usable license is stored locally. */
  canActivate: boolean
}

function lockCopyFor(status: string | undefined, hasStoredLicense: boolean): LockCopy {
  switch (status) {
    case "NOT_ACTIVATED":
      return {
        title: "Activate LabDesk",
        body: "Enter the license key supplied by your software provider to start using LabDesk.",
        canActivate: true,
      }
    case "EXPIRED":
      return {
        title: "License Expired",
        body: "The subscription for this installation has ended. Renew it with your provider, then enter the new key below.",
        canActivate: true,
      }
    case "VERIFICATION_ERROR":
      return {
        title: "License Could Not Be Verified",
        body: "LabDesk could not confirm this license with the licensing server. Reconnect to the internet and check again, or enter a renewed key below.",
        canActivate: true,
      }
    case "SUSPENDED":
      return {
        title: "License Suspended",
        body: "Your LabDesk license has been suspended by the software provider.",
        canActivate: hasStoredLicense,
      }
    default:
      return {
        title: "License Deactivated",
        body: "Your LabDesk license has been deactivated by the software provider.",
        canActivate: hasStoredLicense,
      }
  }
}

export default function LicenseLockScreen() {
  const { db, update } = useLab()
  const summary = summarizeCommercialLicense(db)

  const [isChecking, setIsChecking] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
  const [keyInput, setKeyInput] = useState("")
  const [feedback, setFeedback] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null)

  const hasStoredLicense = Boolean(db.license?.licenseId)
  const copy = lockCopyFor(db.license?.status, hasStoredLicense)

  const handleCheckAgain = async () => {
    setIsChecking(true)
    setFeedback(null)

    try {
      const result = await refreshLicenseFromCloud(db)
      update((draft) => {
        draft.license = result.license
      })

      if (!result.contactedCloud) {
        setFeedback({
          message: result.error || "Unable to reach license verification server. Internet connection required.",
          tone: "info",
        })
        return
      }

      if (result.license.status === "ACTIVE" || result.license.status === "OFFLINE_GRACE" || result.license.status === "EXPIRING_SOON") {
        setFeedback({
          message: "License confirmed. Unlocking software...",
          tone: "success",
        })
      } else {
        setFeedback({
          message: `License remains ${result.license.status || "inactive"} on the cloud server. Please contact support.`,
          tone: "error",
        })
      }
    } catch {
      setFeedback({
        message: "Unable to reach license verification server. Internet connection required.",
        tone: "info",
      })
    } finally {
      setIsChecking(false)
    }
  }

  const handleActivate = async () => {
    const cleanKey = keyInput.trim()
    if (!cleanKey) {
      setFeedback({ message: "Please enter your license key.", tone: "error" })
      return
    }

    setIsActivating(true)
    setFeedback(null)

    try {
      const result = await activateCommercialLicense(cleanKey, db)
      if (result.ok && result.license) {
        update((draft) => {
          draft.license = result.license!
        })
        setFeedback({ message: "License activated. Unlocking software...", tone: "success" })
      } else {
        setFeedback({ message: result.error || "Activation failed. Please check the key and your internet connection.", tone: "error" })
      }
    } catch {
      setFeedback({ message: "Unable to reach license verification server. Please try again.", tone: "info" })
    } finally {
      setIsActivating(false)
    }
  }

  const handleWhatsAppClick = () => {
    // International format URL: +923357981318, visible display text: 03357981318
    const waUrl = "https://wa.me/923357981318?text=Hello%20Engr.%20Hamza%20Asad,%20I%20am%20contacting%20you%20regarding%20my%20LabDesk%20license."
    window.open(waUrl, "_blank", "noopener,noreferrer")
  }

  const handleEmailClick = () => {
    window.location.href = "mailto:hamzazehri2472@gmail.com?subject=LabDesk%20License%20Support"
  }

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950 flex flex-col items-center justify-between p-6 sm:p-10 text-white select-none overflow-y-auto font-sans">
      {/* HEADER PRODUCT MARK */}
      <div className="flex items-center gap-3 pt-4">
        <ProductMark size="md" />
        <div className="text-left">
          <h1 className="text-lg font-bold tracking-tight text-white leading-none">LabDesk</h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Laboratory Management System</p>
        </div>
      </div>

      {/* CENTRAL LOCK CARD */}
      <div className="my-auto max-w-lg w-full bg-slate-900/90 border border-slate-800 p-8 rounded-2xl shadow-2xl text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-rose-950/80 border-2 border-rose-500/60 flex items-center justify-center text-rose-400 shadow-lg animate-pulse">
          <Lock size={40} />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold text-white">{copy.title}</h2>
          <p className="text-xs text-rose-300 bg-rose-950/50 p-3 rounded-xl border border-rose-800/40">
            {copy.body}
          </p>
        </div>

        {/* METADATA BOX */}
        <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl text-left text-xs space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-slate-400 font-medium">Licensed To:</span>
            <span className="font-bold text-slate-100">{summary.licensedTo || db.profile.name || "Laboratory"}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400 font-medium">License Status:</span>
            <Badge tone="red">{summary.label.toUpperCase()}</Badge>
          </div>
          {summary.licenseId !== "—" && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-medium">License ID:</span>
              <span className="font-mono text-cyan-300">{summary.licenseId}</span>
            </div>
          )}
        </div>

        {/* FEEDBACK NOTICE */}
        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center justify-center gap-2 border ${
              feedback.tone === "success"
                ? "bg-emerald-950/80 border-emerald-500/50 text-emerald-300"
                : feedback.tone === "error"
                ? "bg-rose-950/80 border-rose-500/50 text-rose-300"
                : "bg-slate-800 border-slate-700 text-slate-300"
            }`}
          >
            {feedback.tone === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {feedback.message}
          </div>
        )}

        {/* ACTIVATION */}
        {copy.canActivate && (
          <div className="space-y-2.5 text-left">
            <label htmlFor="lock-license-key" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              License Key
            </label>
            <input
              id="lock-license-key"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleActivate()
              }}
              placeholder="LDK-XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm tracking-wider text-cyan-300 outline-none transition-colors placeholder:text-slate-700 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
            />
            <Button variant="primary" className="w-full justify-center py-2.5" onClick={handleActivate} disabled={isActivating}>
              {isActivating ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              {isActivating ? "Activating..." : "Activate LabDesk"}
            </Button>
          </div>
        )}

        {/* ACTIONS */}
        <div className="space-y-3 pt-2">
          {hasStoredLicense && (
            <Button variant="primary" className="w-full justify-center py-2.5" onClick={handleCheckAgain} disabled={isChecking}>
              <RefreshCw size={16} className={isChecking ? "animate-spin" : ""} />
              {isChecking ? "Verifying with Cloud Server..." : "Check License Again"}
            </Button>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button variant="secondary" className="w-full justify-center text-xs" onClick={handleWhatsAppClick}>
              <MessageCircle size={14} className="text-emerald-400" /> Contact on WhatsApp
            </Button>
            <Button variant="secondary" className="w-full justify-center text-xs" onClick={handleEmailClick}>
              <Mail size={14} className="text-cyan-400" /> Email Support
            </Button>
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          {copy.canActivate
            ? "Your laboratory data is safe and will be here once the license is activated."
            : "Please contact your software provider for license reactivation assistance."}
        </p>
      </div>

      {/* FOOTER DEVELOPER ATTRIBUTION */}
      <footer className="pb-4 text-center text-xs text-slate-400 space-y-1">
        <div className="font-semibold text-slate-300">{VENDOR.credit}</div>
        <div className="flex flex-wrap items-center justify-center gap-4 text-slate-400 text-[11px] pt-1">
          <span>WhatsApp: <strong className="text-slate-200">03357981318</strong></span>
          <span>Email: <a href="mailto:hamzazehri2472@gmail.com" className="text-cyan-400 underline">hamzazehri2472@gmail.com</a></span>
          <span>Website: <a href={VENDOR.websiteUrl} target="_blank" rel="noreferrer" className="text-cyan-400 underline">{VENDOR.websiteLine}</a></span>
        </div>
      </footer>
    </div>
  )
}
