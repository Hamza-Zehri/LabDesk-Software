/**
 * Desktop bridge.
 *
 * The packaged application runs inside Electron, where the renderer talks to the
 * main process through a narrow, typed API exposed by `electron/preload.cjs` on
 * `window.labdesk`. When the same UI is opened in a plain browser the bridge is
 * absent and every caller falls back to web behaviour (for example
 * `window.print()` instead of the native print dialog).
 */

export type PaperSize = "A4" | "Letter" | "Thermal58" | "Thermal80"

export type PrintOptions = {
  /** OS printer name. An empty value uses the system default printer. */
  printerName?: string
  copies?: number
  landscape?: boolean
  pageSize?: PaperSize
}

export type PdfOptions = {
  /** Suggested file name shown in the save dialog. */
  defaultFileName?: string
  landscape?: boolean
  pageSize?: PaperSize
}

export type PrintResult = { ok: boolean; reason?: string }
export type PdfResult = { ok: boolean; canceled?: boolean; path?: string; error?: string }

export type LabDeskBridge = {
  platform: string
  window: {
    minimize: () => void
    toggleMaximize: () => void
    toggleFullscreen: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onMaximizedChange: (listener: (value: boolean) => void) => () => void
  }
  printers: {
    list: () => Promise<string[]>
    print: (options: PrintOptions) => Promise<PrintResult>
    savePDF: (options: PdfOptions) => Promise<PdfResult>
  }
}

declare global {
  interface Window {
    labdesk?: LabDeskBridge
  }
}

/** Returns the desktop bridge when running inside the packaged application. */
export const getBridge = (): LabDeskBridge | undefined =>
  typeof window === "undefined" ? undefined : window.labdesk

export const isDesktop = (): boolean => Boolean(getBridge())
