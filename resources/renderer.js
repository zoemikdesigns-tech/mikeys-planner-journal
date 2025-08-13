const updStatusHook = (msg)=>{ const s=document.getElementById('saveStatus'); if(s){ s.textContent=msg; setTimeout(()=>{ if(s.textContent===msg) s.textContent=''; }, 8000); } };
if (window.api && window.api.onUpdateStatus) { window.api.onUpdateStatus(updStatusHook); }

const $ = (sel) => document.querySelector(sel);
let state = null;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "checked") node.checked = !!v;
    else node.setAttribute(k, v);
  });
  children.forEach(c => { if (c == null) return; if (typeof c === "string") node.appendChild(document.createTextNode(c)); else node.appendChild(c); });
  return node;
}

function humanDayName(d) { return ({Mon:"Monday", Tue:"Tuesday", Wed:"Wednesday", Thu:"Thursday", Fri:"Friday"})[d] || d; }
function days() { return ["Mon","Tue","Wed","Thu","Fri"]; }
function isWorkBlock(b) { return !b.isBreak; }

const MOTIVATION = [
  "Small steps daily beat heroic sprints done never.",
  "Win the morning. Win the day.",
  "Momentum > Motivation. Do the next right thing.",
  "Consistency compounds. Show up.",
  "Perfect is the enemy of done.",
  "Today’s reps build tomorrow’s strength.",
  "Be the person your goals need.",
  "Little progress is still progress.",
  "Discipline is doing it after the mood has left.",
  "Creativity favors the prepared mind."
];

const MORNING_PROMPTS = [
  "What’s one thing I’m grateful for today?",
  "What’s my top priority for today?",
  "One thing I’ll do to make today great is…",
  "What habit am I working on this week?",
  "Who could I reach out to or connect with today?",
  "What’s one thing I’ll avoid doing to stay productive?",
  "How will I show kindness today?",
  "What is today’s gym/workout focus?",
  "How will I challenge myself today?",
  "A motivational thought or quote for today is…"
];

const EVENING_PROMPTS = [
  "What’s one win I had today?",
  "What challenged me most today?",
  "Did I stay on track with my top priority? Why/why not?",
  "What did I learn today?",
  "How did I take care of my body and mind today?",
  "What am I proud of from today?",
  "Did I stick to my habit goal?",
  "What could I improve tomorrow?",
  "Who/what am I grateful for right now?",
  "A thought or feeling I want to remember from today is…"
];

function computeDailyPct(dayList) {
  let total = 0, done = 0;
  dayList.forEach(b => { if (isWorkBlock(b)) { total++; if (b.done) done++; } });
  return total ? Math.round((done/total)*100) : 0;
}
function computeWeekPct(schedule) {
  let total = 0, done = 0;
  days().forEach(d => (schedule[d]||[]).forEach(b => { if (isWorkBlock(b)) { total++; if (b.done) done++; } }));
  return total ? Math.round((done/total)*100) : 0;
}
function todayKey() {
  const jsDay = new Date().getDay(); // 0 Sun..6 Sat
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][jsDay];
}

function renderHome() {
  // Daily motivation
  const m = MOTIVATION[new Date().getDate() % MOTIVATION.length];
  $("#motivationText").textContent = m;

  if (!state.meta) state.meta = {};
  if (!state.meta.streak) state.meta.streak = { current: 0, best: 0, lastCalc: "" };

  let tkey = todayKey();
  let todayPctNum = 0;
  if (["Mon","Tue","Wed","Thu","Fri"].includes(tkey)) {
    todayPctNum = computeDailyPct(state.schedule[tkey] || []);
  }

  // Streak logic: increment if today is 100%, else reset on weekdays
  const lastCalc = state.meta.streak.lastCalc || "";
  const todayISO = new Date().toISOString().slice(0,10);
  if (lastCalc !== todayISO) {
    if (todayPctNum === 100) state.meta.streak.current += 1;
    else if (["Mon","Tue","Wed","Thu","Fri"].includes(tkey)) state.meta.streak.current = 0;
    state.meta.streak.best = Math.max(state.meta.streak.best, state.meta.streak.current);
    state.meta.streak.lastCalc = todayISO;
  }

  $("#streakNow").textContent = state.meta.streak.current;
  $("#streakBest").textContent = state.meta.streak.best;
  $("#todayPct").textContent = `${todayPctNum}%`;
  $("#weekPct").textContent = `${computeWeekPct(state.schedule)}%`;

  // Week glance cards
  const wrap = $("#homeWeekGlance");
  wrap.innerHTML = "";
  const list = el("div", { class: "grid two" });
  ["Mon","Tue","Wed","Thu","Fri"].forEach(d=>{
    list.appendChild(el("div",{class:"row"}, el("div",{class:"title"}, humanDayName(d)), el("div",{}, `${computeDailyPct(state.schedule[d]||[])}%`)));
  });
  wrap.appendChild(list);
}

function renderSchedule() {
  const container = $("#scheduleContainer"); container.innerHTML = "";
  days().forEach(day => {
    const panel = el("div", { class: "panel" }, el("h3", {}, humanDayName(day)));
    const list = el("div", {});
    (state.schedule[day] || []).forEach(blk => {
      const row = el("div", { class: "row" + (blk.isBreak ? " break" : "") });
      row.appendChild(el("div", { class: "time" }, blk.time));
      row.appendChild(el("div", { class: "title" }, blk.title));
      const cb = el("input", { type: "checkbox", checked: !!blk.done, oninput: (e) => { blk.done = e.target.checked; renderHome(); renderReview(); } });
      row.appendChild(cb);
      list.appendChild(row);
    });
    panel.appendChild(list);
    container.appendChild(panel);
  });
}

function renderGym() {
  const info = $("#gymInfo"); const container = $("#gymContainer");
  info.innerHTML = ""; container.innerHTML = "";
  const infoBar = el("div", { class: "panel" },
    el("span", { class: "badge" }, `Program: ${state.gym.currentProgram}`),
    el("span", { class: "badge" }, `Week ${state.gym.week}`),
    el("span", { class: "badge" }, `Dumbbells: 6kg`),
    el("div", { class: "small", style: "margin-top:6px" }, "Mon/Wed/Fri = Day A (Upper), Tue/Thu = Day B (Lower & Core)")
  ); info.appendChild(infoBar);

  days().forEach(day => {
    const planType = (["Mon","Wed","Fri"].includes(day)) ? "A" : "B";
    const dayPanel = el("div", { class: "panel" }, el("h3", {}, `${humanDayName(day)} — Day ${planType}`));
    const exList = el("div", {});
    (state.gym.plans[planType] || []).forEach(ex => {
      const row = el("div", { class: "row" });
      row.appendChild(el("div", { class: "title" }, `${ex.name} — ${ex.sets || 3}×${ex.type==='time'?(ex.targetTime || '30s'):(ex.targetReps || 10)} ${ex.type==='time'?'hold':'reps'}`));
      const done = el("input", { type: "checkbox", checked: !!state.gym.log[day]?.completed, oninput: (e) => {
        if (!state.gym.log[day]) state.gym.log[day] = { type: `Day ${planType}`, completed: false, notes: "" };
        state.gym.log[day].completed = e.target.checked; state.gym.log[day].type = `Day ${planType}`;
        renderReview(); renderHome();
      }});
      row.appendChild(done); exList.appendChild(row);
    });
    const notes = el("textarea", { placeholder: "Notes for today (optional)" }, state.gym.log[day]?.notes || "");
    notes.addEventListener("input", () => { if (!state.gym.log[day]) state.gym.log[day] = { type:`Day ${planType}`, completed:false, notes:'' }; state.gym.log[day].notes = notes.value; });
    dayPanel.appendChild(exList); dayPanel.appendChild(el("label", { class: "block" }, "Notes")); dayPanel.appendChild(notes);
    container.appendChild(dayPanel);
  });
}

function renderPrompts(container, key, prompts) {
  container.innerHTML = "";
  const today = todayKey();
  if (!state.journal[today]) state.journal[today] = {};
  if (!state.journal[today][key]) state.journal[today][key] = {}; // map qIndex -> text
  prompts.forEach((q, idx) => {
    const block = el("div", { class: "prompt" }, el("h4", {}, `${idx+1}. ${q}`), el("textarea", {}, state.journal[today][key][idx] || ""));
    const area = block.querySelector("textarea");
    area.addEventListener("input", () => { state.journal[today][key][idx] = area.value; });
    container.appendChild(block);
  });
}

function renderJournal() {
  renderPrompts($("#morningPrompts"), "morningPrompts", MORNING_PROMPTS);
  renderPrompts($("#eveningPrompts"), "eveningPrompts", EVENING_PROMPTS);
}

function renderHistory() {
  const wrap = $("#historyContainer"); wrap.innerHTML = "";
  if (!window.api.listHistory) { wrap.appendChild(el("div",{class:"small"},"History not available.")); return; }
  window.api.listHistory().then(res=>{
    if (!res || !res.ok || !res.list.length) { wrap.appendChild(el("div",{class:"small"},"No history yet — export a weekly summary (Friday) to create one.")); return; }
    const list = el("div", { class: "grid two" });
    res.list.forEach(item => {
      const card = el("div", { class: "row" },
        el("div", { class: "title" }, `Week starting ${item.weekStart}`),
        el("button", { onclick: async () => { await window.api.restoreHistoryWeek(item.weekStart); state = await window.api.loadData(); renderAll(); } }, "Restore")
      );
      list.appendChild(card);
    });
    wrap.appendChild(list);
  });
}

function renderReview() {
  const container = $("#reviewContainer"); container.innerHTML = "";
  const pct = computeWeekPct(state.schedule);
  const panel = el("div", { class: "panel" },
    el("h3", {}, "This Week at a Glance"),
    el("div", {}, "Work block completion: ", el("span", { class: "badge " + (pct >= 80 ? "good" : "warn") }, `${pct}%`)),
    el("ul", { class: "clean" },
      el("li", {}, "Aim for 80%+ consistency before increasing intensity."),
      el("li", {}, "Use \"Level Up Week\" to auto-increase reps (max 15) and add a set every 4 weeks.")
    )
  );
  container.appendChild(panel);
  renderHistory();
}

function renderAll() { renderHome(); renderSchedule(); renderGym(); renderJournal(); renderReview(); }

async function save() { await window.api.saveData(state); const s=$("#saveStatus"); s.textContent="Saved ✓"; setTimeout(()=> s.textContent="", 2000); }

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tab-button").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll(".tab-button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.tab;
      document.querySelectorAll(".tab").forEach(sec=>sec.classList.remove("active"));
      document.getElementById(target).classList.add("active");
    });
  });

  $("#saveBtn").addEventListener("click", save);
  $("#exportSummary").addEventListener("click", async () => {
    const now=new Date(); const day=now.getDay(); const diffToMonday=(day===0?-6:1-day);
    const monday=new Date(now); monday.setDate(now.getDate()+diffToMonday);
    await window.api.exportWeeklySummary(monday.toISOString());
  });
  $("#exportLastWeek").addEventListener("click", async ()=>{ const r = await window.api.exportLastWeekJson?.(); if (!r || !r.ok) alert(r?.error || "No last week snapshot found yet. Export this week first on Friday."); });
  $("#importWeek").addEventListener("click", async ()=>{ const r = await window.api.importWeekJson?.(); if (r && r.ok) { state = await window.api.loadData(); renderAll(); } });
  $("#incrementWeek").addEventListener("click", async ()=>{ await window.api.incrementWeek(); state = await window.api.loadData(); renderAll(); });
  $("#checkUpdates").addEventListener("click", async ()=>{ await window.api.checkForUpdates?.(); });

  (async ()=>{ state = await window.api.loadData(); if (!state.meta) state.meta = {}; renderAll(); })();
});

/* === Update UI wiring === */
(function(){
  const updStatusHook = (msg)=>{
    const s=document.getElementById('saveStatus');
    if(s){ s.textContent=msg; setTimeout(()=>{ if(s.textContent===msg) s.textContent=''; }, 8000); }
  };
  if (window.api && window.api.onUpdateStatus) { window.api.onUpdateStatus(updStatusHook); }

  document.addEventListener('DOMContentLoaded', ()=>{
    const cu = document.getElementById('checkUpdates');
    if (cu) {
      cu.addEventListener('click', async ()=>{
        const s = document.getElementById('saveStatus');
        if (s) s.textContent = 'Checking for updates…';
        try {
          const res = await window.api.checkForUpdates();
          if (!res?.ok && s) s.textContent = 'Update check failed';
        } catch {
          if (s) s.textContent = 'Update check failed';
        }
        setTimeout(()=>{
          const s2=document.getElementById('saveStatus');
          if (s2 && s2.textContent==='Checking for updates…') s2.textContent='';
        }, 4000);
      });
    }
  });
})();
