/**
 * BL4 AIO Editor — Electron Main Process
 *
 * 1. Starts the Fastify API server (embedded)
 * 2. Opens a BrowserWindow pointing at the bundled Vite frontend
 * 3. Provides native file dialogs for .sav open/save
 */
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const { fork } = require("child_process");

// Paths relative to the packaged app
const isDev = !app.isPackaged;
const API_ENTRY = isDev
  ? path.join(__dirname, "..", "api", "dist", "index.js")
  : path.join(process.resourcesPath, "api-dist", "index.js");
const WEB_DIST = isDev
  ? path.join(__dirname, "..", "web", "dist")
  : path.join(__dirname, "web-dist");

let mainWindow = null;
let apiProcess = null;
const API_PORT = 17069; // local-only port for embedded API

function startApi() {
  return new Promise((resolve, reject) => {
    apiProcess = fork(API_ENTRY, [], {
      env: { ...process.env, PORT: String(API_PORT), HOST: "127.0.0.1" },
      stdio: "pipe",
    });

    apiProcess.stdout?.on("data", (data) => {
      const msg = data.toString();
      console.log("[API]", msg.trim());
      if (msg.includes("listening") || msg.includes("Server listening")) {
        resolve();
      }
    });

    apiProcess.stderr?.on("data", (data) => {
      console.error("[API ERR]", data.toString().trim());
    });

    apiProcess.on("error", reject);
    apiProcess.on("exit", (code) => {
      console.log(`[API] exited with code ${code}`);
    });

    // Fallback: resolve after 3s even if we don't see "listening"
    setTimeout(resolve, 3000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: "BL4 AIO Editor",
    backgroundColor: "#0a0a12",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    // Dev mode: load from Vite dev server
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load bundled frontend, proxy API calls to embedded server
    mainWindow.loadFile(path.join(WEB_DIST, "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── Native file dialogs via IPC ──────────────────────────────────────────────

ipcMain.handle("dialog:openSave", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open BL4 Save File",
    filters: [
      { name: "BL4 Save Files", extensions: ["sav"] },
      { name: "All Files", extensions: ["*"] },
    ],
    properties: ["openFile"],
    defaultPath: getSaveFolder(),
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const fs = require("fs");
  return {
    path: result.filePaths[0],
    data: fs.readFileSync(result.filePaths[0]).toString("base64"),
  };
});

ipcMain.handle("dialog:saveSave", async (_event, { data, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save BL4 Save File",
    defaultPath: path.join(getSaveFolder(), defaultName || "save.sav"),
    filters: [{ name: "BL4 Save Files", extensions: ["sav"] }],
  });
  if (result.canceled || !result.filePath) return null;
  const fs = require("fs");
  fs.writeFileSync(result.filePath, Buffer.from(data, "base64"));
  return result.filePath;
});

function getSaveFolder() {
  // BL4 default save location on Windows
  const localAppData = process.env.LOCALAPPDATA || "";
  const bl4Path = path.join(localAppData, "Borderlands4", "Saved", "SaveGames");
  const fs = require("fs");
  if (fs.existsSync(bl4Path)) return bl4Path;
  return app.getPath("documents");
}

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  console.log("Starting embedded API server...");
  await startApi();
  console.log(`API running on http://127.0.0.1:${API_PORT}`);
  createWindow();
});

app.on("window-all-closed", () => {
  if (apiProcess) apiProcess.kill();
  app.quit();
});

app.on("before-quit", () => {
  if (apiProcess) apiProcess.kill();
});
