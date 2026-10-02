import { expect, test, type Page } from "@playwright/test"

/**
 * Real-browser smoke test.
 *
 * This is the check no jsdom test can make: does the shipped bundle actually
 * boot, paint, and run a first-day workflow in a browser? It walks the exact
 * path a new laboratory takes - setup, sign in, register a patient - and fails
 * on any console error or unhandled exception along the way.
 */

const LAB_NAME = "Harbour Road Laboratory"
const USERNAME = "reception.hr"
const PASSWORD = "Clinical2026!"

/** Fails the test if the page logs an error or throws. */
const guardConsole = (page: Page) => {
  const problems: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console.error: ${message.text()}`)
  })
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/**
 * Each Playwright test runs in a fresh browser context, so localStorage and
 * sessionStorage start empty without any explicit reset. Clearing them from an
 * `addInitScript` hook would be wrong: init scripts re-run on every navigation,
 * which would wipe the database out from under the reload assertions below.
 */

test("boots to the setup wizard and completes first-run setup", async ({ page }) => {
  const problems = guardConsole(page)
  await page.goto("/")

  // A fresh browser must never land on a working laboratory.
  await expect(page.getByRole("heading", { name: /welcome to labdesk/i })).toBeVisible()
  await expect(page.getByRole("navigation", { name: /main navigation/i })).toHaveCount(0)

  await page.getByRole("button", { name: /start setup/i }).click()
  await page.getByLabel("Laboratory name *").fill(LAB_NAME)
  await page.getByRole("button", { name: /^continue$/i }).click()

  await page.getByLabel("Street address").fill("44 Harbour Road")
  await page.getByLabel("City").fill("Portside")
  await page.getByLabel("Phone 1 *").fill("03001234567")
  await page.getByRole("button", { name: /^continue$/i }).click()
  await expect(page.getByRole("heading", { name: /report & receipt settings/i })).toBeVisible()

  await page.getByRole("button", { name: /^continue$/i }).click()
  await expect(page.getByRole("heading", { name: /administrator account/i })).toBeVisible()

  // A mismatched confirmation must be refused *and explained*.
  await page.getByLabel("Administrator name *").fill("Dr Amna Sheikh")
  await page.getByLabel("Username *").fill(USERNAME)
  await page.getByLabel("Password *", { exact: false }).first().fill(PASSWORD)
  await page.getByLabel(/confirm password/i).fill("TotallyDifferent9!")
  await page.getByRole("button", { name: /^continue$/i }).click()
  await expect(page.getByRole("alert").first()).toContainText(/match/i)
  await expect(page.getByRole("heading", { name: /administrator account/i })).toBeVisible()

  await page.getByLabel(/confirm password/i).fill(PASSWORD)
  await page.getByRole("button", { name: /^continue$/i }).click()
  await expect(page.getByRole("heading", { name: /your laboratory is ready/i })).toBeVisible()

  await page.getByRole("button", { name: /open dashboard/i }).click()

  // Setup signs the new administrator straight in.
  const nav = page.getByRole("navigation", { name: /main navigation/i })
  await expect(nav).toBeVisible()
  await expect(page.getByText(LAB_NAME).first()).toBeVisible()
  await expect(page.getByRole("button", { name: /^patients$/i })).toBeVisible()

  expect(problems).toEqual([])
})

test("registers a patient, prices the order, and persists it across a reload", async ({ page }) => {
  const problems = guardConsole(page)

  // --- First-run setup -------------------------------------------------------
  await page.goto("/")
  await page.getByRole("button", { name: /start setup/i }).click()
  await page.getByLabel("Laboratory name *").fill(LAB_NAME)
  await page.getByRole("button", { name: /^continue$/i }).click()
  await page.getByLabel("Street address").fill("44 Harbour Road")
  await page.getByLabel("City").fill("Portside")
  await page.getByLabel("Phone 1 *").fill("03001234567")
  await page.getByRole("button", { name: /^continue$/i }).click()
  await page.getByRole("button", { name: /^continue$/i }).click()
  await page.getByLabel("Administrator name *").fill("Dr Amna Sheikh")
  await page.getByLabel("Username *").fill(USERNAME)
  await page.getByLabel("Password *", { exact: false }).first().fill(PASSWORD)
  await page.getByLabel(/confirm password/i).fill(PASSWORD)
  await page.getByRole("button", { name: /^continue$/i }).click()
  await page.getByRole("button", { name: /open dashboard/i }).click()
  await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible()

  // --- Register a patient ----------------------------------------------------
  const nav = page.getByRole("navigation", { name: /main navigation/i })
  await nav.getByRole("button", { name: /new patient/i }).click()

  // An empty catalog refuses every order, so add the test first.
  await expect(page.getByText(/your catalog is empty/i)).toBeVisible()
  await page.getByRole("button", { name: /open test management/i }).click()
  await nav.getByRole("button", { name: /^tests$/i }).click()

  await page.getByRole("button", { name: /^add test$/i }).first().click()
  await page.getByLabel(/^test name/i).fill("Complete Blood Count")
  await page.getByLabel(/^test code/i).fill("CBC")
  await page.getByLabel(/^price/i).fill("1500")
  await page.getByRole("button", { name: /^save test$/i }).click()

  await nav.getByRole("button", { name: /new patient/i }).click()
  await page.getByLabel("Full name *").fill("Bilal Ahmed")
  await page.getByLabel(/^age/i).fill("29")
  await page.getByLabel("Contact number *").fill("03009876543")
  await page.getByLabel(/^gender/i).selectOption("Female")

  // No test selected is refused, with a reason.
  await page.getByRole("button", { name: /^save patient$/i }).click()
  await expect(page.getByText(/select at least one test/i).first()).toBeVisible()

  await page.getByRole("button", { name: /complete blood count/i }).click()
  // The order sidebar is hidden inside the registration form (by design), so
  // the priced total is what proves the selection landed.
  await expect(page.locator(".registration-total")).toContainText(/1,?500/)
  await page.getByRole("button", { name: /^save patient$/i }).click()

  await expect(page.getByText("Bilal Ahmed").first()).toBeVisible()

  // --- Reload: the record must come back from localStorage -------------------
  await page.reload()
  await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible()
  await page.getByRole("button", { name: /^patients$/i }).click()
  await expect(page.getByText("Bilal Ahmed").first()).toBeVisible()

  expect(problems).toEqual([])
})

test("offers Print and Save as PDF for both outputs, and remembers the appearance", async ({
  page,
}) => {
  const problems = guardConsole(page)

  // The browser fallback is `window.print()`, and the real dialog would block
  // the test for ever. Record the request instead so the fallback path itself is
  // what gets verified.
  await page.addInitScript(() => {
    const counter = window as unknown as { __printCalls?: number }
    Object.defineProperty(window, "print", {
      configurable: true,
      writable: true,
      value: () => {
        counter.__printCalls = (counter.__printCalls ?? 0) + 1
      },
    })
  })

  // --- First-run setup -------------------------------------------------------
  await page.goto("/")
  await page.getByRole("button", { name: /start setup/i }).click()
  await page.getByLabel("Laboratory name *").fill(LAB_NAME)
  await page.getByRole("button", { name: /^continue$/i }).click()
  await page.getByLabel("Street address").fill("44 Harbour Road")
  await page.getByLabel("City").fill("Portside")
  await page.getByLabel("Phone 1 *").fill("03001234567")
  await page.getByRole("button", { name: /^continue$/i }).click()
  await page.getByRole("button", { name: /^continue$/i }).click()
  await page.getByLabel("Administrator name *").fill("Dr Amna Sheikh")
  await page.getByLabel("Username *").fill(USERNAME)
  await page.getByLabel("Password *", { exact: false }).first().fill(PASSWORD)
  await page.getByLabel(/confirm password/i).fill(PASSWORD)
  await page.getByRole("button", { name: /^continue$/i }).click()
  await page.getByRole("button", { name: /open dashboard/i }).click()
  await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible()

  // --- The custom title bar replaces the native frame and the old top bar ----
  // A browser has no window to control, so only the identity and the appearance
  // switch remain.
  await expect(page.locator(".titlebar")).toBeVisible()
  await expect(page.getByRole("button", { name: /close window/i })).toHaveCount(0)
  await expect(page.locator(".topbar")).toHaveCount(0)

  // --- A patient, a test, and a printable order ------------------------------
  const nav2 = page.getByRole("navigation", { name: /main navigation/i })
  await nav2.getByRole("button", { name: /new patient/i }).click()
  await page.getByRole("button", { name: /open test management/i }).click()
  await nav2.getByRole("button", { name: /^tests$/i }).click()
  await page.getByRole("button", { name: /^add test$/i }).first().click()
  await page.getByLabel(/^test name/i).fill("Complete Blood Count")
  await page.getByLabel(/^test code/i).fill("CBC")
  await page.getByLabel(/^price/i).fill("1500")
  await page.getByRole("button", { name: /^save test$/i }).click()

  await nav2.getByRole("button", { name: /new patient/i }).click()
  await page.getByLabel("Full name *").fill("Bilal Ahmed")
  await page.getByLabel(/^age/i).fill("29")
  await page.getByLabel("Contact number *").fill("03009876543")
  await page.getByLabel(/^gender/i).selectOption("Female")
  await page.getByRole("button", { name: /complete blood count/i }).click()
  await page.getByRole("button", { name: /^save & print receipt$/i }).click()

  // --- The receipt screen prints and saves -----------------------------------
  // The actions appear at the top and the bottom of the preview, and both are
  // hidden from the printed page itself.
  await expect(page.locator(".thermal-receipt")).toBeVisible()
  await expect(page.getByRole("button", { name: /^print receipt$/i }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: /^save as pdf$/i }).first()).toBeVisible()
  await page.getByRole("button", { name: /^print receipt$/i }).first().click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __printCalls?: number }).__printCalls))
    .toBe(1)

  // --- A report prints too ---------------------------------------------------
  await nav2.getByRole("button", { name: /^reports$/i }).click()
  await page.getByRole("button", { name: /preview latest report/i }).click()
  await expect(page.getByRole("button", { name: /^print report$/i }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: /^save as pdf$/i }).first()).toBeVisible()

  // --- Printer settings: no desktop bridge in a browser ---------------------
  await nav2.getByRole("button", { name: /^settings$/i }).click()
  await page.getByRole("button", { name: /printer settings/i }).click()
  await expect(page.getByText(/thermal \/ receipt printer/i)).toBeVisible()
  await expect(page.getByText(/a4 report printer/i)).toBeVisible()
  // A browser cannot enumerate printers, and must say so rather than show a
  // list that will never work.
  await expect(page.locator(".info-callout")).toContainText(/desktop application/i)

  // --- The appearance is a device preference, not laboratory data ------------
  await page.getByRole("button", { name: /switch to dark appearance/i }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.reload()
  await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await expect(page.locator(".app-shell")).toHaveCSS("background-color", "rgb(17, 28, 38)")

  expect(problems).toEqual([])
})

test("signs out and refuses a wrong password", async ({ page }) => {
  const problems = guardConsole(page)
  await page.goto("/")
  await page.getByRole("button", { name: /start setup/i }).click()
  await page.getByLabel("Laboratory name *").fill(LAB_NAME)
  await page.getByRole("button", { name: /^continue$/i }).click()
  await page.getByLabel("Street address").fill("44 Harbour Road")
  await page.getByLabel("City").fill("Portside")
  await page.getByLabel("Phone 1 *").fill("03001234567")
  await page.getByRole("button", { name: /^continue$/i }).click()
  await page.getByRole("button", { name: /^continue$/i }).click()
  await page.getByLabel("Administrator name *").fill("Dr Amna Sheikh")
  await page.getByLabel("Username *").fill(USERNAME)
  await page.getByLabel("Password *", { exact: false }).first().fill(PASSWORD)
  await page.getByLabel(/confirm password/i).fill(PASSWORD)
  await page.getByRole("button", { name: /^continue$/i }).click()
  await page.getByRole("button", { name: /open dashboard/i }).click()
  await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible()

  await page.getByRole("button", { name: /log out/i }).click()

  // A wrong password must not produce a session.
  await page.getByLabel("Username *").fill(USERNAME)
  await page.getByLabel("Password *", { exact: false }).first().fill("WrongPassword1!")
  await page.getByRole("button", { name: /^sign in$/i }).click()
  await expect(page.getByText(/not correct|incorrect|invalid/i).first()).toBeVisible()
  await expect(page.getByRole("navigation", { name: /main navigation/i })).toHaveCount(0)

  // The real password still works.
  await page.getByLabel("Password *", { exact: false }).first().fill(PASSWORD)
  await page.getByRole("button", { name: /^sign in$/i }).click()
  await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible()

  expect(problems).toEqual([])
})
