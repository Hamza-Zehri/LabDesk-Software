/**
 * CRUD verification at the data layer.
 *
 * These exercise the provider's real actions against a real storage adapter in
 * a jsdom document, so the create / read / update / delete guarantees are
 * verified rather than assumed. Only the provider is mounted; no UI is needed.
 */

import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { LabProvider, useLab, type LabContextValue } from "./LabProvider"
import { ACTIVE_INSTALLATION_KEY, createEmptyDatabase, createInstallation, storageKey } from "../core/defaults"
import { writeDatabase } from "../core/database"
import { createBrowserStorage } from "../core/storage"
import { catalogTest, configuredDatabase, patient, staffUser } from "../core/testFixtures"
import type { CatalogTest, Doctor, LabDatabase, StaffUser } from "../core/types"

const INSTALLATION_ID = "inst-crud"

/** The provider's own result shapes, so the assertions cannot drift from it. */
type LabResult = { ok: boolean; error?: string }
type ResetResult = { ok: boolean; error?: string; backupFile?: string }

let api: LabContextValue

const Probe = () => {
  api = useLab()
  return <div data-testid="ready">{api.status}</div>
}

/** Installs a document at a known installation id, then mounts the provider. */
const mountWith = (document: LabDatabase) => {
  const storage = createBrowserStorage()
  writeDatabase(storage, {
    ...document,
    installation: { ...document.installation, id: INSTALLATION_ID, mode: "production" },
  })
  localStorage.setItem(ACTIVE_INSTALLATION_KEY, INSTALLATION_ID)
  return render(
    <LabProvider>
      <Probe />
    </LabProvider>,
  )
}

/** Mounts and waits until the provider has finished its boot effect. */
const mountReady = async (document: LabDatabase) => {
  mountWith(document)
  await waitFor(() => expect(api.status).not.toBe("loading"))
  return api
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  api = undefined as never
})

afterEach(() => {
  cleanup()
})

describe("patient CRUD", () => {
  it("creates a patient", async () => {
    await mountReady(configuredDatabase())
    await act(async () => {
      api.savePatient(patient({ id: "NSD-0001", name: "New Patient" }))
    })
    expect(api.db.patients).toHaveLength(1)
    expect(api.db.patients[0].name).toBe("New Patient")
  })

  it("reads the created patient back", async () => {
    await mountReady(configuredDatabase())
    await act(async () => {
      api.savePatient(patient({ id: "NSD-0001", name: "Findable" }))
    })
    const found = api.db.patients.find((p) => p.id === "NSD-0001")
    expect(found?.name).toBe("Findable")
  })

  it("updates a patient in place without duplicating it", async () => {
    await mountReady(configuredDatabase({ patients: [patient({ id: "NSD-0001", name: "Before" })] }))
    await act(async () => {
      api.savePatient({ ...api.db.patients[0], name: "After" })
    })
    expect(api.db.patients).toHaveLength(1)
    expect(api.db.patients[0].name).toBe("After")
  })

  it("deletes a patient", async () => {
    await mountReady(configuredDatabase({ patients: [patient({ id: "NSD-0001" })] }))
    await act(async () => {
      api.removePatient("NSD-0001")
    })
    expect(api.db.patients).toHaveLength(0)
  })

  it("leaves other patients alone when one is deleted", async () => {
    await mountReady(
      configuredDatabase({
        patients: [patient({ id: "NSD-0001" }), patient({ id: "NSD-0002" })],
      }),
    )
    await act(async () => {
      api.removePatient("NSD-0001")
    })
    expect(api.db.patients.map((p) => p.id)).toEqual(["NSD-0002"])
  })

  it("persists a change to storage", async () => {
    await mountReady(configuredDatabase())
    await act(async () => {
      api.savePatient(patient({ id: "NSD-0001", name: "Durable" }))
    })
    await waitFor(() => {
      const raw = localStorage.getItem(storageKey(INSTALLATION_ID, "database"))
      expect(raw).toBeTruthy()
      expect(JSON.parse(raw!).patients[0].name).toBe("Durable")
    })
  })

  it("allocates the next record numbers without colliding", async () => {
    await mountReady(configuredDatabase({ patients: [patient({ id: "NSD-0001", reportId: "NDR-0001" })] }))
    const numbers = api.allocateRecordNumbers()
    expect(numbers.patientId).toBe("NSD-0002")
    expect(numbers.reportId).toBe("NDR-0002")
  })
})

describe("doctor CRUD", () => {
  const doctor = (id: string, name: string): Doctor => ({
    id,
    name,
    specialization: "Pathology",
    phone: "03000000000",
    clinic: "Northside",
    email: "",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  })

  it("creates, updates and deletes a doctor", async () => {
    await mountReady(configuredDatabase())

    await act(async () => {
      api.saveDoctor(doctor("doc_1", "Dr First"))
    })
    expect(api.db.doctors).toHaveLength(1)

    await act(async () => {
      api.saveDoctor({ ...api.db.doctors[0], name: "Dr Renamed" })
    })
    expect(api.db.doctors).toHaveLength(1)
    expect(api.db.doctors[0].name).toBe("Dr Renamed")

    await act(async () => {
      api.removeDoctor("doc_1")
    })
    expect(api.db.doctors).toHaveLength(0)
  })

  it("clears the doctor reference on patients but keeps their printed name", async () => {
    await mountReady(
      configuredDatabase({
        doctors: [doctor("doc_1", "Dr First")],
        patients: [patient({ id: "NSD-0001", doctorId: "doc_1", doctorName: "Dr First" })],
      }),
    )
    await act(async () => {
      api.removeDoctor("doc_1")
    })
    expect(api.db.patients[0].doctorId).toBe("")
    // The denormalized name is historical: an issued report must not change.
    expect(api.db.patients[0].doctorName).toBe("Dr First")
  })
})

describe("test catalog CRUD", () => {
  it("creates, updates and deletes a catalog test", async () => {
    await mountReady(configuredDatabase({ tests: [] }))

    await act(async () => {
      api.saveTest(catalogTest({ id: "tst_1", code: "CBC", name: "Complete Blood Count" }))
    })
    expect(api.db.tests.map((t) => t.code)).toEqual(["CBC"])

    await act(async () => {
      api.saveTest({ ...api.db.tests[0], name: "CBC (Updated)" })
    })
    expect(api.db.tests).toHaveLength(1)
    expect(api.db.tests[0].name).toBe("CBC (Updated)")

    await act(async () => {
      api.removeTest("CBC")
    })
    expect(api.db.tests).toHaveLength(0)
  })

  it("treats a changed code on the same id as an update, not a second test", async () => {
    await mountReady(configuredDatabase({ tests: [catalogTest({ id: "tst_1", code: "OLD" })] }))
    await act(async () => {
      api.saveTest(catalogTest({ id: "tst_1", code: "NEW" }))
    })
    expect(api.db.tests).toHaveLength(1)
    expect(api.db.tests[0].code).toBe("NEW")
  })

  it("keeps the catalog ordered by display order", async () => {
    await mountReady(
      configuredDatabase({
        tests: [
          catalogTest({ id: "tst_b", code: "B", displayOrder: 5 }),
          catalogTest({ id: "tst_a", code: "A", displayOrder: 1 }),
        ],
      }),
    )
    await act(async () => {
      api.saveTest(catalogTest({ id: "tst_c", code: "C", displayOrder: 3 }))
    })
    expect(api.db.tests.map((t) => t.code)).toEqual(["A", "C", "B"])
  })

  it("deactivates via an update instead of deleting, so history survives", async () => {
    await mountReady(configuredDatabase({ tests: [catalogTest({ id: "tst_1", code: "CBC", active: true })] }))
    const current = api.db.tests[0]
    await act(async () => {
      api.saveTest({ ...current, active: false })
    })
    expect(api.db.tests).toHaveLength(1)
    expect(api.db.tests[0].active).toBe(false)
  })

  it("removes a deleted test from an open order and re-prices it", async () => {
    await mountReady(
      configuredDatabase({
        tests: [
          catalogTest({ id: "tst_1", code: "CBC", price: 1500, parameters: [catalogTest().parameters[0]] }),
          catalogTest({
            id: "tst_2",
            code: "LFT",
            price: 2200,
            displayOrder: 1,
            parameters: [catalogTest({ parameters: [{ ...catalogTest().parameters[0], id: "alt" }] }).parameters[0]],
          }),
        ],
        patients: [patient({ id: "NSD-0001", testCodes: ["CBC", "LFT"], total: 3700, reportStatus: "Pending" })],
      }),
    )
    await act(async () => {
      api.removeTest("CBC")
    })
    const updated = api.db.patients[0]
    expect(updated.testCodes).toEqual(["LFT"])
    expect(updated.total).toBe(2200)
  })

  it("never empties an order when the only test is removed", async () => {
    await mountReady(
      configuredDatabase({
        tests: [catalogTest({ id: "tst_1", code: "CBC" })],
        patients: [patient({ id: "NSD-0001", testCodes: ["CBC"], total: 1500 })],
      }),
    )
    await act(async () => {
      api.removeTest("CBC")
    })
    expect(api.db.patients[0].testCodes).toEqual(["CBC"])
  })

  it("leaves a finalized report untouched", async () => {
    await mountReady(
      configuredDatabase({
        tests: [catalogTest({ id: "tst_1", code: "CBC" }), catalogTest({ id: "tst_2", code: "LFT", displayOrder: 1 })],
        patients: [
          patient({ id: "NSD-0001", testCodes: ["CBC", "LFT"], total: 3700, reportStatus: "Ready" }),
        ],
      }),
    )
    await act(async () => {
      api.removeTest("CBC")
    })
    expect(api.db.patients[0].testCodes).toEqual(["CBC", "LFT"])
  })
})

describe("staff CRUD", () => {
  const admin = (id: string, username: string): StaffUser => ({
    id,
    name: "Admin",
    username,
    role: "Administrator",
    status: "Active",
    passwordHash: "hash",
    passwordSalt: "salt",
    mustChangePassword: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: "",
  })

  it("creates a staff account and requires a password change", async () => {
    await mountReady(configuredDatabase({ users: [admin("usr_admin", "admin")] }))
    await act(async () => {
      const result = await api.addUser({
        name: "Reception Desk",
        username: "reception",
        role: "Receptionist",
        status: "Active",
        mustChangePassword: true,
        password: "reception2026",
      })
      expect(result.ok).toBe(true)
    })
    expect(api.db.users).toHaveLength(2)
    expect(api.db.users[1].mustChangePassword).toBe(true)
  })

  it("rejects a duplicate username", async () => {
    await mountReady(configuredDatabase({ users: [admin("usr_admin", "admin")] }))
    let result: LabResult = { ok: false }
    await act(async () => {
      result = await api.addUser({
        name: "Impostor",
        username: "ADMIN",
        role: "Receptionist",
        status: "Active",
        mustChangePassword: true,
        password: "reception2026",
      })
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/already taken/i)
    expect(api.db.users).toHaveLength(1)
  })

  it("rejects a password that fails the laboratory policy", async () => {
    await mountReady(configuredDatabase({ users: [admin("usr_admin", "admin")] }))
    let result: LabResult = { ok: false }
    await act(async () => {
      result = await api.addUser({
        name: "Weak",
        username: "weak",
        role: "Receptionist",
        status: "Active",
        mustChangePassword: true,
        password: "short",
      })
    })
    expect(result.ok).toBe(false)
    expect(api.db.users).toHaveLength(1)
  })

  it("edits a staff member's name, username and role", async () => {
    await mountReady(
      configuredDatabase({
        users: [admin("usr_admin", "admin"), { ...admin("usr_two", "second"), role: "Receptionist" }],
      }),
    )
    let result: LabResult = { ok: false }
    await act(async () => {
      result = api.updateUser("usr_two", { name: "Renamed", username: "front.desk", role: "Technician" })
    })
    expect(result.ok).toBe(true)
    const edited = api.db.users.find((u) => u.id === "usr_two")
    expect(edited?.name).toBe("Renamed")
    expect(edited?.username).toBe("front.desk")
    expect(edited?.role).toBe("Technician")
  })

  it("rejects an invalid or duplicate username on edit", async () => {
    await mountReady(
      configuredDatabase({
        users: [admin("usr_admin", "admin"), { ...admin("usr_two", "second"), role: "Receptionist" }],
      }),
    )
    let tooShort: LabResult = { ok: false }
    let duplicate: LabResult = { ok: false }
    await act(async () => {
      tooShort = api.updateUser("usr_two", { username: "ab" })
    })
    expect(tooShort.ok).toBe(false)
    await act(async () => {
      duplicate = api.updateUser("usr_two", { username: "admin" })
    })
    expect(duplicate.ok).toBe(false)
    expect(api.db.users.find((u) => u.id === "usr_two")?.username).toBe("second")
  })

  it("refuses to demote the last active administrator", async () => {
    await mountReady(configuredDatabase({ users: [admin("usr_admin", "admin")] }))
    let result: LabResult = { ok: false }
    await act(async () => {
      result = api.updateUser("usr_admin", { role: "Receptionist" })
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/last active administrator/i)
    expect(api.db.users[0].role).toBe("Administrator")
  })

  it("allows demotion once a second active administrator exists", async () => {
    await mountReady(
      configuredDatabase({
        users: [admin("usr_admin", "admin"), { ...admin("usr_two", "second") }],
      }),
    )
    let result: LabResult = { ok: false }
    await act(async () => {
      result = api.updateUser("usr_admin", { role: "Receptionist" })
    })
    expect(result.ok).toBe(true)
  })

  it("refuses to remove the last active administrator", async () => {
    await mountReady(configuredDatabase({ users: [admin("usr_admin", "admin")] }))
    await act(async () => {
      api.removeUser("usr_admin")
    })
    expect(api.db.users).toHaveLength(1)
  })

  it("removes a non-administrator account", async () => {
    await mountReady(
      configuredDatabase({
        users: [admin("usr_admin", "admin"), { ...admin("usr_two", "second"), role: "Receptionist" }],
      }),
    )
    await act(async () => {
      api.removeUser("usr_two")
    })
    expect(api.db.users.map((u) => u.id)).toEqual(["usr_admin"])
  })

  it("disables and re-enables an account by update", async () => {
    await mountReady(
      configuredDatabase({
        users: [admin("usr_admin", "admin"), { ...admin("usr_two", "second"), role: "Receptionist" }],
      }),
    )
    await act(async () => {
      api.saveUser({ ...api.db.users[1], status: "Disabled" })
    })
    expect(api.db.users[1].status).toBe("Disabled")
    await act(async () => {
      api.saveUser({ ...api.db.users[1], status: "Active" })
    })
    expect(api.db.users[1].status).toBe("Active")
  })

  it("never exposes a stored password in the document", async () => {
    await mountReady(configuredDatabase({ users: [admin("usr_admin", "admin")] }))
    await act(async () => {
      await api.addUser({
        name: "Reception Desk",
        username: "reception",
        role: "Receptionist",
        status: "Active",
        mustChangePassword: true,
        password: "supersecret2026",
      })
    })
    expect(JSON.stringify(api.db)).not.toContain("supersecret2026")
  })
})

describe("audit trail", () => {
  it("records an entry with the signed-in user", async () => {
    await mountReady(configuredDatabase({ users: [] }))
    await act(async () => {
      api.addAudit("Patient Created", "NSD-0001", "Walk-in")
    })
    expect(api.db.audit).toHaveLength(1)
    expect(api.db.audit[0].action).toBe("Patient Created")
  })

  it("clears the trail but leaves a record that it was cleared", async () => {
    // Clearing the audit log is an administrator-only action, so the test needs
    // a real session rather than just a database that happens to contain a user.
    sessionStorage.setItem("labdesk:session", "usr_admin")
    await mountReady(configuredDatabase({ users: [staffUser({ id: "usr_admin", role: "Administrator" })] }))
    await act(async () => {
      api.addAudit("One", "A")
      api.addAudit("Two", "B")
    })
    expect(api.db.audit).toHaveLength(2)

    let result: LabResult = { ok: false }
    await act(async () => {
      result = api.clearAudit()
    })
    expect(result.ok).toBe(true)
    expect(api.db.audit).toHaveLength(1)
    expect(api.db.audit[0].action).toBe("Audit Log Cleared")
  })

  it("refuses to clear the audit log for a non-administrator", async () => {
    sessionStorage.setItem("labdesk:session", "usr_recep")
    await mountReady(configuredDatabase({ users: [staffUser({ id: "usr_recep", role: "Receptionist" })] }))
    await act(async () => {
      api.addAudit("One", "A")
    })
    expect(api.db.audit).toHaveLength(1)

    let result: LabResult = { ok: false }
    await act(async () => {
      result = api.clearAudit()
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/administrator/i)
    // The trail is untouched.
    expect(api.db.audit).toHaveLength(1)
    expect(api.db.audit[0].action).toBe("One")
  })

  it("refuses to clear the audit log when nobody is signed in", async () => {
    await mountReady(configuredDatabase())
    await act(async () => {
      api.addAudit("One", "A")
    })
    let result: LabResult = { ok: false }
    await act(async () => {
      result = api.clearAudit()
    })
    expect(result.ok).toBe(false)
    expect(api.db.audit).toHaveLength(1)
  })
})

describe("settings CRUD", () => {
  it("patches a settings section without losing the other sections", async () => {
    await mountReady(configuredDatabase())
    await act(async () => {
      api.patchSection("testSettings", { allowDiscount: false })
    })
    expect(api.db.testSettings.allowDiscount).toBe(false)
    expect(api.db.paymentSettings).toBeTruthy()
    expect(api.db.profile.name).toBe("Northside Diagnostics")
  })

  it("updates the laboratory profile", async () => {
    await mountReady(configuredDatabase())
    await act(async () => {
      api.patchSection("profile", { name: "Renamed Lab", tagline: "New tagline" })
    })
    expect(api.db.profile.name).toBe("Renamed Lab")
    expect(api.db.profile.tagline).toBe("New tagline")
  })
})

describe("first-run setup", () => {
  it("creates the administrator and marks setup complete", async () => {
    await mountReady(createEmptyDatabase(createInstallation("production")))
    await act(async () => {
      const result = await api.completeSetup({
        profile: { name: "New Lab" },
        branding: {},
        reportSettings: {},
        receiptSettings: {},
        administrator: { name: "Owner", username: "owner", password: "ownerpass2026" },
        tests: [catalogTest() as CatalogTest],
      })
      expect(result.ok).toBe(true)
    })
    expect(api.db.setupCompleted).toBe(true)
    expect(api.db.users).toHaveLength(1)
    expect(api.db.users[0].role).toBe("Administrator")
    expect(api.db.profile.name).toBe("New Lab")
    expect(api.session?.username).toBe("owner")
    expect(api.status).toBe("ready")
  })

  it("does not store the administrator password in clear text", async () => {
    await mountReady(createEmptyDatabase(createInstallation("production")))
    await act(async () => {
      await api.completeSetup({
        profile: { name: "New Lab" },
        branding: {},
        reportSettings: {},
        receiptSettings: {},
        administrator: { name: "Owner", username: "owner", password: "ownerpass2026" },
        tests: [],
      })
    })
    const stored = api.db.users[0]
    expect(stored.passwordHash).toBeTruthy()
    expect(stored.passwordSalt).toBeTruthy()
    expect(JSON.stringify(api.db)).not.toContain("ownerpass2026")
  })
})

describe("backup and restore", () => {
  it("exports a backup that can be restored", async () => {
    await mountReady(configuredDatabase({ patients: [patient({ id: "NSD-0001", name: "Backed Up" })] }))
    let contents = ""
    await act(async () => {
      contents = api.exportBackup()
    })
    expect(contents).toContain("Backed Up")

    await act(async () => {
      api.removePatient("NSD-0001")
    })
    expect(api.db.patients).toHaveLength(0)

    let result: LabResult = { ok: false }
    await act(async () => {
      result = api.applyBackup(contents)
    })
    expect(result.ok).toBe(true)
    expect(api.db.patients[0].name).toBe("Backed Up")
  })

  it("rejects an invalid backup without touching live data", async () => {
    await mountReady(configuredDatabase({ patients: [patient({ id: "NSD-0001" })] }))
    let result: LabResult = { ok: false }
    await act(async () => {
      result = api.applyBackup("{ not a backup")
    })
    expect(result.ok).toBe(false)
    expect(api.db.patients).toHaveLength(1)
  })

  it("signs the user out after a restore", async () => {
    await mountReady(configuredDatabase({ patients: [patient({ id: "NSD-0001" })] }))
    const contents = api.exportBackup()
    await act(async () => {
      api.applyBackup(contents)
    })
    expect(api.session).toBeNull()
  })
})

describe("factory reset", () => {
  it("clears records and requires setup again", async () => {
    await mountReady(configuredDatabase({ patients: [patient({ id: "NSD-0001" })] }))
    await act(async () => {
      await api.factoryReset(false)
    })
    expect(api.db.patients).toHaveLength(0)
    expect(api.db.setupCompleted).toBe(false)
    expect(api.status).toBe("setup")
    expect(api.session).toBeNull()
  })

  it("can return a backup file first", async () => {
    await mountReady(configuredDatabase({ patients: [patient({ id: "NSD-0001", name: "Keep Me" })] }))
    let result: ResetResult = { ok: false }
    await act(async () => {
      result = await api.factoryReset(true)
    })
    expect(result.ok).toBe(true)
    expect(result.backupFile).toBeTruthy()
    expect(result.backupFile).toContain("Keep Me")
  })
})

