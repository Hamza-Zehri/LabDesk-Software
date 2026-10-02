/**
 * Application state for one installation.
 *
 * The provider owns the whole `LabDatabase` document, persists it through the
 * storage adapter, and exposes the actions the screens need. Every screen reads
 * the laboratory's identity, branding and configuration from here, so no screen
 * can hard-code a laboratory name.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  ACTIVE_INSTALLATION_KEY,
  KINDS,
  createEmptyDatabase,
  createInstallation,
  now,
  storageKey,
} from "../core/defaults"
import {
  ensureInstallations,
  migrateDatabase,
  readDatabase,
  replaceInstallation,
  writeDatabase,
  writeSnapshot,
} from "../core/database"
import { initializeLicenseState, refreshLicenseFromCloud } from "../core/licenseService"
import { parseBackup, serializeBackup } from "../core/backup"
import { formatMoney } from "../core/format"
import { checkPassword, hashPassword, verifyPassword } from "../core/password"
import { nextRecordNumbers } from "../core/sequence"
import { pruneResults, subtotalFor, totalFor } from "../core/records"
import { resolveStorage, type StorageAdapter } from "../core/storage"
import type {
  AuditEntry,
  CatalogTest,
  Doctor,
  LabDatabase,
  Patient,
  Session,
  StaffUser,
} from "../core/types"

const SESSION_KEY = "labdesk:session"

/**
 * How often an open installation re-confirms its licence with the cloud, so a
 * vendor deactivating a customer takes effect without a restart.
 */
const LIVE_LICENSE_CHECK_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

export type LabStatus = "loading" | "setup" | "signed-out" | "ready"

export type SetupPayload = {
  profile: Partial<LabDatabase["profile"]>
  branding: Partial<LabDatabase["branding"]>
  reportSettings: Partial<LabDatabase["reportSettings"]>
  receiptSettings: Partial<LabDatabase["receiptSettings"]>
  administrator: { name: string; username: string; password: string }
  tests: CatalogTest[]
}

export type LabContextValue = {
  status: LabStatus
  db: LabDatabase
  storage: StorageAdapter
  session: Session | null
  /** Formats an amount in this laboratory's currency. */
  money: (amount: number) => string
  /** Replaces the whole document with a mutated copy. */
  update: (mutator: (draft: LabDatabase) => void) => void
  /** Merges a partial into a top-level configuration section. */
  patchSection: <K extends keyof LabDatabase>(key: K, partial: Partial<LabDatabase[K]>) => void
  signIn: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  signOut: () => void
  changePassword: (userId: string, current: string, next: string) => Promise<{ ok: boolean; error?: string }>
  /** Confirms a password for destructive actions such as factory reset. */
  confirmPassword: (userId: string, password: string) => Promise<{ ok: boolean; error?: string }>
  completeSetup: (payload: SetupPayload) => Promise<{ ok: boolean; error?: string }>
  addUser: (values: Omit<StaffUser, "id" | "createdAt" | "passwordHash" | "passwordSalt" | "lastLoginAt"> & { password: string }) => Promise<{ ok: boolean; error?: string }>
  saveUser: (user: StaffUser) => void
  /** Edits a staff member's name, username or role with uniqueness checks. */
  updateUser: (
    userId: string,
    changes: { name?: string; username?: string; role?: StaffUser["role"] },
  ) => { ok: boolean; error?: string }
  removeUser: (userId: string) => void
  saveDoctor: (doctor: Doctor) => void
  removeDoctor: (doctorId: string) => void
  saveTest: (test: CatalogTest) => void
  removeTest: (code: string) => void
  addAudit: (action: string, record: string, detail?: string) => void
  /** Empties the audit history. Administrator only, recorded in the log itself. */
  clearAudit: () => { ok: boolean; error?: string }
  /** Inserts a new patient or replaces an existing one, keeping ids stable. */
  savePatient: (patient: Patient) => void
  /** Deletes a patient record entirely. Used by the administrator only. */
  removePatient: (patientId: string) => void
  allocateRecordNumbers: () => { patientId: string; reportId: string; sampleId: string }
  exportBackup: () => string
  applyBackup: (contents: string) => { ok: boolean; error?: string }
  factoryReset: (backupFirst: boolean) => Promise<{ ok: boolean; error?: string; backupFile?: string }>
  persistNow: () => boolean
}

const LabContext = createContext<LabContextValue | null>(null)

const readStoredSession = (): string | null => {
  try {
    return globalThis.sessionStorage?.getItem(SESSION_KEY) ?? null
  } catch {
    return null
  }
}

const writeStoredSession = (userId: string | null) => {
  try {
    if (userId) globalThis.sessionStorage?.setItem(SESSION_KEY, userId)
    else globalThis.sessionStorage?.removeItem(SESSION_KEY)
  } catch {
    /* session persistence is a convenience, never a requirement */
  }
}

export function LabProvider({ children }: { children: ReactNode }) {
  const storage = useMemo(() => resolveStorage(), [])
  const [db, setDb] = useState<LabDatabase>(() => createEmptyDatabase())
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<LabStatus>("loading")
  const installations = useRef<{ productionId: string }>({ productionId: "" })

  /* Boot: resolve the installation, load its document, restore the session. */
  useEffect(() => {
    const ids = ensureInstallations(storage)
    installations.current = ids
    const loaded = readDatabase(storage, ids.productionId)
    setDb(loaded)

    // Trigger async background commercial license verification / heartbeat
    initializeLicenseState(loaded)
      .then((evaluatedLicense) => {
        setDb((current) => {
          if (JSON.stringify(current.license) !== JSON.stringify(evaluatedLicense)) {
            const updated = { ...current, license: evaluatedLicense }
            writeDatabase(storage, updated)
            return updated
          }
          return current
        })
      })
      .catch(() => {
        /* Graceful offline handling */
      })

    const storedUserId = readStoredSession()
    const restored = storedUserId ? loaded.users.find((u) => u.id === storedUserId) : undefined
    if (loaded.setupCompleted && restored && restored.status === "Active") {
      setSession({
        userId: restored.id,
        name: restored.name,
        username: restored.username,
        role: restored.role,
        signedInAt: now(),
      })
      setStatus("ready")
    } else {
      setStatus(loaded.setupCompleted ? "signed-out" : "setup")
    }
  }, [storage])

  /*
   * Keep checking the cloud while the application is open.
   *
   * The licence used to be verified only at boot, so a vendor deactivating a
   * customer had no effect until that customer happened to restart LabDesk.
   * The portal promises the software locks on the next check, so the check now
   * happens periodically and whenever the window regains focus. The 24-hour
   * throttle inside `initializeLicenseState` is deliberately bypassed here.
   */
  useEffect(() => {
    if (status !== "ready") return

    let cancelled = false

    const verify = async () => {
      try {
        const current = readDatabase(storage, installations.current.productionId)
        if (!current.license?.licenseId || current.license.status === "NOT_ACTIVATED") return

        const result = await refreshLicenseFromCloud(current)
        if (cancelled) return

        setDb((previous) => {
          const changed = JSON.stringify(previous.license) !== JSON.stringify(result.license)
          if (!changed) return previous
          const updated = { ...previous, license: result.license }
          writeDatabase(storage, updated)
          return updated
        })
      } catch {
        /* Offline: the grace period in the licence service covers it. */
      }
    }

    const timer = window.setInterval(verify, LIVE_LICENSE_CHECK_INTERVAL_MS)
    window.addEventListener("focus", verify)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener("focus", verify)
    }
  }, [storage, status])

  /* Persist on every change. */
  const persist = useCallback(
    (document: LabDatabase) => {
      const result = writeDatabase(storage, document)
      if (!result.ok && document.backupSettings.autoSnapshot) {
        // Keep the in-memory snapshot current so a later export is complete.
        writeSnapshot(storage, document)
      }
    },
    [storage],
  )

  const update = useCallback(
    (mutator: (draft: LabDatabase) => void) => {
      setDb((current) => {
        const draft = structuredClone(current) as LabDatabase
        draft.updatedAt = now()
        draft.installation = { ...draft.installation, lastOpenedAt: now() }
        mutator(draft)
        persist(draft)
        return draft
      })
    },
    [persist],
  )

  const patchSection = useCallback<LabContextValue["patchSection"]>(
    (key, partial) => {
      update((draft) => {
        const base = draft[key]
        if (base && typeof base === "object" && !Array.isArray(base)) {
          ;(draft[key] as object) = { ...base, ...partial }
        } else {
          ;(draft[key] as unknown) = partial
        }
      })
    },
    [update],
  )

  const addAudit = useCallback(
    (action: string, record: string, detail = "") => {
      update((draft) => {
        const entry: AuditEntry = {
          id: `aud_${Math.random().toString(36).slice(2, 12)}`,
          time: now(),
          userId: session?.userId ?? "",
          userName: session?.name ?? "Unknown user",
          action,
          record,
          detail: detail || "Action completed successfully",
        }
        draft.audit = [entry, ...draft.audit].slice(0, 500)
      })
    },
    [session, update],
  )

  /* ---------------------------------------------------------------------- */
  /* Authentication                                                           */
  /* ---------------------------------------------------------------------- */

  const signIn = useCallback<LabContextValue["signIn"]>(
    async (username, password) => {
      const account = db.users.find(
        (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
      )
      if (!account) {
        if (db.securitySettings.logFailedLogins) {
          addAudit("Sign-in Failed", username.trim(), "Unknown username")
        }
        return { ok: false, error: "That username or password is not correct." }
      }
      if (account.status !== "Active") {
        return { ok: false, error: "This account has been disabled. Contact your administrator." }
      }
      const matches = await verifyPassword(password, {
        hash: account.passwordHash,
        salt: account.passwordSalt,
      })
      if (!matches) {
        if (db.securitySettings.logFailedLogins) {
          addAudit("Sign-in Failed", account.username, "Incorrect password")
        }
        return { ok: false, error: "That username or password is not correct." }
      }
      const signedIn: Session = {
        userId: account.id,
        name: account.name,
        username: account.username,
        role: account.role,
        signedInAt: now(),
      }
      update((draft) => {
        draft.users = draft.users.map((u) =>
          u.id === account.id ? { ...u, lastLoginAt: now() } : u,
        )
      })
      setSession(signedIn)
      writeStoredSession(account.id)
      setStatus("ready")
      return { ok: true }
    },
    [addAudit, db.securitySettings.logFailedLogins, db.users, update],
  )

  const signOut = useCallback(() => {
    setSession(null)
    writeStoredSession(null)
    setStatus(db.setupCompleted ? "signed-out" : "setup")
  }, [db.setupCompleted])

  const changePassword = useCallback<LabContextValue["changePassword"]>(
    async (userId, current, next) => {
      const account = db.users.find((u) => u.id === userId)
      if (!account) return { ok: false, error: "Account not found." }
      const matches = await verifyPassword(current, {
        hash: account.passwordHash,
        salt: account.passwordSalt,
      })
      if (!matches) return { ok: false, error: "Your current password is not correct." }
      const policy = checkPassword(next, db.securitySettings)
      if (!policy.ok) return { ok: false, error: policy.problems.join(" ") }
      const digest = await hashPassword(next)
      update((draft) => {
        draft.users = draft.users.map((u) =>
          u.id === userId
            ? { ...u, passwordHash: digest.hash, passwordSalt: digest.salt, mustChangePassword: false }
            : u,
        )
      })
      return { ok: true }
    },
    [db.securitySettings, db.users, update],
  )

  const confirmPassword = useCallback<LabContextValue["confirmPassword"]>(
    async (userId, password) => {
      const account = db.users.find((u) => u.id === userId)
      if (!account) return { ok: false, error: "Account not found." }
      const matches = await verifyPassword(password, {
        hash: account.passwordHash,
        salt: account.passwordSalt,
      })
      if (!matches) return { ok: false, error: "That password is not correct." }
      return { ok: true }
    },
    [db.users],
  )

  /* ---------------------------------------------------------------------- */
  /* Setup                                                                    */
  /* ---------------------------------------------------------------------- */

  const completeSetup = useCallback<LabContextValue["completeSetup"]>(
    async (payload) => {
      const digest = await hashPassword(payload.administrator.password)
      const administrator: StaffUser = {
        id: `usr_${Math.random().toString(36).slice(2, 12)}`,
        name: payload.administrator.name.trim(),
        username: payload.administrator.username.trim().toLowerCase(),
        role: "Administrator",
        status: "Active",
        passwordHash: digest.hash,
        passwordSalt: digest.salt,
        mustChangePassword: false,
        createdAt: now(),
        lastLoginAt: now(),
      }
      update((draft) => {
        draft.profile = {
          ...draft.profile,
          ...payload.profile,
          name: payload.profile.name?.trim() ?? "",
          updatedAt: now(),
        }
        draft.branding = { ...draft.branding, ...payload.branding }
        draft.reportSettings = { ...draft.reportSettings, ...payload.reportSettings }
        draft.receiptSettings = { ...draft.receiptSettings, ...payload.receiptSettings }
        draft.users = [administrator]
        draft.tests = payload.tests
        draft.setupCompleted = true
        draft.audit = [
          {
            id: `aud_${Math.random().toString(36).slice(2, 12)}`,
            time: now(),
            userId: administrator.id,
            userName: administrator.name,
            action: "Setup Completed",
            record: draft.installation.code,
            detail: "First-run setup completed",
          },
        ]
      })
      setSession({
        userId: administrator.id,
        name: administrator.name,
        username: administrator.username,
        role: administrator.role,
        signedInAt: now(),
      })
      writeStoredSession(administrator.id)
      setStatus("ready")
      return { ok: true }
    },
    [update],
  )

  /* ---------------------------------------------------------------------- */
  /* Staff, doctors, tests                                                    */
  /* ---------------------------------------------------------------------- */

  const addUser = useCallback<LabContextValue["addUser"]>(
    async (values) => {
      const username = values.username.trim().toLowerCase()
      if (db.users.some((u) => u.username.toLowerCase() === username)) {
        return { ok: false, error: "That username is already taken." }
      }
      const policy = checkPassword(values.password, db.securitySettings)
      if (!policy.ok) return { ok: false, error: policy.problems.join(" ") }
      const digest = await hashPassword(values.password)
      update((draft) => {
        draft.users = [
          ...draft.users,
          {
            id: `usr_${Math.random().toString(36).slice(2, 12)}`,
            name: values.name.trim(),
            username,
            role: values.role,
            status: "Active",
            passwordHash: digest.hash,
            passwordSalt: digest.salt,
            mustChangePassword: true,
            createdAt: now(),
            lastLoginAt: "",
          },
        ]
      })
      return { ok: true }
    },
    [db.securitySettings, db.users, update],
  )

  const saveUser = useCallback<LabContextValue["saveUser"]>(
    (user) => {
      update((draft) => {
        draft.users = draft.users.map((u) => (u.id === user.id ? user : u))
      })
    },
    [update],
  )

  const updateUser = useCallback<LabContextValue["updateUser"]>(
    (userId, changes) => {
      const existing = db.users.find((u) => u.id === userId)
      if (!existing) return { ok: false, error: "Account not found." }
      const name = (changes.name ?? existing.name).trim()
      if (!name) return { ok: false, error: "Enter a name for this staff member." }
      const username = (changes.username ?? existing.username).trim().toLowerCase()
      if (!username) return { ok: false, error: "Enter a username." }
      if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
        return {
          ok: false,
          error: "Use 3 to 32 characters: letters, numbers, dot, underscore or hyphen.",
        }
      }
      if (db.users.some((u) => u.id !== userId && u.username.toLowerCase() === username)) {
        return { ok: false, error: "That username is already taken." }
      }
      const role = changes.role ?? existing.role
      if (role !== "Administrator" && existing.role === "Administrator") {
        const otherAdmins = db.users.filter(
          (u) => u.id !== userId && u.role === "Administrator" && u.status === "Active",
        ).length
        if (otherAdmins === 0) {
          return { ok: false, error: "This is the last active administrator." }
        }
      }
      update((draft) => {
        draft.users = draft.users.map((u) =>
          u.id === userId ? { ...u, name, username, role } : u,
        )
      })
      return { ok: true }
    },
    [db.users, update],
  )

  const removeUser = useCallback<LabContextValue["removeUser"]>(
    (userId) => {
      const target = db.users.find((u) => u.id === userId)
      if (!target) return
      if (target.role === "Administrator") {
        const otherAdmins = db.users.filter(
          (u) => u.id !== userId && u.role === "Administrator" && u.status === "Active",
        ).length
        if (otherAdmins === 0) return
      }
      update((draft) => {
        draft.users = draft.users.filter((u) => u.id !== userId)
      })
    },
    [db.users, update],
  )

  const saveDoctor = useCallback<LabContextValue["saveDoctor"]>(
    (doctor) => {
      update((draft) => {
        const exists = draft.doctors.some((d) => d.id === doctor.id)
        draft.doctors = exists
          ? draft.doctors.map((d) => (d.id === doctor.id ? doctor : d))
          : [...draft.doctors, doctor]
      })
    },
    [update],
  )

  const removeDoctor = useCallback<LabContextValue["removeDoctor"]>(
    (doctorId) => {
      update((draft) => {
        draft.doctors = draft.doctors.filter((d) => d.id !== doctorId)
        draft.patients = draft.patients.map((p) =>
          p.doctorId === doctorId ? { ...p, doctorId: "" } : p,
        )
      })
    },
    [update],
  )

  const saveTest = useCallback<LabContextValue["saveTest"]>(
    (catalogTest) => {
      update((draft) => {
        const exists = draft.tests.some((t) => t.id === catalogTest.id || t.code === catalogTest.code)
        draft.tests = exists
          ? draft.tests.map((t) =>
              t.id === catalogTest.id || t.code === catalogTest.code ? catalogTest : t,
            )
          : [...draft.tests, catalogTest]
        draft.tests.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
      })
    },
    [update],
  )

  const removeTest = useCallback<LabContextValue["removeTest"]>(
    (code) => {
      update((draft) => {
        draft.tests = draft.tests.filter((t) => t.code !== code)
        // Removing a catalog entry must not leave open orders pointing at a code
        // that no longer resolves: the patient would keep paying for it and
        // their results would be unreachable. Finalized reports are left alone so
        // an issued document always matches what the patient was given, and a
        // patient whose only remaining test would be emptied is left intact for
        // the same reason.
        draft.patients = draft.patients.map((p) => {
          if (p.reportStatus === "Ready" || !p.testCodes.includes(code)) return p
          const remaining = p.testCodes.filter((c) => c !== code)
          if (remaining.length === 0 || remaining.length === p.testCodes.length) return p
          const subtotal = subtotalFor(draft.tests, remaining)
          const discount = draft.testSettings.allowDiscount ? Math.max(0, p.discount) : 0
          return {
            ...p,
            testCodes: remaining,
            results: pruneResults(p.results, draft.tests, remaining),
            discount,
            total: totalFor(subtotal, discount, draft.testSettings.allowDiscount),
            updatedAt: now(),
          }
        })
      })
    },
    [update],
  )

  const clearAudit = useCallback<LabContextValue["clearAudit"]>(() => {
    // The UI hides this action from non-administrators, but the guard belongs in
    // the data layer too: the audit trail is the record of who did what, and
    // deleting it must not depend on a button being rendered.
    if (session?.role !== "Administrator") {
      return { ok: false, error: "Only an administrator can clear the audit log." }
    }
    update((draft) => {
      draft.audit = [
        {
          id: `aud_${Math.random().toString(36).slice(2, 12)}`,
          time: now(),
          userId: session?.userId ?? "",
          userName: session?.name ?? "Unknown user",
          action: "Audit Log Cleared",
          record: draft.installation.code,
          detail: `Previous ${draft.audit.length} entries were deleted by an administrator`,
        },
      ]
    })
    return { ok: true }
  }, [session, update])

  /* ---------------------------------------------------------------------- */
  /* Patients                                                                 */
  /* ---------------------------------------------------------------------- */

  const savePatient = useCallback<LabContextValue["savePatient"]>(
    (patient) => {
      update((draft) => {
        const exists = draft.patients.some((p) => p.id === patient.id)
        draft.patients = exists
          ? draft.patients.map((p) => (p.id === patient.id ? patient : p))
          : [patient, ...draft.patients]
      })
    },
    [update],
  )

  const removePatient = useCallback<LabContextValue["removePatient"]>(
    (patientId) => {
      update((draft) => {
        draft.patients = draft.patients.filter((p) => p.id !== patientId)
      })
    },
    [update],
  )

  const allocateRecordNumbers = useCallback(
    () => nextRecordNumbers(db.profile, db.patients),
    [db.profile, db.patients],
  )

  /* ---------------------------------------------------------------------- */
  /* Backup, restore, reset                                                   */
  /* ---------------------------------------------------------------------- */

  const exportBackup = useCallback(() => serializeBackup(db), [db])

  const applyBackup = useCallback<LabContextValue["applyBackup"]>(
    (contents) => {
      const parsed = parseBackup(contents)
      if (!parsed.ok) return parsed
      const replaced = replaceInstallation(storage, parsed.database)
      installations.current = ensureInstallations(storage)
      setDb(replaced)
      setSession(null)
      writeStoredSession(null)
      setStatus(replaced.setupCompleted ? "signed-out" : "setup")
      return { ok: true }
    },
    [storage],
  )

  /**
   * Erases this installation. The caller is responsible for having exported a
   * backup first; this function also removes the recorded pointer so the device
   * forgets the old installation completely.
   */
  const factoryReset = useCallback<LabContextValue["factoryReset"]>(
    async (backupFirst) => {
      try {
        const ids = ensureInstallations(storage)
        const existing = readDatabase(storage, ids.productionId)
        const backupFile = backupFirst ? serializeBackup(existing) : null
        for (const kind of Object.values(KINDS)) {
          storage.removeItem(storageKey(ids.productionId, kind))
        }
        storage.removeItem(ACTIVE_INSTALLATION_KEY)

        const freshInstallations = ensureInstallations(storage)
        const fresh = createEmptyDatabase({
          ...createInstallation("production"),
          id: freshInstallations.productionId,
        })
        writeDatabase(storage, fresh)
        setDb(fresh)
        setSession(null)
        writeStoredSession(null)
        setStatus("setup")
        return {
          ok: true,
          backupFile: backupFile ?? undefined,
        }
      } catch (error) {
        return { ok: false, error: (error as Error).message }
      }
    },
    [storage],
  )

  const persistNow = useCallback(() => writeDatabase(storage, db).ok, [db, storage])

  const value: LabContextValue = {
    status,
    db,
    storage,
    session,
    money: (amount: number) => formatMoney(amount, db.paymentSettings),
    update,
    patchSection,
    signIn,
    signOut,
    changePassword,
    confirmPassword,
    completeSetup,
    addUser,
    saveUser,
    updateUser,
    removeUser,
    saveDoctor,
    removeDoctor,
    saveTest,
    removeTest,
    addAudit,
    clearAudit,
    savePatient,
    removePatient,
    allocateRecordNumbers,
    exportBackup,
    applyBackup,
    factoryReset,
    persistNow,
  }

  return <LabContext.Provider value={value}>{children}</LabContext.Provider>
}

export function useLab(): LabContextValue {
  const value = useContext(LabContext)
  if (!value) throw new Error("useLab must be used inside <LabProvider>")
  return value
}

/** Re-exported so screens do not need to reach into the core module directly. */
export { migrateDatabase, storageKey }
