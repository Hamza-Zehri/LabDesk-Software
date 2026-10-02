/**
 * Installation ID Generator & Manager.
 *
 * Every LabDesk installation generates a persistent, unique installation UUID on first run.
 * It is used for cloud license activation and heartbeats.
 */

const INSTALLATION_UUID_STORAGE_KEY = "labdesk:installation_uuid"

export function getOrCreateInstallationId(): string {
  try {
    const existing = globalThis.localStorage?.getItem(INSTALLATION_UUID_STORAGE_KEY)
    if (existing && existing.startsWith("LABDESK-INSTALLATION-UUID-")) {
      return existing
    }
    const newId = generateInstallationUuid()
    globalThis.localStorage?.setItem(INSTALLATION_UUID_STORAGE_KEY, newId)
    return newId
  } catch {
    return generateInstallationUuid()
  }
}

function generateInstallationUuid(): string {
  const hex = () => Math.random().toString(16).substring(2, 6)
  const part1 = hex() + hex()
  const part2 = hex()
  const part3 = hex()
  const part4 = hex()
  const part5 = hex() + hex() + hex()
  return `LABDESK-INSTALLATION-UUID-${part1}-${part2}-${part3}-${part4}-${part5}`.toUpperCase()
}
