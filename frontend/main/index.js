import _electron from 'electron'
const { app, BrowserWindow, Menu } = _electron
import { join } from 'node:path'
import { bootstrap } from './ipc/register.js'

/** @type {BrowserWindow | null} */
let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(app.getAppPath(), 'dist-electron', 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(join(app.getAppPath(), 'dist', 'index.html'))
  }
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Archivo',
      submenu: [
        { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Vista',
      submenu: [
        { role: 'reload',       label: 'Recargar',             accelerator: 'CmdOrCtrl+R' },
        { role: 'forceReload',  label: 'Recargar (forzado)',   accelerator: 'CmdOrCtrl+Shift+R' },
        { role: 'toggleDevTools', label: 'Herramientas de dev', accelerator: 'F12' },
        { type: 'separator' },
        { role: 'resetZoom',    label: 'Zoom normal',          accelerator: 'CmdOrCtrl+0' },
        { role: 'zoomIn',       label: 'Acercar',              accelerator: 'CmdOrCtrl+=' },
        { role: 'zoomOut',      label: 'Alejar',               accelerator: 'CmdOrCtrl+-' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa', accelerator: 'F11' },
      ],
    },
  ])
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildMenu())
  bootstrap()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
