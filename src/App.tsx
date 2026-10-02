/**
 * Laboratory workspace.
 *
 * The application shell: navigation, page routing, the shared patient table
 * and every operational screen.
 *
 * No laboratory name, address, phone number, price, doctor or test is written
 * in this file. Everything comes from the installation's configuration through
 * `useLab()`.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  CreditCard,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  FlaskConical,
  History,
  Home,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Stethoscope,
  TestTube2,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useLab } from "./app/LabProvider"
import { getBridge } from "./core/bridge"
import { createId, now } from "./core/defaults"
import { isLicenseOperatingAllowed } from "./core/licenseService"
import { applyTheme, readTheme, writeTheme, type Theme } from "./core/theme"
import { auditCsv, downloadTextFile } from "./core/backup"
import { evaluateResult, formatDate, formatDateTime, formatTime, initials } from "./core/format"
import {
  allMissingParameters,
  clampPaid,
  isSampleClosed,
  nextSampleStatus,
  pruneResults,
  reprice,
  requiredParameters,
  resultProgress,
  subtotalFor,
  totalFor,
} from "./core/records"
import { PRODUCT_NAME, PRODUCT_VERSION, VENDOR } from "./core/product"
import type {
  CatalogTest,
  Doctor,
  LabDatabase,
  Patient,
  ReportStatus,
  SampleStatus,
  StaffRole,
  TestParameter,
} from "./core/types"
import Brand from "./ui/Brand"
import TitleBar from "./ui/TitleBar"
import SplashScreen from "./ui/SplashScreen"
import LoginScreen from "./ui/LoginScreen"
import SetupWizard from "./setup/SetupWizard"
import {
  Badge,
  Button,
  ConfirmDialog,
  Empty,
  Field,
  IconButton,
  Modal,
  SearchField,
  SectionHeading,
  TextArea,
  ToastView,
  type ConfirmRequest,
  type Toast,
} from "./ui/controls"
import ReportDocument from "./reports/ReportDocument"
import ReceiptDocument from "./reports/ReceiptDocument"
import { buildReportModel } from "./reports/reportModel"
import { buildReceiptModel } from "./reports/receiptModel"
import LicenseLockScreen from "./ui/LicenseLockScreen"
import SettingsPage, { type SettingsSection } from "./settings/SettingsPage"

type Page =
  | "Dashboard"
  | "Patients"
  | "New Patient"
  | "Patient Profile"
  | "Tests"
  | "Samples"
  | "Results"
  | "Result Entry"
  | "Verification"
  | "Reports"
  | "Report Preview"
  | "Receipt"
  | "Billing"
  | "Doctors"
  | "Staff"
  | "Analytics"
  | "Settings"
  | "Audit Log"

const NAV: { label: Page; icon: LucideIcon; group?: string; adminOnly?: boolean }[] = [
  { label: "Dashboard", icon: Home },
  { label: "Patients", icon: Users },
  { label: "New Patient", icon: UserPlus },
  { label: "Tests", icon: FlaskConical, group: "LAB WORK" },
  { label: "Samples", icon: TestTube2 },
  { label: "Results", icon: ClipboardList },
  { label: "Reports", icon: FileText },
  { label: "Billing", icon: Wallet, group: "MANAGEMENT" },
  { label: "Doctors", icon: Stethoscope },
  { label: "Staff", icon: UserCheck, adminOnly: true },
  { label: "Analytics", icon: Activity },
  { label: "Settings", icon: SettingsIcon },
]

const PAGE_TITLE: Record<Page, string> = {
  Dashboard: "Dashboard",
  Patients: "Patients",
  "New Patient": "New Patient",
  "Patient Profile": "Patient Profile",
  Tests: "Test Management",
  Samples: "Sample Collection",
  Results: "Results",
  "Result Entry": "Enter Test Results",
  Verification: "Verify Results",
  Reports: "Reports",
  "Report Preview": "Report Preview",
  Receipt: "Thermal Receipt",
  Billing: "Billing",
  Doctors: "Doctors",
  Staff: "Staff Management",
  Analytics: "Reports & Analytics",
  Settings: "Settings",
  "Audit Log": "Audit Log",
}

const emptyForm = {
  name: "",
  age: "",
  gender: "",
  phone: "",
  cnic: "",
  bloodGroup: "",
  address: "",
  notes: "",
  doctorId: "",
  discount: "",
  paymentInput: "",
  paymentMethod: "",
}

export default function App() {
  const lab = useLab()
  const { db, session, money, update, addAudit, signOut } = lab

  const [page, setPage] = useState<Page>("Dashboard")
  const [collapsed, setCollapsed] = useState(false)
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => applyTheme(theme), [theme])

  const toggleTheme = () =>
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark"
      writeTheme(next)
      return next
    })

  const [activeId, setActiveId] = useState<string>("")
  const [query, setQuery] = useState("")
  const [toast, setToast] = useState<Toast | null>(null)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [selectedTests, setSelectedTests] = useState<string[]>([])
  const [testQuery, setTestQuery] = useState("")
  const [category, setCategory] = useState("All tests")
  const [reportFilter, setReportFilter] = useState("All")
  const [resultTab, setResultTab] = useState<string>("")
  const [doctorForm, setDoctorForm] = useState<Partial<Doctor> | null>(null)
  const [testForm, setTestForm] = useState<Partial<CatalogTest> | null>(null)
  const [rejecting, setRejecting] = useState<Patient | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
  const [patientTests, setPatientTests] = useState<Patient | null>(null)
  const [deletingPatient, setDeletingPatient] = useState<Patient | null>(null)
  const [adjustingPayment, setAdjustingPayment] = useState<Patient | null>(null)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("profile")

  const isAdmin = session?.role === "Administrator"
  const patients = db.patients
  const active = patients.find((p) => p.id === activeId) ?? patients[0] ?? null
  const activeTests = useMemo(
    () => (active ? active.testCodes.map((code) => db.tests.find((t) => t.code === code)).filter(Boolean) as CatalogTest[] : []),
    [active, db.tests],
  )

  /* ---------------------------------------------------------------------- */
  /* Shared helpers                                                          */
  /* ---------------------------------------------------------------------- */

  const notify = (message: string, tone: Toast["tone"] = "success") => {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), 4000)
  }

  const navigate = (next: Page) => {
    setPage(next)
    setQuery("")
    window.scrollTo({ top: 0 })
  }

  /** Settings is one page with many sections, so the nav picks the section. */
  const openSettings = (section: SettingsSection) => {
    setSettingsSection(section)
    navigate("Settings")
  }

  const selectPatient = (patient: Patient, destination: Page = "Patient Profile") => {
    setActiveId(patient.id)
    navigate(destination)
  }

  const activeTest = activeTests.find((t) => t.code === resultTab) ?? activeTests[0] ?? null

  const filteredPatients = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return patients
    return patients.filter((p) =>
      `${p.name} ${p.phone} ${p.cnic} ${p.id} ${p.reportId} ${p.doctorName}`
        .toLowerCase()
        .includes(needle),
    )
  }, [patients, query])

  const totals = useMemo(() => {
    const collected = patients.reduce((sum, p) => sum + p.paid, 0)
    const outstanding = patients.reduce((sum, p) => sum + Math.max(0, p.total - p.paid), 0)
    return {
      collected,
      outstanding,
      pendingResults: patients.filter((p) => p.reportStatus !== "Ready").length,
      readyReports: patients.filter((p) => p.reportStatus === "Ready").length,
      awaitingCollection: patients.filter((p) => p.sampleStatus === "Pending").length,
      totalTests: patients.reduce((sum, p) => sum + p.testCodes.length, 0),
    }
  }, [patients])

  const requireAdmin = (action: () => void, description: string) => {
    if (isAdmin) return action()
    notify(description, "warning")
  }

  /* ---------------------------------------------------------------------- */
  /* Persistence of preferences                                               */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    db.installation.lastOpenedAt = now()
  }, [])

  useEffect(() => {
    if (!db.backupSettings.autoSnapshot || !db.setupCompleted) return
    const timer = window.setTimeout(() => {
      try {
        update((database) => {
          database.backupSettings.lastSnapshotAt = now()
        })
      } catch {
        notify("Local storage is full. Please download a backup file.", "warning")
      }
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [db.patients, db.tests, db.doctors, db.users, db.backupSettings.autoSnapshot])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirm(null)
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === "n") {
        event.preventDefault()
        navigate("New Patient")
      }
      if (key === "f") {
        event.preventDefault()
        navigate("Patients")
        window.setTimeout(() => document.getElementById("patient-search")?.focus(), 30)
      }
      if (key === "p") {
        event.preventDefault()
        window.print()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  /* ---------------------------------------------------------------------- */
  /* Patient operations                                                      */
  /* ---------------------------------------------------------------------- */

  const savePatient = (options: { printReceipt: boolean; keepRegistering: boolean }) => {
    if (!form.name.trim()) return notify("Enter the patient's name.", "error")
    if (form.age.trim() && Number.isNaN(Number(form.age))) return notify("Age must be a number.", "error")
    if (!form.age.trim()) return notify("Enter the patient's age.", "error")
    if (!form.gender) return notify("Select a gender.", "error")
    if (form.phone.replace(/\D/g, "").length < 7) return notify("Enter a valid contact number.", "error")
    if (!selectedTests.length) return notify("Select at least one test.", "error")

    const numbers = lab.allocateRecordNumbers()
    const doctor = db.doctors.find((d) => d.id === form.doctorId)
    const discount = db.testSettings.allowDiscount ? Math.max(0, Number(form.discount) || 0) : 0
    const total = totalFor(subtotalFor(db.tests, selectedTests), discount, db.testSettings.allowDiscount)
    const paid = db.paymentSettings.allowPartialPayment
      ? clampPaid(Number(form.paymentInput) || 0, total)
      : total
    const timestamp = now()

    const patient: Patient = {
      ...emptyPatient,
      id: numbers.patientId,
      reportId: numbers.reportId,
      sampleId: numbers.sampleId,
      name: form.name.trim(),
      age: form.age.trim(),
      gender: form.gender,
      phone: form.phone.trim(),
      cnic: form.cnic.trim(),
      bloodGroup: form.bloodGroup,
      address: form.address.trim(),
      notes: form.notes.trim(),
      doctorId: doctor?.id ?? "",
      doctorName: doctor?.name ?? "Walk-in",
      testCodes: [...selectedTests],
      sampleType: db.tests.find((t) => t.code === selectedTests[0])?.sampleType ?? "Blood",
      discount,
      total,
      paid,
      paymentMethod:
        form.paymentMethod || db.paymentSettings.paymentMethods[0] || "Cash",
      reportStatus: "Pending",
      sampleStatus: "Pending",
      collectedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    update((database) => {
      database.patients = [patient, ...database.patients]
    })
    addAudit("Patient Created", patient.id, `${patient.testCodes.length} tests`)
    notify(`${patient.name} registered.`)
    setActiveId(patient.id)
    setForm(emptyForm)
    setSelectedTests([])
    navigate(options.printReceipt ? "Receipt" : options.keepRegistering ? "New Patient" : "Patient Profile")
  }

  const patchPatient = (id: string, changes: Partial<Patient>, action: string, detail = "") => {
    update((database) => {
      database.patients = database.patients.map((p) =>
        p.id === id ? { ...p, ...changes, updatedAt: now() } : p,
      )
    })
    if (action) addAudit(action, id, detail)
  }

  /* ---------------------------------------------------------------------- */
  /* Patient read / update / delete                                          */
  /* ---------------------------------------------------------------------- */

  const editPatient = (patient: Patient) => {
    setEditingPatient({
      ...patient,
      age: patient.age,
      phone: patient.phone,
      cnic: patient.cnic,
      bloodGroup: patient.bloodGroup,
      doctorId: patient.doctorId,
      address: patient.address,
      notes: patient.notes,
    })
  }

  const savePatientEdits = (draft: Patient) => {
    const name = draft.name.trim()
    if (!name) return notify("Enter the patient's name.", "error")
    if (draft.age.trim() && Number.isNaN(Number(draft.age))) {
      return notify("Age must be a number.", "error")
    }
    if (draft.phone.replace(/\D/g, "").length < 7) {
      return notify("Enter a valid contact number.", "error")
    }
    const doctor = db.doctors.find((d) => d.id === draft.doctorId)
    const priced = reprice(
      { ...draft, testCodes: [...draft.testCodes] },
      db.tests,
      Number(draft.discount) || 0,
      db.testSettings.allowDiscount,
    )
    const record: Patient = {
      ...draft,
      name,
      age: draft.age.trim(),
      phone: draft.phone.trim(),
      cnic: draft.cnic.trim(),
      address: draft.address.trim(),
      notes: draft.notes.trim(),
      doctorId: doctor?.id ?? "",
      doctorName: doctor?.name ?? "Walk-in",
      results: pruneResults(draft.results, db.tests, draft.testCodes),
      ...priced,
      updatedAt: now(),
    }
    lab.savePatient(record)
    addAudit("Patient Updated", record.id, `${record.name} · ${record.testCodes.length} tests`)
    setEditingPatient(null)
    notify(`${record.name} updated.`)
  }

  /** Re-prices the order when the tests on an existing patient are changed. */
  const savePatientTests = (patient: Patient, codes: string[]) => {
    if (!codes.length) return notify("A patient needs at least one test.", "error")
    const removed = patient.testCodes.filter((code) => !codes.includes(code))
    const record: Patient = {
      ...patient,
      testCodes: [...codes],
      sampleType: db.tests.find((t) => t.code === codes[0])?.sampleType ?? patient.sampleType,
      results: pruneResults(patient.results, db.tests, codes),
      ...reprice(patient, db.tests, patient.discount, db.testSettings.allowDiscount, codes),
      reportStatus: patient.reportStatus === "Ready" ? "Pending" : patient.reportStatus,
      updatedAt: now(),
    }
    lab.savePatient(record)
    addAudit(
      "Patient Tests Changed",
      patient.id,
      removed.length
        ? `Removed ${removed.join(", ")} · now ${codes.join(", ")}`
        : `Now ${codes.join(", ")}`,
    )
    setPatientTests(null)
    notify(removed.length ? "Tests updated. The report must be re-verified." : "Test added.")
  }

  const requestDeletePatient = (patient: Patient) => {
    if (!isAdmin) {
      return notify("Only an administrator can delete a patient record.", "warning")
    }
    setDeletingPatient(patient)
  }

  const deletePatient = (patient: Patient) => {
    lab.removePatient(patient.id)
    addAudit("Patient Deleted", patient.id, `${patient.name} · ${patient.reportId}`)
    setDeletingPatient(null)
    if (activeId === patient.id) {
      const next = db.patients.find((p) => p.id !== patient.id)
      setActiveId(next?.id ?? "")
    }
    navigate("Patients")
    notify(`${patient.name} deleted.`)
  }

  /* ---------------------------------------------------------------------- */
  /* Sample lifecycle                                                         */
  /* ---------------------------------------------------------------------- */

  const setSampleStatus = (patient: Patient, status: SampleStatus) => {
    const changes: Partial<Patient> = { sampleStatus: status }
    if (status !== "Pending") changes.collectedAt = patient.collectedAt || now()
    if (status === "Rejected") changes.reportStatus = "Rejected"
    else if (patient.reportStatus === "Rejected") changes.reportStatus = "Pending"
    patchPatient(patient.id, changes, `Sample ${status}`, patient.sampleId)
  }

  const advanceSample = (patient: Patient) => {
    const next = nextSampleStatus(patient.sampleStatus)
    if (!next) return notify("This sample has already been completed.", "warning")
    setSampleStatus(patient, next)
    notify(`Sample marked as ${next.toLowerCase()}.`)
  }

  const reopenSample = (patient: Patient) => {
    patchPatient(
      patient.id,
      { reportStatus: "Pending", sampleStatus: "Pending" },
      "Sample Reopened",
      patient.sampleId,
    )
    notify("Sample returned to collection. Results can be re-entered.")
  }

  /** Prints the current page, or saves it as a PDF, using the desktop bridge. */
  const produceOutput = (kind: "report" | "receipt", savePdf: boolean) => {
    if (!active) return
    const bridge = getBridge()
    const settings = db.printerSettings
    const pageSize =
      kind === "report"
        ? settings.reportPaper
        : settings.receiptPaper === "58mm"
          ? "Thermal58"
          : "Thermal80"
    const printerName = kind === "report" ? settings.reportPrinterName : settings.thermalPrinterName
    const copies = kind === "report" ? settings.reportCopies : settings.receiptCopies
    const label = kind === "report" ? "Report" : "Receipt"
    const fileName =
      kind === "report"
        ? `${active.reportId || "report"}.pdf`
        : `receipt-${active.id || "patient"}.pdf`

    addAudit(`${label} ${savePdf ? "Saved as PDF" : "Printed"}`, active.reportId, db.profile.name)

    if (!bridge) {
      // Browser preview: the platform print dialog handles both printing and
      // "save as PDF".
      window.print()
      return
    }

    if (savePdf) {
      void bridge.printers
        .savePDF({ defaultFileName: fileName, pageSize })
        .then((result) => {
          if (result.ok) notify(`${label} saved as PDF.`)
          else if (!result.canceled) notify(result.error || "The PDF could not be saved.", "error")
        })
      return
    }

    void bridge.printers.print({ printerName, copies, pageSize }).then((result) => {
      if (!result.ok) notify(result.reason || `The ${label.toLowerCase()} could not be printed.`, "error")
    })
  }

  const printReport = () => produceOutput("report", false)
  const saveReportPdf = () => produceOutput("report", true)
  const printReceipt = () => produceOutput("receipt", false)
  const saveReceiptPdf = () => produceOutput("receipt", true)

  const receivePayment = (patient: Patient, amount: number, method: string) => {
    if (!amount || amount <= 0) return notify("Enter an amount to receive.", "error")
    const remaining = patient.total - patient.paid
    if (amount > remaining) return notify(`That is more than the ${money(remaining)} remaining.`, "error")
    patchPatient(
      patient.id,
      { paid: clampPaid(patient.paid + amount, patient.total), paymentMethod: method },
      "Payment Received",
      `${money(amount)} · ${method}`,
    )
    notify("Payment recorded.")
  }

  /**
   * Corrects a billing record: discount, payment method and the amount already
   * received. Every field is auditable because it changes money.
   *
   * The reason for the correction belongs in the audit trail, not on the
   * patient: `technicianNote` is the technician's own observation and is
   * overwritten by result entry, so a billing note written there would be lost.
   */
  const savePaymentAdjustment = (patient: Patient, values: {
    discount: number
    paid: number
    paymentMethod: string
    note: string
  }) => {
    const priced = reprice(patient, db.tests, values.discount, db.testSettings.allowDiscount)
    const paid = clampPaid(values.paid, priced.total)
    const changes: Partial<Patient> = { ...priced, paid, paymentMethod: values.paymentMethod }
    const detail = [
      `Discount ${money(priced.discount)}`,
      `Total ${money(priced.total)}`,
      `Paid ${money(paid)}`,
      values.paymentMethod,
      values.note.trim() ? `Reason: ${values.note.trim()}` : "",
    ]
      .filter(Boolean)
      .join(" · ")
    patchPatient(patient.id, changes, "Billing Adjusted", detail)
    setAdjustingPayment(null)
    notify("Billing record updated.")
  }

  const clearPayments = (patient: Patient) => {
    patchPatient(
      patient.id,
      { paid: 0, paymentMethod: db.paymentSettings.paymentMethods[0] ?? "Cash" },
      "Payments Voided",
      patient.reportId,
    )
    setAdjustingPayment(null)
    notify("Recorded payments were voided.")
  }

  /* ---------------------------------------------------------------------- */
  /* Result entry, saving, clearing and returning                             */
  /* ---------------------------------------------------------------------- */

  /** Commits the values currently on screen and moves the sample forward. */
  const saveResults = (
    patient: Patient,
    values: Record<string, string>,
    note: string,
    complete: boolean,
  ): boolean => {
    const missing = allMissingParameters({ ...patient, results: values }, db.tests)
    if (complete && missing.length) {
      const names = missing.map((entry) => `${entry.test.code}: ${entry.parameters.map((p) => p.name).join(", ")}`)
      notify(`Enter every value first. Still missing ${names.join("; ")}.`, "error")
      return false
    }
    const nextStatus: SampleStatus | undefined = complete
      ? "Completed"
      : patient.sampleStatus === "Pending" || patient.sampleStatus === "Collected"
        ? "Processing"
        : undefined
    const changes: Partial<Patient> = {
      results: { ...values },
      technicianNote: note.trim(),
      ...(nextStatus
        ? { sampleStatus: nextStatus, collectedAt: patient.collectedAt || now() }
        : {}),
    }
    patchPatient(patient.id, changes, complete ? "Results Saved & Completed" : "Results Saved", patient.reportId)
    notify(complete ? "Results saved and sample completed." : "Results saved.")
    return true
  }

  /** Wipes the entered values for one test so it can be typed again. */
  const clearResultsForTest = (patient: Patient, test: CatalogTest | null) => {
    if (!test) return
    const values = { ...patient.results }
    for (const parameter of test.parameters) delete values[parameter.id]
    patchPatient(patient.id, { results: values }, "Results Cleared", test.code)
    notify(`${test.code} results cleared.`)
    return values
  }

  /** Sends a finalized report back to the technician for correction. */
  const returnForCorrection = (patient: Patient) => {
    setConfirm({
      title: "Return report for correction?",
      body: "The report leaves the finalized list and results become editable again. This is recorded in the audit log.",
      confirm: "Return for correction",
      onConfirm: () => {
        patchPatient(
          patient.id,
          { reportStatus: "Pending", sampleStatus: "Processing" },
          "Report Returned",
          patient.reportId,
        )
        setConfirm(null)
        setResultTab(patient.testCodes[0] ?? "")
        navigate("Result Entry")
        notify("Report returned for correction.")
      },
    })
  }

  /* ---------------------------------------------------------------------- */
  /* Test catalog operations                                                 */
  /* ---------------------------------------------------------------------- */

  const saveTestRecord = (draft: Partial<CatalogTest>) => {
    const code = (draft.code ?? "").trim().toUpperCase()
    const name = (draft.name ?? "").trim()
    if (!code || !name) return notify("A test needs a code and a name.", "error")
    const price = Number(draft.price)
    if (!Number.isFinite(price) || price < 0) return notify("Enter a valid price.", "error")
    const existing = db.tests.find((t) => t.code === code)
    const timestamp = now()
    const record: CatalogTest = {
      id: existing?.id ?? createId("tst"),
      code,
      name,
      category: draft.category || db.testSettings.defaultCategory,
      price,
      sampleType: draft.sampleType || "Blood",
      container: draft.container ?? "",
      method: draft.method ?? "",
      active: draft.active ?? existing?.active ?? true,
      displayOrder: draft.displayOrder ?? existing?.displayOrder ?? db.tests.length,
      turnaroundHours: Number(draft.turnaroundHours) || db.testSettings.defaultTurnaroundHours,
      parameters: (draft.parameters ?? existing?.parameters ?? []).map((parameter, index) => ({
        ...parameter,
        displayOrder: parameter.displayOrder ?? index,
      })),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }
    lab.saveTest(record)
    addAudit(existing ? "Test Updated" : "Test Created", code, `${money(price)} · ${record.parameters.length} parameters`)
    setTestForm(null)
    notify(`${name} saved.`)
  }

  const saveDoctorRecord = (draft: Partial<Doctor>) => {
    const name = (draft.name ?? "").trim()
    if (!name) return notify("Enter the doctor's name.", "error")
    const record: Doctor = {
      id: draft.id ?? createId("doc"),
      name,
      specialization: draft.specialization ?? "",
      phone: draft.phone ?? "",
      clinic: draft.clinic ?? "",
      email: draft.email ?? "",
      active: draft.active ?? true,
      createdAt: draft.createdAt ?? now(),
    }
    lab.saveDoctor(record)
    addAudit(draft.id ? "Doctor Updated" : "Doctor Created", name, record.specialization)
    setDoctorForm(null)
    notify(`${name} saved.`)
  }

  const toggleDoctorActive = (doctor: Doctor) => {
    const record = { ...doctor, active: !doctor.active }
    lab.saveDoctor(record)
    addAudit(record.active ? "Doctor Reactivated" : "Doctor Deactivated", record.name)
    notify(`${record.name} is now ${record.active ? "active" : "inactive"}.`)
  }

  const toggleTestActive = (test: CatalogTest) => {
    lab.saveTest({ ...test, active: !test.active, updatedAt: now() })
    addAudit(test.active ? "Test Deactivated" : "Test Reactivated", test.code, test.name)
    notify(`${test.name} is now ${test.active ? "inactive" : "active"}.`)
  }

  const removeDoctor = (doctor: Doctor) => {
    setConfirm({
      title: `Remove ${doctor.name}?`,
      body: "They will be removed from the directory. Reports already issued keep the printed name.",
      confirm: "Remove doctor",
      danger: true,
      onConfirm: () => {
        lab.removeDoctor(doctor.id)
        addAudit("Doctor Removed", doctor.name)
        setConfirm(null)
        notify(`${doctor.name} removed.`)
      },
    })
  }

  const removeTest = (test: CatalogTest) => {
    // Open orders that carry this test (and at least one other) will be
    // re-priced without it. Say so before it happens rather than after.
    const affected = db.patients.filter(
      (p) =>
        p.reportStatus !== "Ready" &&
        p.testCodes.includes(test.code) &&
        p.testCodes.filter((code) => code !== test.code).length > 0,
    )
    setConfirm({
      title: `Remove ${test.name}?`,
      body: affected.length
        ? `It will be removed from the catalog and from ${affected.length} open order${affected.length === 1 ? "" : "s"}, which will be re-priced. Reports already issued keep their printed results.`
        : "It will be removed from the catalog. Reports already issued keep their printed results.",
      confirm: "Remove test",
      danger: true,
      onConfirm: () => {
        lab.removeTest(test.code)
        addAudit(
          "Test Removed",
          test.code,
          affected.length ? `${test.name} · ${affected.length} open order(s) re-priced` : test.name,
        )
        setConfirm(null)
        notify(`${test.name} removed.`)
      },
    })
  }

  /* ---------------------------------------------------------------------- */
  /* Shared fragments                                                        */
  /* ---------------------------------------------------------------------- */

  const paymentState = (patient: Patient) =>
    patient.paid >= patient.total ? "Paid" : patient.paid > 0 ? "Partial" : "Unpaid"

  const patientTable = (
    list: Patient[],
    context: "patients" | "reports" | "billing" = "patients",
  ) => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {context === "reports" ? (
              <>
                <th>REPORT ID</th>
                <th>PATIENT</th>
                <th>TESTS</th>
                <th>DATE</th>
                <th>STATUS</th>
                <th>PAYMENT</th>
              </>
            ) : context === "billing" ? (
              <>
                <th>PATIENT</th>
                <th>TESTS</th>
                <th>TOTAL</th>
                <th>PAID</th>
                <th>REMAINING</th>
                <th>STATUS</th>
              </>
            ) : (
              <>
                <th>PATIENT</th>
                <th>PATIENT ID</th>
                <th>TESTS</th>
                <th>DATE</th>
                <th>PAYMENT</th>
                <th>REPORT</th>
              </>
            )}
            <th className="table-action-head">ACTION</th>
          </tr>
        </thead>
        <tbody>
          {list.map((patient) => (
            <tr
              key={patient.id}
              onClick={() =>
                selectPatient(
                  patient,
                  context === "billing"
                    ? "Billing"
                    : context === "reports"
                      ? "Report Preview"
                      : "Patient Profile",
                )
              }
            >
              <td>
                {context === "reports" ? (
                  <span className="mono-id">{patient.reportId}</span>
                ) : (
                  <div className="person-cell">
                    <span className="avatar">{initials(patient.name)}</span>
                    <span>
                      <strong>{patient.name}</strong>
                      <small>
                        {context === "billing" ? patient.id : `${patient.age} yrs · ${patient.gender}`}
                      </small>
                    </span>
                  </div>
                )}
              </td>
              {context === "reports" ? (
                <>
                  <td>
                    <strong>{patient.name}</strong>
                  </td>
                  <td>{patient.testCodes.join(", ")}</td>
                  <td>{formatDate(patient.createdAt)}</td>
                  <td>
                    <Badge>{patient.reportStatus}</Badge>
                  </td>
                  <td>
                    <Badge>{paymentState(patient)}</Badge>
                  </td>
                </>
              ) : context === "billing" ? (
                <>
                  <td>{patient.testCodes.join(", ")}</td>
                  <td>{money(patient.total)}</td>
                  <td>{money(patient.paid)}</td>
                  <td className="strong-cell">{money(patient.total - patient.paid)}</td>
                  <td>
                    <Badge>{paymentState(patient)}</Badge>
                  </td>
                </>
              ) : (
                <>
                  <td>
                    <span className="mono-id">{patient.id}</span>
                  </td>
                  <td>{patient.testCodes.join(", ")}</td>
                  <td>{formatDate(patient.createdAt)}</td>
                  <td>
                    <Badge>{paymentState(patient)}</Badge>
                  </td>
                  <td>
                    <Badge>{patient.reportStatus}</Badge>
                  </td>
                </>
              )}
              <td className="table-action-cell">
                <IconButton icon={Pencil} label={`Edit ${patient.name}`} onClick={() => editPatient(patient)} />
                <IconButton
                  icon={Printer}
                  label={`Print receipt for ${patient.name}`}
                  onClick={() => {
                    setActiveId(patient.id)
                    navigate("Receipt")
                  }}
                />
                <IconButton
                  icon={Trash2}
                  label={`Delete ${patient.name}`}
                  className="icon-danger"
                  onClick={() => requestDeletePatient(patient)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const testSelection = (
    <div className="selection-layout">
      <div>
        <SearchField
          value={testQuery}
          onChange={setTestQuery}
          placeholder="Search by test name or code..."
          wide
        />
        <div className="category-tabs">
          {["All tests", ...new Set(db.tests.map((t) => t.category))].map((entry) => (
            <button
              key={entry}
              className={category === entry ? "active" : ""}
              onClick={() => setCategory(entry)}
            >
              {entry}
            </button>
          ))}
        </div>
        {db.tests.filter((t) => t.active).length === 0 ? (
          <Empty
            title="Your catalog is empty"
            detail="Add the tests your laboratory offers, with their own prices and reference ranges."
            action="Open test management"
            onAction={() => navigate("Tests")}
          />
        ) : (
          <div className="test-grid">
            {db.tests
              .filter(
                (test) =>
                  test.active &&
                  (category === "All tests" || test.category === category) &&
                  `${test.name} ${test.code}`.toLowerCase().includes(testQuery.toLowerCase()),
              )
              .map((test) => (
                <button
                  key={test.code}
                  className={`test-card ${selectedTests.includes(test.code) ? "selected" : ""}`}
                  onClick={() =>
                    setSelectedTests((current) =>
                      current.includes(test.code)
                        ? current.filter((code) => code !== test.code)
                        : [...current, test.code],
                    )
                  }
                >
                  <span className="test-card-top">
                    <span className="test-code">{test.code}</span>
                    <span className={`test-add ${selectedTests.includes(test.code) ? "added" : ""}`}>
                      {selectedTests.includes(test.code) ? <Check size={17} /> : <Plus size={17} />}
                    </span>
                  </span>
                  <strong>{test.name}</strong>
                  <span className="test-card-bottom">
                    <small>{test.sampleType} sample</small>
                    <b>{money(test.price)}</b>
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>
      <aside className="order-summary">
        <div className="order-heading">
          <span className="order-icon">
            <ClipboardList size={20} />
          </span>
          <div>
            <strong>Selected Tests</strong>
            <small>{selectedTests.length} tests added</small>
          </div>
        </div>
        {selectedTests.length ? (
          <div className="order-items">
            {selectedTests.map((code) => {
              const test = db.tests.find((t) => t.code === code)
              if (!test) return null
              return (
                <div key={code}>
                  <span>
                    <strong>{test.code}</strong>
                    <small>{test.name}</small>
                  </span>
                  <span>
                    {money(test.price)}{" "}
                    <button
                      title={`Remove ${test.code}`}
                      aria-label={`Remove ${test.code}`}
                      onClick={() => setSelectedTests((current) => current.filter((c) => c !== code))}
                    >
                      ×
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="order-empty">
            <FlaskConical size={27} />
            <p>
              No tests selected yet.
              <br />
              Choose tests from the list.
            </p>
          </div>
        )}
        <div className="order-total">
          <span>Subtotal</span>
          <strong>
            {money(selectedTests.reduce((sum, code) => sum + (db.tests.find((t) => t.code === code)?.price ?? 0), 0))}
          </strong>
        </div>
        <div className="order-total final">
          <span>Total</span>
          <strong>
            {money(
              Math.max(
                0,
                selectedTests.reduce((sum, code) => sum + (db.tests.find((t) => t.code === code)?.price ?? 0), 0) -
                  (db.testSettings.allowDiscount ? Number(form.discount) || 0 : 0),
              ),
            )}
          </strong>
        </div>
        <Button
          className="full-width"
          disabled={!selectedTests.length}
          onClick={() =>
            page === "New Patient"
              ? document.getElementById("payment-section")?.scrollIntoView({ behavior: "smooth" })
              : navigate("New Patient")
          }
        >
          Continue <ArrowRight size={18} />
        </Button>
      </aside>
    </div>
  )

  const actionTile = (icon: LucideIcon, label: string, detail: string, target: Page) => {
    const Icon = icon
    return (
      <button className="action-tile" onClick={() => navigate(target)}>
        <span className="action-icon">
          <Icon size={25} strokeWidth={1.8} />
        </span>
        <span className="action-text">
          <strong>{label}</strong>
          <small>{detail}</small>
        </span>
        <ArrowRight className="action-arrow" size={17} />
      </button>
    )
  }

  /* ---------------------------------------------------------------------- */
  /* Pages                                                                   */
  /* ---------------------------------------------------------------------- */

  const today = new Date()
  const todayLabel = today.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  })

  let content: ReactNode

  if (page === "Dashboard")
    content = (
      <>
        <div className="page-intro dashboard-intro">
          <div>
            <div className="eyebrow">
              <span className="live-dot" /> {todayLabel.toUpperCase()}
            </div>
            <h1>
              Welcome, {session?.name?.split(" ")[0] ?? "there"}
              <span className="greeting-period">.</span>
            </h1>
            <p>Here is what is happening at {db.profile.name || "your laboratory"} today.</p>
          </div>
          <div className="intro-actions">
            <Button variant="secondary" icon={Search} onClick={() => navigate("Patients")}>
              Find patient
            </Button>
            <Button icon={UserPlus} onClick={() => navigate("New Patient")}>
              New Patient
            </Button>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-main">
            <div className="summary-grid">
              <div className="metric">
                <div className="metric-top">
                  <span>Patients</span>
                  <span className="metric-icon metric-blue">
                    <Users size={21} />
                  </span>
                </div>
                <strong>{String(patients.length).padStart(2, "0")}</strong>
                <small>All registered records</small>
              </div>
              <div className="metric">
                <div className="metric-top">
                  <span>Tests ordered</span>
                  <span className="metric-icon metric-teal">
                    <FlaskConical size={21} />
                  </span>
                </div>
                <strong>{String(totals.totalTests).padStart(2, "0")}</strong>
                <small>Across {patients.length} patients</small>
              </div>
              <div className="metric">
                <div className="metric-top">
                  <span>Pending results</span>
                  <span className="metric-icon metric-amber">
                    <Clock3 size={21} />
                  </span>
                </div>
                <strong>{String(totals.pendingResults).padStart(2, "0")}</strong>
                <small>
                  <span className="amber-text">Awaiting verification</span>
                </small>
              </div>
              <div className="metric">
                <div className="metric-top">
                  <span>Reports ready</span>
                  <span className="metric-icon metric-green">
                    <FileCheck2 size={21} />
                  </span>
                </div>
                <strong>{String(totals.readyReports).padStart(2, "0")}</strong>
                <small>Ready for collection</small>
              </div>
            </div>

            <div className="panel quick-panel">
              <SectionHeading
                title="Quick actions"
                subtitle="Everything you need, one click away"
              />
              <div className="quick-grid">
                {actionTile(UserPlus, "New patient", "Register & add tests", "New Patient")}
                {actionTile(Search, "Find patient", "Search patient records", "Patients")}
                {actionTile(ClipboardCheck, "Enter results", "Update test findings", "Results")}
                {actionTile(Printer, "Print report", "Review ready reports", "Reports")}
                {actionTile(Wallet, "Receive payment", "Manage outstanding", "Billing")}
                {actionTile(FileText, "Print receipt", "Open the latest receipt", "Receipt")}
              </div>
            </div>

            <div className="panel recent-panel">
              <SectionHeading
                title="Recent patients"
                subtitle="Latest registrations"
                action={
                  <button className="text-link" onClick={() => navigate("Patients")}>
                    View all patients <ArrowRight size={16} />
                  </button>
                }
              />
              {patients.length ? (
                patientTable(patients.slice(0, 5))
              ) : (
                <Empty
                  title="No patients yet"
                  detail="Register your first patient to get started."
                  action="New Patient"
                  onAction={() => navigate("New Patient")}
                />
              )}
            </div>
          </div>

          <aside className="dashboard-side">
            <div className="attention-card">
              <div className="attention-top">
                <div className="attention-icon">
                  <Bell size={20} />
                </div>
                <span>NEEDS ATTENTION</span>
              </div>
              <h2>
                Stay on top of
                <br />
                today&apos;s work.
              </h2>
              <p>A few items are waiting for your review.</p>
              <div className="attention-list">
                <button onClick={() => navigate("Results")}>
                  <span className="attention-list-icon">
                    <Clock3 size={17} />
                  </span>
                  <span>
                    <strong>
                      {totals.pendingResults} pending result{totals.pendingResults === 1 ? "" : "s"}
                    </strong>
                    <small>Ready to be entered</small>
                  </span>
                  <ChevronRight size={17} />
                </button>
                <button onClick={() => navigate("Samples")}>
                  <span className="attention-list-icon">
                    <TestTube2 size={17} />
                  </span>
                  <span>
                    <strong>
                      {totals.awaitingCollection} sample{totals.awaitingCollection === 1 ? "" : "s"}
                    </strong>
                    <small>Awaiting collection</small>
                  </span>
                  <ChevronRight size={17} />
                </button>
                <button onClick={() => navigate("Billing")}>
                  <span className="attention-list-icon">
                    <Wallet size={17} />
                  </span>
                  <span>
                    <strong>{money(totals.outstanding)}</strong>
                    <small>Outstanding payments</small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            <div className="panel collection-panel">
              <div className="collection-icon">
                <Wallet size={22} />
              </div>
              <span className="side-label">TOTAL COLLECTED</span>
              <strong>{money(totals.collected)}</strong>
              <div className="collection-divider" />
              <div className="collection-bottom">
                <span>Outstanding</span>
                <b>{money(totals.outstanding)}</b>
              </div>
              <button className="text-link" onClick={() => navigate("Billing")}>
                View billing <ArrowRight size={16} />
              </button>
            </div>

            <div className="help-card">
              <span>
                <ShieldCheck size={18} /> LOCAL &amp; SECURE
              </span>
              <p>
                Your laboratory data stays on this device. Export a backup
                regularly from Settings.
              </p>
              <button onClick={() => navigate("Settings")}>
                Backup settings <ArrowRight size={15} />
              </button>
            </div>
          </aside>
        </div>
      </>
    )
  else if (page === "Patients")
    content = (
      <>
        <div className="page-intro">
          <div>
            <div className="eyebrow">PATIENT MANAGEMENT</div>
            <h1>Patients</h1>
            <p>Find a patient or register someone new.</p>
          </div>
          <Button icon={UserPlus} onClick={() => navigate("New Patient")}>
            New Patient
          </Button>
        </div>
        <div className="panel list-panel">
          <div className="list-toolbar">
            <SearchField
              id="patient-search"
              value={query}
              onChange={setQuery}
              placeholder="Search by name, phone, ID or report number"
              wide
            />
            <span className="result-count">{filteredPatients.length} patients</span>
          </div>
          {filteredPatients.length ? (
            patientTable(filteredPatients)
          ) : (
            <Empty
              title="No patients found"
              detail="Try another search, or register a new patient."
              action="New Patient"
              onAction={() => navigate("New Patient")}
            />
          )}
        </div>
      </>
    )
  else if (page === "New Patient")
    content = (
      <>
        <div className="page-intro">
          <div>
            <div className="eyebrow">PATIENT REGISTRATION</div>
            <h1>New Patient</h1>
            <p>Just a few details to get started. Fields marked * are required.</p>
          </div>
          <div className="generated-ids">
            <span>
              Patient ID <b>Auto-generated</b>
            </span>
            <span>
              Report ID <b>Auto-generated</b>
            </span>
          </div>
        </div>
        <div className="form-layout">
          <div className="form-main">
            <div className="panel form-panel">
              <div className="form-section-heading">
                <span className="section-number">01</span>
                <div>
                  <h2>Patient information</h2>
                  <p>Basic details about the patient</p>
                </div>
              </div>
              <div className="form-grid">
                <Field
                  label="Full name"
                  value={form.name}
                  onChange={(v) => setForm({ ...form, name: v })}
                  placeholder="Patient's full name"
                  required
                />
                <Field
                  label="Age (years)"
                  value={form.age}
                  onChange={(v) => setForm({ ...form, age: v })}
                  type="number"
                  min={0}
                  required
                />
                <Field
                  label="Gender"
                  value={form.gender}
                  onChange={(v) => setForm({ ...form, gender: v })}
                  options={["Male", "Female", "Other"]}
                  required
                />
                <Field
                  label="Blood group"
                  value={form.bloodGroup}
                  onChange={(v) => setForm({ ...form, bloodGroup: v })}
                  options={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]}
                />
              </div>
              <div className="form-divider" />
              <div className="form-section-heading">
                <span className="section-number">02</span>
                <div>
                  <h2>Contact information</h2>
                  <p>How can we reach the patient?</p>
                </div>
              </div>
              <div className="form-grid">
                <Field
                  label="Contact number"
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                  required
                />
                <Field
                  label="National ID (optional)"
                  value={form.cnic}
                  onChange={(v) => setForm({ ...form, cnic: v })}
                />
                <div className="full-span">
                  <Field
                    label="Address (optional)"
                    value={form.address}
                    onChange={(v) => setForm({ ...form, address: v })}
                  />
                </div>
              </div>
              <div className="form-divider" />
              <div className="form-section-heading">
                <span className="section-number">03</span>
                <div>
                  <h2>Referral information</h2>
                  <p>Who referred this patient?</p>
                </div>
              </div>
              <div className="form-grid">
                <Field
                  label="Referred by"
                  value={form.doctorId}
                  onChange={(v) => setForm({ ...form, doctorId: v })}
                  options={[
                    "",
                    ...db.doctors
                      .filter((d) => d.active)
                      .map((d) => `${d.name}${d.specialization ? `, ${d.specialization}` : ""} (${d.id})`),
                  ]}
                  hint={
                    db.doctors.length
                      ? "Choose a doctor from your directory."
                      : "Add referring doctors from the Doctors page."
                  }
                />
                <Field
                  label="Notes (optional)"
                  value={form.notes}
                  onChange={(v) => setForm({ ...form, notes: v })}
                />
              </div>
            </div>
            <div className="panel form-panel">
              <div className="form-section-heading">
                <span className="section-number">04</span>
                <div>
                  <h2>Test selection</h2>
                  <p>Choose the tests for this visit</p>
                </div>
              </div>
              {testSelection}
            </div>
            <div id="payment-section" className="panel form-panel">
              <div className="form-section-heading">
                <span className="section-number">05</span>
                <div>
                  <h2>Payment</h2>
                  <p>Record payment now or leave it for later</p>
                </div>
              </div>
              <div className="form-grid">
                {db.testSettings.allowDiscount && (
                  <Field
                    label={`Discount (${db.paymentSettings.currencySymbol})`}
                    value={form.discount}
                    onChange={(v) => setForm({ ...form, discount: v })}
                    type="number"
                    placeholder="0"
                  />
                )}
                {db.paymentSettings.allowPartialPayment && (
                  <Field
                    label={`Amount paid (${db.paymentSettings.currencySymbol})`}
                    value={form.paymentInput}
                    onChange={(v) => setForm({ ...form, paymentInput: v })}
                    type="number"
                    placeholder="0"
                  />
                )}
                <Field
                  label="Payment method"
                  value={form.paymentMethod || db.paymentSettings.paymentMethods[0] || ""}
                  onChange={(v) => setForm({ ...form, paymentMethod: v })}
                  options={db.paymentSettings.paymentMethods}
                />
              </div>
              <div className="registration-total">
                <span>Total payable</span>
                <strong>
                  {money(
                    Math.max(
                      0,
                      selectedTests.reduce(
                        (sum, code) => sum + (db.tests.find((t) => t.code === code)?.price ?? 0),
                        0,
                      ) - (Number(form.discount) || 0),
                    ),
                  )}
                </strong>
              </div>
            </div>
            <div className="form-footer">
              <Button
                variant="secondary"
                onClick={() => savePatient({ printReceipt: false, keepRegistering: true })}
              >
                Save &amp; New Patient
              </Button>
              <Button
                variant="secondary"
                icon={Printer}
                onClick={() => savePatient({ printReceipt: true, keepRegistering: false })}
              >
                Save &amp; Print Receipt
              </Button>
              <Button icon={Check} onClick={() => savePatient({ printReceipt: false, keepRegistering: false })}>
                Save Patient
              </Button>
            </div>
          </div>
          <aside className="form-side">
            <div className="tip-card">
              <div className="tip-icon">
                <ShieldCheck size={20} />
              </div>
              <strong>Simple and secure</strong>
              <p>
                Patient, sample and report numbers are generated from your own
                prefix. Update any detail later from the patient profile.
              </p>
            </div>
          </aside>
        </div>
      </>
    )
  else if (page === "Patient Profile")
    content = !active ? (
      <Empty title="No patient selected" detail="Choose a patient from the list." action="Patients" onAction={() => navigate("Patients")} />
    ) : (
      <>
        <div className="back-row">
          <button onClick={() => navigate("Patients")}>
            <ArrowLeft size={18} /> All patients
          </button>
        </div>
        <div className="profile-banner panel">
          <div className="profile-identity">
            <span className="avatar avatar-large">{initials(active.name)}</span>
            <div>
              <div className="eyebrow">
                PATIENT PROFILE · {active.id}
              </div>
              <h1>{active.name}</h1>
              <p>
                {active.age} years · {active.gender} <span>·</span> {active.phone}
              </p>
            </div>
          </div>
          <div className="intro-actions">
            <Button variant="secondary" icon={Pencil} onClick={() => editPatient(active)}>
              Edit details
            </Button>
            <Button variant="secondary" icon={FileText} onClick={() => navigate("Report Preview")}>
              View report
            </Button>
            <Button variant="danger" icon={Trash2} onClick={() => requestDeletePatient(active)}>
              Delete
            </Button>
          </div>
        </div>
        <div className="profile-actions">
          {[
            [ClipboardList, "Change tests", "PatientTests"],
            [FileText, "View report", "Report Preview"],
            [Wallet, "Payment", "Billing"],
            [Printer, "Print receipt", "Receipt"],
          ].map(([Icon, text, target]) => {
            const I = Icon as LucideIcon
            return (
              <button
                key={text as string}
                onClick={() =>
                  target === "PatientTests" ? setPatientTests(active) : navigate(target as Page)
                }
              >
                <I size={21} />
                <span>{text as string}</span>
                <ArrowRight size={17} />
              </button>
            )
          })}
        </div>
        <div className="profile-columns">
          <div className="panel profile-details">
            <SectionHeading title="Patient details" />
            <div className="detail-grid">
              {[
                ["Patient code", active.id],
                ["Report ID", active.reportId],
                ["Sample ID", active.sampleId],
                ["Contact", active.phone],
                ["National ID", active.cnic || "Not provided"],
                ["Blood group", active.bloodGroup || "Not provided"],
                ["Referred by", active.doctorName],
                ["Sample type", active.sampleType],
              ].map(([key, value]) => (
                <div key={key}>
                  <small>{key}</small>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="panel profile-details">
            <SectionHeading title="Payment overview" />
            <div className="payment-hero">
              <Badge>{paymentState(active)}</Badge>
              <strong>{money(active.total - active.paid)}</strong>
              <span>Remaining balance</span>
            </div>
            <div className="payment-mini">
              <span>
                Total <b>{money(active.total)}</b>
              </span>
              <span>
                Paid <b>{money(active.paid)}</b>
              </span>
            </div>
            <Button className="full-width" variant="secondary" onClick={() => navigate("Billing")}>
              Manage payment <ArrowRight size={16} />
            </Button>
          </div>
        </div>
        <div className="panel history-panel">
          <SectionHeading
            title="Patient history"
            subtitle="A clear record of this patient's laboratory visits"
          />
          <div className="timeline">
            <div className="timeline-item">
              <div className="timeline-marker">
                <FlaskConical size={18} />
              </div>
              <div>
                <strong>{active.testCodes.join(" + ")}</strong>
                <p>
                  {formatDate(active.createdAt)} · {active.reportId}
                </p>
              </div>
              <div className="timeline-badges">
                <Badge>{active.reportStatus}</Badge>
                <Badge>{active.sampleStatus}</Badge>
                <Badge>{paymentState(active)}</Badge>
              </div>
              <button onClick={() => navigate("Report Preview")}>
                View <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </>
    )
  else if (page === "Tests")
    content = (
      <>
        <div className="page-intro">
          <div>
            <div className="eyebrow">CATALOG</div>
            <h1>Test management</h1>
            <p>
              {db.profile.name ? `${db.profile.name}'s` : "Your"} tests, parameters and
              prices.
            </p>
          </div>
          <Button
            icon={UserPlus}
            onClick={() =>
              setTestForm({
                name: "",
                code: "",
                category: db.testSettings.defaultCategory,
                price: 0,
                sampleType: db.testSettings.sampleTypes[0] ?? "Blood",
                parameters: [],
              })
            }
          >
            Add test
          </Button>
        </div>
        <div className="panel list-panel">
          <div className="list-toolbar">
            <SearchField value={query} onChange={setQuery} placeholder="Search test name or code" />
            <span className="result-count">
              {db.tests.filter((t) => t.active).length} active tests
            </span>
          </div>
          {db.tests.filter((t) => `${t.name} ${t.code}`.toLowerCase().includes(query.toLowerCase()))
            .length === 0 ? (
            <Empty
              title="No tests yet"
              detail="Add the tests your laboratory offers. Each laboratory sets its own prices."
              action="Add test"
              onAction={() =>
                setTestForm({
                  name: "",
                  code: "",
                  category: db.testSettings.defaultCategory,
                  price: 0,
                  sampleType: "Blood",
                  parameters: [],
                })
              }
            />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>TEST NAME</th>
                    <th>CODE</th>
                    <th>CATEGORY</th>
                    <th>SAMPLE</th>
                    <th>PARAMETERS</th>
                    <th>PRICE</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {db.tests
                    .filter((t) => `${t.name} ${t.code}`.toLowerCase().includes(query.toLowerCase()))
                    .map((test) => (
                      <tr key={test.code}>
                        <td>
                          <strong>{test.name}</strong>
                        </td>
                        <td>
                          <span className="test-code">{test.code}</span>
                        </td>
                        <td>{test.category}</td>
                        <td>{test.sampleType}</td>
                        <td>{test.parameters.length}</td>
                        <td className="strong-cell">{money(test.price)}</td>
                        <td>
                          <Badge>{test.active ? "Active" : "Inactive"}</Badge>
                        </td>
                        <td className="table-action-cell">
                          <IconButton
                            icon={FileText}
                            label={`Edit ${test.name}`}
                            onClick={() => setTestForm({ ...test })}
                          />
                          <IconButton
                            icon={test.active ? EyeOff : Eye}
                            label={test.active ? `Deactivate ${test.name}` : `Activate ${test.name}`}
                            onClick={() => toggleTestActive(test)}
                          />
                          <IconButton
                            icon={Trash2}
                            className="icon-danger"
                            label={`Remove ${test.name}`}
                            onClick={() => removeTest(test)}
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    )
  else if (page === "Samples")
    content = (
      <>
        <div className="page-intro">
          <div>
            <div className="eyebrow">LAB WORK</div>
            <h1>Sample collection</h1>
            <p>Track samples from collection through processing.</p>
          </div>
          <Badge tone="blue">{totals.awaitingCollection} awaiting collection</Badge>
        </div>
        <div className="panel list-panel">
          <div className="list-toolbar">
            <SearchField value={query} onChange={setQuery} placeholder="Search patient or sample ID" />
            <span className="result-count">{filteredPatients.length} samples</span>
          </div>
          {filteredPatients.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>SAMPLE ID</th>
                    <th>PATIENT</th>
                    <th>TESTS</th>
                    <th>TYPE</th>
                    <th>COLLECTED</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map((patient) => (
                    <tr key={patient.id}>
                      <td className="mono-id">{patient.sampleId}</td>
                      <td>
                        <strong>{patient.name}</strong>
                        <small className="table-sub">{patient.id}</small>
                      </td>
                      <td>{patient.testCodes.join(", ")}</td>
                      <td>{patient.sampleType}</td>
                      <td>
                        {patient.sampleStatus === "Pending" ? "—" : formatTime(patient.collectedAt)}
                      </td>
                      <td>
                        <Badge>{patient.sampleStatus}</Badge>
                      </td>
                      <td>
                        <div className="sample-actions">
                          {!isSampleClosed(patient.sampleStatus) ? (
                            <>
                              <button
                                className="table-text-action"
                                onClick={() => advanceSample(patient)}
                              >
                                {patient.sampleStatus === "Pending"
                                  ? "Collect sample"
                                  : patient.sampleStatus === "Collected"
                                    ? "Start processing"
                                    : "Complete"}{" "}
                                <ArrowRight size={15} />
                              </button>
                              <button
                                className="sample-reject"
                                onClick={() => {
                                  setRejecting(patient)
                                  setRejectReason("")
                                }}
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <button
                              className="table-text-action"
                              onClick={() => reopenSample(patient)}
                            >
                              <RotateCcw size={15} /> Reopen
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No samples" detail="No samples match your search." />
          )}
        </div>
      </>
    )
  else if (page === "Results")
    content = (
      <>
        <div className="page-intro">
          <div>
            <div className="eyebrow">LAB WORK</div>
            <h1>Results</h1>
            <p>Enter, review and finalize test results.</p>
          </div>
        </div>
        <div className="panel list-panel">
          <div className="list-toolbar">
            <SearchField value={query} onChange={setQuery} placeholder="Search patient or report ID" />
            <span className="result-count">{totals.pendingResults} awaiting results</span>
          </div>
          {filteredPatients.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>PATIENT</th>
                    <th>REPORT ID</th>
                    <th>TESTS</th>
                    <th>DATE</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map((patient) => (
                    <tr key={patient.id}>
                      <td>
                        <strong>{patient.name}</strong>
                        <small className="table-sub">{patient.id}</small>
                      </td>
                      <td className="mono-id">{patient.reportId}</td>
                      <td>{patient.testCodes.join(", ")}</td>
                      <td>{formatDate(patient.createdAt)}</td>
                      <td>
                        <Badge>{patient.reportStatus}</Badge>
                      </td>
                      <td>
                        <button
                          className="table-text-action"
                          onClick={() => {
                            setResultTab(patient.testCodes[0] ?? "")
                            selectPatient(
                              patient,
                              patient.reportStatus === "Ready" ? "Report Preview" : "Result Entry",
                            )
                          }}
                        >
                          {patient.reportStatus === "Ready" ? "View report" : "Enter results"}{" "}
                          <ArrowRight size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No results" detail="No patients match your search." />
          )}
        </div>
      </>
    )
  else if (page === "Result Entry" || page === "Verification")
    content = !active || activeTests.length === 0 ? (
      <Empty
        title="No test selected"
        detail="Open a patient with at least one test in their catalog."
        action="Patients"
        onAction={() => navigate("Patients")}
      />
    ) : (
      <ResultEntryPanel
        mode={page === "Verification" ? "verify" : "edit"}
        db={db}
        patient={active}
        tests={activeTests}
        testCode={activeTest?.code ?? ""}
        onSelectTest={setResultTab}
        onBack={() => navigate(page === "Verification" ? "Verification" : "Results")}
        onSaved={() => navigate("Results")}
        onSubmitted={() => navigate("Verification")}
        onReturn={() => returnForCorrection(active)}
        onSave={saveResults}
        onClearTest={clearResultsForTest}
        onFinalize={() =>
          setConfirm({
            title: "Finalize report?",
            body: "After verification, editing results requires returning the report for correction.",
            confirm: "Verify & Finalize",
            onConfirm: () => {
              patchPatient(active.id, { reportStatus: "Ready" }, "Result Verified", active.reportId)
              setConfirm(null)
              navigate("Report Preview")
              notify("Report finalized and ready to print.")
            },
          })
        }
      />
    )
  else if (page === "Reports")
    content = (
      <>
        <div className="page-intro">
          <div>
            <div className="eyebrow">REPORT MANAGEMENT</div>
            <h1>Reports</h1>
            <p>Find, review and print laboratory reports.</p>
          </div>
          <Button
            variant="secondary"
            icon={Printer}
            disabled={!active}
            onClick={() => navigate("Report Preview")}
          >
            Preview latest report
          </Button>
        </div>
        <div className="panel list-panel">
          <div className="list-toolbar wrap-toolbar">
            <SearchField value={query} onChange={setQuery} placeholder="Search patient or report ID" />
            <div className="filter-pills">
              {["All", "Pending", "Ready"].map((filter) => (
                <button
                  key={filter}
                  className={reportFilter === filter ? "active" : ""}
                  onClick={() => setReportFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
          {filteredPatients.length ? (
            patientTable(
              reportFilter === "All"
                ? filteredPatients
                : filteredPatients.filter((p) => p.reportStatus === reportFilter),
              "reports",
            )
          ) : (
            <Empty title="No reports found" detail="Try another search or status filter." />
          )}
        </div>
      </>
    )
  else if (page === "Report Preview")
    content = !active ? (
      <Empty title="No report to show" detail="Open a patient to preview their report." action="Patients" onAction={() => navigate("Patients")} />
    ) : (
      <>
        <div className="page-intro print-hide">
          <div>
            <div className="eyebrow">
              REPORTS · {active.reportId}
            </div>
            <h1>Report preview</h1>
            <p>Review the final report before printing or saving as PDF.</p>
          </div>
          <div className="intro-actions">
            {active.reportStatus === "Ready" ? (
              <Button variant="secondary" icon={RotateCcw} onClick={() => returnForCorrection(active)}>
                Return for correction
              </Button>
            ) : (
              <Button
                variant="secondary"
                icon={Pencil}
                onClick={() => {
                  setResultTab(active.testCodes[0] ?? "")
                  navigate("Result Entry")
                }}
              >
                Enter results
              </Button>
            )}
            <Button variant="secondary" icon={FileCheck2} onClick={saveReportPdf}>
              Save as PDF
            </Button>
            <Button icon={Printer} onClick={printReport}>
              Print report
            </Button>
          </div>
        </div>
        <div className="print-canvas">
          <ReportDocument
            model={buildReportModel(db, active, {
              productName: PRODUCT_NAME,
              vendorCredit: VENDOR.credit,
              vendorWebsite: VENDOR.websiteLine,
            })}
          />
        </div>
        <div className="preview-bottom print-hide">
          <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate("Reports")}>
            Back to reports
          </Button>
          <Button icon={Printer} onClick={printReport}>
            Print report
          </Button>
        </div>
      </>
    )
  else if (page === "Receipt")
    content = !active ? (
      <Empty title="No receipt to show" detail="Open a patient to preview their receipt." action="Patients" onAction={() => navigate("Patients")} />
    ) : (
      <>
        <div className="page-intro print-hide">
          <div>
            <div className="eyebrow">
              BILLING · {active.id}
            </div>
            <h1>Thermal receipt</h1>
            <p>Optimized for {db.printerSettings.receiptPaper} receipt printers.</p>
          </div>
          <div className="intro-actions">
            <Button variant="secondary" icon={FileCheck2} onClick={saveReceiptPdf}>
              Save as PDF
            </Button>
            <Button icon={Printer} onClick={printReceipt}>
              Print receipt
            </Button>
          </div>
        </div>
        <div className="receipt-stage">
          <ReceiptDocument
            model={buildReceiptModel(db, active, {
              vendorCredit: VENDOR.credit,
              vendorWebsite: VENDOR.websiteLine,
            })}
          />
        </div>
        <div className="preview-bottom print-hide">
          <Button variant="secondary" onClick={() => navigate("Patient Profile")}>
            Back to patient
          </Button>
          <Button variant="secondary" icon={FileCheck2} onClick={saveReceiptPdf}>
            Save as PDF
          </Button>
          <Button icon={Printer} onClick={printReceipt}>
            Print receipt
          </Button>
        </div>
      </>
    )
  else if (page === "Billing")
    content = (
      <>
        <div className="page-intro">
          <div>
            <div className="eyebrow">PAYMENTS</div>
            <h1>Billing</h1>
            <p>Clear payments. No guesswork.</p>
          </div>
          <Button variant="secondary" icon={Search} onClick={() => navigate("Patients")}>
            Find patient
          </Button>
        </div>
        <div className="billing-summary-grid">
          <div className="billing-stat">
            <span>
              <Wallet size={19} /> Total collected
            </span>
            <strong>{money(totals.collected)}</strong>
          </div>
          <div className="billing-stat">
            <span>
              <Clock3 size={19} /> Outstanding
            </span>
            <strong>{money(totals.outstanding)}</strong>
          </div>
          <div className="billing-stat">
            <span>
              <CheckCircle2 size={19} /> Settled invoices
            </span>
            <strong>{patients.filter((p) => p.paid >= p.total).length}</strong>
          </div>
        </div>
        <div className="panel list-panel">
          <SectionHeading
            title="Patient payments"
            subtitle="Select a patient to receive payment or print a receipt"
          />
          {patients.length ? (
            patientTable(patients, "billing")
          ) : (
            <Empty title="No billing records" detail="Register a patient to begin billing." />
          )}
        </div>
        {active && (
          <div className="panel payment-detail">
            <div className="payment-detail-head">
              <div>
                <div className="eyebrow">SELECTED PATIENT</div>
                <h2>
                  {active.name} <span>· {active.id}</span>
                </h2>
              </div>
              <Badge>{paymentState(active)}</Badge>
            </div>
            <div className="payment-detail-grid">
              <div>
                <small>TESTS</small>
                <strong>{active.testCodes.join(", ")}</strong>
              </div>
              <div>
                <small>TOTAL</small>
                <strong>{money(active.total)}</strong>
              </div>
              <div>
                <small>PAID</small>
                <strong>{money(active.paid)}</strong>
              </div>
              <div>
                <small>REMAINING</small>
                <strong className="remaining-amount">{money(active.total - active.paid)}</strong>
              </div>
            </div>
            {active.total > active.paid ? (
              <ReceivePaymentForm
                remaining={active.total - active.paid}
                methods={db.paymentSettings.paymentMethods}
                currency={db.paymentSettings.currencySymbol}
                onSubmit={(amount, method) => receivePayment(active, amount, method)}
              />
            ) : (
              <div className="paid-message">
                <CheckCircle2 size={20} /> Payment complete. No balance remaining.
              </div>
            )}
            <div className="billing-tools">
              <Button variant="secondary" icon={Pencil} onClick={() => setAdjustingPayment(active)}>
                Adjust billing
              </Button>
              <button className="text-link" onClick={() => navigate("Receipt")}>
                View or print receipt <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </>
    )
  else if (page === "Doctors")
    content = (
      <>
        <div className="page-intro">
          <div>
            <div className="eyebrow">DIRECTORY</div>
            <h1>Doctors</h1>
            <p>Referring doctors for this laboratory.</p>
          </div>
          <Button icon={UserPlus} onClick={() => setDoctorForm({ name: "" })}>
            Add doctor
          </Button>
        </div>
        <div className="panel list-panel">
          <div className="list-toolbar">
            <SearchField value={query} onChange={setQuery} placeholder="Search doctors" />
            <span className="result-count">{db.doctors.length} doctors</span>
          </div>
          {db.doctors.filter((d) => `${d.name} ${d.clinic} ${d.specialization}`.toLowerCase().includes(query.toLowerCase()))
            .length === 0 ? (
            <Empty
              title="No doctors yet"
              detail="Add the doctors who refer patients to your laboratory."
              action="Add doctor"
              onAction={() => setDoctorForm({ name: "" })}
            />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>DOCTOR</th>
                    <th>SPECIALIZATION</th>
                    <th>PHONE</th>
                    <th>CLINIC / HOSPITAL</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {db.doctors
                    .filter((d) =>
                      `${d.name} ${d.clinic} ${d.specialization}`.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((doctor) => (
                      <tr key={doctor.id}>
                        <td>
                          <div className="person-cell">
                            <span className="avatar avatar-teal">
                              <Stethoscope size={19} />
                            </span>
                            <strong>{doctor.name}</strong>
                          </div>
                        </td>
                        <td>{doctor.specialization || "—"}</td>
                        <td>{doctor.phone || "—"}</td>
                        <td>{doctor.clinic || "—"}</td>
                        <td className="table-action-cell">
                          <IconButton
                            icon={FileText}
                            label={`Edit ${doctor.name}`}
                            onClick={() => setDoctorForm(doctor)}
                          />
                          <IconButton
                            icon={doctor.active ? EyeOff : Eye}
                            label={doctor.active ? `Deactivate ${doctor.name}` : `Activate ${doctor.name}`}
                            onClick={() => toggleDoctorActive(doctor)}
                          />
                          <IconButton
                            icon={Trash2}
                            className="icon-danger"
                            label={`Remove ${doctor.name}`}
                            onClick={() => removeDoctor(doctor)}
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    )
  else if (page === "Staff")
    content = (
      <SettingsPage
        initialSection="users"
        notify={notify}
        onNavigate={(target) => navigate(target as Page)}
      />
    )
  else if (page === "Analytics")
    content = <AnalyticsPage db={db} money={money} totals={totals} />
  else if (page === "Audit Log")
    content = (
      <>
        <div className="page-intro">
          <div>
            <div className="eyebrow">SECURITY</div>
            <h1>Audit log</h1>
            <p>A record of important actions in your laboratory.</p>
          </div>
          <div className="intro-actions">
            <Button
              variant="secondary"
              icon={ArrowDownLeft}
              disabled={!db.audit.length}
              onClick={() =>
                downloadTextFile(
                  `audit-log-${db.installation.code}.csv`,
                  auditCsv(db.audit),
                  "text/csv",
                )
              }
            >
              Export CSV
            </Button>
            {isAdmin && (
              <Button
                variant="danger"
                icon={Trash2}
                disabled={!db.audit.length}
                onClick={() =>
                  setConfirm({
                    title: "Clear the audit log?",
                    body: "Every recorded entry is deleted and only the clearing action itself is kept. This cannot be undone.",
                    confirm: "Clear audit log",
                    danger: true,
                    onConfirm: () => {
                      const result = lab.clearAudit()
                      setConfirm(null)
                      if (!result.ok) return notify(result.error ?? "The audit log was not cleared.", "error")
                      notify("Audit log cleared.")
                    },
                  })
                }
              >
                Clear log
              </Button>
            )}
          </div>
        </div>
        <div className="panel list-panel">
          {db.audit.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>DATE &amp; TIME</th>
                    <th>USER</th>
                    <th>ACTION</th>
                    <th>RECORD</th>
                    <th>DETAIL</th>
                  </tr>
                </thead>
                <tbody>
                  {db.audit.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDateTime(entry.time)}</td>
                      <td>{entry.userName}</td>
                      <td>
                        <strong>{entry.action}</strong>
                      </td>
                      <td className="mono-id">{entry.record}</td>
                      <td>{entry.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Nothing recorded yet" detail="Actions appear here as your team works." />
          )}
        </div>
      </>
    )
  else
    content = (
      <SettingsPage
        initialSection={settingsSection}
        notify={notify}
        onNavigate={(target) =>
          requireAdmin(
            () => navigate(target as Page),
            "Only an administrator can manage staff and test configuration.",
          )
        }
      />
    )

  /* ---------------------------------------------------------------------- */
  /* Shell                                                                   */
  /* ---------------------------------------------------------------------- */

  /*
   * Gate first, before any hook-dependent shell work. The provider decides
   * whether this installation still needs setting up, still needs a sign-in, or
   * is ready to use. Rendering the shell before that decision is made would
   * hand a fresh browser a fully working, unauthenticated laboratory.
   */
  /*
   * The window is frameless, so the custom title bar carries the window
   * controls on every screen, including sign-in, setup and the splash. On the
   * operational shell it also names the current screen.
   */
  const titleBar = (
    <TitleBar
      labName={db.profile.name}
      title={lab.status === "ready" ? PAGE_TITLE[page] : ""}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  )

  // The license decides whether the product may be used at all. It is evaluated
  // after loading, first-run setup and sign-in so those states are never locked
  // out, and it relies on isLicenseOperatingAllowed so every non-operational
  // status is covered: NOT_ACTIVATED, EXPIRED, DEACTIVATED, SUSPENDED, REVOKED
  // and VERIFICATION_ERROR.
  const isHardLocked = !isLicenseOperatingAllowed(db.license)

  if (lab.status === "loading")
    return (
      <div className="desktop-frame">
        {titleBar}
        <SplashScreen />
      </div>
    )
  if (lab.status === "setup")
    return (
      <div className="desktop-frame">
        {titleBar}
        <SetupWizard />
      </div>
    )
  if (lab.status === "signed-out")
    return (
      <div className="desktop-frame">
        {titleBar}
        <LoginScreen />
      </div>
    )

  if (isHardLocked)
    return (
      <div className="desktop-frame">
        {titleBar}
        <LicenseLockScreen />
      </div>
    )

  return (
      <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Brand compact={collapsed} />
          <IconButton
            icon={Menu}
            label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
            className="collapse-button"
          />
        </div>
        <div className="sidebar-content">
          <div className="nav-caption">WORKSPACE</div>
          <nav aria-label="Main navigation">
            {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => {
              const Icon = item.icon
              const isActive =
                page === item.label ||
                (item.label === "Patients" && page === "Patient Profile") ||
                (item.label === "Results" && (page === "Result Entry" || page === "Verification")) ||
                (item.label === "Reports" && page === "Report Preview")
              return (
                <div key={item.label}>
                  {item.group && <div className="nav-caption nav-group">{item.group}</div>}
                  <button
                    title={item.label}
                    className={`nav-item ${isActive ? "active" : ""}`}
                    onClick={() =>
                      item.label === "Settings" ? openSettings("profile") : navigate(item.label)
                    }
                  >
                    <Icon size={20} strokeWidth={1.85} />
                    <span>{item.label}</span>
                    {item.label === "Results" && totals.pendingResults > 0 && (
                      <i className="nav-count">{totals.pendingResults}</i>
                    )}
                  </button>
                </div>
              )
            })}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <button className="sidebar-profile" onClick={() => navigate("Settings")}>
            <span className="profile-avatar">{initials(session?.name ?? "")}</span>
            <span className="profile-copy">
              <strong>{session?.name}</strong>
              <small>{session?.role}</small>
            </span>
          </button>
          <button className="logout-button" title="Log out" onClick={signOut}>
            <LogOut size={18} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <div className="app-body">
        {titleBar}

        <main className="main-content">
          {content}
          <footer className="app-footer">
            <span>
              {db.profile.name ? `© ${new Date().getFullYear()} ${db.profile.name}` : `© ${new Date().getFullYear()}`}
              {" · "}
              {PRODUCT_NAME} {PRODUCT_VERSION}
            </span>
            <span>
              <ShieldCheck size={14} /> Secure local workspace
            </span>
            <span className="app-footer-vendor">
              {VENDOR.credit} · {VENDOR.websiteLine}
            </span>
          </footer>
        </main>
      </div>

      {toast && <ToastView toast={toast} onDismiss={() => setToast(null)} />}
      {confirm && <ConfirmDialog request={confirm} onCancel={() => setConfirm(null)} />}

      {editingPatient && (
        <EditPatientModal
          patient={editingPatient}
          doctors={db.doctors.filter((d) => d.active)}
          onClose={() => setEditingPatient(null)}
          onSave={savePatientEdits}
        />
      )}

      {patientTests && (
        <PatientTestsModal
          patient={patientTests}
          tests={db.tests.filter((t) => t.active)}
          money={money}
          onClose={() => setPatientTests(null)}
          onSave={(codes) => savePatientTests(patientTests, codes)}
        />
      )}

      {deletingPatient && (
        <Modal
          title={`Delete ${deletingPatient.name}?`}
          description={`This permanently removes ${deletingPatient.id}, report ${deletingPatient.reportId}, its results and its payment record from this installation.`}
          onClose={() => setDeletingPatient(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeletingPatient(null)}>
                Keep record
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const target = deletingPatient
                  setDeletingPatient(null)
                  deletePatient(target)
                }}
              >
                Delete permanently
              </Button>
            </>
          }
        >
          <div className="info-callout danger">
            <AlertTriangle size={20} />
            <span>
              This cannot be undone. Export a backup from Settings first if you may
              need this record again.
            </span>
          </div>
        </Modal>
      )}

      {adjustingPayment && (
        <BillingAdjustModal
          patient={adjustingPayment}
          db={db}
          money={money}
          onClose={() => setAdjustingPayment(null)}
          onSave={savePaymentAdjustment}
          onVoid={() => clearPayments(adjustingPayment)}
        />
      )}

      {doctorForm && (
        <Modal
          title={doctorForm.id ? "Edit doctor" : "Add doctor"}
          description="Referring doctors belong to this laboratory."
          onClose={() => setDoctorForm(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDoctorForm(null)}>
                Cancel
              </Button>
              <Button onClick={() => saveDoctorRecord(doctorForm)}>Save doctor</Button>
            </>
          }
        >
          <div className="settings-form-grid">
            <Field
              label="Doctor name"
              value={doctorForm.name ?? ""}
              onChange={(v) => setDoctorForm({ ...doctorForm, name: v })}
              required
            />
            <Field
              label="Specialization"
              value={doctorForm.specialization ?? ""}
              onChange={(v) => setDoctorForm({ ...doctorForm, specialization: v })}
            />
            <Field
              label="Phone"
              value={doctorForm.phone ?? ""}
              onChange={(v) => setDoctorForm({ ...doctorForm, phone: v })}
            />
            <Field
              label="Clinic / hospital"
              value={doctorForm.clinic ?? ""}
              onChange={(v) => setDoctorForm({ ...doctorForm, clinic: v })}
            />
            <div className="full-span">
              <Field
                label="Email"
                value={doctorForm.email ?? ""}
                onChange={(v) => setDoctorForm({ ...doctorForm, email: v })}
                type="email"
              />
            </div>
          </div>
        </Modal>
      )}

      {testForm && (
        <TestEditor
          draft={testForm}
          categories={db.testSettings.categories}
          sampleTypes={db.testSettings.sampleTypes}
          defaultTurnaround={db.testSettings.defaultTurnaroundHours}
          currencySymbol={db.paymentSettings.currencySymbol}
          onClose={() => setTestForm(null)}
          onSave={saveTestRecord}
        />
      )}

      {rejecting && (
        <Modal
          title="Reject sample?"
          description={`Enter a reason for rejecting ${rejecting.name}'s sample. This action is recorded in the audit log.`}
          onClose={() => setRejecting(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRejecting(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (!rejectReason.trim()) return notify("Enter a reason for rejection.", "error")
                  patchPatient(rejecting.id, { sampleStatus: "Rejected" }, "Sample Rejected", rejectReason.trim())
                  setRejecting(null)
                  setRejectReason("")
                  notify("Sample rejected. Reason recorded.", "warning")
                }}
              >
                Reject sample
              </Button>
            </>
          }
        >
          <TextArea
            label="Reason for rejection"
            value={rejectReason}
            onChange={setRejectReason}
            placeholder="e.g. Insufficient sample volume"
            required
          />
        </Modal>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Receive payment form                                                        */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Result entry and verification                                                */
/* -------------------------------------------------------------------------- */

/**
 * Result entry holds its own draft values so the database is only written when
 * the technician saves. This keeps the audit log readable instead of recording
 * one entry per keystroke, and it means an abandoned edit changes nothing.
 */
function ResultEntryPanel({
  mode,
  db,
  patient,
  tests,
  testCode,
  onSelectTest,
  onBack,
  onSaved,
  onSubmitted,
  onReturn,
  onSave,
  onClearTest,
  onFinalize,
}: {
  mode: "edit" | "verify"
  db: LabDatabase
  patient: Patient
  tests: CatalogTest[]
  testCode: string
  onSelectTest: (code: string) => void
  onBack: () => void
  onSaved: () => void
  onSubmitted: () => void
  onReturn: () => void
  onSave: (
    patient: Patient,
    values: Record<string, string>,
    note: string,
    complete: boolean,
  ) => boolean
  onClearTest: (patient: Patient, test: CatalogTest | null) => Record<string, string> | void
  onFinalize: () => void
}) {
  const readOnly = mode === "verify"
  const activeTest = tests.find((t) => t.code === testCode) ?? tests[0] ?? null
  const [values, setValues] = useState<Record<string, string>>(patient.results)
  const [note, setNote] = useState(patient.technicianNote)

  // Re-seed the draft whenever a different record is opened.
  useEffect(() => {
    setValues(patient.results)
    setNote(patient.technicianNote)
  }, [patient.id])

  const draft: Patient = { ...patient, results: values, technicianNote: note }
  const dirty = useMemo(
    () =>
      JSON.stringify({ ...values, __note: note }) !==
      JSON.stringify({ ...patient.results, __note: patient.technicianNote }),
    [values, note, patient.results, patient.technicianNote],
  )
  const progress = resultProgress(draft, db.tests)
  const missing = allMissingParameters(draft, db.tests)

  return (
    <>
      <div className="back-row">
        <button onClick={onBack}>
          <ArrowLeft size={18} /> All results
        </button>
      </div>
      <div className="page-intro result-intro">
        <div>
          <div className="eyebrow">
            {readOnly ? "FINAL REVIEW" : "LAB WORK"} · {patient.reportId}
          </div>
          <h1>{readOnly ? "Verify results" : "Enter test results"}</h1>
          <p>
            {readOnly
              ? "Review every value before finalizing this report."
              : "Enter measured values. Flags appear automatically from your reference ranges."}
          </p>
        </div>
        <div className="intro-actions">
          <Badge>{readOnly ? "Awaiting verification" : `${progress}% complete`}</Badge>
          {dirty && <Badge tone="amber">Unsaved changes</Badge>}
        </div>
      </div>

      <div className="panel patient-strip">
        <span className="avatar">{initials(patient.name)}</span>
        <div>
          <strong>{patient.name}</strong>
          <small>
            {patient.id} · {patient.age} years · {patient.gender}
          </small>
        </div>
        <div className="strip-test">
          <small>TEST</small>
          <strong>
            {activeTest?.code} <span>· {activeTest?.name}</span>
          </strong>
        </div>
      </div>

      {tests.length > 1 && (
        <div className="category-tabs result-tabs">
          {tests.map((test) => (
            <button
              key={test.code}
              className={(activeTest?.code ?? "") === test.code ? "active" : ""}
              onClick={() => onSelectTest(test.code)}
            >
              {test.code}
            </button>
          ))}
        </div>
      )}

      <div className="panel result-panel">
        <SectionHeading
          title={`${activeTest?.name ?? ""} parameters`}
          subtitle="Reference ranges come from your test configuration"
          action={
            <span className="result-legend">
              <span className="legend-dot" /> Auto-flagged results
            </span>
          }
        />
        {activeTest?.parameters.length ? (
          <div className="table-scroll">
            <table className="result-table">
              <thead>
                <tr>
                  <th>PARAMETER</th>
                  <th>RESULT</th>
                  <th>UNIT</th>
                  <th>REFERENCE RANGE</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {requiredParameters(activeTest).map((parameter) => {
                  const value = values[parameter.id] ?? ""
                  return (
                    <tr key={parameter.id}>
                      <td>
                        <strong>{parameter.name}</strong>
                      </td>
                      <td>
                        {readOnly ? (
                          <strong className="result-value">{value || "—"}</strong>
                        ) : (
                          <input
                            aria-label={`${parameter.name} result`}
                            className="result-input"
                            value={value}
                            placeholder="Enter value"
                            onChange={(event) =>
                              setValues((current) => ({
                                ...current,
                                [parameter.id]: event.target.value,
                              }))
                            }
                          />
                        )}
                      </td>
                      <td>{parameter.unit}</td>
                      <td>{parameter.referenceRange}</td>
                      <td>
                        <Badge>{evaluateResult(parameter, value)}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="This test has no parameters"
            detail="Add parameters and reference ranges to this test from Test management."
          />
        )}

        <div className="notes-block">
          <TextArea
            label="Technician notes (optional)"
            value={note}
            onChange={setNote}
            rows={2}
            placeholder="Observations or comments for the verifier"
            disabled={readOnly}
            hint={readOnly ? undefined : "Saved with the results, not on every keystroke."}
          />
        </div>

        {!readOnly && activeTest && (
          <div className="result-tools">
            <Button
              variant="ghost"
              icon={RotateCcw}
              onClick={() => {
                const cleared = onClearTest(patient, activeTest)
                if (cleared) setValues(cleared)
              }}
            >
              Clear {activeTest.code} values
            </Button>
            <span className="result-count">
              {missing.length
                ? `${missing.reduce((sum, entry) => sum + entry.parameters.length, 0)} value(s) still missing`
                : "All required values entered"}
            </span>
          </div>
        )}

        <div className="result-actions">
          {readOnly ? (
            <>
              <Button variant="secondary" icon={ArrowLeft} onClick={onReturn}>
                Return for correction
              </Button>
              <Button icon={ShieldCheck} onClick={onFinalize} disabled={missing.length > 0}>
                Verify &amp; Finalize
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                icon={Check}
                disabled={!dirty}
                onClick={() => {
                  if (!onSave(patient, values, note, false)) return
                  onSaved()
                }}
              >
                Save results
              </Button>
              <Button
                icon={ArrowRight}
                onClick={() => {
                  if (!onSave(patient, values, note, true)) return
                  onSubmitted()
                }}
              >
                Submit for verification
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Patient editing                                                             */
/* -------------------------------------------------------------------------- */

function EditPatientModal({
  patient,
  doctors,
  onClose,
  onSave,
}: {
  patient: Patient
  doctors: Doctor[]
  onClose: () => void
  onSave: (patient: Patient) => void
}) {
  const [draft, setDraft] = useState<Patient>(patient)
  return (
    <Modal
      wide
      title="Edit patient"
      description="Identifiers, ordered tests, results and payments are not changed here."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)}>Save changes</Button>
        </>
      }
    >
      <div className="form-grid">
        <Field
          label="Full name"
          value={draft.name}
          onChange={(v) => setDraft({ ...draft, name: v })}
          required
        />
        <Field
          label="Age (years)"
          value={draft.age}
          onChange={(v) => setDraft({ ...draft, age: v })}
          type="number"
          min={0}
        />
        <Field
          label="Gender"
          value={draft.gender}
          onChange={(v) => setDraft({ ...draft, gender: v })}
          options={["Male", "Female", "Other"]}
        />
        <Field
          label="Blood group"
          value={draft.bloodGroup}
          onChange={(v) => setDraft({ ...draft, bloodGroup: v })}
          options={["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]}
        />
        <Field
          label="Contact number"
          value={draft.phone}
          onChange={(v) => setDraft({ ...draft, phone: v })}
          required
        />
        <Field
          label="National ID"
          value={draft.cnic}
          onChange={(v) => setDraft({ ...draft, cnic: v })}
        />
        <Field
          label="Referred by"
          value={draft.doctorId}
          onChange={(v) => setDraft({ ...draft, doctorId: v })}
          options={[
            "",
            ...doctors.map((d) => `${d.name}${d.specialization ? `, ${d.specialization}` : ""} (${d.id})`),
          ]}
        />
        <div className="full-span">
          <Field
            label="Address"
            value={draft.address}
            onChange={(v) => setDraft({ ...draft, address: v })}
          />
        </div>
        <div className="full-span">
          <TextArea
            label="Notes"
            value={draft.notes}
            onChange={(v) => setDraft({ ...draft, notes: v })}
            rows={2}
          />
        </div>
      </div>
      <div className="info-callout">
        <ShieldCheck size={20} />
        <span>
          {patient.id} · {patient.reportId} · {patient.sampleId}
        </span>
      </div>
    </Modal>
  )
}

function PatientTestsModal({
  patient,
  tests,
  money,
  onClose,
  onSave,
}: {
  patient: Patient
  tests: CatalogTest[]
  money: (amount: number) => string
  onClose: () => void
  onSave: (codes: string[]) => void
}) {
  const [codes, setCodes] = useState<string[]>(patient.testCodes)
  const [query, setQuery] = useState("")
  const removed = patient.testCodes.filter((code) => !codes.includes(code))
  const visible = tests.filter((t) => `${t.name} ${t.code}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <Modal
      wide
      title="Change tests"
      description="Adding or removing a test re-prices this order and clears values that no longer belong to it."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!codes.length} onClick={() => onSave(codes)}>
            Save {codes.length} test{codes.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <SearchField value={query} onChange={setQuery} placeholder="Search the catalog" wide />
      {visible.length ? (
        <div className="test-grid test-grid-modal">
          {visible.map((test) => (
            <button
              key={test.code}
              className={`test-card ${codes.includes(test.code) ? "selected" : ""}`}
              onClick={() =>
                setCodes((current) =>
                  current.includes(test.code)
                    ? current.filter((code) => code !== test.code)
                    : [...current, test.code],
                )
              }
            >
              <span className="test-card-top">
                <span className="test-code">{test.code}</span>
                <span className={`test-add ${codes.includes(test.code) ? "added" : ""}`}>
                  {codes.includes(test.code) ? <Check size={17} /> : <Plus size={17} />}
                </span>
              </span>
              <strong>{test.name}</strong>
              <span className="test-card-bottom">
                <small>{test.sampleType} sample</small>
                <b>{money(test.price)}</b>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty title="No tests match" detail="Try another search." />
      )}
      {removed.length > 0 && (
        <div className="info-callout danger">
          <AlertTriangle size={20} />
          <span>
            Removing {removed.join(", ")} will delete the entered results for{" "}
            {removed.length === 1 ? "that test" : "those tests"} and require the report to be
            re-verified.
          </span>
        </div>
      )}
    </Modal>
  )
}

function BillingAdjustModal({
  patient,
  db,
  money,
  onClose,
  onSave,
  onVoid,
}: {
  patient: Patient
  db: LabDatabase
  money: (amount: number) => string
  onClose: () => void
  onSave: (
    patient: Patient,
    values: { discount: number; paid: number; paymentMethod: string; note: string },
  ) => void
  onVoid: () => void
}) {
  const [discount, setDiscount] = useState(String(patient.discount || ""))
  const [paid, setPaid] = useState(String(patient.paid || ""))
  const [method, setMethod] = useState(patient.paymentMethod || db.paymentSettings.paymentMethods[0] || "Cash")
  const [note, setNote] = useState("")

  const subtotal = subtotalFor(db.tests, patient.testCodes)
  const total = totalFor(
    subtotal,
    db.testSettings.allowDiscount ? Number(discount) || 0 : 0,
    db.testSettings.allowDiscount,
  )
  const paidValue = clampPaid(Number(paid) || 0, total)

  return (
    <Modal
      title="Adjust billing"
      description="Corrects the discount, the amount received and the payment method. Every change is written to the audit log."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {patient.paid > 0 && (
            <Button variant="danger" icon={Trash2} onClick={onVoid}>
              Void payments
            </Button>
          )}
          <Button
            onClick={() =>
              onSave(patient, {
                discount: Number(discount) || 0,
                paid: paidValue,
                paymentMethod: method,
                note,
              })
            }
          >
            Save adjustment
          </Button>
        </>
      }
    >
      <div className="settings-form-grid">
        <Field
          label={`Subtotal (${db.paymentSettings.currencySymbol})`}
          value={String(subtotal)}
          onChange={() => undefined}
          disabled
        />
        <Field
          label={`Discount (${db.paymentSettings.currencySymbol})`}
          value={discount}
          onChange={setDiscount}
          type="number"
          min={0}
          max={subtotal}
          disabled={!db.testSettings.allowDiscount}
          hint={db.testSettings.allowDiscount ? undefined : "Discounts are switched off for this laboratory."}
        />
        <Field
          label={`Total (${db.paymentSettings.currencySymbol})`}
          value={String(total)}
          onChange={() => undefined}
          disabled
        />
        <Field
          label={`Amount received (${db.paymentSettings.currencySymbol})`}
          value={paid}
          onChange={setPaid}
          type="number"
          min={0}
          max={total}
        />
        <Field
          label="Payment method"
          value={method}
          onChange={setMethod}
          options={db.paymentSettings.paymentMethods}
        />
        <Field
          label="Balance after adjustment"
          value={money(Math.max(0, total - paidValue))}
          onChange={() => undefined}
          disabled
        />
        <div className="full-span">
          <TextArea
            label="Reason (optional)"
            value={note}
            onChange={setNote}
            rows={2}
            placeholder="Recorded in the audit log"
          />
        </div>
      </div>
    </Modal>
  )
}

const ReceivePaymentForm = ({
  remaining,
  methods,
  currency,
  onSubmit,
}: {
  remaining: number
  methods: string[]
  currency: string
  onSubmit: (amount: number, method: string) => void
}) => {
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState(methods[0] ?? "Cash")
  return (
    <div className="receive-row">
      <Field
        label={`Receive amount (${currency})`}
        value={amount}
        onChange={setAmount}
        type="number"
        placeholder={`Up to ${remaining}`}
      />
      <Field label="Payment method" value={method} onChange={setMethod} options={methods} />
      <Button icon={CreditCard} onClick={() => onSubmit(Number(amount), method)}>
        Save payment
      </Button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Test editor                                                                 */
/* -------------------------------------------------------------------------- */

const TestEditor = ({
  draft,
  categories,
  sampleTypes,
  defaultTurnaround,
  currencySymbol,
  onClose,
  onSave,
}: {
  draft: Partial<CatalogTest>
  categories: string[]
  sampleTypes: string[]
  defaultTurnaround: number
  currencySymbol: string
  onClose: () => void
  onSave: (draft: Partial<CatalogTest>) => void
}) => {
  const [value, setValue] = useState<Partial<CatalogTest>>(draft)
  const [parameters, setParameters] = useState<TestParameter[]>(draft.parameters ?? [])
  const [editingParameter, setEditingParameter] = useState<TestParameter | null>(null)
  const isNew = !draft.id

  const upsertParameter = (parameter: TestParameter) => {
    setParameters((current) => {
      const exists = current.some((p) => p.id === parameter.id)
      return exists
        ? current.map((p) => (p.id === parameter.id ? parameter : p))
        : [...current, parameter]
    })
    setEditingParameter(null)
  }

  return (
    <Modal
      wide
      title={isNew ? "Add test" : `Edit ${draft.name}`}
      description="Tests, parameters, reference ranges and prices belong to this laboratory."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave({ ...value, parameters })}>Save test</Button>
        </>
      }
    >
      <div className="settings-form-grid">
        <Field
          label="Test name"
          value={value.name ?? ""}
          onChange={(v) => setValue({ ...value, name: v })}
          required
        />
        <Field
          label="Test code"
          value={value.code ?? ""}
          onChange={(v) => setValue({ ...value, code: v.toUpperCase() })}
          required
        />
        <Field
          label="Category"
          value={value.category ?? ""}
          onChange={(v) => setValue({ ...value, category: v })}
          options={categories}
        />
        <Field
          label={`Price (${currencySymbol})`}
          value={String(value.price ?? "")}
          onChange={(v) => setValue({ ...value, price: Number(v) || 0 })}
          type="number"
          min={0}
        />
        <Field
          label="Sample type"
          value={value.sampleType ?? ""}
          onChange={(v) => setValue({ ...value, sampleType: v })}
          options={sampleTypes}
        />
        <Field
          label="Container"
          value={value.container ?? ""}
          onChange={(v) => setValue({ ...value, container: v })}
        />
        <Field
          label="Method"
          value={value.method ?? ""}
          onChange={(v) => setValue({ ...value, method: v })}
          placeholder="e.g. Automated analyser"
        />
        <Field
          label="Turnaround (hours)"
          value={String(value.turnaroundHours ?? defaultTurnaround)}
          onChange={(v) => setValue({ ...value, turnaroundHours: Number(v) || defaultTurnaround })}
          type="number"
          min={1}
        />
      </div>

      <div className="parameter-editor">
        <SectionHeading
          title="Parameters"
          subtitle="Reference ranges and critical values drive automatic flagging on reports."
          action={
            <Button
              variant="secondary"
              onClick={() =>
                setEditingParameter({
                  id: createId("prm"),
                  name: "",
                  unit: "",
                  referenceRange: "",
                  low: null,
                  high: null,
                  criticalLow: null,
                  criticalHigh: null,
                  displayOrder: parameters.length,
                  active: true,
                })
              }
            >
              Add parameter
            </Button>
          }
        />
        {parameters.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>PARAMETER</th>
                  <th>UNIT</th>
                  <th>RANGE</th>
                  <th>LOW</th>
                  <th>HIGH</th>
                  <th>CRITICAL LOW</th>
                  <th>CRITICAL HIGH</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {parameters.map((parameter) => (
                  <tr key={parameter.id}>
                    <td>
                      <strong>{parameter.name}</strong>
                    </td>
                    <td>{parameter.unit || "—"}</td>
                    <td>{parameter.referenceRange || "—"}</td>
                    <td>{parameter.low ?? "—"}</td>
                    <td>{parameter.high ?? "—"}</td>
                    <td>{parameter.criticalLow ?? "—"}</td>
                    <td>{parameter.criticalHigh ?? "—"}</td>
                    <td className="table-action-cell">
                      <button className="table-text-action" onClick={() => setEditingParameter(parameter)}>
                        Edit
                      </button>
                      <button
                        className="table-text-action danger"
                        onClick={() => setParameters(parameters.filter((p) => p.id !== parameter.id))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="setup-empty-note">
            No parameters yet. A test without parameters still works, it simply
            has no result rows.
          </p>
        )}
      </div>

      {editingParameter && (
        <div className="parameter-editor-nested">
          <SectionHeading
            title={editingParameter.name || "New parameter"}
            subtitle="Leave the numeric bounds blank for a qualitative test."
            action={
              <Button variant="ghost" onClick={() => setEditingParameter(null)}>
                Close
              </Button>
            }
          />
          <div className="settings-form-grid">
            <Field
              label="Parameter name"
              value={editingParameter.name}
              onChange={(v) => setEditingParameter({ ...editingParameter, name: v })}
              required
            />
            <Field
              label="Unit"
              value={editingParameter.unit}
              onChange={(v) => setEditingParameter({ ...editingParameter, unit: v })}
            />
            <Field
              label="Reference range (display text)"
              value={editingParameter.referenceRange}
              onChange={(v) => setEditingParameter({ ...editingParameter, referenceRange: v })}
            />
            <Field
              label="Low bound"
              value={editingParameter.low === null ? "" : String(editingParameter.low)}
              onChange={(v) => setEditingParameter({ ...editingParameter, low: toNumberOrNull(v) })}
              type="number"
            />
            <Field
              label="High bound"
              value={editingParameter.high === null ? "" : String(editingParameter.high)}
              onChange={(v) => setEditingParameter({ ...editingParameter, high: toNumberOrNull(v) })}
              type="number"
            />
            <Field
              label="Critical low"
              value={editingParameter.criticalLow === null ? "" : String(editingParameter.criticalLow)}
              onChange={(v) => setEditingParameter({ ...editingParameter, criticalLow: toNumberOrNull(v) })}
              type="number"
            />
            <Field
              label="Critical high"
              value={editingParameter.criticalHigh === null ? "" : String(editingParameter.criticalHigh)}
              onChange={(v) => setEditingParameter({ ...editingParameter, criticalHigh: toNumberOrNull(v) })}
              type="number"
            />
          </div>
          <Button onClick={() => editingParameter.name && upsertParameter(editingParameter)}>
            Save parameter
          </Button>
        </div>
      )}
    </Modal>
  )
}

const toNumberOrNull = (value: string): number | null => {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/* -------------------------------------------------------------------------- */
/* Analytics                                                                   */
/* -------------------------------------------------------------------------- */

const AnalyticsPage = ({
  db,
  money,
  totals,
}: {
  db: LabDatabase
  money: (amount: number) => string
  totals: { collected: number; outstanding: number; totalTests: number; pendingResults: number; readyReports: number }
}) => {
  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const patient of db.patients) {
      for (const code of patient.testCodes) counts.set(code, (counts.get(code) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([code, count]) => ({
        code,
        count,
        name: db.tests.find((t) => t.code === code)?.name ?? code,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [db.patients, db.tests])

  const peak = Math.max(1, ...usage.map((entry) => entry.count))
  const flagged = db.patients.reduce(
    (sum, patient) =>
      sum +
      patient.testCodes.reduce((inner, code) => {
        const test = db.tests.find((t) => t.code === code)
        return (
          inner +
          (test?.parameters ?? []).filter((parameter) => {
            const flag = evaluateResult(parameter, patient.results[parameter.id] ?? "")
            return flag === "High" || flag === "Low" || flag === "Critical"
          }).length
        )
      }, 0),
    0,
  )

  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">LABORATORY INSIGHTS</div>
          <h1>Reports &amp; analytics</h1>
          <p>How {db.profile.name || "your laboratory"} is doing, from your own records.</p>
        </div>
        <span className="date-pill">
          <CalendarDays size={17} /> {formatDate(new Date().toISOString())}
        </span>
      </div>
      <div className="analytics-metrics">
        <div className="metric">
          <span>Patients</span>
          <strong>{db.patients.length}</strong>
          <small>All records</small>
        </div>
        <div className="metric">
          <span>Tests ordered</span>
          <strong>{totals.totalTests}</strong>
          <small>Across {db.tests.length} catalog tests</small>
        </div>
        <div className="metric">
          <span>Collected</span>
          <strong>{money(totals.collected)}</strong>
          <small>All recorded payments</small>
        </div>
        <div className="metric">
          <span>Flagged results</span>
          <strong>{flagged}</strong>
          <small>Outside a reference range</small>
        </div>
      </div>
      <div className="analytics-panels">
        <div className="panel chart-panel">
          <SectionHeading title="Most requested tests" subtitle="From your patient records" />
          {usage.length ? (
            <div className="popular-list">
              {usage.map((entry) => (
                <div key={entry.code}>
                  <span>
                    <strong>{entry.name}</strong>
                    <small>{entry.count} orders</small>
                  </span>
                  <div className="progress-track">
                    <span style={{ width: `${Math.round((entry.count / peak) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No test usage yet" detail="Register patients to see which tests are requested." />
          )}
        </div>
        <div className="panel chart-panel">
          <SectionHeading title="Report status" subtitle="Where your work stands" />
          <div className="popular-list">
            {[
              ["Ready for collection", totals.readyReports, "green"],
              ["Awaiting verification", totals.pendingResults, "amber"],
              ["Doctors in directory", db.doctors.length, "blue"],
              ["Staff accounts", db.users.length, "blue"],
            ].map(([label, value, tone]) => (
              <div key={label as string}>
                <span>
                  <strong>{label as string}</strong>
                </span>
                <Badge tone={tone as string}>{String(value)}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

const emptyPatient: Omit<Patient, "id" | "reportId" | "sampleId"> = {
  name: "",
  age: "",
  gender: "",
  phone: "",
  cnic: "",
  bloodGroup: "",
  address: "",
  notes: "",
  doctorId: "",
  doctorName: "Walk-in",
  testCodes: [],
  sampleType: "Blood",
  discount: 0,
  total: 0,
  paid: 0,
  paymentMethod: "Cash",
  reportStatus: "Pending",
  sampleStatus: "Pending",
  results: {},
  technicianNote: "",
  collectedAt: "",
  createdAt: "",
  updatedAt: "",
}

export type { ReportStatus, SampleStatus, StaffRole }
