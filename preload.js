const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("api", {
  loadData: () => ipcRenderer.invoke("load-data"),
  saveData: (payload) => ipcRenderer.invoke("save-data", payload),
  exportWeeklySummary: (weekStartISO) => ipcRenderer.invoke("export-weekly-summary", weekStartISO),
  incrementWeek: () => ipcRenderer.invoke("increment-week"),
  exportLastWeekJson: () => ipcRenderer.invoke("export-last-week-json"),
  importWeekJson: () => ipcRenderer.invoke("import-week-json"),
  listHistory: () => ipcRenderer.invoke("list-history"),
  restoreHistoryWeek: (weekStartISO) => ipcRenderer.invoke("restore-history-week", weekStartISO),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates")
});
