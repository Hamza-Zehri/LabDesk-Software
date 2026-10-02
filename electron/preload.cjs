const { contextBridge, ipcRenderer } = require("electron")

/**
 * Desktop bridge.
 *
 * Exposes a small, explicit API to the renderer. Nothing else from Node or
 * Electron is reachable once context isolation is on; every operation here is a
 * named, argument-checked call into the main process.
 */
contextBridge.exposeInMainWorld("labdesk", {
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
    toggleFullscreen: () => ipcRenderer.send("window:toggle-fullscreen"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    onMaximizedChange: (listener) => {
      const handler = (_event, value) => listener(Boolean(value))
      ipcRenderer.on("window:maximized-changed", handler)
      return () => ipcRenderer.removeListener("window:maximized-changed", handler)
    },
  },
  printers: {
    list: () => ipcRenderer.invoke("printers:list"),
    print: (options) => ipcRenderer.invoke("print:document", options),
    savePDF: (options) => ipcRenderer.invoke("print:pdf", options),
  },
})
