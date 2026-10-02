const { app, BrowserWindow, Menu, dialog, shell, protocol, ipcMain } = require("electron")
const path = require("node:path")
const fs = require("node:fs")

/**
 * LabDesk desktop entry point.
 *
 * The renderer is the same static bundle the web build produces. It is served
 * over a privileged custom `app://` scheme rather than `file://`: the bundle
 * uses `<script type="module">` and `crossorigin` assets, which a `file://`
 * origin blocks via CORS. A standard, secure scheme gives the renderer a real
 * origin, so the CSS and JS load normally and localStorage persists per user
 * under the app's user-data directory.
 */

const APP_ID = "com.brightpixel.labdesk"
const CREDIT = "Software by Engr. Hamza Asad"
const WEBSITE = "Brightpixel.vercel.app"

const SCHEME = "app"
const HOST = "bundle"
const DIST_DIR = path.join(__dirname, "..", "dist")
const START_URL = `${SCHEME}://${HOST}/index.html`

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".txt": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
}

// Page sizes in microns (Electron's unit for custom page sizes). The two
// thermal options describe a continuous roll, so the height is generous.
const PAPER_SIZES = {
  A4: { width: 210000, height: 297000 },
  Letter: { width: 215900, height: 279400 },
  Thermal58: { width: 58000, height: 300000 },
  Thermal80: { width: 80000, height: 300000 },
}

/** The window created at start-up, used as a fallback for IPC senders. */
let mainWindow = null

app.setAppUserModelId(APP_ID)

// Must run before the app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

function resolveAssetPath(pathname) {
  const safe = path
    .normalize(decodeURIComponent(pathname))
    .replace(/^[/\\]+/, "")
  const resolved = path.resolve(DIST_DIR, safe)
  return resolved.startsWith(DIST_DIR) ? resolved : null
}

function registerAppProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const { pathname } = new URL(request.url)
    const filePath = resolveAssetPath(pathname)

    if (filePath) {
      try {
        const data = await fs.promises.readFile(filePath)
        const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream"
        return new Response(data, { headers: { "content-type": type } })
      } catch {
        // fall through to the shell for client-side routes without an extension
      }
    }

    try {
      const html = await fs.promises.readFile(path.join(DIST_DIR, "index.html"))
      return new Response(html, { headers: { "content-type": "text/html" } })
    } catch {
      return new Response("Not found", { status: 404 })
    }
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#f7f9fb",
    title: "LabDesk",
    // The application draws its own title bar, so the native frame is hidden.
    frame: false,
    autoHideMenuBar: true,
    icon: path.join(DIST_DIR, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow = win
  win.loadURL(START_URL)

  // Tell the renderer when the window is maximized or restored so its title bar
  // can show the correct control.
  win.on("maximize", () => win.webContents.send("window:maximized-changed", true))
  win.on("unmaximize", () => win.webContents.send("window:maximized-changed", false))
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null
  })

  // Any external link opens in the user's browser, never inside the app shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) shell.openExternal(url)
    return { action: "deny" }
  })

  return win
}

const senderWindow = (event) => BrowserWindow.fromWebContents(event.sender) || mainWindow

/** Window controls and printing, exposed to the renderer through the preload. */
function registerIpcHandlers() {
  ipcMain.on("window:minimize", (event) => senderWindow(event)?.minimize())

  ipcMain.on("window:toggle-maximize", (event) => {
    const win = senderWindow(event)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on("window:toggle-fullscreen", (event) => {
    const win = senderWindow(event)
    if (win) win.setFullScreen(!win.isFullScreen())
  })

  ipcMain.on("window:close", (event) => senderWindow(event)?.close())

  ipcMain.handle("window:is-maximized", (event) => senderWindow(event)?.isMaximized() ?? false)

  ipcMain.handle("printers:list", async (event) => {
    const win = senderWindow(event)
    if (!win) return []
    try {
      const printers = await win.webContents.getPrintersAsync()
      return printers.map((printer) => printer.name).filter(Boolean)
    } catch {
      return []
    }
  })

  ipcMain.handle("print:document", (event, options = {}) => {
    const win = senderWindow(event)
    if (!win) return { ok: false, reason: "No window is available." }
    const pageSize = options.pageSize ? PAPER_SIZES[options.pageSize] || options.pageSize : undefined
    return new Promise((resolve) => {
      try {
        win.webContents.print(
          {
            // A named printer prints without a dialog; otherwise the user is
            // asked to choose, which is what the gear control implies.
            silent: Boolean(options.printerName),
            printBackground: true,
            deviceName: options.printerName || undefined,
            copies: options.copies && options.copies > 0 ? options.copies : 1,
            landscape: Boolean(options.landscape),
            pageSize,
          },
          (success, failureReason) =>
            resolve(success ? { ok: true } : { ok: false, reason: String(failureReason || "") }),
        )
      } catch (error) {
        resolve({ ok: false, reason: error.message })
      }
    })
  })

  ipcMain.handle("print:pdf", async (event, options = {}) => {
    const win = senderWindow(event)
    if (!win) return { ok: false, error: "No window is available." }
    try {
      const data = await win.webContents.printToPDF({
        printBackground: true,
        landscape: Boolean(options.landscape),
        pageSize: options.pageSize ? PAPER_SIZES[options.pageSize] || options.pageSize : "A4",
      })
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: "Save as PDF",
        defaultPath: options.defaultFileName || "document.pdf",
        filters: [{ name: "PDF document", extensions: ["pdf"] }],
      })
      if (canceled || !filePath) return { ok: false, canceled: true }
      await fs.promises.writeFile(filePath, data)
      return { ok: true, path: filePath }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  })
}

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [{ role: "quit", label: "Exit" }],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About LabDesk",
          click: () => {
            dialog
              .showMessageBox({
                type: "info",
                title: "About LabDesk",
                message: "LabDesk - Laboratory Management System",
                detail: `Version ${app.getVersion()}\n\n${CREDIT}\n${WEBSITE}`,
                buttons: ["OK"],
              })
              .catch(() => {})
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  registerAppProtocol()
  registerIpcHandlers()
  buildMenu()
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
