const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  loadData: () => ipcRenderer.invoke("load-data"),
  saveData: (payload) => ipcRenderer.invoke("save-data", payload),
  exportWeeklySummary: (weekStartISO) => ipcRenderer.invoke("export-weekly-summary", weekStartISO),
  incrementWeek: () => ipcRenderer.invoke("increment-week"),

  // Updater
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  onUpdateStatus: (handler) => ipcRenderer.on("update-status", (_evt, msg) => handler && handler(msg))
});
