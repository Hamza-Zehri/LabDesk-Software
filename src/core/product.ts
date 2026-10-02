/**
 * Product identity.
 *
 * These values describe the *software*, not the laboratory that installs it.
 * Everything a customer can rebrand (laboratory name, logo, contact details,
 * report and receipt wording) lives in configuration instead — see
 * `src/core/types.ts` and `src/core/defaults.ts`.
 */

/** Permanent product name. Never derived from customer configuration. */
export const PRODUCT_NAME = "LabDesk"

/** Permanent product subtitle. */
export const PRODUCT_SUBTITLE = "Laboratory Management System"

/** Semantic version of the shipped application. */
export const PRODUCT_VERSION = "1.0.0"

/** Readable description of the product for the About screen. */
export const PRODUCT_DESCRIPTION =
  "Desktop laboratory management and reporting software for diagnostic laboratories, pathology centers, hospital laboratories and private diagnostic centers."

/** Persistent vendor attribution. Displayed subtly, never as customer identity. */
export const VENDOR = {
  developer: "Engr. Hamza Asad",
  website: "Brightpixel.vercel.app",
  websiteUrl: "https://brightpixel.vercel.app",
  credit: "Software by Engr. Hamza Asad",
  websiteLine: "Brightpixel.vercel.app",
} as const

/** Runtime technology facts reported on the About screen. */
export const TECHNOLOGY = {
  runtime: "React 19 + Vite",
  styling: "Tailwind CSS v4",
  language: "TypeScript",
  storage: "Local installation database (browser storage adapter)",
} as const

/**
 * Storage key namespace. One installation owns one namespace, which keeps
 * customer data isolated from any other installation or from demo data.
 */
export const STORAGE_NAMESPACE = "labdesk"

/** Separator between the product namespace and an installation-scoped key. */
export const STORAGE_SEPARATOR = ":"
