/**
 * Firebase Cloud Functions for LabDesk Commercial Licensing System.
 *
 * Project ID: labdesk-85655
 * Project Number: 750773926472
 */

import * as functions from "firebase-functions"
import * as admin from "firebase-admin"

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

/**
 * 1. Activation Cloud Function
 */
export const activateLicense = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*")
  res.set("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.status(204).send("")
    return
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed. Use POST." })
    return
  }

  try {
    const { licenseKey, installationId, laboratoryName, appVersion } = req.body || {}

    if (!licenseKey || !installationId) {
      res.status(400).json({ ok: false, error: "licenseKey and installationId are required." })
      return
    }

    const cleanKey = String(licenseKey).trim().toUpperCase()
    let licenseRef = db.collection("licenses").doc(cleanKey)
    let doc = await licenseRef.get()

    if (!doc.exists) {
      // Query by licenseKeyHash or key search
      const snapshot = await db.collection("licenses").where("licenseKeyMasked", "==", cleanKey).get()
      if (!snapshot.empty) {
        doc = snapshot.docs[0]
        licenseRef = doc.ref
      }
    }

    if (!doc.exists) {
      res.status(404).json({ ok: false, error: "License key was not found." })
      return
    }

    const data = doc.data() || {}
    const status = data.status || "ACTIVE"
    const expiresAt = data.expiresAt || new Date(Date.now() + 365 * 86400000).toISOString()
    const maxInstallations = data.maxInstallations || 1
    const installationIds: string[] = data.installationIds || []
    const nowIso = new Date().toISOString()

    if (status !== "ACTIVE") {
      res.status(403).json({
        ok: false,
        error: `This license is currently ${status}. ${data.deactivationReason ? "Reason: " + data.deactivationReason : ""}`,
        status,
      })
      return
    }

    if (new Date(expiresAt).getTime() < new Date(nowIso).getTime()) {
      res.status(403).json({ ok: false, error: "This license has expired.", status: "EXPIRED" })
      return
    }

    if (!installationIds.includes(installationId)) {
      if (installationIds.length >= maxInstallations) {
        res.status(403).json({
          ok: false,
          error: `Your license has reached its allowed installation limit (${installationIds.length}/${maxInstallations}).`,
        })
        return
      }
      installationIds.push(installationId)
    }

    await licenseRef.update({
      installationIds,
      currentInstallations: installationIds.length,
      lastCheckInAt: nowIso,
      activatedAt: data.activatedAt || nowIso,
      updatedAt: nowIso,
    })

    // Register installation doc
    await db.collection("installations").doc(installationId).set(
      {
        installationId,
        licenseId: doc.id,
        laboratoryName: laboratoryName || data.laboratoryName,
        appVersion: appVersion || "1.0.0",
        lastSeenAt: nowIso,
        status: "ACTIVE",
      },
      { merge: true },
    )

    const graceUntil = new Date(Date.now() + 7 * 86400000).toISOString()

    res.status(200).json({
      ok: true,
      licenseId: doc.id,
      customerId: data.customerId || "CUST-101",
      customerName: data.customerName || data.laboratoryName,
      laboratoryName: data.laboratoryName || laboratoryName,
      plan: data.plan || "PROFESSIONAL",
      expiresAt,
      serverTime: nowIso,
      graceUntil,
      maxInstallations,
      message: "License successfully activated.",
    })
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message })
  }
})

/**
 * 2. Heartbeat License Verification Cloud Function
 */
export const checkLicense = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*")
  res.set("Access-Control-Allow-Headers", "Content-Type")

  const licenseId = String(req.query.licenseId || req.body?.licenseId || "").trim()
  const installationId = String(req.query.installationId || req.body?.installationId || "").trim()

  if (!licenseId) {
    res.status(400).json({ ok: false, error: "licenseId is required." })
    return
  }

  try {
    const doc = await db.collection("licenses").doc(licenseId).get()
    if (!doc.exists) {
      res.status(404).json({ ok: false, error: "License not found.", status: "NOT_ACTIVATED" })
      return
    }

    const data = doc.data() || {}
    const status = data.status || "ACTIVE"
    const expiresAt = data.expiresAt || new Date(Date.now() + 365 * 86400000).toISOString()
    const nowIso = new Date().toISOString()

    // Update last check-in timestamp
    await doc.ref.update({ lastCheckInAt: nowIso, updatedAt: nowIso })

    if (installationId) {
      await db.collection("installations").doc(installationId).set(
        { lastSeenAt: nowIso },
        { merge: true },
      )
    }

    const graceUntil = new Date(Date.now() + 7 * 86400000).toISOString()

    res.status(200).json({
      ok: true,
      status,
      licenseId: doc.id,
      expiresAt,
      serverTime: nowIso,
      graceUntil,
      deactivationReason: data.deactivationReason || "",
    })
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message })
  }
})
