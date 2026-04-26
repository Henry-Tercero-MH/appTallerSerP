import { app, BrowserWindow } from 'electron'
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
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(app.getAppPath(), 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  // Bootstrap de DB + migraciones + IPC ANTES de abrir la ventana: si una
  // migracion falla, el renderer no debe llegar a cargar la app en estado roto.
  bootstrap()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
