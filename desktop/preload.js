/**
 * Preload script — exposes native file dialog APIs to the renderer
 * via contextBridge so the web app can open/save .sav files directly.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  /** Opens a native file dialog to select a .sav file. Returns { path, data (base64) } or null. */
  openSave: () => ipcRenderer.invoke("dialog:openSave"),

  /** Opens a native save dialog. Writes base64 data to the chosen path. Returns the path or null. */
  saveSave: (data, defaultName) =>
    ipcRenderer.invoke("dialog:saveSave", { data, defaultName }),

  /** True when running inside Electron (vs. web browser). */
  isElectron: true,
});
