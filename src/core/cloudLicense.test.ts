/**
 * Tests for the degraded Firestore path in cloudLicense.ts.
 *
 * While the Cloud Functions are not deployed every license check is served from
 * a publicly readable document, so these tests pin down the guarantees that
 * path has to keep on its own: a server refusal is never bypassed, expiry is
 * judged against the server clock rather than the customer's, and a withdrawn
 * or over-subscribed key stops working.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  activateLicenseOnline,
  checkLicenseStatusOnline,
  FIREBASE_CONFIG,
} from "./cloudLicense"
import { sha256 } from "./licenseCrypto"

const KEY = "LDK-TEST-TEST-TEST-0001"
const SERVER_NOW = "2026-06-15T12:00:00Z"

/** A real installation id, matching the format the Firestore rules require. */
const INSTALLATION = "LABDESK-INSTALLATION-UUID-AAAAA-BBBBB-CCCCC-DDDDD-EEEEE"

/** Firestore always returns a `Date` header from Google, so it is never local. */
const SERVER_DATE = new Date(SERVER_NOW).toUTCString()

function firestoreDocument(fields: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ name: `licenses/${KEY}`, fields }), {
    status: 200,
    headers: { "Content-Type": "application/json", Date: SERVER_DATE },
  })
}

function notFound(): Response {
  return new Response(JSON.stringify({ error: { code: 404, message: "not found" } }), {
    status: 404,
    headers: { "Content-Type": "application/json", Date: SERVER_DATE },
  })
}

const ACTIVE_FIELDS = {
  status: { stringValue: "ACTIVE" },
  expiresAt: { stringValue: "2027-06-15T12:00:00Z" },
  maxInstallations: { integerValue: "2" },
  currentInstallations: { integerValue: "0" },
  installationIds: { arrayValue: { values: [] } },
  customerId: { stringValue: "CUST-1" },
  customerName: { stringValue: "Test Customer" },
  plan: { stringValue: "PROFESSIONAL" },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Cloud Function endpoint responses", () => {
  it("honours an explicit refusal instead of falling back to Firestore", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "Seat limit reached.", status: "DEACTIVATED" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await activateLicenseOnline(KEY, "INSTALL-1", "Test Laboratory")

    expect(result.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    if (!result.ok) {
      expect(result.error).toBe("Seat limit reached.")
      expect(result.status).toBe("DEACTIVATED")
    }
  })

  it("falls back to Firestore when the endpoint is not deployed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(firestoreDocument({ ...ACTIVE_FIELDS, licenseKeyHash: { stringValue: await sha256(KEY) } }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

const result = await activateLicenseOnline(KEY, INSTALLATION, "Test Laboratory")

    expect(result.ok).toBe(true)
    expect(String(fetchMock.mock.calls[1][0])).toContain(`${FIREBASE_CONFIG.firestoreRestBase}/licenses/`)
    // The seat is claimed, then the computer publishes itself: without the
    // latter the portal's installations view stays empty for as long as the
    // Cloud Function is undeployed.
    expect(String(fetchMock.mock.calls[2][0])).toContain(
      `${FIREBASE_CONFIG.firestoreRestBase}/licenses/`,
    )
    expect(String(fetchMock.mock.calls[3][0])).toContain(
      `${FIREBASE_CONFIG.firestoreRestBase}/installations/${INSTALLATION}`,
    )
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "PATCH" })
  })

  it("activates even when publishing the installation fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(firestoreDocument({ ...ACTIVE_FIELDS, licenseKeyHash: { stringValue: await sha256(KEY) } }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("denied", { status: 403 }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await activateLicenseOnline(KEY, "INSTALL-1", "Test Laboratory")

    expect(result.ok).toBe(true)
  })

  it("refreshes last seen on a heartbeat without rewriting the license", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(firestoreDocument(ACTIVE_FIELDS))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await checkLicenseStatusOnline(KEY, "INSTALL-1")

    expect(result.ok && result.status).toBe("ACTIVE")
    const [url, init] = fetchMock.mock.calls[2]
    expect(String(url)).toContain(`${FIREBASE_CONFIG.firestoreRestBase}/installations/INSTALL-1`)
    expect(String(url)).toContain("updateMask.fieldPaths=lastSeenAt")
    expect(init).toMatchObject({ method: "PATCH" })
  })

  it("registers on a heartbeat when the machine is not in the portal yet", async () => {
    // A masked update of an unregistered document is refused by the Firestore
    // rules, which is how an upgraded install republishes itself.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(firestoreDocument(ACTIVE_FIELDS))
      .mockResolvedValueOnce(new Response("denied", { status: 403 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await checkLicenseStatusOnline(KEY, "INSTALL-1")

    expect(result.ok && result.status).toBe("ACTIVE")
    expect(String(fetchMock.mock.calls[3][0])).toContain("updateMask.fieldPaths=installationId")
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ method: "PATCH" })
  })

  it("does not downgrade a named status refusal into an offline event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, status: "REVOKED", error: "License revoked." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )

    const result = await checkLicenseStatusOnline("LIC-1", "INSTALL-1")

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.status).toBe("REVOKED")
  })

  it("reports a network failure so offline grace can take over", async () => {
    // Endpoint unreachable and Firestore unreachable.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))

    const result = await checkLicenseStatusOnline("LIC-1", "INSTALL-1")

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.networkFailure).toBe(true)
  })
})

describe("Degraded Firestore path", () => {
  /** First call is the undeployed endpoint, second call is the document read. */
  const endpointThenDocument = (fields: Record<string, unknown>) =>
    vi.fn().mockResolvedValueOnce(new Response("", { status: 404 })).mockResolvedValueOnce(firestoreDocument(fields))

  it("uses the server clock rather than the customer's", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2020-01-01T00:00:00Z").getTime())
    vi.stubGlobal("fetch", endpointThenDocument(ACTIVE_FIELDS))

    const result = await checkLicenseStatusOnline(KEY, "INSTALL-1")

    expect(result.ok).toBe(true)
    if (result.ok) {
      // Proof the local clock was not consulted: it reads 2020, the server says 2026.
      expect(new Date(result.serverTime).getTime()).toBe(new Date(SERVER_NOW).getTime())
      expect(new Date(result.graceUntil).getTime()).toBe(new Date(SERVER_NOW).getTime() + 7 * 86400000)
      expect(result.status).toBe("ACTIVE")
    }
  })

  it("marks an expired license EXPIRED even though the stored status says ACTIVE", async () => {
    vi.stubGlobal(
      "fetch",
      endpointThenDocument({ status: { stringValue: "ACTIVE" }, expiresAt: { stringValue: "2026-01-01T00:00:00Z" } }),
    )

    const result = await checkLicenseStatusOnline(KEY, "INSTALL-1")

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.status).toBe("EXPIRED")
  })

  it("does not let a rolled-back system clock revive an expired license", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2020-01-01T00:00:00Z").getTime())
    vi.stubGlobal(
      "fetch",
      endpointThenDocument({ status: { stringValue: "ACTIVE" }, expiresAt: { stringValue: "2026-01-01T00:00:00Z" } }),
    )

    const result = await checkLicenseStatusOnline(KEY, "INSTALL-1")

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.status).toBe("EXPIRED")
  })

  it("treats a deleted document as REVOKED so the vendor can stop a customer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("", { status: 404 })).mockResolvedValueOnce(notFound()))

    const result = await checkLicenseStatusOnline(KEY, "INSTALL-1")

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.status).toBe("REVOKED")
  })

  it("refuses a machine with no seat left", async () => {
    vi.stubGlobal(
      "fetch",
      endpointThenDocument({
        ...ACTIVE_FIELDS,
        licenseKeyHash: { stringValue: await sha256(KEY) },
        maxInstallations: { integerValue: "1" },
        currentInstallations: { integerValue: "1" },
        installationIds: { arrayValue: { values: [{ stringValue: "INSTALL-9" }] } },
      }),
    )

    const result = await activateLicenseOnline(KEY, "INSTALL-1", "Test Laboratory")

    expect(result.ok).toBe(false)
  })

  it("still lets a registered machine re-activate", async () => {
    vi.stubGlobal(
      "fetch",
      endpointThenDocument({
        ...ACTIVE_FIELDS,
        licenseKeyHash: { stringValue: await sha256(KEY) },
        maxInstallations: { integerValue: "1" },
        currentInstallations: { integerValue: "1" },
        installationIds: { arrayValue: { values: [{ stringValue: "INSTALL-1" }] } },
      }),
    )

    const result = await activateLicenseOnline(KEY, "INSTALL-1", "Test Laboratory")

    expect(result.ok).toBe(true)
  })

  it("rejects a document whose stored hash belongs to a different key", async () => {
    vi.stubGlobal(
      "fetch",
      endpointThenDocument({ ...ACTIVE_FIELDS, licenseKeyHash: { stringValue: await sha256("LDK-OTHER-KEY") } }),
    )

    const result = await activateLicenseOnline(KEY, "INSTALL-1", "Test Laboratory")

    expect(result.ok).toBe(false)
  })

  it("refuses activation while the vendor has withdrawn the license", async () => {
    vi.stubGlobal(
      "fetch",
      endpointThenDocument({
        ...ACTIVE_FIELDS,
        status: { stringValue: "DEACTIVATED" },
        licenseKeyHash: { stringValue: await sha256(KEY) },
      }),
    )

    const result = await activateLicenseOnline(KEY, "INSTALL-1", "Test Laboratory")

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe("DEACTIVATED")
  })
})

  describe("Seat reservation", () => {
    const SEAT_FIELDS = {
      ...ACTIVE_FIELDS,
      maxInstallations: { integerValue: "1" },
      currentInstallations: { integerValue: "0" },
      installationIds: { arrayValue: { values: [] } },
    }

    const seatList = (...ids: string[]) => ({ arrayValue: { values: ids.map((id) => ({ stringValue: id })) } })

    /** Endpoint probe, license read, seat write, then the installation publish. */
    const activationCalls = (documentFields: Record<string, unknown>, writeStatus = 200) =>
      vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 404 }))
        .mockResolvedValueOnce(firestoreDocument(documentFields))
        .mockResolvedValueOnce(new Response("{}", { status: writeStatus }))
        .mockResolvedValueOnce(new Response("{}", { status: 200 }))

    it("appends its own installation to the seat list", async () => {
      const fetchMock = activationCalls(SEAT_FIELDS)
      vi.stubGlobal("fetch", fetchMock)

      const result = await activateLicenseOnline(KEY, INSTALLATION, "Test Laboratory", "1.0.0")

      expect(result.ok).toBe(true)
      const [url, init] = fetchMock.mock.calls[2]
      expect(String(url)).toContain(`${FIREBASE_CONFIG.firestoreRestBase}/licenses/`)
      expect(String(url)).toContain("updateMask.fieldPaths=installationIds")
      const body = JSON.parse(String(init?.body))
      expect(body.fields.installationIds.arrayValue.values[0].stringValue).toBe(INSTALLATION)
      expect(body.fields.currentInstallations.integerValue).toBe("1")
    })

    it("does not write when the only seat is already taken", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 404 }))
        .mockResolvedValueOnce(
          firestoreDocument({
            ...SEAT_FIELDS,
            installationIds: seatList("LABDESK-INSTALLATION-UUID-AAAA-BBBB"),
            currentInstallations: { integerValue: "1" },
          }),
        )
      vi.stubGlobal("fetch", fetchMock)

      const result = await activateLicenseOnline(KEY, INSTALLATION, "Test Laboratory", "1.0.0")

      expect(result.ok).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("losing the race for the final seat is refused, not silently allowed", async () => {
      // The write is denied by the rules because another machine claimed the
      // last seat first, so the license is re-read and now shows it full.
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 404 }))
        .mockResolvedValueOnce(firestoreDocument(SEAT_FIELDS))
        .mockResolvedValueOnce(new Response("denied", { status: 403 }))
        .mockResolvedValueOnce(
          firestoreDocument({
            ...SEAT_FIELDS,
            installationIds: seatList("LABDESK-INSTALLATION-UUID-WINNER"),
            currentInstallations: { integerValue: "1" },
          }),
        )
      vi.stubGlobal("fetch", fetchMock)

      const result = await activateLicenseOnline(KEY, INSTALLATION, "Test Laboratory", "1.0.0")

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.status).toBe("DEACTIVATED")
        expect(result.error).toContain("1 of 1")
      }
    })

    it("activates without a seat write when this machine already holds the seat", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 404 }))
        .mockResolvedValueOnce(
          firestoreDocument({
            ...SEAT_FIELDS,
            installationIds: seatList(INSTALLATION),
            currentInstallations: { integerValue: "1" },
          }),
        )
        .mockResolvedValueOnce(new Response("{}", { status: 200 }))
        .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      vi.stubGlobal("fetch", fetchMock)

      const result = await activateLicenseOnline(KEY, INSTALLATION, "Test Laboratory", "1.0.0")

      expect(result.ok).toBe(true)
      // The only seat write is the counter sync, which does not grow the list.
      const body = JSON.parse(String(fetchMock.mock.calls[2][1]?.body))
      expect(body.fields.installationIds.arrayValue.values).toHaveLength(1)
      expect(body.fields.currentInstallations.integerValue).toBe("1")
    })

    it("never reserves a seat on a license that is not active", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 404 }))
        .mockResolvedValueOnce(
          firestoreDocument({ ...SEAT_FIELDS, status: { stringValue: "DEACTIVATED" } }),
        )
      vi.stubGlobal("fetch", fetchMock)

      const result = await activateLicenseOnline(KEY, INSTALLATION, "Test Laboratory", "1.0.0")

expect(result.ok).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })