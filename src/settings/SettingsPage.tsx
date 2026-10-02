/**
 * Settings.
 *
 * Everything a customer can re-brand or re-configure lives here, grouped into
 * categories. Changes apply to the whole installation immediately on save, and
 * the Laboratory Profile section carries a live report and receipt preview so
 * the customer can see exactly what will print.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  Building2,
  Database,
  Eye,
  FileCheck2,
  FileText,
  FlaskConical,
  History,
  Info,
  KeyRound,
  LockKeyhole,
  Palette,
  Printer,
  Receipt,
  RotateCcw,
  Save,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useLab } from "../app/LabProvider"
import { getBridge } from "../core/bridge"
import { describeDatabase } from "../core/database"
import { formatDateTime } from "../core/format"
import { downloadTextFile, backupFileName, parseBackup, describeBackup } from "../core/backup"
import { checkPassword } from "../core/password"
import { PRODUCT_NAME, PRODUCT_VERSION, VENDOR } from "../core/product"
import { createId, now } from "../core/defaults"
import type { LabDatabase, LaboratoryProfile, Patient, StaffRole, StaffUser } from "../core/types"
import AboutScreen from "../ui/AboutScreen"
import LicenseSettings from "./LicenseSettings"
import Brand, { ProductMark } from "../ui/Brand"
import LogoUpload from "../ui/LogoUpload"
import {
  Badge,
  Button,
  Field,
  Modal,
  SectionHeading,
  TextArea,
  Toggle,
} from "../ui/controls"
import ReportDocument from "../reports/ReportDocument"
import ReceiptDocument from "../reports/ReceiptDocument"
import { buildReportModel } from "../reports/reportModel"
import { buildReceiptModel } from "../reports/receiptModel"
import { sanitizePrefix } from "../setup/SetupWizard"
import type { ReactNode } from "react"

type SectionId =
  | "profile"
  | "branding"
  | "report"
  | "receipt"
  | "printer"
  | "tests"
  | "payment"
  | "users"
  | "security"
  | "license"
  | "backup"
  | "about"

export type SettingsSection = SectionId

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { id: "profile", label: "Laboratory Profile", icon: Building2 },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "report", label: "Report Settings", icon: FileCheck2 },
  { id: "receipt", label: "Receipt Settings", icon: Receipt },
  { id: "printer", label: "Printer Settings", icon: Printer },
  { id: "tests", label: "Test Settings", icon: FlaskConical },
  { id: "payment", label: "Payment Settings", icon: Wallet },
  { id: "users", label: "User Settings", icon: Users, adminOnly: true },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "license", label: "License & Activation", icon: KeyRound },
  { id: "backup", label: "Backup & Reset", icon: Database, adminOnly: true },
  { id: "about", label: "About", icon: Info },
]

export type SettingsNotify = (message: string, tone?: "success" | "warning" | "error") => void

type Props = {
  notify: SettingsNotify
  onNavigate: (page: "Tests" | "Staff" | "Audit Log") => void
  /** Section shown on arrival, so a nav item can deep-link into settings. */
  initialSection?: SectionId
}

export default function SettingsPage({ notify, onNavigate, initialSection = "profile" }: Props) {
  const lab = useLab()
  const { db, session } = lab
  const [section, setSection] = useState<SectionId>(initialSection)
  const isAdmin = session?.role === "Administrator"

  const visibleSections = SECTIONS.filter((s) => !s.adminOnly || isAdmin)

  return (
    <div className="settings-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">CONFIGURATION</div>
          <h1>Settings</h1>
          <p>
            {db.profile.name
              ? `Everything below belongs to ${db.profile.name}.`
              : "Configure this installation for your laboratory."}{" "}
            Changes take effect immediately.
          </p>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-menu panel" aria-label="Settings categories">
          {visibleSections.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={section === item.id ? "active" : ""}
                onClick={() => setSection(item.id)}
              >
                <Icon size={19} />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="settings-content">
          {section === "profile" && <ProfileSection notify={notify} onNavigate={onNavigate} />}
          {section === "branding" && <BrandingSection notify={notify} />}
          {section === "report" && <ReportSection notify={notify} />}
          {section === "receipt" && <ReceiptSection notify={notify} />}
          {section === "printer" && <PrinterSection notify={notify} />}
          {section === "tests" && <TestSection notify={notify} onNavigate={onNavigate} />}
          {section === "payment" && <PaymentSection notify={notify} />}
          {section === "users" && isAdmin && <UsersSection notify={notify} onNavigate={onNavigate} />}
          {section === "security" && <SecuritySection notify={notify} />}
          {section === "license" && <LicenseSettings />}
          {section === "backup" && isAdmin && <BackupSection notify={notify} />}
          {section === "about" && <AboutScreen />}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Panel wrapper                                                               */
/* -------------------------------------------------------------------------- */

const Panel = ({
  id,
  title,
  subtitle,
  children,
  actions,
}: {
  id: string
  title: string
  subtitle: string
  children: ReactNode
  actions?: ReactNode
}) => (
  <section className="panel settings-panel" id={id}>
    <SectionHeading title={title} subtitle={subtitle} />
    {children}
    {actions && <div className="settings-actions">{actions}</div>}
  </section>
)

/* -------------------------------------------------------------------------- */
/* Live preview helpers                                                        */
/* -------------------------------------------------------------------------- */

/** A neutral sample record so a customer can see their branding before any patient exists. */
const buildPreviewPatient = (db: LabDatabase): Patient => {
  const test = db.tests.find((t) => t.active) ?? null
  const timestamp = now()
  return {
    id: `${db.profile.idPrefixes.patient || "LAB"}-0001`,
    reportId: `${db.profile.idPrefixes.report || "RPT"}-0001`,
    sampleId: `${db.profile.idPrefixes.sample || "SMP"}-0001`,
    name: "Sample Patient",
    age: "35",
    gender: "Female",
    phone: "",
    cnic: "",
    bloodGroup: "",
    address: "",
    notes: "",
    doctorId: "",
    doctorName: "Walk-in",
    testCodes: test ? [test.code] : [],
    sampleType: test?.sampleType ?? "Blood",
    discount: 0,
    total: test?.price ?? 0,
    paid: 0,
    paymentMethod: db.paymentSettings.paymentMethods[0] ?? "Cash",
    reportStatus: "Ready",
    sampleStatus: "Completed",
    results: Object.fromEntries(
      (test?.parameters ?? []).map((parameter, index) => [
        parameter.id,
        parameter.low !== null && parameter.high !== null
          ? String(
              Math.round(((parameter.low + parameter.high) / 2) * 100) / 100,
            )
          : "",
      ]),
    ),
    technicianNote: "",
    collectedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

/** Merges unsaved draft values so the preview reflects what the operator sees. */
const usePreviewDatabase = (overrides: Partial<LabDatabase>) => {
  const { db } = useLab()
  return useMemo<LabDatabase>(
    () => ({
      ...db,
      ...overrides,
      profile: { ...db.profile, ...(overrides.profile ?? {}) },
      branding: { ...db.branding, ...(overrides.branding ?? {}) },
      reportSettings: { ...db.reportSettings, ...(overrides.reportSettings ?? {}) },
      receiptSettings: { ...db.receiptSettings, ...(overrides.receiptSettings ?? {}) },
      printerSettings: { ...db.printerSettings, ...(overrides.printerSettings ?? {}) },
    }),
    [db, overrides],
  )
}

const PreviewTabs = ({ children }: { children: ReactNode }) => (
  <div className="preview-tabs">{children}</div>
)

/* -------------------------------------------------------------------------- */
/* Laboratory profile                                                          */
/* -------------------------------------------------------------------------- */

function ProfileSection({ notify, onNavigate }: { notify: SettingsNotify; onNavigate: Props["onNavigate"] }) {
  const { db, update, addAudit } = useLab()
  const [draft, setDraft] = useState<LaboratoryProfile>(db.profile)
  const [tab, setTab] = useState<"report" | "receipt">("report")
  const dirty = JSON.stringify(draft) !== JSON.stringify(db.profile)

  const preview = usePreviewDatabase({ profile: draft })
  const previewPatient = useMemo(() => buildPreviewPatient(preview), [preview])
  const reportModel = useMemo(
    () =>
      buildReportModel(preview, previewPatient, {
        productName: PRODUCT_NAME,
        vendorCredit: VENDOR.credit,
        vendorWebsite: VENDOR.websiteLine,
      }),
    [preview, previewPatient],
  )
  const receiptModel = useMemo(
    () =>
      buildReceiptModel(preview, previewPatient, {
        vendorCredit: VENDOR.credit,
        vendorWebsite: VENDOR.websiteLine,
      }),
    [preview, previewPatient],
  )

  const set = <K extends keyof LaboratoryProfile>(key: K, value: LaboratoryProfile[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const save = () => {
    if (!draft.name.trim()) return notify("Laboratory name is required.", "error")
    update((database) => {
      database.profile = { ...draft, name: draft.name.trim(), updatedAt: now() }
    })
    addAudit("Laboratory Profile Updated", db.installation.code, draft.name)
    notify("Laboratory profile saved. Your branding is updated everywhere.")
  }

  return (
    <>
      <Panel
        id="settings-profile"
        title="Laboratory profile"
        subtitle="These details appear on your reports, receipts and sign-in screen."
        actions={
          <>
            {dirty && (
              <Button variant="ghost" icon={RotateCcw} onClick={() => setDraft(db.profile)}>
                Discard changes
              </Button>
            )}
            <Button icon={Save} onClick={save} disabled={!dirty}>
              Save changes
            </Button>
          </>
        }
      >
        <LogoUpload
          logo={draft.logo}
          onChange={(logo) => set("logo", logo)}
          onError={(message) => notify(message, "error")}
          fallback={<ProductMark size="lg" />}
        />
        <div className="settings-form-grid">
          <Field label="Laboratory name" value={draft.name} onChange={(v) => set("name", v)} required />
          <Field label="Short name" value={draft.shortName} onChange={(v) => set("shortName", v)} />
          <Field label="Tagline" value={draft.tagline} onChange={(v) => set("tagline", v)} />
          <Field
            label="Laboratory type"
            value={draft.type}
            onChange={(v) => set("type", v as LaboratoryProfile["type"])}
            options={[
              "Diagnostic Laboratory",
              "Pathology Laboratory",
              "Medical Laboratory",
              "Hospital Laboratory",
              "Diagnostic Center",
              "Clinical Laboratory",
              "Reference Laboratory",
              "Other",
            ]}
          />
          <Field label="Registration / licence number" value={draft.licenseNumber} onChange={(v) => set("licenseNumber", v)} />
          <Field label="Tax / NTN number" value={draft.taxNumber} onChange={(v) => set("taxNumber", v)} />
          <div className="full-span">
            <Field label="Street address" value={draft.address} onChange={(v) => set("address", v)} />
          </div>
          <Field label="City" value={draft.city} onChange={(v) => set("city", v)} />
          <Field label="Province / state" value={draft.province} onChange={(v) => set("province", v)} />
          <Field label="Country" value={draft.country} onChange={(v) => set("country", v)} />
          <Field label="Phone 1" value={draft.phone} onChange={(v) => set("phone", v)} />
          <Field label="Phone 2" value={draft.phone2} onChange={(v) => set("phone2", v)} />
          <Field label="WhatsApp" value={draft.whatsapp} onChange={(v) => set("whatsapp", v)} />
          <Field label="Email" value={draft.email} onChange={(v) => set("email", v)} type="email" />
          <Field label="Website" value={draft.website} onChange={(v) => set("website", v)} />
        </div>
        <div className="settings-form-grid">
          <Field
            label="Patient ID prefix"
            value={draft.idPrefixes.patient}
            onChange={(v) => set("idPrefixes", { ...draft.idPrefixes, patient: sanitizePrefix(v) })}
            hint="Existing records keep their numbers."
          />
          <Field
            label="Report ID prefix"
            value={draft.idPrefixes.report}
            onChange={(v) => set("idPrefixes", { ...draft.idPrefixes, report: sanitizePrefix(v) })}
          />
        </div>
      </Panel>

      <section className="panel settings-panel preview-panel">
        <SectionHeading
          title="Branding preview"
          subtitle="Exactly what your laboratory will print. Updates as you type."
        />
        <PreviewTabs>
          <button className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}>
            <FileCheck2 size={16} /> Report preview
          </button>
          <button className={tab === "receipt" ? "active" : ""} onClick={() => setTab("receipt")}>
            <FileText size={16} /> Receipt preview
          </button>
        </PreviewTabs>
        <div className="preview-stage">
          {tab === "report" ? (
            <ReportDocument model={reportModel} preview />
          ) : (
            <ReceiptDocument model={receiptModel} preview />
          )}
        </div>
      </section>

      <Panel
        id="settings-profile-data"
        title="Laboratory records"
        subtitle="Tests, prices, doctors and staff belong to this laboratory."
      >
        <div className="settings-link-grid">
          <button onClick={() => onNavigate("Tests")}>
            <FlaskConical size={19} />
            <span>
              <strong>{db.tests.length} tests in the catalog</strong>
              <small>Names, parameters, reference ranges and prices</small>
            </span>
          </button>
          <button onClick={() => onNavigate("Staff")}>
            <Users size={19} />
            <span>
              <strong>{db.users.length} staff accounts</strong>
              <small>Roles, sign-in and access</small>
            </span>
          </button>
          <button onClick={() => onNavigate("Audit Log")}>
            <History size={19} />
            <span>
              <strong>{db.audit.length} audit entries</strong>
              <small>Who did what, and when</small>
            </span>
          </button>
        </div>
      </Panel>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Branding                                                                    */
/* -------------------------------------------------------------------------- */

function BrandingSection({ notify }: { notify: SettingsNotify }) {
  const { db, update } = useLab()
  const [draft, setDraft] = useState(db.branding)
  const dirty = JSON.stringify(draft) !== JSON.stringify(db.branding)
  const preview = usePreviewDatabase({ branding: draft })

  return (
    <Panel
      id="settings-branding"
      title="Branding"
      subtitle="Decide where the laboratory identity appears inside the application."
      actions={
        <>
          {dirty && (
            <Button variant="ghost" icon={RotateCcw} onClick={() => setDraft(db.branding)}>
              Discard changes
            </Button>
          )}
          <Button
            icon={Save}
            disabled={!dirty}
            onClick={() => {
              update((database) => {
                database.branding = draft
              })
              notify("Branding settings saved.")
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="settings-link-grid branding-preview-row">
        <div className="settings-preview-tile">
          <small>APPLICATION HEADER</small>
          <div className="settings-preview-brand">
            <Brand size="sm" />
          </div>
        </div>
        <div className="settings-preview-tile">
          <small>PRODUCT IDENTITY</small>
          <div className="settings-preview-product">
            <ProductMark size="sm" />
            <span>
              <strong>{PRODUCT_NAME}</strong>
              <small>Laboratory Management System</small>
            </span>
          </div>
        </div>
      </div>

      <div className="settings-form-grid">
        <Field
          label="Show the logo inside the application"
          value={draft.showLogoInApp}
          onChange={(v) => setDraft({ ...draft, showLogoInApp: v as typeof draft.showLogoInApp })}
          options={["everywhere", "header", "off"]}
        />
        <Field
          label="Show the laboratory name inside the application"
          value={draft.showNameInApp}
          onChange={(v) => setDraft({ ...draft, showNameInApp: v as typeof draft.showNameInApp })}
          options={["everywhere", "header", "off"]}
        />
      </div>
      <div className="settings-form-grid">
        <Field
          label="Accent colour"
          value={draft.accentColor}
          onChange={(v) => setDraft({ ...draft, accentColor: v })}
          type="color"
          hint="Used by reports, receipts and printed headers."
        />
      </div>
      <Toggle
        label="Show the product name in the application"
        description="For example “Powered by LabDesk” under your laboratory name."
        checked={draft.showProductNameInApp}
        onChange={(v) => setDraft({ ...draft, showProductNameInApp: v })}
      />
      <Toggle
        label="Show the product name on printed output"
        description="Adds “Powered by LabDesk” to reports and receipts."
        checked={draft.showProductNameOnPrint}
        onChange={(v) => setDraft({ ...draft, showProductNameOnPrint: v })}
      />
      <Toggle
        label="Show the developer credit on printed output"
        description={`${VENDOR.credit} · ${VENDOR.websiteLine}`}
        checked={draft.showVendorCreditOnPrint}
        onChange={(v) => setDraft({ ...draft, showVendorCreditOnPrint: v })}
      />
      <div className="setup-callout">
        <ShieldCheck size={18} />
        <span>
          Your laboratory always remains the primary identity. Product and vendor
          names are only ever shown where you enable them.
        </span>
      </div>
    </Panel>
  )
}

/* -------------------------------------------------------------------------- */
/* Report settings                                                             */
/* -------------------------------------------------------------------------- */

function ReportSection({ notify }: { notify: SettingsNotify }) {
  const { db, update } = useLab()
  const patients = db.patients
  const [draft, setDraft] = useState(db.reportSettings)
  const dirty = JSON.stringify(draft) !== JSON.stringify(db.reportSettings)
  const preview = usePreviewDatabase({ reportSettings: draft })
  const previewPatient = useMemo(() => buildPreviewPatient(preview), [preview])
  const model = useMemo(
    () =>
      buildReportModel(preview, previewPatient, {
        productName: PRODUCT_NAME,
        vendorCredit: VENDOR.credit,
        vendorWebsite: VENDOR.websiteLine,
      }),
    [preview, previewPatient],
  )

  return (
    <>
      <Panel
        id="settings-report"
        title="Report settings"
        subtitle="Layout, header fields, signature labels and footer text for your A4 report."
        actions={
          <>
            {dirty && (
              <Button variant="ghost" icon={RotateCcw} onClick={() => setDraft(db.reportSettings)}>
                Discard changes
              </Button>
            )}
            <Button
              icon={Save}
              disabled={!dirty}
              onClick={() => {
                update((database) => {
                  database.reportSettings = draft
                })
                notify("Report settings saved.")
              }}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="settings-form-grid">
          <Field label="Document title" value={draft.documentTitle} onChange={(v) => setDraft({ ...draft, documentTitle: v })} />
          <Field label="Document subtitle" value={draft.documentSubtitle} onChange={(v) => setDraft({ ...draft, documentSubtitle: v })} />
          <Field
            label="Header alignment"
            value={draft.headerAlignment}
            onChange={(v) => setDraft({ ...draft, headerAlignment: v as typeof draft.headerAlignment })}
            options={["left", "center", "right"]}
          />
        </div>

        <h4 className="settings-subheading">Header fields</h4>
        <div className="settings-form-grid">
          <Toggle label="Logo" checked={draft.showLogo} onChange={(v) => setDraft({ ...draft, showLogo: v })} />
          <Toggle label="Laboratory name" checked={draft.showLaboratoryName} onChange={(v) => setDraft({ ...draft, showLaboratoryName: v })} />
          <Toggle label="Tagline / type" checked={draft.showTagline} onChange={(v) => setDraft({ ...draft, showTagline: v })} />
          <Toggle label="Address" checked={draft.showAddress} onChange={(v) => setDraft({ ...draft, showAddress: v })} />
          <Toggle label="Phone" checked={draft.showPhone} onChange={(v) => setDraft({ ...draft, showPhone: v })} />
          <Toggle label="Email" checked={draft.showEmail} onChange={(v) => setDraft({ ...draft, showEmail: v })} />
          <Toggle label="Website" checked={draft.showWebsite} onChange={(v) => setDraft({ ...draft, showWebsite: v })} />
          <Toggle label="Licence number" checked={draft.showLicenseNumber} onChange={(v) => setDraft({ ...draft, showLicenseNumber: v })} />
          <Toggle label="Tax / NTN number" checked={draft.showTaxNumber} onChange={(v) => setDraft({ ...draft, showTaxNumber: v })} />
        </div>

        <h4 className="settings-subheading">Result table columns</h4>
        <div className="settings-form-grid">
          <Toggle label="Parameter" checked={draft.resultColumns.parameter} onChange={(v) => setDraft({ ...draft, resultColumns: { ...draft.resultColumns, parameter: v } })} />
          <Toggle label="Result" checked={draft.resultColumns.result} onChange={(v) => setDraft({ ...draft, resultColumns: { ...draft.resultColumns, result: v } })} />
          <Toggle label="Unit" checked={draft.resultColumns.unit} onChange={(v) => setDraft({ ...draft, resultColumns: { ...draft.resultColumns, unit: v } })} />
          <Toggle label="Reference range" checked={draft.resultColumns.referenceRange} onChange={(v) => setDraft({ ...draft, resultColumns: { ...draft.resultColumns, referenceRange: v } })} />
          <Toggle label="Flag" checked={draft.resultColumns.flag} onChange={(v) => setDraft({ ...draft, resultColumns: { ...draft.resultColumns, flag: v } })} />
        </div>

        <h4 className="settings-subheading">Signature blocks</h4>
        <div className="settings-form-grid">
          <Field label="Technician label" value={draft.signatureLabels.technician} onChange={(v) => setDraft({ ...draft, signatureLabels: { ...draft.signatureLabels, technician: v } })} />
          <Field label="Verified by label" value={draft.signatureLabels.verifiedBy} onChange={(v) => setDraft({ ...draft, signatureLabels: { ...draft.signatureLabels, verifiedBy: v } })} />
          <Field label="Pathologist label" value={draft.signatureLabels.pathologist} onChange={(v) => setDraft({ ...draft, signatureLabels: { ...draft.signatureLabels, pathologist: v } })} />
          <Field label="Director label" value={draft.signatureLabels.director} onChange={(v) => setDraft({ ...draft, signatureLabels: { ...draft.signatureLabels, director: v } })} />
        </div>
        <div className="settings-form-grid">
          {(["technician", "verifiedBy", "pathologist", "director"] as const).map((slot) => (
            <Toggle
              key={slot}
              label={draft.signatureLabels[slot]}
              checked={draft.showSignatures.includes(slot)}
              onChange={(v) =>
                setDraft({
                  ...draft,
                  showSignatures: v
                    ? [...draft.showSignatures, slot]
                    : draft.showSignatures.filter((s) => s !== slot),
                })
              }
            />
          ))}
        </div>

        <h4 className="settings-subheading">Notes, disclaimer and footer</h4>
        <div className="settings-form-grid">
          <Field label="Notes label" value={draft.notesLabel} onChange={(v) => setDraft({ ...draft, notesLabel: v })} />
          <Toggle label="Show the report footer" checked={draft.showReportFooter} onChange={(v) => setDraft({ ...draft, showReportFooter: v })} />
        </div>
        <div className="settings-form-grid">
          <div className="full-span">
            <TextArea label="Disclaimer / interpretation note" value={draft.disclaimer} onChange={(v) => setDraft({ ...draft, disclaimer: v })} />
          </div>
          <div className="full-span">
            <TextArea label="Footer text" value={draft.footerText} onChange={(v) => setDraft({ ...draft, footerText: v })} />
          </div>
        </div>
      </Panel>

      <section className="panel settings-panel preview-panel">
        <SectionHeading
          title="Report preview"
          subtitle={
            patients.length
              ? "Rendered with your configuration. Open a patient's report to print a real one."
              : "Add a test to your catalog to see result rows here."
          }
        />
        <div className="preview-stage">
          <ReportDocument model={model} preview />
        </div>
      </section>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Receipt settings                                                            */
/* -------------------------------------------------------------------------- */

function ReceiptSection({ notify }: { notify: SettingsNotify }) {
  const { db, update } = useLab()
  const [draft, setDraft] = useState(db.receiptSettings)
  const dirty = JSON.stringify(draft) !== JSON.stringify(db.receiptSettings)
  const preview = usePreviewDatabase({ receiptSettings: draft })
  const previewPatient = useMemo(() => buildPreviewPatient(preview), [preview])
  const model = useMemo(
    () =>
      buildReceiptModel(preview, previewPatient, {
        vendorCredit: VENDOR.credit,
        vendorWebsite: VENDOR.websiteLine,
      }),
    [preview, previewPatient],
  )

  return (
    <>
      <Panel
        id="settings-receipt"
        title="Receipt settings"
        subtitle="Choose exactly what your thermal receipt prints."
        actions={
          <>
            {dirty && (
              <Button variant="ghost" icon={RotateCcw} onClick={() => setDraft(db.receiptSettings)}>
                Discard changes
              </Button>
            )}
            <Button
              icon={Save}
              disabled={!dirty}
              onClick={() => {
                update((database) => {
                  database.receiptSettings = draft
                })
                notify("Receipt settings saved.")
              }}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="settings-form-grid">
          <Toggle label="Logo (if the printer supports it)" checked={draft.showLogo} onChange={(v) => setDraft({ ...draft, showLogo: v })} />
          <Toggle label="Laboratory name" checked={draft.showLaboratoryName} onChange={(v) => setDraft({ ...draft, showLaboratoryName: v })} />
          <Toggle label="Tagline / type" checked={draft.showTagline} onChange={(v) => setDraft({ ...draft, showTagline: v })} />
          <Toggle label="Address" checked={draft.showAddress} onChange={(v) => setDraft({ ...draft, showAddress: v })} />
          <Toggle label="Phone" checked={draft.showPhone} onChange={(v) => setDraft({ ...draft, showPhone: v })} />
          <Toggle label="WhatsApp" checked={draft.showWhatsapp} onChange={(v) => setDraft({ ...draft, showWhatsapp: v })} />
          <Toggle label="Licence number" checked={draft.showLicenseNumber} onChange={(v) => setDraft({ ...draft, showLicenseNumber: v })} />
          <Toggle label="Test list" checked={draft.showTests} onChange={(v) => setDraft({ ...draft, showTests: v })} />
          <Toggle label="Payment summary" checked={draft.showPaymentSummary} onChange={(v) => setDraft({ ...draft, showPaymentSummary: v })} />
          <Toggle label="Payment method" checked={draft.showPaymentMethod} onChange={(v) => setDraft({ ...draft, showPaymentMethod: v })} />
          <Toggle label="Barcode" checked={draft.showBarcode} onChange={(v) => setDraft({ ...draft, showBarcode: v })} />
          <Toggle label="Expected report date" checked={draft.showExpectedReport} onChange={(v) => setDraft({ ...draft, showExpectedReport: v })} />
          <Toggle label="Thank-you line" checked={draft.showThankYou} onChange={(v) => setDraft({ ...draft, showThankYou: v })} />
          <Toggle label="Developer credit" checked={draft.showVendorCredit} onChange={(v) => setDraft({ ...draft, showVendorCredit: v })} />
        </div>
        <div className="settings-form-grid">
          <div className="full-span">
            <TextArea
              label="Collection instructions"
              value={draft.collectionInstructions}
              onChange={(v) => setDraft({ ...draft, collectionInstructions: v })}
            />
          </div>
          <div className="full-span">
            <Field
              label="Thank-you text"
              value={draft.thankYouText}
              onChange={(v) => setDraft({ ...draft, thankYouText: v })}
              hint="Use {{laboratoryName}}, {{phone}} or {{city}} to insert your own details."
            />
          </div>
          <div className="full-span">
            <TextArea label="Footer text" value={draft.footerText} onChange={(v) => setDraft({ ...draft, footerText: v })} />
          </div>
        </div>
      </Panel>

      <section className="panel settings-panel preview-panel">
        <SectionHeading
          title="Receipt preview"
          subtitle={`Rendered at ${db.printerSettings.receiptPaper} thermal width.`}
        />
        <div className="preview-stage">
          <ReceiptDocument model={model} preview />
        </div>
      </section>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Printer, tests, payment                                                     */
/* -------------------------------------------------------------------------- */

function PrinterSection({ notify }: { notify: SettingsNotify }) {
  const { db, update } = useLab()
  const [draft, setDraft] = useState(db.printerSettings)
  const [printers, setPrinters] = useState<string[]>([])
  const dirty = JSON.stringify(draft) !== JSON.stringify(db.printerSettings)
  const bridge = getBridge()

  useEffect(() => {
    let active = true
    bridge?.printers
      .list()
      .then((list) => {
        if (active) setPrinters(list)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [bridge])

  // A previously chosen printer may be offline today. Keep it selectable so
  // saving another change never silently resets the choice.
  const printerOptions = (selected: string) => {
    const names = selected && !printers.includes(selected) ? [selected, ...printers] : printers
    return names.map((name) => (
      <option key={name} value={name}>
        {name}
      </option>
    ))
  }

  return (
    <Panel
      id="settings-printer"
      title="Printer settings"
      subtitle="Choose which printer each kind of output is sent to, and how many copies to make."
      actions={
        <>
          {dirty && (
            <Button variant="ghost" icon={RotateCcw} onClick={() => setDraft(db.printerSettings)}>
              Discard changes
            </Button>
          )}
          <Button
            icon={Save}
            disabled={!dirty}
            onClick={() => {
              update((database) => {
                database.printerSettings = draft
              })
              notify("Printer settings saved.")
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="settings-form-grid">
        <div className="full-span">
          <label className="field">
            <span className="field-label">Thermal / receipt printer</span>
            <select
              value={draft.thermalPrinterName}
              onChange={(e) => setDraft({ ...draft, thermalPrinterName: e.target.value })}
            >
              <option value="">Use system default</option>
              {printerOptions(draft.thermalPrinterName)}
            </select>
            <small>Used by “Print receipt” on the thermal receipt screen.</small>
          </label>
        </div>
        <div className="full-span">
          <label className="field">
            <span className="field-label">A4 report printer</span>
            <select
              value={draft.reportPrinterName}
              onChange={(e) => setDraft({ ...draft, reportPrinterName: e.target.value })}
            >
              <option value="">Use system default</option>
              {printerOptions(draft.reportPrinterName)}
            </select>
            <small>Used by “Print report” on the report preview screen.</small>
          </label>
        </div>
        <Field
          label="Report paper"
          value={draft.reportPaper}
          onChange={(v) => setDraft({ ...draft, reportPaper: v as typeof draft.reportPaper })}
          options={["A4", "Letter"]}
        />
        <Field
          label="Receipt paper"
          value={draft.receiptPaper}
          onChange={(v) => setDraft({ ...draft, receiptPaper: v as typeof draft.receiptPaper })}
          options={["80mm", "58mm"]}
        />
        <Field label="Report copies" value={String(draft.reportCopies)} onChange={(v) => setDraft({ ...draft, reportCopies: Number(v) || 1 })} type="number" min={1} />
        <Field label="Receipt copies" value={String(draft.receiptCopies)} onChange={(v) => setDraft({ ...draft, receiptCopies: Number(v) || 1 })} type="number" min={1} />
      </div>
      <div className="info-callout">
        {bridge
          ? printers.length
            ? `Detected ${printers.length} printer${printers.length === 1 ? "" : "s"} on this device.`
            : "No printers were detected. Install a printer, then reopen this panel."
          : "Open LabDesk in the desktop application to list printers here. In a browser, printing uses the system dialog."}
      </div>
    </Panel>
  )
}

function TestSection({ notify, onNavigate }: { notify: SettingsNotify; onNavigate: Props["onNavigate"] }) {
  const { db, update } = useLab()
  const [draft, setDraft] = useState(db.testSettings)
  const dirty = JSON.stringify(draft) !== JSON.stringify(db.testSettings)

  return (
    <>
      <Panel
        id="settings-tests"
        title="Test settings"
        subtitle="Categories, sample types and default turnaround used when you add tests."
        actions={
          <>
            {dirty && (
              <Button variant="ghost" icon={RotateCcw} onClick={() => setDraft(db.testSettings)}>
                Discard changes
              </Button>
            )}
            <Button
              icon={Save}
              disabled={!dirty}
              onClick={() => {
                update((database) => {
                  database.testSettings = draft
                })
                notify("Test settings saved.")
              }}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="settings-form-grid">
          <div className="full-span">
            <Field
              label="Categories (comma separated)"
              value={draft.categories.join(", ")}
              onChange={(v) => setDraft({ ...draft, categories: splitList(v) })}
            />
          </div>
          <div className="full-span">
            <Field
              label="Sample types (comma separated)"
              value={draft.sampleTypes.join(", ")}
              onChange={(v) => setDraft({ ...draft, sampleTypes: splitList(v) })}
            />
          </div>
          <Field
            label="Default category"
            value={draft.defaultCategory}
            onChange={(v) => setDraft({ ...draft, defaultCategory: v })}
            options={draft.categories}
          />
          <Field
            label="Default turnaround (hours)"
            value={String(draft.defaultTurnaroundHours)}
            onChange={(v) => setDraft({ ...draft, defaultTurnaroundHours: Number(v) || 24 })}
            type="number"
            min={1}
          />
        </div>
        <Toggle
          label="Allow discounts at registration"
          description="Turn this off to disable the discount field when registering a patient."
          checked={draft.allowDiscount}
          onChange={(v) => setDraft({ ...draft, allowDiscount: v })}
        />
      </Panel>

      <Panel
        id="settings-catalog"
        title="Test catalog"
        subtitle="Your tests, parameters, reference ranges and prices. Prices belong to this laboratory only."
      >
        <div className="settings-link-grid">
          <button onClick={() => onNavigate("Tests")}>
            <FlaskConical size={19} />
            <span>
              <strong>{db.tests.length} tests configured</strong>
              <small>
                {db.tests.filter((t) => t.active).length} active ·{" "}
                {db.tests.reduce((sum, t) => sum + t.parameters.length, 0)} parameters
              </small>
            </span>
          </button>
        </div>
        <Button variant="secondary" icon={Eye} onClick={() => onNavigate("Tests")}>
          Open test management
        </Button>
      </Panel>
    </>
  )
}

function PaymentSection({ notify }: { notify: SettingsNotify }) {
  const { db, update } = useLab()
  const [draft, setDraft] = useState(db.paymentSettings)
  const dirty = JSON.stringify(draft) !== JSON.stringify(db.paymentSettings)
  const formatSample = (amount: number) =>
    draft.currencyPosition === "suffix"
      ? `${amount.toLocaleString()} ${draft.currencySymbol}`
      : `${draft.currencySymbol} ${amount.toLocaleString()}`

  return (
    <Panel
      id="settings-payment"
      title="Payment settings"
      subtitle="Currency and payment methods used on receipts and invoices."
      actions={
        <>
          {dirty && (
            <Button variant="ghost" icon={RotateCcw} onClick={() => setDraft(db.paymentSettings)}>
              Discard changes
            </Button>
          )}
          <Button
            icon={Save}
            disabled={!dirty}
            onClick={() => {
              update((database) => {
                database.paymentSettings = draft
              })
              notify("Payment settings saved.")
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="settings-form-grid">
        <Field label="Currency symbol" value={draft.currencySymbol} onChange={(v) => setDraft({ ...draft, currencySymbol: v })} />
        <Field label="Currency code" value={draft.currencyCode} onChange={(v) => setDraft({ ...draft, currencyCode: v.toUpperCase() })} placeholder="e.g. PKR, USD, AED" />
        <Field
          label="Symbol position"
          value={draft.currencyPosition}
          onChange={(v) => setDraft({ ...draft, currencyPosition: v as typeof draft.currencyPosition })}
          options={["prefix", "suffix"]}
        />
        <Field label="Tax (%)" value={String(draft.taxPercent)} onChange={(v) => setDraft({ ...draft, taxPercent: Number(v) || 0 })} type="number" min={0} />
        <div className="full-span">
          <Field
            label="Payment methods (comma separated)"
            value={draft.paymentMethods.join(", ")}
            onChange={(v) => setDraft({ ...draft, paymentMethods: splitList(v) })}
          />
        </div>
      </div>
      <Toggle
        label="Allow partial payment"
        description="Patients may pay part of the total now and settle the balance later."
        checked={draft.allowPartialPayment}
        onChange={(v) => setDraft({ ...draft, allowPartialPayment: v })}
      />
      <div className="currency-sample">
        <Wallet size={18} />
        <span>
          Amounts will print as <b>{formatSample(1250)}</b> and <b>{formatSample(99.5)}</b>.
        </span>
      </div>
    </Panel>
  )
}

/* -------------------------------------------------------------------------- */
/* Users                                                                       */
/* -------------------------------------------------------------------------- */

const ROLES: StaffRole[] = ["Administrator", "Receptionist", "Technician", "Pathologist", "Accountant"]

function UsersSection({ notify, onNavigate }: { notify: SettingsNotify; onNavigate: Props["onNavigate"] }) {
  const { db, addUser, saveUser, updateUser, removeUser, session, addAudit } = useLab()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<StaffUser | null>(null)
  const [form, setForm] = useState({ name: "", username: "", role: "Receptionist" as StaffRole, password: "" })
  const [editForm, setEditForm] = useState({ name: "", username: "", role: "Receptionist" as StaffRole })
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    const result = await addUser({ ...form, status: "Active", mustChangePassword: true })
    if (!result.ok) return setError(result.error ?? "The account could not be created.")
    addAudit("Staff Account Created", form.username, form.role)
    setForm({ name: "", username: "", role: "Receptionist", password: "" })
    setAdding(false)
    notify("Staff account created. They must set their own password at first sign-in.")
  }

  const saveEdit = () => {
    if (!editing) return
    setError(null)
    const result = updateUser(editing.id, editForm)
    if (!result.ok) return setError(result.error ?? "The account could not be updated.")
    addAudit("Staff Account Updated", editForm.username, editForm.role)
    setEditing(null)
    notify(`${editForm.name} updated.`)
  }

  return (
    <Panel
      id="settings-users"
      title="User settings"
      subtitle="Staff accounts for this installation. There is no default account."
      actions={
        <Button icon={UserPlus} onClick={() => setAdding(true)}>
          Add staff member
        </Button>
      }
    >
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>NAME</th>
              <th>USERNAME</th>
              <th>ROLE</th>
              <th>STATUS</th>
              <th>LAST SIGN-IN</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {db.users.map((user) => (
              <tr key={user.id}>
                <td>
                  <div className="person-cell">
                    <span className="avatar">
                      {user.name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <strong>{user.name}</strong>
                  </div>
                </td>
                <td>{user.username}</td>
                <td>{user.role}</td>
                <td>
                  <Badge>{user.status}</Badge>
                </td>
                <td>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"}</td>
                <td className="table-action-cell">
                  <button
                    className="table-text-action"
                    onClick={() => {
                      setEditing(user)
                      setEditForm({ name: user.name, username: user.username, role: user.role })
                      setError(null)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="table-text-action"
                    disabled={user.id === session?.userId}
                    onClick={() => {
                      saveUser({
                        ...user,
                        status: user.status === "Active" ? "Disabled" : "Active",
                      })
                      addAudit("Staff Access Changed", user.username, user.status)
                      notify(`${user.name} is now ${user.status === "Active" ? "disabled" : "enabled"}.`)
                    }}
                  >
                    {user.status === "Active" ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="table-text-action danger"
                    disabled={user.id === session?.userId || user.role === "Administrator"}
                    title={
                      user.role === "Administrator"
                        ? "The last administrator cannot be removed"
                        : "Remove account"
                    }
                    onClick={() => {
                      removeUser(user.id)
                      addAudit("Staff Account Removed", user.username, user.role)
                      notify(`${user.name} removed.`)
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="info-callout">
        <ShieldCheck size={20} />
        <span>
          Passwords are stored as salted PBKDF2 digests. Removing an account here
          does not delete the audit history it produced.
        </span>
      </div>
      <div className="settings-actions">
        <Button variant="secondary" icon={Users} onClick={() => onNavigate("Audit Log")}>
          Open audit log
        </Button>
      </div>

      {editing && (
        <Modal
          title="Edit staff member"
          description="Changing a username or role takes effect at their next sign-in. Passwords are changed by the account holder."
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={saveEdit}>Save changes</Button>
            </>
          }
        >
          <div className="settings-form-grid">
            <Field
              label="Full name"
              value={editForm.name}
              onChange={(v) => setEditForm({ ...editForm, name: v })}
              required
            />
            <Field
              label="Username"
              value={editForm.username}
              onChange={(v) => setEditForm({ ...editForm, username: v })}
              required
              hint="3 to 32 characters: letters, numbers, dot, dash or underscore."
            />
            <Field
              label="Role"
              value={editForm.role}
              onChange={(v) => setEditForm({ ...editForm, role: v as StaffRole })}
              options={ROLES}
            />
          </div>
          {error && (
            <div className="form-error" role="alert">
              <AlertTriangle size={16} /> {error}
            </div>
          )}
        </Modal>
      )}

      {adding && (
        <Modal
          title="Add staff member"
          description="Create a sign-in account for someone who works in your laboratory."
          onClose={() => setAdding(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button onClick={() => void submit()}>Create account</Button>
            </>
          }
        >
          <div className="settings-form-grid">
            <Field label="Full name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <Field label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} required />
            <Field label="Role" value={form.role} onChange={(v) => setForm({ ...form, role: v as StaffRole })} options={ROLES} />
            <Field
              label="Initial password"
              value={form.password}
              onChange={(v) => setForm({ ...form, password: v })}
              type="password"
              required
              hint={`At least ${db.securitySettings.minimumPasswordLength} characters, with a letter and a number.`}
            />
          </div>
          {error && (
            <div className="form-error" role="alert">
              <AlertTriangle size={16} /> {error}
            </div>
          )}
        </Modal>
      )}
    </Panel>
  )
}

/* -------------------------------------------------------------------------- */
/* Security                                                                    */
/* -------------------------------------------------------------------------- */

function SecuritySection({ notify }: { notify: SettingsNotify }) {
  const { db, update, session, changePassword } = useLab()
  const [draft, setDraft] = useState(db.securitySettings)
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" })
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(db.securitySettings)

  const submitPassword = async () => {
    setPasswordError(null)
    if (passwords.next !== passwords.confirm) {
      setPasswordError("The new passwords do not match.")
      return
    }
    const result = await changePassword(session!.userId, passwords.current, passwords.next)
    if (!result.ok) return setPasswordError(result.error ?? "The password could not be changed.")
    setPasswords({ current: "", next: "", confirm: "" })
    notify("Your password has been changed.")
  }

  return (
    <>
      <Panel
        id="settings-security"
        title="Security"
        subtitle="Password rules and sign-in behaviour for this installation."
        actions={
          <>
            {dirty && (
              <Button variant="ghost" icon={RotateCcw} onClick={() => setDraft(db.securitySettings)}>
                Discard changes
              </Button>
            )}
            <Button
              icon={Save}
              disabled={!dirty}
              onClick={() => {
                update((database) => {
                  database.securitySettings = draft
                })
                notify("Security settings saved. They apply to new passwords.")
              }}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="settings-form-grid">
          <Field
            label="Minimum password length"
            value={String(draft.minimumPasswordLength)}
            onChange={(v) => setDraft({ ...draft, minimumPasswordLength: Math.max(6, Number(v) || 8) })}
            type="number"
            min={6}
          />
          <Field
            label="Automatic sign-out after (minutes)"
            value={String(draft.autoLockMinutes)}
            onChange={(v) => setDraft({ ...draft, autoLockMinutes: Math.max(0, Number(v) || 0) })}
            type="number"
            min={0}
            hint="0 keeps the workspace signed in until you sign out."
          />
        </div>
        <Toggle
          label="Require a letter and a number in passwords"
          checked={draft.requireMixedCharacterPassword}
          onChange={(v) => setDraft({ ...draft, requireMixedCharacterPassword: v })}
        />
        <Toggle
          label="Record failed sign-in attempts in the audit log"
          checked={draft.logFailedLogins}
          onChange={(v) => setDraft({ ...draft, logFailedLogins: v })}
        />
        <div className="settings-callout-grid">
          <div className="settings-callout">
            <LockKeyhole size={18} />
            <span>
              <strong>Password storage</strong>
              Passwords are stored only as salted PBKDF2-SHA256 digests. LabDesk
              never stores, displays or exports a password in plain text.
            </span>
          </div>
          <div className="settings-callout">
            <Activity size={18} />
            <span>
              <strong>Access</strong>
              Sign-in is required after signing out. Accounts can be disabled or
              removed from User settings at any time.
            </span>
          </div>
        </div>
      </Panel>

      <Panel id="settings-password" title="Change your password" subtitle={`Signed in as ${session?.name}.`}>
        <div className="settings-form-grid">
          <Field label="Current password" value={passwords.current} onChange={(v) => setPasswords({ ...passwords, current: v })} type="password" required />
          <Field label="New password" value={passwords.next} onChange={(v) => setPasswords({ ...passwords, next: v })} type="password" required />
          <Field label="Confirm new password" value={passwords.confirm} onChange={(v) => setPasswords({ ...passwords, confirm: v })} type="password" required />
        </div>
        {passwordError && (
          <div className="form-error" role="alert">
            <AlertTriangle size={16} /> {passwordError}
          </div>
        )}
        <Button
          icon={LockKeyhole}
          onClick={() => void submitPassword()}
          disabled={!passwords.current || !passwords.next}
        >
          Change password
        </Button>
      </Panel>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Backup and factory reset                                                    */
/* -------------------------------------------------------------------------- */

function BackupSection({ notify }: { notify: SettingsNotify }) {
  const {
    db,
    storage,
    exportBackup,
    applyBackup,
    factoryReset,
    confirmPassword,
    session,
    addAudit,
    update,
  } = useLab()
  const fileRef = useRef<HTMLInputElement>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetPassword, setResetPassword] = useState("")
  const [resetConfirm, setResetConfirm] = useState("")
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetBusy, setResetBusy] = useState(false)

  const doExport = () => {
    const contents = exportBackup()
    const name = backupFileName(db, new Date().toISOString())
    downloadTextFile(name, contents)
    update((database) => {
      database.backupSettings.lastExportAt = new Date().toISOString()
    })
    addAudit("Backup Exported", name, `${db.patients.length} patient records`)
    notify("Backup file downloaded. Keep it somewhere safe.")
  }

  const doRestore = async (file?: File) => {
    if (!file) return
    const parsed = parseBackup(await file.text())
    if (!parsed.ok) return notify(parsed.error, "error")
    downloadTextFile(
      `${db.profile.name || "laboratory"}-pre-restore-${new Date().toISOString().slice(0, 10)}.json`,
      exportBackup(),
    )
    const result = applyBackup(await file.text())
    if (fileRef.current) fileRef.current.value = ""
    if (result.ok) {
      notify("Backup restored. Sign in with the accounts from that backup.")
    } else {
      notify(result.error ?? "The backup could not be restored.", "error")
    }
  }

  const doReset = async () => {
    setResetError(null)
    if (resetConfirm.trim().toUpperCase() !== "RESET") {
      return setResetError('Type RESET exactly to confirm.')
    }
    setResetBusy(true)
    const verified = await confirmPassword(session!.userId, resetPassword)
    if (!verified.ok) {
      setResetBusy(false)
      return setResetError(verified.error ?? 'That password is not correct.')
    }
    const result = await factoryReset(true)
    setResetBusy(false)
    if (!result.ok) {
      setResetError(result.error ?? 'The reset could not be completed.')
      return
    }
    if (result.backupFile) {
      downloadTextFile(
        `${db.profile.name || 'laboratory'}-pre-reset-${new Date().toISOString().slice(0, 10)}.json`,
        result.backupFile,
      )
    }
    setResetOpen(false)
    setResetPassword('')
    setResetConfirm('')
    notify(
      result.backupFile
        ? 'Installation reset. A pre-reset backup was downloaded.'
        : 'This installation has been reset. Complete setup to start again.',
    )
  }

  return (
    <>
      <Panel
        id="settings-backup"
        title="Backup & restore"
        subtitle="A backup contains everything: laboratory identity, logo, branding, report and receipt configuration, tests, prices, doctors, staff, patients and payments."
      >
        <div className="backup-meta">
          <div>
            <Database size={20} />
            <span>
              <small>DATABASE</small>
              <strong>{describeDatabase(db, storage)}</strong>
            </span>
          </div>
          <div>
            <FileText size={20} />
            <span>
              <small>LAST EXPORT</small>
              <strong>
                {db.backupSettings.lastExportAt
                  ? formatDateTime(db.backupSettings.lastExportAt)
                  : 'Never exported'}
              </strong>
            </span>
          </div>
          <div>
            <History size={20} />
            <span>
              <small>LOCAL SNAPSHOT</small>
              <strong>
                {db.backupSettings.lastSnapshotAt
                  ? formatDateTime(db.backupSettings.lastSnapshotAt)
                  : 'Not taken yet'}
              </strong>
            </span>
          </div>
        </div>

        <Toggle
          label="Keep a local snapshot"
          description="Saves a rollback copy on this device whenever records change. A downloaded backup file is still the only off-device copy."
          checked={db.backupSettings.autoSnapshot}
          onChange={(v) => {
            update((database) => {
              database.backupSettings.autoSnapshot = v
            })
            notify(`Local snapshot ${v ? 'enabled' : 'disabled'}.`)
          }}
        />

        <div className="settings-actions">
          <Button icon={Database} onClick={doExport}>
            Backup now
          </Button>
          <Button variant="secondary" icon={ArrowDownLeft} onClick={() => fileRef.current?.click()}>
            Restore backup
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden-file"
          aria-label="Select backup file"
          onChange={(e) => void doRestore(e.target.files?.[0])}
        />
        <div className="setup-callout">
          <AlertTriangle size={18} />
          <span>
            Restoring replaces the current installation. A copy of your present
            data is downloaded first, so nothing is lost.
          </span>
        </div>
      </Panel>

      <Panel
        id="settings-reset"
        title="Factory reset"
        subtitle="Erase this installation and start again from first-run setup."
      >
        <div className="danger-zone">
          <div>
            <strong>This will remove laboratory data from this installation.</strong>
            <p>
              Patients, orders, results, payments, tests, doctors, staff accounts,
              branding and settings are all deleted. Download a backup first if
              there is anything you need to keep.
            </p>
          </div>
          <Button variant="danger" icon={Trash2} onClick={() => setResetOpen(true)}>
            Factory reset
          </Button>
        </div>
      </Panel>

      {resetOpen && (
        <Modal
          title="Factory reset this installation?"
          description="This cannot be undone. Confirm carefully."
          onClose={() => setResetOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setResetOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => void doReset()}
                disabled={resetBusy || !resetPassword || resetConfirm.trim().toUpperCase() !== 'RESET'}
              >
                {resetBusy ? 'Resetting…' : 'Reset everything'}
              </Button>
            </>
          }
        >
          <div className="danger-warning">
            <strong>This will remove laboratory data from this installation.</strong>
            <p>
              A backup of the current state is captured before anything is
              deleted, so the reset can be reversed by restoring that file.
            </p>
          </div>
          <Field
            label="Your password"
            value={resetPassword}
            onChange={setResetPassword}
            type="password"
            required
          />
          <Field
            label="Type RESET to confirm"
            value={resetConfirm}
            onChange={setResetConfirm}
            required
          />
          {resetError && (
            <div className="form-error" role="alert">
              <AlertTriangle size={16} /> {resetError}
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const splitList = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
