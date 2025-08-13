const { app, BrowserWindow, ipcMain, dialog, clipboard } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");


//
// ----- Stable userData path + migration (use one folder across all versions) -----
const USER_DIR = path.join(app.getPath('appData'), 'MikeyPlannerJournal');
app.setPath('userData', USER_DIR);

// Try to migrate old data files into this new folder (first run only)
(function migrateOldData(){
  try {
    const targetFile = path.join(USER_DIR, 'planner_data.json');
    if (fs.existsSync(targetFile)) return; // already migrated/exists

    const candidates = [
      // Possible old app names/folders from earlier builds
      path.join(app.getPath('appData'), 'PlannerJournal'),
      path.join(app.getPath('appData'), "Mikey's Planner & Journal"),
      path.join(app.getPath('appData'), 'planner-journal-app'),
      path.join(app.getPath('appData'), 'Planner & Journal'),
    ];
    for (const dir of candidates) {
      try {
        const f = path.join(dir, 'planner_data.json');
        if (fs.existsSync(f)) {
          fs.mkdirSync(USER_DIR, { recursive: true });
          fs.copyFileSync(f, targetFile);
          break;
        }
      } catch {}
    }
  } catch {}
})();
// ----- Paths & data helpers -----
const DATA_FILE = path.join(app.getPath("userData"), "planner_data.json");
function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const defaultData = require(path.join(__dirname, "resources", "defaultData.json"));
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
  }
}
function readData() { ensureDataFile(); return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")); }
function writeData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }

// ----- Week helpers & history -----
function weekStartMonday(date = new Date()) {
  const d = new Date(date);
  const dow = d.getDay(); // Sun 0 .. Sat 6
  const diff = (dow === 0 ? -6 : 1 - dow);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + diff);
  return d;
}
function fmtISO(d){ return d.toISOString().slice(0,10); }

function ensureHistory(data){ if (!data.history) data.history = []; }
function snapshotWeekStart(weekStart) {
  const data = readData(); ensureHistory(data);
  const key = fmtISO(weekStart);
  const snapshot = { schedule:data.schedule, gym:data.gym, journal:data.journal, meta:{ savedAt:new Date().toISOString() } };
  const idx = data.history.findIndex(h => h.weekStart === key);
  if (idx >= 0) data.history[idx].data = snapshot; else data.history.push({ weekStart:key, data:snapshot });
  writeData(data);
}

// ----- Window -----
function createWindow () {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
    title: "Mikey's Planner & Journal v" + app.getVersion()
  });
  win.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();
  try { autoUpdater.checkForUpdatesAndNotify(); } catch (e) { /* ignore */ }
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

// ----- Auto-update events -----
autoUpdater.on("update-available", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send("update-status", "Downloading update…");
});
autoUpdater.on("update-downloaded", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send("update-status", "Update ready — restarting…");
  setTimeout(() => { autoUpdater.quitAndInstall(); }, 1200);
});

// ----- IPC: core data -----
ipcMain.handle("load-data", async () => readData());
ipcMain.handle("save-data", async (_, payload) => { writeData(payload); return { ok:true }; });

// ----- IPC: weekly summary export (also snapshots history) -----
ipcMain.handle("export-weekly-summary", async (_, weekStartISO) => {
  const data = readData();
  const weekStart = new Date(weekStartISO);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 4);
  const fmt = d => d.toISOString().slice(0,10);

  let md = `# Weekly Summary (${fmt(weekStart)} to ${fmt(weekEnd)})\n\n`;
  let totalBlocks = 0, completedBlocks = 0;
  const days = ["Mon","Tue","Wed","Thu","Fri"];
  days.forEach(day => {
    const schedule = data.schedule[day] || [];
    schedule.forEach(block => { if (!block.isBreak) { totalBlocks += 1; if (block.done) completedBlocks += 1; } });
  });
  const pct = totalBlocks ? Math.round((completedBlocks/totalBlocks)*100) : 0;
  md += `**Work Block Completion:** ${completedBlocks}/${totalBlocks} (${pct}%)\n\n`;

  md += `## Gym\n`;
  md += `Program: ${data.gym.currentProgram} | Week: ${data.gym.week}\n\n`;
  md += `**Sessions:**\n`;
  ["Mon","Tue","Wed","Thu","Fri"].forEach(day => {
    const g = data.gym.log[day];
    if (g && g.completed) md += `- ${day}: ${g.type} ✅ (${g.notes || "no notes"})\n`;
    else if (g) md += `- ${day}: ${g.type} — not completed\n`;
  }); md += `\n`;

  md += `## Journaling\n`;
  ["Mon","Tue","Wed","Thu","Fri"].forEach(day => {
    const j = data.journal[day] || {};
    md += `### ${day}\n`;
    md += `**Morning:** ${j.morning?.trim?.() || "-"}\n\n`;
    md += `**Reflection:** ${j.evening?.trim?.() || "-"}\n\n`;
  });

  const { filePath } = await dialog.showSaveDialog({
    title: "Save Weekly Summary",
    defaultPath: `Weekly_Summary_${fmt(weekStart)}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }]
  });

  if (filePath) { fs.writeFileSync(filePath, md, "utf-8"); clipboard.writeText(md); snapshotWeekStart(weekStart); return { ok:true, path:filePath }; }
  else return { ok:false, cancelled:true };
});

// ----- IPC: gym progression -----
ipcMain.handle("increment-week", async () => {
  const data = readData();
  data.gym.week += 1;
  if (!data.gym.progression) data.gym.progression = { addedSetsEvery: 4, maxReps: 15 };
  const prog = data.gym.progression;
  ["A","B"].forEach(planKey => {
    data.gym.plans[planKey].forEach(ex => {
      if (ex.type === "time") return;
      ex.targetReps = Math.min((ex.targetReps || 10) + 1, prog.maxReps);
      if (data.gym.week % prog.addedSetsEvery === 0) ex.sets = (ex.sets || 3) + 1;
    });
  });
  writeData(data);
  return { ok:true, week: data.gym.week };
});

// ----- IPC: history export/import/restore + manual update check -----
ipcMain.handle("export-last-week-json", async () => {
  const data = readData(); ensureHistory(data);
  const lastMonday = weekStartMonday(new Date(Date.now() - 7*24*3600*1000));
  const found = data.history.find(h => h.weekStart === fmtISO(lastMonday));
  if (!found) return { ok:false, error:"No snapshot found for last week." };
  const { filePath } = await dialog.showSaveDialog({ title:"Save Last Week (JSON)", defaultPath:`Week_${fmtISO(lastMonday)}.json`, filters:[{name:"JSON",extensions:["json"]}] });
  if (!filePath) return { ok:false, cancelled:true };
  fs.writeFileSync(filePath, JSON.stringify(found.data, null, 2), "utf-8");
  return { ok:true, path:filePath };
});

ipcMain.handle("import-week-json", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ title:"Import Week JSON", filters:[{name:"JSON",extensions:["json"]}], properties:["openFile"] });
  if (canceled || !filePaths?.length) return { ok:false, cancelled:true };
  const imported = JSON.parse(fs.readFileSync(filePaths[0], "utf-8"));
  const cur = readData(); cur.schedule = imported.schedule ?? cur.schedule; cur.gym = imported.gym ?? cur.gym; cur.journal = imported.journal ?? cur.journal; ensureHistory(cur); writeData(cur);
  return { ok:true };
});

ipcMain.handle("list-history", async () => {
  const data = readData(); ensureHistory(data);
  const list = data.history.sort((a,b)=> (a.weekStart < b.weekStart ? 1 : -1)).slice(0,24).map(h => ({ weekStart:h.weekStart }));
  return { ok:true, list };
});

ipcMain.handle("restore-history-week", async (_, weekStartISO) => {
  const data = readData(); ensureHistory(data);
  const found = data.history.find(h => h.weekStart === weekStartISO);
  if (!found) return { ok:false, error:"Snapshot not found" };
  const snap = found.data; data.schedule = snap.schedule ?? data.schedule; data.gym = snap.gym ?? data.gym; data.journal = snap.journal ?? data.journal; writeData(data);
  return { ok:true };
});

ipcMain.handle("check-for-updates", async () => {
  try { await autoUpdater.checkForUpdatesAndNotify(); return { ok:true }; }
  catch (e) { return { ok:false, error:String(e) }; }
});

