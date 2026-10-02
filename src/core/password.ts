/**
 * Password hashing.
 *
 * Staff passwords are never stored, logged, backed up as plain text or
 * compared as plain text. Only a PBKDF2-SHA256 digest and its random salt are
 * persisted, so a backup file or a copied database does not reveal passwords.
 *
 * `crypto.subtle` is required. When it is unavailable (an insecure context
 * that browsers deliberately exclude it from) the caller must refuse to create
 * or verify an account rather than fall back to something weaker.
 */

const ITERATIONS = 210_000
const KEY_LENGTH_BITS = 256
const SALT_BYTES = 16

export class PasswordCryptoUnavailableError extends Error {
  constructor() {
    super(
      "Secure password storage is unavailable in this environment. LabDesk will not store a weak password.",
    )
    this.name = "PasswordCryptoUnavailableError"
  }
}

/**
 * Both halves of WebCrypto are required. Checking `subtle` alone is not enough:
 * a context can expose `crypto` while omitting `getRandomValues`, and that
 * would surface as a cryptic `TypeError` from the salt step instead of the
 * message explaining why the account cannot be created.
 */
const webCrypto = (): Crypto => {
  const c = globalThis.crypto
  if (!c?.subtle || typeof c.getRandomValues !== "function") {
    throw new PasswordCryptoUnavailableError()
  }
  return c
}

const subtle = (): SubtleCrypto => webCrypto().subtle

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("")

const fromHex = (hex: string) => {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

const randomSalt = (): string => {
  const bytes = new Uint8Array(SALT_BYTES)
  webCrypto().getRandomValues(bytes)
  return toHex(bytes.buffer)
}

const derive = async (password: string, saltHex: string): Promise<string> => {
  const key = await subtle().importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const bits = await subtle().deriveBits(
    {
      name: "PBKDF2",
      salt: fromHex(saltHex),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    key,
    KEY_LENGTH_BITS,
  )
  return toHex(bits)
}

export type PasswordDigest = { hash: string; salt: string }

export const hashPassword = async (password: string): Promise<PasswordDigest> => {
  const salt = randomSalt()
  return { salt, hash: await derive(password, salt) }
}

export const verifyPassword = async (
  password: string,
  digest: PasswordDigest,
): Promise<boolean> => {
  if (!digest?.hash || !digest?.salt) return false
  const candidate = await derive(password, digest.salt)
  if (candidate.length !== digest.hash.length) return false
  let diff = 0
  for (let i = 0; i < candidate.length; i += 1) {
    diff |= candidate.charCodeAt(i) ^ digest.hash.charCodeAt(i)
  }
  return diff === 0
}

export type PasswordPolicy = {
  minimumPasswordLength: number
  requireMixedCharacterPassword: boolean
}

export type PasswordCheck = { ok: boolean; problems: string[] }

/** Validates a candidate password against the laboratory's security settings. */
export const checkPassword = (
  password: string,
  policy: PasswordPolicy,
): PasswordCheck => {
  const problems: string[] = []
  const minimum = Math.max(1, policy.minimumPasswordLength || 8)
  if (password.length < minimum) {
    problems.push(`Use at least ${minimum} characters.`)
  }
  if (policy.requireMixedCharacterPassword) {
    if (!/[A-Za-z]/.test(password)) problems.push("Include at least one letter.")
    if (!/\d/.test(password)) problems.push("Include at least one number.")
  }
  return { ok: problems.length === 0, problems }
}
