/**
 * License Settings Component.
 *
 * Provides customer-facing license state display, key activation form,
 * cloud refresh verification, offline grace status, and support contact details.
 * Strictly hides internal Firebase IDs, developer credentials, or technical stack errors.
 */

import { useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Globe,
  Key,
  KeyRound,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
} from "lucide-react"
import { useLab } from "../app/LabProvider"
import { activateCommercialLicense, refreshLicenseFromCloud, summarizeCommercialLicense } from "../core/licenseService"
import { VENDOR } from "../core/product"
import { Badge, Button, Field, Modal } from "../ui/controls"

export default function LicenseSettings() {
  const { db, update } = useLab()
  const summary = summarizeCommercialLicense(db)

  const [inputKey, setInputKey] = useState("")
  const [isActivating, setIsActivating] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showKeyChangeModal, setShowKeyChangeModal] = useState(false)
  const [showSupportModal, setShowSupportModal] = useState(false)

  const handleActivate = async (keyToUse: string) => {
    const cleanKey = keyToUse.trim()
    if (!cleanKey) {
      setErrorMessage("Please enter a valid LabDesk license key.")
      return
    }

    setIsActivating(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const result = await activateCommercialLicense(cleanKey, db)
      if (result.ok && result.license) {
        update((draft) => {
          draft.license = result.license!
        })
        setSuccessMessage("LabDesk license successfully activated!")
        setInputKey("")
        setShowKeyChangeModal(false)
      } else {
        setErrorMessage(result.error || "License activation failed. Please check key and internet connection.")
      }
    } catch {
      setErrorMessage("Unable to connect to license verification server. Please try again.")
    } finally {
      setIsActivating(false)
    }
  }

  const handleRefreshLicense = async () => {
    setIsRefreshing(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const result = await refreshLicenseFromCloud(db)
      update((draft) => {
        draft.license = result.license
      })

      if (!result.contactedCloud) {
        // Saying "updated from cloud server" when the server was never reached
        // is how a deactivated customer was told everything was fine.
        setErrorMessage(result.error || "The cloud server could not be reached.")
        return
      }

      if (result.license.status === "ACTIVE") {
        setSuccessMessage("License status updated from cloud server: active.")
      } else {
        setErrorMessage(
          `Cloud server reports this license as ${result.license.status}. ${
            result.license.deactivationReason || ""
          }`.trim(),
        )
      }
    } catch {
      setErrorMessage("License refresh failed. Please check internet connection.")
    } finally {
      setIsRefreshing(false)
    }
  }

  const statusToneMap: Record<string, "green" | "blue" | "amber" | "red"> = {
    ACTIVE: "green",
    OFFLINE_GRACE: "amber",
    EXPIRING_SOON: "amber",
    EXPIRED: "red",
    DEACTIVATED: "red",
    SUSPENDED: "red",
    REVOKED: "red",
    NOT_ACTIVATED: "blue",
    VERIFICATION_ERROR: "amber",
    licensed: "green",
    unlicensed: "blue",
  }

  return (
    <div className="license-settings-container space-y-6">
      {/* STATUS HEADER CARD */}
      <div className="panel p-6 bg-slate-900 border border-slate-800 rounded-xl shadow-lg space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${summary.isOperatingAllowed ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60" : "bg-rose-950/80 text-rose-400 border border-rose-800/60"}`}>
              {summary.isOperatingAllowed ? <ShieldCheck size={28} /> : <ShieldAlert size={28} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-white">LabDesk License</h3>
                <Badge tone={statusToneMap[summary.status] || "blue"}>{summary.label}</Badge>
              </div>
              <p className="text-xs text-slate-400 mt-1">{summary.detail}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleRefreshLicense} disabled={isRefreshing}>
              <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
              {isRefreshing ? "Checking..." : "Refresh License"}
            </Button>
            <Button variant="secondary" onClick={() => setShowKeyChangeModal(true)}>
              <Key size={14} /> Change Key
            </Button>
            <Button variant="secondary" onClick={() => setShowSupportModal(true)}>
              Contact Support
            </Button>
          </div>
        </div>

        {/* FEEDBACK MESSAGES */}
        {successMessage && (
          <div className="bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 p-4 rounded-lg text-xs flex items-center gap-2">
            <CheckCircle2 size={16} /> {successMessage}
          </div>
        )}
        {errorMessage && (
          <div className="bg-rose-950/60 border border-rose-500/40 text-rose-300 p-4 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle size={16} /> {errorMessage}
          </div>
        )}

        {/* DEACTIVATED / SUSPENDED WARNING BANNER */}
        {(summary.status === "DEACTIVATED" || summary.status === "SUSPENDED" || summary.status === "REVOKED") && (
          <div className="bg-rose-950/90 border border-rose-500/60 p-5 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
              <AlertCircle size={20} /> License {summary.label}
            </div>
            <p className="text-xs text-rose-200">
              Your LabDesk license is currently inactive. Please contact your software provider to reactivate your license.
            </p>
            <div className="pt-2 flex gap-2">
              <Button variant="primary" onClick={() => setShowSupportModal(true)}>
                Contact Software Provider
              </Button>
              <Button variant="secondary" onClick={() => setShowKeyChangeModal(true)}>
                Enter New License Key
              </Button>
            </div>
          </div>
        )}

        {/* LICENSE METADATA GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="bg-slate-800/40 p-3.5 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Licensed To</span>
            <span className="text-sm font-bold text-slate-100 mt-1 block">{summary.licensedTo}</span>
          </div>

          <div className="bg-slate-800/40 p-3.5 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">License Key (Masked)</span>
            <span className="text-sm font-mono text-cyan-300 mt-1 block">{summary.licenseKeyMasked}</span>
          </div>

          <div className="bg-slate-800/40 p-3.5 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Edition / Plan</span>
            <span className="text-sm font-bold text-slate-100 mt-1 block">{summary.plan}</span>
          </div>

          <div className="bg-slate-800/40 p-3.5 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Expiration Date</span>
            <span className="text-sm font-semibold text-slate-200 mt-1 block">{summary.expiresAt}</span>
          </div>

          <div className="bg-slate-800/40 p-3.5 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Last Cloud Verification</span>
            <span className="text-sm font-semibold text-slate-200 mt-1 block">{summary.lastCheckInAt}</span>
          </div>

          <div className="bg-slate-800/40 p-3.5 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Installation ID</span>
            <span className="text-xs font-mono text-slate-400 mt-1 block truncate" title={summary.installationId}>
              {summary.installationId}
            </span>
          </div>
        </div>
      </div>

      {/* ACTIVATION FORM (SHOWN IF NOT ACTIVATED OR EXPIRING) */}
      {!summary.isOperatingAllowed && summary.status !== "DEACTIVATED" && summary.status !== "SUSPENDED" && (
        <div className="panel p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
          <div className="flex items-center gap-2 text-white font-bold text-lg">
            <KeyRound className="text-cyan-400" size={20} /> License Activation Required
          </div>
          <p className="text-xs text-slate-300">
            Enter your LabDesk commercial license key (<code className="text-cyan-300">LDK-XXXX-XXXX-XXXX-XXXX</code>) below to activate this installation.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <div className="flex-1">
              <Field
                label=""
                value={inputKey}
                onChange={setInputKey}
                placeholder="LDK-XXXX-XXXX-XXXX-XXXX"
              />
            </div>
            <Button
              variant="primary"
              onClick={() => handleActivate(inputKey)}
              disabled={isActivating || !inputKey.trim()}
            >
              {isActivating ? "Activating..." : "Activate License"}
            </Button>
          </div>

          <p className="text-xs text-slate-400 pt-2 border-t border-slate-800/60">
            Need a license? Contact your LabDesk software provider: <strong>{VENDOR.developer}</strong> ({VENDOR.websiteLine})
          </p>
        </div>
      )}

      {/* CHANGE KEY MODAL */}
      {showKeyChangeModal && (
        <Modal title="Enter License Key" description="Activate or update your LabDesk software license key" onClose={() => setShowKeyChangeModal(false)}>
          <div className="space-y-4">
            <Field
              label="License Key"
              value={inputKey}
              onChange={setInputKey}
              placeholder="LDK-XXXX-XXXX-XXXX-XXXX"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowKeyChangeModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => handleActivate(inputKey)} disabled={isActivating || !inputKey.trim()}>
                {isActivating ? "Activating..." : "Activate"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* SUPPORT MODAL */}
      {showSupportModal && (
        <Modal title="LabDesk Software Support" description="Commercial license and technical support" onClose={() => setShowSupportModal(false)}>
          <div className="space-y-4 text-xs text-slate-200">
            <div className="bg-slate-800/60 p-4 rounded-xl space-y-2 border border-slate-700">
              <div className="font-bold text-sm text-white flex items-center gap-2">
                <User size={16} className="text-cyan-400" /> {VENDOR.developer}
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Globe size={14} /> <a href={VENDOR.websiteUrl} target="_blank" rel="noreferrer" className="text-cyan-400 underline">{VENDOR.websiteLine}</a>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Shield size={14} /> LabDesk Software License Provider
              </div>
            </div>

            <p className="text-slate-400">
              For license renewal, key reactivation, adding computer installation capacity, or technical inquiries, please contact your software provider.
            </p>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setShowSupportModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
