/**
 * Appearance preference.
 *
 * The chosen theme is a device preference, not laboratory data, so it lives in
 * local storage and is applied to the document root before React renders. That
 * keeps sign-in, setup and splash screens consistent with the rest of the
 * application and avoids a flash of the wrong palette on start-up.
 */

export type Theme = "light" | "dark"

const THEME_KEY = "labdesk:theme"

export const readTheme = (): Theme => {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_KEY)
    if (stored === "dark" || stored === "light") return stored
  } catch {
    /* storage can be unavailable; fall through to the default */
  }
  return "light"
}

export const writeTheme = (theme: Theme): void => {
  try {
    globalThis.localStorage?.setItem(THEME_KEY, theme)
  } catch {
    /* a failed preference write must never break the application */
  }
}

export const applyTheme = (theme: Theme): void => {
  const root = document.documentElement
  root.classList.toggle("dark", theme === "dark")
  root.style.colorScheme = theme
}
