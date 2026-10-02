/**
 * First-run setup wizard.
 *
 * Shown on a brand new installation instead of a dashboard. Collects the
 * laboratory identity, the branding, the report and receipt defaults and the
 * first administrator account, then writes a working installation.
 *
 * Nothing here has a pre-filled laboratory name: an unconfigured installation
 * must be configured by its operator.
 */

import { useMemo, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Contact,
  FileText,
  FlaskConical,
  Palette,
  ShieldCheck,
  UserCog,
} from "lucide-react"
import { useLab, type SetupPayload } from "../app/LabProvider"
import {
  defaultBranding,
  defaultReceiptSettings,
  defaultReportSettings,
  emptyTests,
} from "../core/defaults"
import { checkPassword } from "../core/password"
import { PRODUCT_NAME, PRODUCT_SUBTITLE, PRODUCT_VERSION, VENDOR } from "../core/product"
import type { CatalogTest, LaboratoryTypeOption } from "../core/types"
import { ProductMark } from "../ui/Brand"
import LogoUpload from "../ui/LogoUpload"
import { Field, Button } from "../ui/controls"
import type { ReactNode } from "react"

const LABORATORY_TYPES: LaboratoryTypeOption[] = [
  "Diagnostic Laboratory",
  "Pathology Laboratory",
  "Medical Laboratory",
  "Hospital Laboratory",
  "Diagnostic Center",
  "Clinical Laboratory",
  "Reference Laboratory",
  "Other",
]

const STEPS = [
  { id: "welcome", title: "Welcome", caption: "About this product", icon: FlaskConical },
  { id: "laboratory", title: "Laboratory & Logo", caption: "Name, type and identity", icon: Building2 },
  { id: "contact", title: "Address & Contact", caption: "How patients reach you", icon: Contact },
  { id: "documents", title: "Reports & Receipts", caption: "Printed output defaults", icon: FileText },
  { id: "administrator", title: "Administrator", caption: "Your sign-in account", icon: UserCog },
  { id: "finish", title: "Finish", caption: "Review and open", icon: Check },
] as const

type StepId = (typeof STEPS)[number]["id"]

const emptyProfile = {
  name: "",
  shortName: "",
  tagline: "",
  type: "" as LaboratoryTypeOption | "",
  licenseNumber: "",
  taxNumber: "",
  address: "",
  city: "",
  province: "",
  country: "",
  phone: "",
  phone2: "",
  whatsapp: "",
  email: "",
  website: "",
  logo: "",
  idPrefixes: { patient: "LAB", report: "RPT", sample: "SMP" },
}

/** Record-number prefixes are short, uppercase and alphanumeric. */
export const sanitizePrefix = (value: string): string =>
  (value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6)

const emptyAdmin = { name: "", username: "", password: "", confirm: "" }

export default function SetupWizard() {
  const { db, completeSetup } = useLab()
  const [step, setStep] = useState<StepId>("welcome")
  const [profile, setProfile] = useState(emptyProfile)
  const [admin, setAdmin] = useState(emptyAdmin)
  const [branding, setBranding] = useState(defaultBranding())
  const [reportSettings, setReportSettings] = useState(defaultReportSettings())
  const [receiptSettings, setReceiptSettings] = useState(defaultReceiptSettings())
  const [tests, setTests] = useState<CatalogTest[]>(emptyTests())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const stepIndex = STEPS.findIndex((s) => s.id === step)
  const isLast = stepIndex === STEPS.length - 1

  /* ---------------------------------------------------------------------- */
  /* Validation                                                               */
  /* ---------------------------------------------------------------------- */

  const stepErrors = useMemo(() => {
    const problems: Partial<Record<StepId, string[]>> = {}
    problems.laboratory = []
    if (!profile.name.trim()) problems.laboratory!.push("Laboratory name is required.")
    if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
      problems.laboratory!.push("Enter a valid email address or leave it blank.")
    }
    if (profile.website && !/^https?:\/\/.+/i.test(profile.website.trim())) {
      problems.laboratory!.push("Website must start with http:// or https://")
    }

    problems.contact = []
    if (!profile.city.trim() && !profile.address.trim()) {
      problems.contact!.push("Enter an address or a city.")
    }
    if (!profile.phone.trim()) problems.contact!.push("A contact number is required.")
    else if (profile.phone.replace(/\D/g, "").length < 7) {
      problems.contact!.push("That contact number looks too short.")
    }
    if (profile.whatsapp && !/^[\d+\-\s()]+$/.test(profile.whatsapp.trim())) {
      problems.contact!.push("WhatsApp number may only contain digits, spaces and + - ( ).")
    }

    problems.administrator = []
    if (!admin.name.trim()) problems.administrator!.push("Administrator name is required.")
    if (!admin.username.trim()) problems.administrator!.push("Username is required.")
    else if (!/^[a-z0-9._-]{3,}$/i.test(admin.username.trim())) {
      problems.administrator!.push(
        "Use at least 3 characters: letters, numbers, dot, dash or underscore.",
      )
    }
    if (!admin.password) problems.administrator!.push("Password is required.")
    const policy = checkPassword(admin.password, db.securitySettings)
    for (const problem of policy.problems) problems.administrator!.push(problem)
    if (admin.password && admin.password !== admin.confirm) {
      problems.administrator!.push("Passwords do not match.")
    }
    return problems
  }, [admin, db.securitySettings, profile])

  const stepProblems = (id: StepId): string[] | undefined => {
    if (id === "finish") {
      const all = [
        ...(stepErrors.laboratory ?? []),
        ...(stepErrors.contact ?? []),
        ...(stepErrors.administrator ?? []),
      ]
      return all.length ? all : undefined
    }
    return stepErrors[id]
  }

  const blocking = stepProblems(step)

  const goNext = () => {
    setError(null)
    const problems = stepProblems(step)
    if (problems?.length) return setError(problems[0])
    const next = STEPS[Math.min(STEPS.length - 1, stepIndex + 1)]
    setStep(next.id)
  }

  const goBack = () => {
    setError(null)
    const previous = STEPS[Math.max(0, stepIndex - 1)]
    setStep(previous.id)
  }

  const finish = async () => {
    const problems = stepProblems("finish")
    if (problems?.length) return setError(problems[0])
    setSaving(true)
    try {
      const payload: SetupPayload = {
        profile,
        branding,
        reportSettings,
        receiptSettings,
        administrator: {
          name: admin.name,
          username: admin.username,
          password: admin.password,
        },
        tests,
      }
      const result = await completeSetup(payload)
      if (!result.ok) setError(result.error ?? "Setup could not be completed.")
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "A secure password store is required to create your administrator account.",
      )
    } finally {
      setSaving(false)
    }
  }

  const previewProfile = { ...db.profile, ...profile, tagline: profile.tagline || "Laboratory" }

  return (
    <div className="setup-screen">
      <header className="setup-header">
        <div className="setup-header-brand">
          <ProductMark size="md" />
          <div>
            <strong>{PRODUCT_NAME}</strong>
            <small>{PRODUCT_SUBTITLE}</small>
          </div>
        </div>
        <span className="setup-version">Version {PRODUCT_VERSION}</span>
      </header>

      <div className="setup-body">
        <nav className="setup-steps" aria-label="Setup progress">
          {STEPS.map((s, index) => {
            const Icon = s.icon
            const state = index < stepIndex ? "done" : index === stepIndex ? "current" : "todo"
            return (
              <div className={`setup-step setup-step-${state}`} key={s.id}>
                <span className="setup-step-marker">
                  {state === "done" ? <Check size={15} /> : <Icon size={15} />}
                </span>
                <span>
                  <strong>{s.title}</strong>
                  <small>{s.caption}</small>
                </span>
              </div>
            )
          })}
        </nav>

        <main className="setup-main">
          <div className="setup-card">
            {step === "welcome" && <WelcomeStep onStart={() => setStep("laboratory")} />}

            {step === "laboratory" && (
              <StepShell
                title="Laboratory information"
                lead="This is the name your patients will see on reports and receipts."
              >
                <div className="setup-logo-row">
                  <LogoUpload
                    logo={profile.logo}
                    onChange={(logo) => setProfile((p) => ({ ...p, logo }))}
                    onError={setError}
                    fallback={<ProductMark size="lg" />}
                  />
                  <div className="setup-logo-preview">
                    <small>LIVE PREVIEW</small>
                    <div className="setup-preview-card">
                      <LogoPreview profile={previewProfile} tagline={profile.tagline || profile.type} />
                    </div>
                  </div>
                </div>
                <div className="settings-form-grid">
                  <Field
                    label="Laboratory name"
                    value={profile.name}
                    onChange={(v) => setProfile({ ...profile, name: v })}
                    placeholder="e.g. City Diagnostic Laboratory"
                    required
                  />
                  <Field
                    label="Short name"
                    value={profile.shortName}
                    onChange={(v) => setProfile({ ...profile, shortName: v })}
                    placeholder="Used in tight spaces, e.g. City Lab"
                    hint="Optional. Falls back to the full name."
                  />
                  <Field
                    label="Tagline"
                    value={profile.tagline}
                    onChange={(v) => setProfile({ ...profile, tagline: v })}
                    placeholder="e.g. Diagnostic Laboratory"
                  />
                  <Field
                    label="Laboratory type"
                    value={profile.type}
                    onChange={(v) => setProfile({ ...profile, type: v as LaboratoryTypeOption })}
                    options={[...LABORATORY_TYPES]}
                  />
                  <Field
                    label="Registration / licence number"
                    value={profile.licenseNumber}
                    onChange={(v) => setProfile({ ...profile, licenseNumber: v })}
                    placeholder="Shown on reports only if you enable it"
                  />
                  <Field
                    label="Tax / NTN number"
                    value={profile.taxNumber}
                    onChange={(v) => setProfile({ ...profile, taxNumber: v })}
                    placeholder="Optional"
                  />
                </div>
                <div className="settings-form-grid">
                  <Field
                    label="Patient ID prefix"
                    value={profile.idPrefixes.patient}
                    onChange={(v) =>
                      setProfile({ ...profile, idPrefixes: { ...profile.idPrefixes, patient: sanitizePrefix(v) } })
                    }
                    placeholder="LAB"
                    hint={`Record numbers are generated as ${profile.idPrefixes.patient || "LAB"}-0001.`}
                  />
                  <Field
                    label="Report ID prefix"
                    value={profile.idPrefixes.report}
                    onChange={(v) =>
                      setProfile({ ...profile, idPrefixes: { ...profile.idPrefixes, report: sanitizePrefix(v) } })
                    }
                    placeholder="RPT"
                  />
                </div>
              </StepShell>
            )}

            {step === "contact" && (
              <StepShell
                title="Address & contact"
                lead="These details appear on your reports and receipts."
              >
                <div className="settings-form-grid">
                  <div className="full-span">
                    <Field
                      label="Street address"
                      value={profile.address}
                      onChange={(v) => setProfile({ ...profile, address: v })}
                      placeholder="Street, area, landmark"
                    />
                  </div>
                  <Field
                    label="City"
                    value={profile.city}
                    onChange={(v) => setProfile({ ...profile, city: v })}
                  />
                  <Field
                    label="Province / state"
                    value={profile.province}
                    onChange={(v) => setProfile({ ...profile, province: v })}
                  />
                  <Field
                    label="Country"
                    value={profile.country}
                    onChange={(v) => setProfile({ ...profile, country: v })}
                  />
                  <Field
                    label="Phone 1"
                    value={profile.phone}
                    onChange={(v) => setProfile({ ...profile, phone: v })}
                    required
                  />
                  <Field
                    label="Phone 2"
                    value={profile.phone2}
                    onChange={(v) => setProfile({ ...profile, phone2: v })}
                  />
                  <Field
                    label="WhatsApp"
                    value={profile.whatsapp}
                    onChange={(v) => setProfile({ ...profile, whatsapp: v })}
                    placeholder="Optional"
                  />
                  <Field
                    label="Email"
                    value={profile.email}
                    onChange={(v) => setProfile({ ...profile, email: v })}
                    type="email"
                  />
                  <Field
                    label="Website"
                    value={profile.website}
                    onChange={(v) => setProfile({ ...profile, website: v })}
                    placeholder="https://"
                  />
                </div>
                <div className="setup-callout">
                  <Contact size={18} />
                  <span>
                    Everything entered here is stored on this device only. You can
                    change it at any time from Settings.
                  </span>
                </div>
              </StepShell>
            )}

            {step === "documents" && (
              <StepShell
                title="Report & receipt settings"
                lead="Sensible defaults. Every field can be changed later."
              >
                <div className="settings-form-grid">
                  <Field
                    label="Report title"
                    value={reportSettings.documentTitle}
                    onChange={(v) => setReportSettings({ ...reportSettings, documentTitle: v })}
                  />
                  <Field
                    label="Report subtitle"
                    value={reportSettings.documentSubtitle}
                    onChange={(v) => setReportSettings({ ...reportSettings, documentSubtitle: v })}
                  />
                  <Field
                    label="Report header alignment"
                    value={reportSettings.headerAlignment}
                    onChange={(v) =>
                      setReportSettings({
                        ...reportSettings,
                        headerAlignment: v as typeof reportSettings.headerAlignment,
                      })
                    }
                    options={["left", "center", "right"]}
                  />
                  <Field
                    label="Receipt paper"
                    value={db.printerSettings.receiptPaper}
                    onChange={() => setError(null)}
                    options={["80mm", "58mm"]}
                  />
                </div>
                <div className="setup-toggle-grid">
                  <Toggle
                    label="Print the logo on reports"
                    checked={reportSettings.showLogo}
                    onChange={(v) => setReportSettings({ ...reportSettings, showLogo: v })}
                  />
                  <Toggle
                    label="Print licence number on reports"
                    checked={reportSettings.showLicenseNumber}
                    onChange={(v) => setReportSettings({ ...reportSettings, showLicenseNumber: v })}
                  />
                  <Toggle
                    label="Print the logo on receipts"
                    checked={receiptSettings.showLogo}
                    onChange={(v) => setReceiptSettings({ ...receiptSettings, showLogo: v })}
                  />
                  <Toggle
                    label="Print the vendor credit on printed output"
                    checked={branding.showVendorCreditOnPrint}
                    onChange={(v) => setBranding({ ...branding, showVendorCreditOnPrint: v })}
                    hint="Off by default so your laboratory stays the primary brand."
                  />
                </div>
                <div className="settings-form-grid">
                  <div className="full-span">
                    <Field
                      label="Report disclaimer / notes"
                      value={reportSettings.disclaimer}
                      onChange={(v) => setReportSettings({ ...reportSettings, disclaimer: v })}
                    />
                  </div>
                  <div className="full-span">
                    <Field
                      label="Receipt collection instructions"
                      value={receiptSettings.collectionInstructions}
                      onChange={(v) =>
                        setReceiptSettings({ ...receiptSettings, collectionInstructions: v })
                      }
                    />
                  </div>
                </div>
                <div className="setup-callout">
                  <Palette size={18} />
                  <span>
                    Report and receipt layout, every field and every signature label
                    can be adjusted later from Settings, with a live preview.
                  </span>
                </div>
              </StepShell>
            )}

            {step === "administrator" && (
              <StepShell
                title="Administrator account"
                lead="This is the only account created now. You will add the rest of your staff afterwards."
              >
                <div className="setup-form-grid">
                  <Field
                    label="Administrator name"
                    value={admin.name}
                    onChange={(v) => setAdmin({ ...admin, name: v })}
                    placeholder="e.g. Laboratory Director"
                    required
                  />
                  <Field
                    label="Username"
                    value={admin.username}
                    onChange={(v) => setAdmin({ ...admin, username: v })}
                    placeholder="e.g. director"
                    required
                  />
                  <Field
                    label="Password"
                    value={admin.password}
                    onChange={(v) => setAdmin({ ...admin, password: v })}
                    type="password"
                    required
                    hint={`At least ${db.securitySettings.minimumPasswordLength} characters, including a letter and a number.`}
                  />
                  <Field
                    label="Confirm password"
                    value={admin.confirm}
                    onChange={(v) => setAdmin({ ...admin, confirm: v })}
                    type="password"
                    required
                  />
                </div>
                <div className="setup-callout">
                  <ShieldCheck size={18} />
                  <span>
                    Your password is stored as a salted PBKDF2 digest, never as text.
                    There is no default account and no universal password.
                  </span>
                </div>
              </StepShell>
            )}

            {step === "finish" && <FinishStep profile={previewProfile} tests={tests} setTests={setTests} />}

            {error && (
              <div className="setup-error" role="alert">
                {error}
              </div>
            )}

            <footer className="setup-footer">
              <div className="setup-footer-left">
                {stepIndex > 0 && (
                  <Button variant="ghost" icon={ArrowLeft} onClick={goBack}>
                    Back
                  </Button>
                )}
              </div>
              <div className="setup-footer-right">
                {step === "welcome" && (
                  <Button icon={ArrowRight} onClick={() => setStep("laboratory")}>
                    Start setup
                  </Button>
                )}
                {step === "finish" ? (
                  <Button icon={Check} onClick={finish} disabled={saving}>
                    {saving ? "Preparing your laboratory…" : "Open dashboard"}
                  </Button>
                ) : (
                  /*
                   * Never disabled for an invalid step. A greyed-out button
                   * tells the operator nothing about which field to fix, and it
                   * made `goNext` unreachable, so the reason was never shown.
                   * `goNext` refuses the advance and reports the first problem.
                   */
                  <Button icon={ArrowRight} onClick={goNext}>
                    Continue
                  </Button>
                )}
              </div>
            </footer>
          </div>

          <p className="setup-credit">
            {VENDOR.credit} · {VENDOR.websiteLine}
          </p>
        </main>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Step pieces                                                                 */
/* -------------------------------------------------------------------------- */

const StepShell = ({
  title,
  lead,
  children,
}: {
  title: string
  lead: string
  children: ReactNode
}) => (
  <div className="setup-step-body">
    <h2>{title}</h2>
    <p className="setup-lead">{lead}</p>
    {children}
  </div>
)

const LogoPreview = ({
  profile,
  tagline,
}: {
  profile: { name: string; logo: string }
  tagline: string
}) => (
  <div className="setup-preview-brand">
    {profile.logo ? <img src={profile.logo} alt="" /> : <ProductMark size="sm" />}
    <div>
      <strong>{profile.name || "Your laboratory name"}</strong>
      {tagline ? <small>{tagline}</small> : null}
    </div>
  </div>
)

const WelcomeStep = ({ onStart }: { onStart: () => void }) => (
  <div className="setup-step-body setup-welcome">
    <div className="setup-welcome-mark">
      <ProductMark size="lg" />
    </div>
    <h2>Welcome to {PRODUCT_NAME}</h2>
    <p className="setup-lead">{PRODUCT_SUBTITLE}</p>
    <p className="setup-welcome-copy">
      Set up your laboratory in a few simple steps. You will enter your own
      details, upload your logo and create your administrator account. You can
      change all of it later from Settings, without reinstalling.
    </p>
    <ul className="setup-welcome-list">
      <li>
        <Check size={16} /> Your laboratory name and logo on every report
      </li>
      <li>
        <Check size={16} /> Your own tests, parameters and prices
      </li>
      <li>
        <Check size={16} /> Your own doctors, staff accounts and currency
      </li>
      <li>
        <Check size={16} /> All data stays on this device
      </li>
    </ul>
  </div>
)

const FinishStep = ({
  profile,
  tests,
  setTests,
}: {
  profile: { name: string; logo: string; type: string }
  tests: CatalogTest[]
  setTests: (tests: CatalogTest[]) => void
}) => (
  <div className="setup-step-body">
    <div className="setup-done-mark">
      <Check size={30} />
    </div>
    <h2>Your laboratory is ready.</h2>
    <p className="setup-lead">
      {profile.name || "Your laboratory"} is configured as a {profile.type || "laboratory"}.
    </p>
    <div className="setup-test-seed">
      <div className="form-section-heading">
        <span className="section-number">01</span>
        <div>
          <h2>Test catalog</h2>
          <p>
            Start with the tests you already offer, or add them later from Test
            Management. Prices are yours to set.
          </p>
        </div>
      </div>
      {tests.length === 0 ? (
        <>
          <p className="setup-empty-note">
            No tests added yet. You can add them now, or skip and build your
            catalog after the dashboard opens.
          </p>
          <div className="settings-actions">
            <Button variant="secondary" onClick={() => setTests(quickStartTests(profile.name))}>
              Add a starting set of common tests
            </Button>
            <Button variant="ghost" onClick={() => setTests([])}>
              Skip for now
            </Button>
          </div>
        </>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>CODE</th>
                <th>NAME</th>
                <th>CATEGORY</th>
                <th>PRICE</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.code}>
                  <td>
                    <span className="test-code">{t.code}</span>
                  </td>
                  <td>
                    <strong>{t.name}</strong>
                  </td>
                  <td>{t.category}</td>
                  <td className="strong-cell">{t.price}</td>
                  <td>
                    <button
                      className="table-text-action"
                      onClick={() => setTests(tests.filter((x) => x.code !== t.code))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="settings-actions">
            <Button variant="ghost" onClick={() => setTests([])}>
              Clear catalog
            </Button>
          </div>
        </div>
      )}
    </div>
  </div>
)

/**
 * A neutral starting catalog offered at the end of setup.
 *
 * Test names and reference ranges are clinical conventions rather than
 * customer data; prices are deliberately left at zero so each laboratory sets
 * its own.
 */
const quickStartTests = (laboratoryName: string): CatalogTest[] => {
  const prefix = (laboratoryName || "lab")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase() || "LAB"
  const timestamp = new Date().toISOString()
  const rows: [string, string, string, string, [string, string, string, number | null, number | null][]][] = [
    [
      "CBC",
      "Complete Blood Count",
      "Hematology",
      "Blood",
      [
        ["Hemoglobin", "g/dL", "12.0 - 16.0", 12, 16],
        ["WBC Count", "10³/µL", "4.0 - 11.0", 4, 11],
        ["RBC Count", "10⁶/µL", "4.2 - 5.9", 4.2, 5.9],
        ["Platelets", "10³/µL", "150 - 450", 150, 450],
      ],
    ],
    [
      "FBS",
      "Fasting Blood Sugar",
      "Diabetes",
      "Plasma",
      [["Glucose (Fasting)", "mg/dL", "70 - 110", 70, 110]],
    ],
    [
      "LFT",
      "Liver Function Test",
      "Liver",
      "Serum",
      [
        ["SGPT (ALT)", "U/L", "0 - 40", 0, 40],
        ["SGOT (AST)", "U/L", "0 - 40", 0, 40],
        ["Total Bilirubin", "mg/dL", "0.1 - 1.2", 0.1, 1.2],
      ],
    ],
    [
      "RFT",
      "Renal Function Test",
      "Kidney",
      "Serum",
      [
        ["Urea", "mg/dL", "15 - 40", 15, 40],
        ["Creatinine", "mg/dL", "0.6 - 1.3", 0.6, 1.3],
      ],
    ],
    [
      "UR",
      "Urine Routine Examination",
      "Urine",
      "Urine",
      [
        ["Colour", "", "Yellow", null, null],
        ["Protein", "", "Negative", null, null],
        ["Glucose", "", "Negative", null, null],
      ],
    ],
  ]
  return rows.map(([code, name, category, sampleType, parameters], index) => ({
    id: `${prefix.toLowerCase()}_${code.toLowerCase()}_${timestamp}`,
    code,
    name,
    category,
    price: 0,
    sampleType,
    container: "",
    method: "",
    active: true,
    displayOrder: index,
    turnaroundHours: 24,
    parameters: parameters.map(([pName, unit, range, low, high], order) => ({
      id: `${prefix.toLowerCase()}_${code.toLowerCase()}_p${order}`,
      name: pName,
      unit,
      referenceRange: range,
      low,
      high,
      criticalLow: null,
      criticalHigh: null,
      displayOrder: order,
      active: true,
    })),
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
}

/* -------------------------------------------------------------------------- */
/* Controls                                                                    */
/* -------------------------------------------------------------------------- */

const Toggle = ({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  hint?: string
}) => (
  <label className="check-label setup-toggle">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>
      <strong>{label}</strong>
      {hint ? <small>{hint}</small> : null}
    </span>
  </label>
)
