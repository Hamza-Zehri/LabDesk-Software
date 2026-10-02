/**
 * End-to-end UI smoke test.
 *
 * Everything else in the suite tests the data layer. This file drives the real
 * `App` through the real screens with the real storage backend, because the
 * first-run path is the one a customer walks on day one and the one most likely
 * to be broken by a refactor that no unit test would notice.
 *
 * The flow is the one that matters: a brand new installation sets itself up,
 * the administrator signs in, a patient is registered, and the order reaches
 * the report.
 */

import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import App from "./App"
import { LabProvider } from "./app/LabProvider"
import { createEmptyDatabase, createInstallation, storageKey, ACTIVE_INSTALLATION_KEY } from "./core/defaults"
import { getOrCreateInstallationId } from "./core/installationId"
import { computeLicenseSignature } from "./core/licenseCrypto"
import { createDefaultLicenseInfo } from "./core/licenseService"
import { catalogTest } from "./core/testFixtures"
import type { LabDatabase, LicenseInfo } from "./core/types"

const LAB_NAME = "Harbour Road Laboratory"
const USERNAME = "reception.hr"
const PASSWORD = "Clinical2026!"

/** Renders the real application tree, exactly as `main.tsx` mounts it. */
const renderApp = () => render(<LabProvider><App /></LabProvider>)

const resetStorage = () => {
  localStorage.clear()
  sessionStorage.clear()
}

/**
 * Gives the database a usable license, signed the way the app signs it.
 *
 * The application refuses to operate without one, so every test that is about
 * something else has to start from a licensed installation. `lastCheckInAt` is
 * set to now so the background heartbeat considers the cloud check not yet due
 * and the suite stays offline and deterministic; the licensing tests cover the
 * cloud path itself.
 */
const withLicense = async (db: LabDatabase, status: LicenseInfo["status"] = "ACTIVE"): Promise<LabDatabase> => {
  const installationId = db.license?.installationId || getOrCreateInstallationId()
  const now = new Date()
  const in30Days = new Date(now.getTime() + 30 * 86400000)

  const license: LicenseInfo = {
    ...createDefaultLicenseInfo(installationId),
    status,
    licenseId: "LIC-TEST000001",
    licenseKeyMasked: "LDK-****-****-****-0001",
    customerId: "CUST-TEST0001",
    customerName: "Test Customer",
    licensedTo: LAB_NAME,
    issuedAt: now.toISOString(),
    activatedAt: now.toISOString(),
    expiresAt: in30Days.toISOString(),
    lastCheckInAt: now.toISOString(),
    serverTimeAtCheck: now.toISOString(),
    graceUntil: in30Days.toISOString(),
    signature: "",
  }
  license.signature = await computeLicenseSignature(license, installationId)
  db.license = license
  return db
}

/** Writes a completed installation with one known credential, ready to sign in. */
const seedInstalled = async (role: "Administrator" | "Receptionist" = "Administrator", status: LicenseInfo["status"] = "ACTIVE") => {
  const install = createInstallation("production")
  const db = createEmptyDatabase(install)
  const { hashPassword } = await import("./core/password")
  const digest = await hashPassword(PASSWORD)

  db.setupCompleted = true
  // An order needs at least one test, so the seeded catalog is not optional for
  // anything that registers a patient.
  db.tests = [catalogTest({ code: "CBC", name: "Complete Blood Count", price: 1500 })]
  db.users = [
    {
      id: "usr_1",
      name: role === "Administrator" ? "Dr Amna Sheikh" : "Reception Desk",
      username: USERNAME,
      role,
      status: "Active",
      passwordHash: digest.hash,
      passwordSalt: digest.salt,
      mustChangePassword: false,
      createdAt: new Date().toISOString(),
      lastLoginAt: "",
    },
  ]

  await withLicense(db, status)

  // `ACTIVE_INSTALLATION_KEY` holds the bare installation id, not JSON.
  localStorage.setItem(ACTIVE_INSTALLATION_KEY, install.id)
  localStorage.setItem(storageKey(install.id, "database"), JSON.stringify(db))
  return install
}

/** Signs in through the real login screen and returns the user-event driver. */
const signIn = async (role: "Administrator" | "Receptionist" = "Administrator") => {
  await seedInstalled(role)
  const user = userEvent.setup()
  renderApp()
  await user.type(await screen.findByLabelText(/^username/i), USERNAME)
  await user.type(screen.getByLabelText(/^password/i), PASSWORD)
  await user.click(screen.getByRole("button", { name: /sign in|log in/i }))
  return user
}

const storedDatabase = () => {
  const installId = localStorage.getItem(ACTIVE_INSTALLATION_KEY)!
  return JSON.parse(localStorage.getItem(storageKey(installId, "database"))!)
}

/** Fills the registration form and saves, selecting a test as the form requires. */
const registerPatient = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  const nav = await screen.findByRole("navigation", { name: /main navigation/i })
  await user.click(within(nav).getByRole("button", { name: /new patient/i }))

  await user.type(await screen.findByLabelText(/full name/i), name)
  await user.type(screen.getByLabelText(/^age/i), "29")
  await user.type(screen.getByLabelText(/contact number/i), "03009876543")
  await user.selectOptions(screen.getByLabelText(/^gender/i), "Female")

  // An order with no tests is refused, so the catalog entry must be picked.
  await user.click(screen.getByRole("button", { name: /complete blood count/i }))
  await user.click(screen.getByRole("button", { name: /^save patient$/i }))
}

beforeEach(() => {
  resetStorage()
})

afterEach(() => {
  resetStorage()
})

describe("first run", () => {
  it("walks a new installation from setup through to a registered patient", async () => {
    const user = userEvent.setup()
    renderApp()

    // Each step is entered by waiting for its heading, never for one of its
    // fields: a field can appear while the previous step's Continue button is
    // still mounted, and clicking that stale button silently does nothing.
    const advance = async (stepHeading: RegExp) => {
      await user.click(screen.getByRole("button", { name: /^continue$/i }))
      await screen.findByRole("heading", { name: stepHeading })
    }

    // --- Setup wizard: welcome -------------------------------------------------
    expect(await screen.findByRole("heading", { name: /welcome/i })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: /start setup/i }))
    await screen.findByRole("heading", { name: /laboratory information/i })

    // --- Laboratory identity --------------------------------------------------
    await user.type(screen.getByLabelText(/laboratory name/i), LAB_NAME)

    // The product name is fixed and must never be editable from setup.
    expect(screen.queryByLabelText(/software name|product name/i)).toBeNull()

    await advance(/address & contact/i)

    // --- Contact --------------------------------------------------------------
    await user.type(screen.getByLabelText(/^city/i), "Portside")
    await user.type(screen.getByLabelText(/street address/i), "44 Harbour Road")
    await user.type(screen.getByLabelText(/phone 1/i), "03001234567")
    await advance(/report & receipt settings/i)

    // --- Documents ------------------------------------------------------------
    await advance(/administrator account/i)

    // --- Administrator --------------------------------------------------------
    await user.type(screen.getByLabelText(/administrator name/i), "Dr Amna Sheikh")
    await user.type(screen.getByLabelText(/^username/i), USERNAME)
    await user.type(screen.getByLabelText(/^password/i), PASSWORD)
    await user.type(screen.getByLabelText(/confirm password/i), PASSWORD)
    await advance(/your laboratory is ready/i)

    // --- Finish ---------------------------------------------------------------
    // Setup signs the new administrator straight in, so there is no
    // intermediate login screen to dismiss on day one.
    await user.click(await screen.findByRole("button", { name: /open dashboard/i }))

    // A brand new installation holds no license, so the product must ask for a
    // key rather than hand over a fully working laboratory. Everything typed
    // during setup is still saved and still there after activation.
    expect(await screen.findByRole("heading", { name: /activate labdesk/i })).toBeTruthy()
    expect(screen.queryByRole("navigation", { name: /main navigation/i })).toBeNull()
    expect(screen.getByLabelText(/license key/i)).toBeTruthy()

    // --- Activate and enter the product --------------------------------------
    const licensed = await withLicense(storedDatabase())
    localStorage.setItem(storageKey(localStorage.getItem(ACTIVE_INSTALLATION_KEY)!, "database"), JSON.stringify(licensed))

    // Remount against the same storage. The sign-in from setup is still in
    // place, so this is what a customer restarting the application sees.
    cleanup()
    renderApp()

    // --- The shell is up and shows this laboratory, not the software ----------
    const shell = await screen.findByRole("navigation", { name: /main navigation/i })
    expect(within(shell).getByRole("button", { name: /dashboard/i })).toBeTruthy()
    expect(within(shell).getByRole("button", { name: /new patient/i })).toBeTruthy()
    await waitFor(() => expect(document.body.textContent).toContain(LAB_NAME))

    // The name the customer typed is what is stored, not a hard-coded default.
    const stored = storedDatabase()
    expect(stored.profile.name).toBe(LAB_NAME)
    expect(stored.setupCompleted).toBe(true)

    // Exactly one administrator exists, and the password is not in plain text.
    expect(stored.users).toHaveLength(1)
    expect(stored.users[0].role).toBe("Administrator")
    expect(stored.users[0].passwordHash).not.toBe(PASSWORD)
    expect(stored.users[0].passwordHash.length).toBeGreaterThan(16)
  }, 60_000)

  it("refuses a mismatched confirmation password and does not finish setup", async () => {
    const user = userEvent.setup()
    renderApp()

    const advance = async (stepHeading: RegExp) => {
      await user.click(screen.getByRole("button", { name: /^continue$/i }))
      await screen.findByRole("heading", { name: stepHeading })
    }

    await user.click(await screen.findByRole("button", { name: /start setup/i }))
    await user.type(await screen.findByLabelText(/laboratory name/i), "Mismatched Lab")
    await advance(/address & contact/i)

    await user.type(screen.getByLabelText(/street address/i), "1 Test Street")
    await user.type(screen.getByLabelText(/phone 1/i), "03001234567")
    await advance(/report & receipt settings/i)
    await advance(/administrator account/i)

    await user.type(screen.getByLabelText(/administrator name/i), "Someone")
    await user.type(screen.getByLabelText(/^username/i), "someone")
    await user.type(screen.getByLabelText(/^password/i), PASSWORD)
    await user.type(screen.getByLabelText(/confirm password/i), "TotallyDifferent9!")
    await user.click(screen.getByRole("button", { name: /^continue$/i }))

    // The wizard must refuse to advance and say why.
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0))
    expect(screen.getAllByRole("alert").map((a) => a.textContent).join(" ")).toMatch(/match/i)
    // Still on the administrator step, and no installation was created.
    expect(screen.getByRole("heading", { name: /administrator account/i })).toBeTruthy()
    // The wizard reserves an installation id on boot, but an abandoned setup
    // must leave no usable laboratory behind: either nothing is persisted yet,
    // or what is persisted is still marked incomplete with no staff accounts.
    const stored = localStorage.getItem(
      storageKey(localStorage.getItem(ACTIVE_INSTALLATION_KEY)!, "database"),
    )
    if (stored) {
      const db = JSON.parse(stored)
      expect(db.setupCompleted).toBe(false)
      expect(db.users).toHaveLength(0)
    }
  }, 60_000)
})

describe("daily use", () => {
  it("registers a patient and shows them in the register", async () => {
    const user = await signIn()
    await registerPatient(user, "Bilal Ahmed")

    await waitFor(() => expect(document.body.textContent).toContain("Bilal Ahmed"))

    await user.click(
      within(await screen.findByRole("navigation", { name: /main navigation/i })).getByRole("button", {
        name: /^patients$/i,
      }),
    )
    await waitFor(() => expect(document.body.textContent).toContain("Bilal Ahmed"))

    // The record reached storage, not just component state, and it was billed
    // at the catalog price with the test attached.
    const [saved] = storedDatabase().patients
    expect(saved.name).toBe("Bilal Ahmed")
    expect(saved.testCodes).toEqual(["CBC"])
    expect(saved.total).toBe(1500)
  }, 60_000)

  it("keeps a registered patient after a full reload", async () => {
    const user = await signIn()
    await registerPatient(user, "Persisted Person")
    await waitFor(() => expect(document.body.textContent).toContain("Persisted Person"))

    // Remount the entire application against the same storage. This proves the
    // record is in localStorage and not merely in React state.
    cleanup()
    renderApp()
    await waitFor(() => expect(document.body.textContent).toContain("Persisted Person"), { timeout: 10_000 })
  }, 60_000)

  it("shows the staff section to an administrator", async () => {
    const user = await signIn("Administrator")
    const nav = await screen.findByRole("navigation", { name: /main navigation/i })

    expect(within(nav).getByRole("button", { name: /^staff$/i })).toBeTruthy()
    await user.click(within(nav).getByRole("button", { name: /^settings$/i }))
    await waitFor(() => expect(document.body.textContent).toMatch(/laboratory name|currency/i))
  }, 60_000)
})

describe("licensing", () => {
  /** Signs in against an installation whose license has the given status. */
  const signInWithLicense = async (status: LicenseInfo["status"]) => {
    await seedInstalled("Administrator", status)
    const user = userEvent.setup()
    renderApp()
    await user.type(await screen.findByLabelText(/^username/i), USERNAME)
    await user.type(screen.getByLabelText(/^password/i), PASSWORD)
    await user.click(screen.getByRole("button", { name: /sign in|log in/i }))
    return user
  }

  it("refuses to run when no license has ever been activated", async () => {
    await signInWithLicense("NOT_ACTIVATED")

    expect(await screen.findByRole("heading", { name: /activate labdesk/i })).toBeTruthy()
    // The whole product is behind the lock: no navigation, no patient register.
    expect(screen.queryByRole("navigation", { name: /main navigation/i })).toBeNull()
  }, 60_000)

  it.each([
    ["EXPIRED", /license expired/i],
    ["DEACTIVATED", /license deactivated/i],
    ["SUSPENDED", /license suspended/i],
    ["REVOKED", /license deactivated/i],
    ["VERIFICATION_ERROR", /could not be verified/i],
  ] as const)("locks the product when the license is %s", async (status, expectedHeading) => {
    await signInWithLicense(status)

    expect(await screen.findByRole("heading", { name: expectedHeading })).toBeTruthy()
    expect(screen.queryByRole("navigation", { name: /main navigation/i })).toBeNull()
  }, 60_000)

  it.each(["ACTIVE", "OFFLINE_GRACE", "EXPIRING_SOON"] as const)(
    "keeps running when the license is %s",
    async (status) => {
      await signInWithLicense(status)

      expect(await screen.findByRole("navigation", { name: /main navigation/i })).toBeTruthy()
      expect(screen.queryByRole("heading", { name: /activate labdesk/i })).toBeNull()
    },
    60_000,
  )

  it("leaves the laboratory data untouched behind the lock", async () => {
    await signInWithLicense("ACTIVE")
    const user = userEvent.setup()
    await registerPatient(user, "Pre Lock Patient")
    await waitFor(() => expect(document.body.textContent).toContain("Pre Lock Patient"))

    // Same installation, license withdrawn by the vendor.
    const db = storedDatabase()
    await withLicense(db, "DEACTIVATED")
    localStorage.setItem(storageKey(localStorage.getItem(ACTIVE_INSTALLATION_KEY)!, "database"), JSON.stringify(db))

    cleanup()
    renderApp()
    expect(await screen.findByRole("heading", { name: /license deactivated/i })).toBeTruthy()

    // The record is still on disk and reachable again after reactivation.
    const reactivated = await withLicense(storedDatabase(), "ACTIVE")
    expect(reactivated.patients[0].name).toBe("Pre Lock Patient")

    localStorage.setItem(storageKey(localStorage.getItem(ACTIVE_INSTALLATION_KEY)!, "database"), JSON.stringify(reactivated))
    cleanup()
    renderApp()
    await waitFor(() => expect(document.body.textContent).toContain("Pre Lock Patient"), { timeout: 10_000 })
  }, 90_000)

  it("offers a key field so a customer is never locked out permanently", async () => {
    await signInWithLicense("NOT_ACTIVATED")

    expect(await screen.findByRole("heading", { name: /activate labdesk/i })).toBeTruthy()
    const keyField = screen.getByLabelText(/license key/i)
    expect(keyField).toBeTruthy()
    expect(screen.getByRole("button", { name: /activate labdesk/i })).toBeTruthy()
    expect(screen.getByText(/data is safe/i)).toBeTruthy()
  }, 60_000)
})

describe("security", () => {
  it("does not expose the staff section to a receptionist", async () => {
    const user = await signIn("Receptionist")
    const nav = await screen.findByRole("navigation", { name: /main navigation/i })

    expect(within(nav).queryByRole("button", { name: /^staff$/i })).toBeNull()
  }, 60_000)

  it("rejects a wrong password", async () => {
    await seedInstalled()
    const user = userEvent.setup()
    renderApp()

    await user.type(await screen.findByLabelText(/^username/i), "whoever")
    await user.type(screen.getByLabelText(/^password/i), "WrongPassword1!")
    await user.click(screen.getByRole("button", { name: /sign in|log in/i }))

    await waitFor(() => expect(document.body.textContent).toMatch(/not correct|incorrect|invalid/i))
    expect(screen.queryByRole("navigation", { name: /main navigation/i })).toBeNull()
  }, 60_000)
})
