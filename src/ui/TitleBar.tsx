/**
 * Custom window title bar.
 *
 * The desktop build hides the native frame so the application draws its own
 * chrome. This bar is draggable, carries the laboratory identity and the current
 * screen, and hosts the window controls. In a plain browser the window controls
 * are omitted and only the identity, screen name and theme switch remain.
 */

import { useEffect, useState } from "react"
import { FlaskConical, Maximize2, Minus, Moon, Square, Sun, X } from "lucide-react"
import { getBridge } from "../core/bridge"
import { PRODUCT_NAME } from "../core/product"

export default function TitleBar({
  labName,
  title,
  theme,
  onToggleTheme,
}: {
  labName: string
  title: string
  theme: "light" | "dark"
  onToggleTheme: () => void
}) {
  const bridge = getBridge()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!bridge) return
    let active = true
    bridge.window.isMaximized().then((value) => {
      if (active) setMaximized(value)
    })
    const off = bridge.window.onMaximizedChange(setMaximized)
    return () => {
      active = false
      off()
    }
  }, [bridge])

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="titlebar-mark">
          <FlaskConical size={16} strokeWidth={2} />
        </span>
        <span className="titlebar-name">{labName || PRODUCT_NAME}</span>
        {title && <span className="titlebar-divider" />}
        {title && <span className="titlebar-page">{title}</span>}
      </div>

      <div className="titlebar-actions">
        <button
          type="button"
          className="titlebar-btn titlebar-theme"
          onClick={onToggleTheme}
          title={theme === "dark" ? "Switch to light appearance" : "Switch to dark appearance"}
          aria-label={theme === "dark" ? "Switch to light appearance" : "Switch to dark appearance"}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {bridge && (
          <>
            <button
              type="button"
              className="titlebar-btn"
              onClick={() => bridge.window.minimize()}
              title="Minimize"
              aria-label="Minimize window"
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              className="titlebar-btn"
              onClick={() => bridge.window.toggleMaximize()}
              title={maximized ? "Restore" : "Maximize"}
              aria-label={maximized ? "Restore window" : "Maximize window"}
            >
              <Square size={13} />
            </button>
            <button
              type="button"
              className="titlebar-btn"
              onClick={() => bridge.window.toggleFullscreen()}
              title="Toggle fullscreen"
              aria-label="Toggle fullscreen"
            >
              <Maximize2 size={15} />
            </button>
            <button
              type="button"
              className="titlebar-btn titlebar-close"
              onClick={() => bridge.window.close()}
              title="Close"
              aria-label="Close window"
            >
              <X size={16} />
            </button>
          </>
        )}
      </div>
    </header>
  )
}
