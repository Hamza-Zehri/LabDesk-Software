import { afterEach, describe, expect, it, vi } from "vitest"
import { calculateGraceUntil } from "./cloudLicense"
import { createEmptyDatabase } from "./defaults"
import { getOrCreateInstallationId } from "./installationId"
import { computeLicenseSignature, generateRandomLicenseKey, isLocalLicenseSignatureValid, maskLicenseKey, sha256 } from "./licenseCrypto"
import {
  activateCommercialLicense,
  initializeLicenseState,
  isLicenseOperatingAllowed,
  refreshLicenseFromCloud,
  summarizeCommercialLicense,
} from "./licenseService"
import type { LabDatabase, LicenseInfo } from "./types"

describe("Commercial License Engine", () => {
  it("generates predictable license key format LDK-XXXX-XXXX-XXXX-XXXX", () => {
    const key = generateRandomLicenseKey()
    expect(key).toMatch(/^LDK-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  })

  it("masks license key for customer display", () => {
    const key = "LDK-A1B2-C3D4-E5F6-7890"
    const masked = maskLicenseKey(key)
    expect(masked).toBe("LDK-****-****-****-7890")
  })

  it("generates persistent installation UUID", () => {
    const id1 = getOrCreateInstallationId()
    const id2 = getOrCreateInstallationId()
    expect(id1).toMatch(/^LABDESK-INSTALLATION-UUID-/)
    expect(id1).toBe(id2)
  })

  it("computes tamper-evident cryptographic signature", async () => {
    const instId = getOrCreateInstallationId()
    const license: Partial<LicenseInfo> = {
      licenseId: "LIC-9988",
      status: "ACTIVE",
      customerId: "CUST-11",
      licensedTo: "Baloch Lab",
      expiresAt: "2027-12-31T00:00:00.000Z",
      lastCheckInAt: "2026-10-02T00:00:00.000Z",
    }
    const signature = await computeLicenseSignature(license, instId)
    expect(signature).toBeDefined()
    expect(signature.length).toBe(64) // SHA-256 hex length

    const fullLicense = { ...license, installationId: instId, signature } as LicenseInfo
    const isValid = await isLocalLicenseSignatureValid(fullLicense, instId)
    expect(isValid).toBe(true)

    // Simulate local file tampering by changing status or expiry without signature
    const tampered = { ...fullLicense, status: "ACTIVE", expiresAt: "2099-12-31" } as LicenseInfo
    const isTamperedValid = await isLocalLicenseSignatureValid(tampered, instId)
    expect(isTamperedValid).toBe(false)
  })

  it("evaluates operating permission correctly for states", () => {
    const activeLic: Partial<LicenseInfo> = { status: "ACTIVE" }
    const graceLic: Partial<LicenseInfo> = { status: "OFFLINE_GRACE" }
    const deactivatedLic: Partial<LicenseInfo> = { status: "DEACTIVATED" }
    const suspendedLic: Partial<LicenseInfo> = { status: "SUSPENDED" }
    const notActivatedLic: Partial<LicenseInfo> = { status: "NOT_ACTIVATED" }

    expect(isLicenseOperatingAllowed(activeLic as LicenseInfo)).toBe(true)
    expect(isLicenseOperatingAllowed(graceLic as LicenseInfo)).toBe(true)
    expect(isLicenseOperatingAllowed(deactivatedLic as LicenseInfo)).toBe(false)
    expect(isLicenseOperatingAllowed(suspendedLic as LicenseInfo)).toBe(false)
    expect(isLicenseOperatingAllowed(notActivatedLic as LicenseInfo)).toBe(false)
  })

  it("calculates 7-day offline grace period", () => {
    const baseDate = "2026-10-02T10:00:00.000Z"
    const graceUntil = calculateGraceUntil(baseDate, 7)
    const diffDays = (new Date(graceUntil).getTime() - new Date(baseDate).getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBe(7)
  })

  it("detects tampered local license on initialization and sets status to VERIFICATION_ERROR", async () => {
    const instId = getOrCreateInstallationId()
    const db = createEmptyDatabase()
    db.license = {
      status: "ACTIVE",
      licenseId: "LIC-123",
      licenseKeyMasked: "LDK-****-****-****-1234",
      customerId: "CUST-1",
      customerName: "Test",
      licensedTo: "Test Lab",
      plan: "PROFESSIONAL",
      issuedAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(),
      expiresAt: "2099-01-01",
      lastCheckInAt: new Date().toISOString(),
      serverTimeAtCheck: new Date().toISOString(),
      graceUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
      maxInstallations: 1,
      installationId: instId,
      signature: "INVALID_TAMPERED_HASH",
      seatLimit: 1,
      features: [],
    }

    const evaluated = await initializeLicenseState(db)
    expect(evaluated.status).toBe("VERIFICATION_ERROR")
  })

  describe("manual refresh", () => {
    const activatedDb = async (): Promise<LabDatabase> => {
      const instId = getOrCreateInstallationId()
      const license: LicenseInfo = {
        ...createEmptyDatabase().license,
        licenseId: "LDK-A1B2-C3D4-E5F6-7890",
        status: "ACTIVE",
        customerId: "CUST-11",
        licensedTo: "Verification Laboratory",
        expiresAt: "2099-01-01T00:00:00.000Z",
        activatedAt: new Date().toISOString(),
        // Checked seconds ago, so the 24-hour throttle would skip the cloud.
        lastCheckInAt: new Date().toISOString(),
        serverTimeAtCheck: new Date().toISOString(),
        graceUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
        installationId: instId,
        seatLimit: 1,
        features: [],
      }
      license.signature = await computeLicenseSignature(license, instId)
      const db = createEmptyDatabase()
      db.license = license
      return db
    }

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it("contacts the cloud even when the automatic check is not due", async () => {
      // First answer is the undeployed Cloud Function, so the check falls
      // through to Firestore, which is where the deactivation now lives.
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 503 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              fields: {
                status: { stringValue: "DEACTIVATED" },
                expiresAt: { stringValue: "2099-01-01T00:00:00.000Z" },
                deactivationReason: { stringValue: "Subscription unpaid." },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      vi.stubGlobal("fetch", fetchMock)

      const result = await refreshLicenseFromCloud(await activatedDb())

      expect(result.contactedCloud).toBe(true)
      expect(result.license.status).toBe("DEACTIVATED")
      expect(result.license.deactivationReason).toBe("Subscription unpaid.")
      expect(isLicenseOperatingAllowed(result.license)).toBe(false)
    })

    it("does not claim success when the cloud cannot be reached", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("offline", { status: 503 })))

      const result = await refreshLicenseFromCloud(await activatedDb())

      expect(result.contactedCloud).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it("leaves an unactivated installation alone", async () => {
      const db = createEmptyDatabase()
      db.license = createEmptyDatabase().license

      const result = await refreshLicenseFromCloud(db)

      expect(result.contactedCloud).toBe(false)
      expect(result.license.status).toBe("NOT_ACTIVATED")
    })
  })

  describe("Seat registration for installs that predate seats", () => {
    const instId = getOrCreateInstallationId()
    /** Checked two days ago, so the scheduled check is due on start-up. */
    const TWO_DAYS_AGO = new Date(Date.now() - 2 * 86400000).toISOString()

    const dbWithLicense = async (overrides: Partial<LicenseInfo> = {}): Promise<LabDatabase> => {
      const license: LicenseInfo = {
        ...createEmptyDatabase().license,
        licenseId: "LDK-A1B2-C3D4-E5F6-7890",
        status: "ACTIVE",
        customerId: "CUST-11",
        licensedTo: "Verification Laboratory",
        expiresAt: "2099-01-01T00:00:00.000Z",
        activatedAt: TWO_DAYS_AGO,
        lastCheckInAt: TWO_DAYS_AGO,
        serverTimeAtCheck: TWO_DAYS_AGO,
        graceUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
        maxInstallations: 1,
        installationId: instId,
        seatLimit: 1,
        features: [],
        ...overrides,
      }
      license.signature = await computeLicenseSignature(license, instId)
      const db = createEmptyDatabase()
      db.license = license
      return db
    }

    const seatDocument = (ids: string[], status = "ACTIVE") =>
      new Response(
        JSON.stringify({
          fields: {
            status: { stringValue: status },
            expiresAt: { stringValue: status === "EXPIRED" ? "2020-01-01T00:00:00.000Z" : "2099-01-01T00:00:00.000Z" },
            maxInstallations: { integerValue: "1" },
            currentInstallations: { integerValue: String(ids.length) },
            installationIds: { arrayValue: { values: ids.map((id) => ({ stringValue: id })) } },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )

    const ok = () => new Response("{}", { status: 200 })
    const seatWriteHappened = (mock: ReturnType<typeof vi.fn>) =>
      mock.mock.calls.some((call) => String(call[0]).includes("updateMask.fieldPaths=installationIds"))

    afterEach(() => vi.unstubAllGlobals())

    it("claims a seat once for an install that never held one", async () => {
      // endpoint probe, status read, publish installation, seat read, seat write
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 503 }))
        .mockResolvedValueOnce(seatDocument([]))
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(seatDocument([]))
        .mockResolvedValueOnce(ok())
      vi.stubGlobal("fetch", fetchMock)

      const license = await initializeLicenseState(await dbWithLicense())

      expect(license.seatClaimedAt).toBeTruthy()
      expect(seatWriteHappened(fetchMock)).toBe(true)
      expect(license.status).toBe("ACTIVE")
    })

    it("never re-claims a seat the vendor already freed", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 503 }))
        .mockResolvedValueOnce(seatDocument([]))
        .mockResolvedValueOnce(ok())
      vi.stubGlobal("fetch", fetchMock)

      const license = await initializeLicenseState(
        await dbWithLicense({ seatClaimedAt: "2026-01-01T00:00:00.000Z" }),
      )

      expect(license.seatClaimedAt).toBe("2026-01-01T00:00:00.000Z")
      expect(seatWriteHappened(fetchMock)).toBe(false)
    })

    it("does not claim a seat while the license is not permitted to run", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 503 }))
        .mockResolvedValueOnce(seatDocument([], "EXPIRED"))
        .mockResolvedValueOnce(ok())
      vi.stubGlobal("fetch", fetchMock)

      const license = await initializeLicenseState(await dbWithLicense())

      expect(license.status).toBe("EXPIRED")
      expect(license.seatClaimedAt).toBeUndefined()
      expect(seatWriteHappened(fetchMock)).toBe(false)
    })

    it("registers an install whose seat is already recorded without writing anything", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 503 }))
        .mockResolvedValueOnce(seatDocument([instId]))
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(seatDocument([instId]))
      vi.stubGlobal("fetch", fetchMock)

      const license = await initializeLicenseState(await dbWithLicense())

      expect(license.seatClaimedAt).toBeTruthy()
      expect(seatWriteHappened(fetchMock)).toBe(false)
    })
  })
})