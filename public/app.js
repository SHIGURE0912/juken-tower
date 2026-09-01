// 妹の中学受験勉強を記録するアプリのフロントエンド処理

const SUBJECT_COLORS = {
  国語: "#ff6b81",
  算数: "#4a90e2",
  理科: "#4caf50",
  社会: "#ffa726",
};
const SUBJECT_ICONS = {
  国語: "📖",
  算数: "🔢",
  理科: "🔬",
  社会: "🌏",
};
const EVENT_CATEGORIES = {
  test: { label: "テスト", icon: "📝", color: "#e57373" },
  school: { label: "学校", icon: "🏫", color: "#64b5f6" },
  club: { label: "部活", icon: "⚽", color: "#81c784" },
  cram: { label: "塾", icon: "📚", color: "#ffb74d" },
  rest: { label: "休み", icon: "💤", color: "#90a4ae" },
  birthday: { label: "誕生日", icon: "🎂", color: "#f06292" },
  other: { label: "その他", icon: "📌", color: "#9575cd" },
};
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const BADGE_TIERS = [
  { tier: 10, icon: "🥉", name: "はじめの一歩", desc: "10段達成！", grad: "linear-gradient(135deg,#d7b98e,#a97c50)" },
  { tier: 50, icon: "🥈", name: "積み上げ職人", desc: "50段達成！", grad: "linear-gradient(135deg,#e0e0e0,#9e9e9e)" },
  { tier: 100, icon: "🥇", name: "百段の塔", desc: "100段達成！", grad: "linear-gradient(135deg,#ffe082,#ffb300)" },
  { tier: 200, icon: "💎", name: "ダイヤの塔", desc: "200段達成！", grad: "linear-gradient(135deg,#b3e5fc,#0288d1)" },
  { tier: 300, icon: "👑", name: "王様の塔", desc: "300段達成！", grad: "linear-gradient(135deg,#e1bee7,#8e24aa)" },
  { tier: 400, icon: "🌟", name: "伝説の建築士", desc: "400段達成！", grad: "linear-gradient(135deg,#ff8a65,#ff5252,#7c4dff)" },
  { tier: 500, icon: "🏆", name: "殿堂入りタワー", desc: "500段達成！", grad: "linear-gradient(135deg,#fff176,#ff8f00,#7c4dff,#fff176)" },
];

const WORLD_THEMES = [
  { min: 0, name: "はらっぱ", emoji: "🌱", bg: "linear-gradient(#bdeaff,#eaffea)" },
  { min: 10, name: "にほん", emoji: "⛩️", bg: "linear-gradient(#ffe0b2,#fff3e0)" },
  { min: 50, name: "フランス", emoji: "🗼", bg: "linear-gradient(#dcedc8,#f1f8e9)" },
  { min: 100, name: "エジプト", emoji: "🐫", bg: "linear-gradient(#ffe082,#fff8e1)" },
  { min: 200, name: "アメリカ", emoji: "🗽", bg: "linear-gradient(#b3e5fc,#e1f5fe)" },
  { min: 300, name: "やまのくに", emoji: "🏔️", bg: "linear-gradient(#cfd8dc,#eceff1)" },
  { min: 400, name: "たいきけん", emoji: "🌌", bg: "linear-gradient(#7986cb,#303f9f)" },
  { min: 500, name: "うちゅう", emoji: "🚀", bg: "linear-gradient(#0d1333,#1a237e)" },
];

function currentWorldTheme(blockCount) {
  let theme = WORLD_THEMES[0];
  WORLD_THEMES.forEach((t) => {
    if (blockCount >= t.min) theme = t;
  });
  return theme;
}

function badgeInfo(tier) {
  return BADGE_TIERS.find((b) => b.tier === tier) || null;
}

let currentUserName = null;
let myUserId = null;
let profile = null;
let friendsData = { friends: [], incomingRequests: [], outgoingRequests: [] };
let currentChatFriendId = null;
let currentChatFriendName = null;
let currentChatFriendAvatar = { type: null, value: null };
let chatPollInterval = null;
let records = [];
let notes = {};
let goal = { minutesTarget: 0, memo: "" };
let examDay = { date: "", label: "受験本番" };
let events = [];
let scores = [];
let selectedSubject = null;
let selectedGradeSubject = null;
let gradeChartMode = "score";
let timerSeconds = 0;
let timerInterval = null;
let detailDate = null;
let calendarViewDate = new Date();
let selectedEventCategory = null;

// ---------- 日付まわりの小さな関数 ----------

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function calcStreak(recordList) {
  const dateSet = new Set(recordList.map((r) => r.date));
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  if (!dateSet.has(formatDate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (dateSet.has(formatDate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ---------- サーバーとのやりとり ----------

async function fetchRecords() {
  const res = await fetch("/api/records");
  records = await res.json();
}

async function fetchNotes() {
  const res = await fetch("/api/notes");
  notes = await res.json();
}

async function saveNote(date, text) {
  const res = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, text }),
  });
  if (!res.ok) {
    throw new Error("メモの保存に失敗しました");
  }
  if (text.trim() === "") {
    delete notes[date];
  } else {
    notes[date] = text;
  }
}

async function fetchGoal() {
  const res = await fetch("/api/goal");
  goal = await res.json();
}

async function saveGoalApi(minutesTarget, memo) {
  const res = await fetch("/api/goal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minutesTarget, memo }),
  });
  if (!res.ok) throw new Error("目標の保存に失敗しました");
  return res.json();
}

async function fetchExamDay() {
  const res = await fetch("/api/exam-day");
  examDay = await res.json();
}

async function saveExamDayApi(date, label) {
  const res = await fetch("/api/exam-day", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, label }),
  });
  if (!res.ok) throw new Error("日付の保存に失敗しました");
  return res.json();
}

async function fetchEvents() {
  const res = await fetch("/api/events");
  events = await res.json();
}

async function saveEventApi(date, endDate, category, title) {
  const res = await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, endDate, category, title }),
  });
  if (!res.ok) throw new Error("予定の保存に失敗しました");
  return res.json();
}

async function deleteEventApi(id) {
  await fetch(`/api/events/${id}`, { method: "DELETE" });
}

async function fetchScores() {
  const res = await fetch("/api/scores");
  scores = await res.json();
}

async function saveScoreApi(date, subject, score, hensachi, comment) {
  const res = await fetch("/api/scores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, subject, score, hensachi, comment }),
  });
  if (!res.ok) throw new Error("成績の保存に失敗しました");
  return res.json();
}

async function deleteScoreApi(id) {
  await fetch(`/api/scores/${id}`, { method: "DELETE" });
}

async function saveRecord(subject, minutes) {
  const res = await fetch("/api/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject, minutes }),
  });
  if (!res.ok) {
    throw new Error("記録の保存に失敗しました");
  }
  const newRecord = await res.json();
  records.push(newRecord);
  return newRecord;
}

// ---------- タワー描画 ----------

function blockHeight(minutes) {
  return Math.min(220, Math.max(14, minutes * 2));
}

function renderTower(container, recordList, highlightLastAsNew) {
  const skin = profile && profile.towerSkin ? profile.towerSkin : "default";
  container.className = `tower tower-skin-${skin}`;
  container.innerHTML = "";
  const recent = recordList.slice(-30); // 表示は直近30件まで
  recent.forEach((r, index) => {
    const block = document.createElement("div");
    block.className = "tower-block";
    block.style.backgroundColor = SUBJECT_COLORS[r.subject];
    block.style.height = blockHeight(r.minutes) + "px";
    block.title = `${r.date} ${r.subject} ${r.minutes}分`;

    const icon = document.createElement("span");
    icon.className = "tower-block-icon";
    icon.textContent = SUBJECT_ICONS[r.subject];
    block.appendChild(icon);

    if (highlightLastAsNew && index === recent.length - 1) {
      block.classList.add("new");
    }
    container.appendChild(block);
  });
}

// ---------- ホーム画面 ----------

function renderTowerTheme() {
  const theme = currentWorldTheme(records.length);
  const area = document.getElementById("tower-area");
  area.style.background = theme.bg;
  document.getElementById("tower-landmark").textContent = theme.emoji;
  document.getElementById(
    "tower-theme-label"
  ).textContent = `${theme.emoji} ${theme.name}を たびしています（${records.length}段）`;
}

function renderHome() {
  renderTower(document.getElementById("tower"), records, false);
  renderTowerTheme();

  const totalMinutes = records.reduce((sum, r) => sum + r.minutes, 0);
  const totalInfo = document.getElementById("total-info");
  totalInfo.textContent =
    records.length === 0
      ? "まだ記録がありません"
      : `これまでの合計: ${totalMinutes}分 (${records.length}回)`;

  const streak = calcStreak(records);
  document.getElementById("streak-badge").textContent = `🔥 ${streak}日連続`;

  renderCountdown();
  renderGoal();
  renderWelcomeBadge();
}

function selectSubject(subject) {
  selectedSubject = subject;
  document.querySelectorAll("#home-screen .subject-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.subject === subject);
  });
}

// ---------- カウントダウン（日めくり） ----------

function renderCountdown() {
  const setBox = document.getElementById("countdown-set-box");
  const displayBox = document.getElementById("countdown-display-box");

  if (!examDay.date) {
    setBox.hidden = false;
    displayBox.hidden = true;
    return;
  }

  setBox.hidden = true;
  displayBox.hidden = false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(examDay.date + "T00:00:00");
  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));

  document.getElementById("countdown-label").textContent = `${examDay.label}まで`;
  const numberEl = document.getElementById("countdown-number");
  const unitEl = document.querySelector(".countdown-unit");

  if (diffDays > 0) {
    numberEl.textContent = diffDays;
    unitEl.textContent = "日";
  } else if (diffDays === 0) {
    numberEl.textContent = "🎉";
    unitEl.textContent = "今日だ！";
  } else {
    numberEl.textContent = "済";
    unitEl.textContent = "";
  }
}

function showExamDayForm() {
  document.getElementById("exam-label-input").value = examDay.label || "受験本番";
  document.getElementById("exam-date-input").value = examDay.date || "";
  document.getElementById("countdown-set-box").hidden = false;
  document.getElementById("countdown-display-box").hidden = true;
}

async function saveExamDayFromForm() {
  const label = document.getElementById("exam-label-input").value.trim() || "受験本番";
  const date = document.getElementById("exam-date-input").value;
  if (!date) return;

  examDay = await saveExamDayApi(date, label);
  renderCountdown();
}

// ---------- 今週の目標 ----------

function thisWeekRange() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: formatDate(monday), end: formatDate(sunday) };
}

function renderGoal() {
  document.getElementById("goal-view-box").hidden = false;
  document.getElementById("goal-edit-box").hidden = true;

  const { start, end } = thisWeekRange();
  const thisWeekMinutes = records
    .filter((r) => r.date >= start && r.date <= end)
    .reduce((sum, r) => sum + r.minutes, 0);

  const memoText = document.getElementById("goal-memo-text");
  memoText.textContent = goal.memo || "";
  memoText.hidden = !goal.memo;

  const target = goal.minutesTarget || 0;
  const pct = target > 0 ? Math.min(100, Math.round((thisWeekMinutes / target) * 100)) : 0;
  document.getElementById("goal-progress-bar").style.width = pct + "%";
  document.getElementById("goal-progress-text").textContent =
    target > 0
      ? `${thisWeekMinutes}分 / ${target}分（${pct}%）`
      : "目標を設定してみよう（編集を押してね）";
}

function showGoalEditForm() {
  document.getElementById("goal-minutes-input").value = goal.minutesTarget || "";
  document.getElementById("goal-memo-input").value = goal.memo || "";
  document.getElementById("goal-view-box").hidden = true;
  document.getElementById("goal-edit-box").hidden = false;
}

async function saveGoalFromForm() {
  const minutes = Number(document.getElementById("goal-minutes-input").value) || 0;
  const memo = document.getElementById("goal-memo-input").value;
  goal = await saveGoalApi(minutes, memo);
  renderGoal();
}

function showHomeMessage(text) {
  document.getElementById("home-message").textContent = text;
}

// ---------- タイマー ----------

function updateTimerDisplay() {
  const m = String(Math.floor(timerSeconds / 60)).padStart(2, "0");
  const s = String(timerSeconds % 60).padStart(2, "0");
  document.getElementById("timer-display").textContent = `${m}:${s}`;
}

function startTimer() {
  if (!selectedSubject) {
    showHomeMessage("先に教科を選んでね");
    return;
  }
  showHomeMessage("");
  timerSeconds = 0;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timerSeconds++;
    updateTimerDisplay();
  }, 1000);

  document.getElementById("timer-start-btn").hidden = true;
  document.getElementById("timer-stop-btn").hidden = false;
}

async function stopTimerAndRecord() {
  clearInterval(timerInterval);
  const minutes = Math.max(1, Math.round(timerSeconds / 60));

  document.getElementById("timer-start-btn").hidden = false;
  document.getElementById("timer-stop-btn").hidden = true;
  timerSeconds = 0;
  updateTimerDisplay();

  try {
    await saveRecord(selectedSubject, minutes);
    showCompleteScreen(selectedSubject, minutes);
  } catch (err) {
    showHomeMessage("記録できませんでした。もう一度試してね");
  }
}

// ---------- 手入力での記録 ----------

async function recordManualMinutes() {
  const input = document.getElementById("manual-minutes");
  const minutes = Number(input.value);

  if (!selectedSubject) {
    showHomeMessage("先に教科を選んでね");
    return;
  }
  if (!Number.isFinite(minutes) || minutes <= 0) {
    showHomeMessage("正しい分数を入力してね");
    return;
  }
  showHomeMessage("");
  input.value = "";

  try {
    await saveRecord(selectedSubject, Math.round(minutes));
    showCompleteScreen(selectedSubject, Math.round(minutes));
  } catch (err) {
    showHomeMessage("記録できませんでした。もう一度試してね");
  }
}

// ---------- 記録完了画面 ----------

function createConfettiBurst() {
  const container = document.getElementById("confetti-container");
  container.innerHTML = "";
  container.hidden = false;
  const colors = ["#ff6b81", "#4a90e2", "#4caf50", "#ffa726", "#6c63ff", "#ffd54f"];
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = 1.8 + Math.random() * 1.4 + "s";
    piece.style.animationDelay = Math.random() * 0.4 + "s";
    piece.style.setProperty("--start-rotate", `${Math.random() * 360}deg`);
    container.appendChild(piece);
  }
  setTimeout(() => {
    container.hidden = true;
    container.innerHTML = "";
  }, 3400);
}

function showCelebrationToast(text) {
  createConfettiBurst();
  const toast = document.getElementById("celebration-toast");
  toast.textContent = text;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.hidden = true;
    }, 400);
  }, 2600);
}

function showBadgeReveal(badge) {
  createConfettiBurst();
  const overlay = document.getElementById("badge-reveal-overlay");
  const iconEl = document.getElementById("badge-reveal-icon");
  iconEl.textContent = badge.icon;
  iconEl.style.background = badge.grad;
  document.getElementById("badge-reveal-name").textContent = badge.name;
  document.getElementById("badge-reveal-desc").textContent = badge.desc;
  overlay.hidden = false;
}

function showCompleteScreen(subject, minutes) {
  document.getElementById(
    "complete-message"
  ).textContent = `${subject} を ${minutes}分がんばったね！`;
  renderTower(document.getElementById("complete-tower"), records, true);
  switchScreen("complete-screen");

  const completeTowerArea = document.getElementById("complete-tower-area");
  completeTowerArea.classList.remove("focus-pulse");
  void completeTowerArea.offsetWidth;
  completeTowerArea.classList.add("focus-pulse");

  const newCount = records.length;
  const newlyUnlocked = BADGE_TIERS.find((b) => b.tier === newCount);
  if (newlyUnlocked) {
    setTimeout(() => showBadgeReveal(newlyUnlocked), 500);
  } else if (newCount > 0 && newCount % 20 === 0) {
    setTimeout(() => showCelebrationToast(`${newCount}段達成！！`), 300);
  }
}

// ---------- 履歴・カレンダー画面 ----------

function changeCalendarMonth(diff) {
  calendarViewDate = new Date(
    calendarViewDate.getFullYear(),
    calendarViewDate.getMonth() + diff,
    1
  );
  renderCalendar();
}

function eventsCoveringDate(dateStr) {
  return events.filter((e) => dateStr >= e.date && dateStr <= (e.endDate || e.date));
}

function renderCalendar() {
  const now = new Date();
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();

  document.getElementById(
    "calendar-title"
  ).textContent = `${year}年${month + 1}月`;

  const recordsByDate = {};
  records.forEach((r) => {
    if (!recordsByDate[r.date]) recordsByDate[r.date] = [];
    if (!recordsByDate[r.date].includes(r.subject)) {
      recordsByDate[r.date].push(r.subject);
    }
  });

  const calendar = document.getElementById("calendar");
  calendar.innerHTML = "";

  WEEKDAYS.forEach((w, i) => {
    const el = document.createElement("div");
    el.className = "weekday";
    if (i === 0) el.classList.add("weekday-sun");
    if (i === 6) el.classList.add("weekday-sat");
    el.textContent = w;
    calendar.appendChild(el);
  });

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = formatDate(now);

  for (let i = 0; i < firstDay.getDay(); i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day empty";
    calendar.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatDate(new Date(year, month, day));
    const weekday = new Date(year, month, day).getDay();
    const cell = document.createElement("div");
    cell.className = "calendar-day";
    if (dateStr === todayStr) cell.classList.add("today");

    const num = document.createElement("span");
    num.className = "day-number";
    if (weekday === 0) num.classList.add("day-number-sun");
    if (weekday === 6) num.classList.add("day-number-sat");
    num.textContent = day;
    cell.appendChild(num);

    const tagBox = document.createElement("div");
    tagBox.className = "day-tag-box";

    const subjectsToday = recordsByDate[dateStr] || [];
    subjectsToday.slice(0, 2).forEach((subject) => {
      const tag = document.createElement("span");
      tag.className = "day-tag";
      tag.style.background = SUBJECT_COLORS[subject];
      tag.textContent = `${SUBJECT_ICONS[subject]} ${subject}`;
      tagBox.appendChild(tag);
    });
    if (subjectsToday.length > 2) {
      const more = document.createElement("span");
      more.className = "day-tag day-tag-more";
      more.textContent = `+${subjectsToday.length - 2}`;
      tagBox.appendChild(more);
    }
    cell.appendChild(tagBox);

    // 複数日にまたがる予定を優先して表示する(セル間で帯がつながって見えるように)
    const eventsToday = eventsCoveringDate(dateStr).slice().sort((a, b) => {
      const aSpan = (a.endDate || a.date) !== a.date ? 1 : 0;
      const bSpan = (b.endDate || b.date) !== b.date ? 1 : 0;
      return bSpan - aSpan;
    });
    if (eventsToday.length > 0) {
      const primary = eventsToday[0];
      const info = eventCategoryInfo(primary.category);
      const start = primary.date;
      const end = primary.endDate || primary.date;
      const isSegStart = dateStr === start || weekday === 0;
      const isSegEnd = dateStr === end || weekday === 6;

      const bar = document.createElement("div");
      bar.className = "day-event-bar";
      bar.style.background = info.color;
      bar.style.borderTopLeftRadius = isSegStart ? "8px" : "0";
      bar.style.borderBottomLeftRadius = isSegStart ? "8px" : "0";
      bar.style.borderTopRightRadius = isSegEnd ? "8px" : "0";
      bar.style.borderBottomRightRadius = isSegEnd ? "8px" : "0";
      bar.style.left = isSegStart ? "3px" : "-4px";
      bar.style.right = isSegEnd ? "3px" : "-4px";
      if (isSegStart) {
        const extraLabel = eventsToday.length > 1 ? ` +${eventsToday.length - 1}` : "";
        bar.textContent = `${info.icon}${info.label}${extraLabel}`;
      }
      cell.appendChild(bar);
    }

    if (notes[dateStr]) {
      cell.classList.add("has-note");
    }

    cell.addEventListener("click", () => showDayDetail(dateStr));
    calendar.appendChild(cell);
  }
}

// ---------- 1日の記録・メモ画面 ----------

function showDayDetail(dateStr) {
  detailDate = dateStr;
  const d = new Date(dateStr + "T00:00:00");
  document.getElementById(
    "day-detail-title"
  ).textContent = `${d.getMonth() + 1}月${d.getDate()}日 (${WEEKDAYS[d.getDay()]})`;

  const dayRecords = records.filter((r) => r.date === dateStr);
  const recordsBox = document.getElementById("day-detail-records");
  recordsBox.innerHTML = "";
  if (dayRecords.length === 0) {
    recordsBox.innerHTML = `<p class="no-record-text">この日の記録はまだありません</p>`;
  } else {
    dayRecords.forEach((r) => {
      const row = document.createElement("div");
      row.className = "day-detail-record-row";
      row.style.borderLeft = `6px solid ${SUBJECT_COLORS[r.subject]}`;
      row.innerHTML = `<span>${r.subject}</span><span>${r.minutes}分</span>`;
      recordsBox.appendChild(row);
    });
  }

  document.getElementById("day-note-input").value = notes[dateStr] || "";
  document.getElementById("day-note-saved-msg").textContent = "";

  selectedEventCategory = null;
  document.querySelectorAll(".category-pick-btn").forEach((btn) => {
    btn.classList.remove("selected");
  });
  document.getElementById("day-event-input").value = "";
  document.getElementById("day-event-enddate-input").value = "";
  document.getElementById("day-event-msg").textContent = "";

  renderDayEvents(dateStr);

  switchScreen("day-detail-screen");
}

function selectEventCategory(category) {
  selectedEventCategory = category;
  document.querySelectorAll(".category-pick-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.category === category);
  });
}

function eventCategoryInfo(category) {
  return EVENT_CATEGORIES[category] || EVENT_CATEGORIES.other;
}

function renderDayEvents(dateStr) {
  const list = document.getElementById("day-events-list");
  list.innerHTML = "";
  const dayEvents = events.filter(
    (e) => dateStr >= e.date && dateStr <= (e.endDate || e.date)
  );

  if (dayEvents.length === 0) {
    list.innerHTML = `<p class="no-record-text">まだ予定はないよ</p>`;
    return;
  }

  dayEvents.forEach((e) => {
    const info = eventCategoryInfo(e.category);
    const row = document.createElement("div");
    row.className = "day-event-row";
    row.style.borderLeft = `6px solid ${info.color}`;

    const label = document.createElement("span");
    const rangeText =
      e.endDate && e.endDate !== e.date ? ` (${e.date}〜${e.endDate})` : "";
    label.textContent = `${info.icon} ${info.label}${e.title ? " " + e.title : ""}${rangeText}`;
    row.appendChild(label);

    const delBtn = document.createElement("button");
    delBtn.className = "small-delete-btn";
    delBtn.textContent = "けす";
    delBtn.addEventListener("click", async () => {
      await deleteEventApi(e.id);
      events = events.filter((ev) => ev.id !== e.id);
      renderDayEvents(dateStr);
    });
    row.appendChild(delBtn);

    list.appendChild(row);
  });
}

async function addDayEvent() {
  const msg = document.getElementById("day-event-msg");
  if (!selectedEventCategory) {
    msg.textContent = "まず、予定のしゅるいをえらんでね";
    return;
  }

  const titleInput = document.getElementById("day-event-input");
  const endDateInput = document.getElementById("day-event-enddate-input");

  const event = await saveEventApi(
    detailDate,
    endDateInput.value || detailDate,
    selectedEventCategory,
    titleInput.value.trim()
  );
  events.push(event);

  selectedEventCategory = null;
  document.querySelectorAll(".category-pick-btn").forEach((btn) => {
    btn.classList.remove("selected");
  });
  titleInput.value = "";
  endDateInput.value = "";
  msg.textContent = "追加したよ！";

  renderDayEvents(detailDate);
}

async function saveDayNote() {
  const text = document.getElementById("day-note-input").value;
  const savedMsg = document.getElementById("day-note-saved-msg");
  try {
    await saveNote(detailDate, text);
    savedMsg.textContent = "保存したよ！";
  } catch (err) {
    savedMsg.textContent = "保存に失敗しました";
  }
}

function renderSubjectTotals() {
  const totals = { 国語: 0, 算数: 0, 理科: 0, 社会: 0 };
  records.forEach((r) => {
    totals[r.subject] += r.minutes;
  });

  const container = document.getElementById("subject-totals");
  container.innerHTML = "";
  Object.entries(totals).forEach(([subject, minutes]) => {
    const card = document.createElement("div");
    card.className = "subject-total-card";
    card.style.background = SUBJECT_COLORS[subject];
    card.innerHTML = `<div class="label">${subject}</div><div class="value">${minutes}分</div>`;
    container.appendChild(card);
  });
}

function renderWeeklyChart() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  const totalsByDate = {};
  days.forEach((d) => {
    totalsByDate[formatDate(d)] = { 国語: 0, 算数: 0, 理科: 0, 社会: 0 };
  });
  records.forEach((r) => {
    if (totalsByDate[r.date]) {
      totalsByDate[r.date][r.subject] += r.minutes;
    }
  });

  const dayTotals = days.map((d) =>
    Object.values(totalsByDate[formatDate(d)]).reduce((a, b) => a + b, 0)
  );
  const maxTotal = Math.max(1, ...dayTotals);
  const MAX_BAR_HEIGHT = 160;

  const container = document.getElementById("weekly-chart");
  container.innerHTML = "";

  days.forEach((d, i) => {
    const dateStr = formatDate(d);
    const subjects = totalsByDate[dateStr];
    const total = dayTotals[i];

    const col = document.createElement("div");
    col.className = "weekly-chart-col";

    const barWrap = document.createElement("div");
    barWrap.className = "weekly-bar-wrap";

    const bar = document.createElement("div");
    bar.className = "weekly-bar";
    bar.style.height =
      total === 0 ? "0px" : Math.max(4, (total / maxTotal) * MAX_BAR_HEIGHT) + "px";

    Object.entries(subjects).forEach(([subject, minutes]) => {
      if (minutes <= 0) return;
      const seg = document.createElement("div");
      seg.className = "weekly-bar-segment";
      seg.style.background = SUBJECT_COLORS[subject];
      seg.style.flex = minutes;
      seg.title = `${subject} ${minutes}分`;
      bar.appendChild(seg);
    });

    barWrap.appendChild(bar);
    col.appendChild(barWrap);

    const totalLabel = document.createElement("div");
    totalLabel.className = "weekly-total-label";
    totalLabel.textContent = total > 0 ? `${total}分` : "";
    col.appendChild(totalLabel);

    const dayLabel = document.createElement("div");
    dayLabel.className = "weekly-day-label";
    dayLabel.textContent = `${d.getMonth() + 1}/${d.getDate()}`;
    col.appendChild(dayLabel);

    container.appendChild(col);
  });
}

function renderNoteFeed() {
  const list = document.getElementById("note-feed-list");
  list.innerHTML = "";
  const entries = Object.entries(notes).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  if (entries.length === 0) {
    list.innerHTML = `<p class="no-record-text">まだメモがないよ。カレンダーの日付から書いてみよう！</p>`;
    return;
  }

  entries.forEach(([date, text]) => {
    const d = new Date(date + "T00:00:00");
    const card = document.createElement("div");
    card.className = "note-feed-item";

    const dateEl = document.createElement("div");
    dateEl.className = "note-feed-date";
    dateEl.textContent = `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
    card.appendChild(dateEl);

    const textEl = document.createElement("div");
    textEl.className = "note-feed-text";
    textEl.textContent = text;
    card.appendChild(textEl);

    card.addEventListener("click", () => showDayDetail(date));
    list.appendChild(card);
  });
}

function renderHistory() {
  const streak = calcStreak(records);
  document.getElementById(
    "streak-badge-history"
  ).textContent = `🔥 ${streak}日連続`;
  renderWeeklyChart();
  renderCalendar();
  renderSubjectTotals();
  renderNoteFeed();
}

// ---------- せいせき画面 ----------

function renderScoreCommentFeed() {
  const list = document.getElementById("score-comment-feed-list");
  list.innerHTML = "";
  const commented = scores
    .filter((s) => s.comment && s.comment.trim() !== "")
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  if (commented.length === 0) {
    list.innerHTML = `<p class="no-record-text">まだコメントつきのきろくがないよ</p>`;
    return;
  }

  commented.forEach((s) => {
    const card = document.createElement("div");
    card.className = "score-comment-item";
    card.style.borderLeftColor = SUBJECT_COLORS[s.subject];

    const top = document.createElement("div");
    top.className = "score-comment-top";

    const subjectBadge = document.createElement("span");
    subjectBadge.className = "score-comment-subject";
    subjectBadge.style.background = SUBJECT_COLORS[s.subject];
    subjectBadge.textContent = `${SUBJECT_ICONS[s.subject]} ${s.subject}`;
    top.appendChild(subjectBadge);

    const scoreEl = document.createElement("span");
    scoreEl.className = "score-comment-score";
    const hensachiText =
      s.hensachi !== null && s.hensachi !== undefined ? ` ・偏差値${s.hensachi}` : "";
    scoreEl.textContent = `✨ ${s.score}点${hensachiText}`;
    top.appendChild(scoreEl);

    const dateEl = document.createElement("span");
    dateEl.className = "score-comment-date";
    dateEl.textContent = s.date;
    top.appendChild(dateEl);

    card.appendChild(top);

    const textEl = document.createElement("div");
    textEl.className = "score-comment-text";
    textEl.textContent = s.comment;
    card.appendChild(textEl);

    list.appendChild(card);
  });
}

function selectGradeSubject(subject) {
  selectedGradeSubject = subject;
  document.querySelectorAll("#grades-screen .subject-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.subject === subject);
  });
  renderGradesScreen();
}

function setGradeChartMode(mode) {
  gradeChartMode = mode;
  renderGradesScreen();
}

function renderGradeChart(subjectScores, mode) {
  const svg = document.getElementById("grade-chart");
  const hint = document.getElementById("grade-chart-hint");
  const tooltip = document.getElementById("grade-tooltip");
  svg.innerHTML = "";
  tooltip.hidden = true;

  if (subjectScores.length === 0) {
    svg.hidden = true;
    hint.hidden = false;
    hint.textContent = "まだ記録がありません。下のフォームから記録してみよう";
    return;
  }

  const getValue = (s) => (mode === "hensachi" ? s.hensachi : s.score);
  const plottable =
    mode === "hensachi"
      ? subjectScores.filter((s) => s.hensachi !== null && s.hensachi !== undefined)
      : subjectScores;

  if (plottable.length === 0) {
    svg.hidden = true;
    hint.hidden = false;
    hint.textContent = "偏差値が記録された成績がまだないよ";
    return;
  }

  hint.hidden = true;
  svg.hidden = false;

  const PAD_SIDE = 24;
  const PAD_TOP = 26;
  const PAD_BOTTOM = 34;
  const W = 300;
  const H = 180;
  const n = plottable.length;
  const xStep = n > 1 ? (W - PAD_SIDE * 2) / (n - 1) : 0;
  const color = SUBJECT_COLORS[plottable[0].subject];
  const svgNS = "http://www.w3.org/2000/svg";
  const plotHeight = H - PAD_TOP - PAD_BOTTOM;

  let minV = 0;
  let maxV = 100;
  if (mode === "hensachi") {
    const values = plottable.map(getValue);
    minV = Math.min(...values);
    maxV = Math.max(...values);
    if (minV === maxV) {
      minV -= 5;
      maxV += 5;
    }
    const pad = (maxV - minV) * 0.2;
    minV -= pad;
    maxV += pad;
  }

  const yForValue = (v) => PAD_TOP + plotHeight - ((v - minV) / (maxV - minV)) * plotHeight;

  const axis = document.createElementNS(svgNS, "line");
  axis.setAttribute("x1", PAD_SIDE);
  axis.setAttribute("y1", PAD_TOP + plotHeight);
  axis.setAttribute("x2", W - PAD_SIDE);
  axis.setAttribute("y2", PAD_TOP + plotHeight);
  axis.setAttribute("stroke", "#ddd");
  svg.appendChild(axis);

  const points = plottable.map((s, i) => {
    const x = PAD_SIDE + (n > 1 ? i * xStep : (W - PAD_SIDE * 2) / 2);
    const y = yForValue(getValue(s));
    return { x, y, s };
  });

  if (n > 1) {
    const polyline = document.createElementNS(svgNS, "polyline");
    polyline.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", color);
    polyline.setAttribute("stroke-width", "3");
    svg.appendChild(polyline);
  }

  let runningMax = -Infinity;
  points.forEach((p, i) => {
    const d = new Date(p.s.date + "T00:00:00");
    const dateLabel = document.createElementNS(svgNS, "text");
    dateLabel.setAttribute("x", p.x);
    dateLabel.setAttribute("y", H - 10);
    dateLabel.setAttribute("text-anchor", "middle");
    dateLabel.setAttribute("font-size", "9");
    dateLabel.setAttribute("fill", "#999");
    dateLabel.textContent = `${d.getMonth() + 1}/${d.getDate()}`;
    svg.appendChild(dateLabel);

    const value = getValue(p.s);
    const prevValue = i > 0 ? getValue(points[i - 1].s) : null;

    let badgeText = null;
    let badgeColor = null;
    if (i > 0) {
      if (value > runningMax) {
        badgeText = "自己ベスト更新!!";
        badgeColor = "#e8960c";
      } else if (prevValue !== null && value > prevValue) {
        const diff = Math.round((value - prevValue) * 10) / 10;
        const unit = mode === "hensachi" ? "" : "点";
        badgeText = `+${diff}${unit}UP!!`;
        badgeColor = "#43a047";
      }
    }
    if (value > runningMax) runningMax = value;

    if (badgeText) {
      const badgeY = Math.max(10, p.y - 12);
      const badge = document.createElementNS(svgNS, "text");
      badge.setAttribute("x", p.x);
      badge.setAttribute("y", badgeY);
      badge.setAttribute("text-anchor", "middle");
      badge.setAttribute("font-size", "7.5");
      badge.setAttribute("font-weight", "bold");
      badge.setAttribute("fill", badgeColor);
      badge.textContent = badgeText;
      svg.appendChild(badge);
    }

    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", p.x);
    circle.setAttribute("cy", p.y);
    circle.setAttribute("r", 5);
    circle.setAttribute("fill", color);
    circle.style.cursor = "pointer";
    circle.addEventListener("mouseenter", () => showGradeTooltip(p));
    circle.addEventListener("mouseleave", () => {
      tooltip.hidden = true;
    });
    circle.addEventListener("click", () => showGradeTooltip(p));
    svg.appendChild(circle);
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showGradeTooltip(point) {
  const tooltip = document.getElementById("grade-tooltip");
  const svg = document.getElementById("grade-chart");
  const box = document.getElementById("grade-chart-box");

  const svgRect = svg.getBoundingClientRect();
  const boxRect = box.getBoundingClientRect();
  const scaleX = svgRect.width / 300;
  const scaleY = svgRect.height / 180;

  const left = svgRect.left - boxRect.left + point.x * scaleX;
  const top = svgRect.top - boxRect.top + point.y * scaleY;

  const s = point.s;
  const hensachiLine =
    s.hensachi !== null && s.hensachi !== undefined
      ? `<div>偏差値 ${escapeHtml(String(s.hensachi))}</div>`
      : "";
  const commentLine = s.comment
    ? `<div class="tooltip-comment">${escapeHtml(s.comment)}</div>`
    : "";

  tooltip.innerHTML = `
    <div class="tooltip-date">${escapeHtml(s.date)}</div>
    <div>${escapeHtml(String(s.score))}点</div>
    ${hensachiLine}
    ${commentLine}
  `;
  tooltip.style.left = left + "px";
  tooltip.style.top = top + "px";
  tooltip.hidden = false;
}

function renderScoreList(subjectScores) {
  const container = document.getElementById("score-list");
  container.innerHTML = "";

  [...subjectScores].reverse().forEach((s) => {
    const row = document.createElement("div");
    row.className = "score-row";

    const top = document.createElement("div");
    top.className = "score-row-top";

    const hensachiText =
      s.hensachi !== null && s.hensachi !== undefined ? ` / 偏差値${s.hensachi}` : "";
    const label = document.createElement("span");
    label.textContent = `${s.date}　${s.score}点${hensachiText}`;
    top.appendChild(label);

    const delBtn = document.createElement("button");
    delBtn.className = "small-delete-btn";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", async () => {
      await deleteScoreApi(s.id);
      scores = scores.filter((sc) => sc.id !== s.id);
      renderGradesScreen();
    });
    top.appendChild(delBtn);

    row.appendChild(top);

    if (s.comment) {
      const comment = document.createElement("p");
      comment.className = "score-row-comment";
      comment.textContent = s.comment;
      row.appendChild(comment);
    }

    container.appendChild(row);
  });
}

function renderGradesScreen() {
  renderScoreCommentFeed();

  document.querySelectorAll("#grades-screen .subject-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.subject === selectedGradeSubject);
  });

  document
    .getElementById("chart-mode-score-btn")
    .classList.toggle("selected", gradeChartMode === "score");
  document
    .getElementById("chart-mode-hensachi-btn")
    .classList.toggle("selected", gradeChartMode === "hensachi");

  const dateInput = document.getElementById("score-date-input");
  if (!dateInput.value) {
    dateInput.value = formatDate(new Date());
  }

  if (!selectedGradeSubject) {
    document.getElementById("grade-chart").hidden = true;
    const hint = document.getElementById("grade-chart-hint");
    hint.hidden = false;
    hint.textContent = "教科を選ぶと、点数の変化がグラフで見られるよ";
    document.getElementById("score-list").innerHTML = "";
    return;
  }

  const subjectScores = scores
    .filter((s) => s.subject === selectedGradeSubject)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  renderGradeChart(subjectScores, gradeChartMode);
  renderScoreList(subjectScores);
}

async function recordScore() {
  const dateInput = document.getElementById("score-date-input");
  const scoreInput = document.getElementById("score-value-input");
  const hensachiInput = document.getElementById("score-hensachi-input");
  const commentInput = document.getElementById("score-comment-input");
  const msg = document.getElementById("score-save-msg");

  if (!selectedGradeSubject) {
    msg.textContent = "先に教科を選んでね";
    return;
  }
  if (!dateInput.value) {
    msg.textContent = "日付を選んでね";
    return;
  }
  const scoreValue = Number(scoreInput.value);
  if (!Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 100) {
    msg.textContent = "0〜100の点数を入力してね";
    return;
  }
  const hensachiValue = hensachiInput.value === "" ? null : Number(hensachiInput.value);

  try {
    const entry = await saveScoreApi(
      dateInput.value,
      selectedGradeSubject,
      scoreValue,
      hensachiValue,
      commentInput.value
    );
    scores.push(entry);
    scoreInput.value = "";
    hensachiInput.value = "";
    commentInput.value = "";
    msg.textContent = "記録したよ！";
    renderGradesScreen();
  } catch (err) {
    msg.textContent = "記録できませんでした";
  }
}

// ---------- マイページ ----------

async function fetchProfile() {
  const res = await fetch("/api/profile");
  profile = await res.json();
}

function avatarUrl(avatarType, avatarValue) {
  if (avatarType === "template") return `/avatars/template${avatarValue}.png`;
  if (avatarType === "custom") return avatarValue;
  return null;
}

function createAvatarElement(avatarType, avatarValue, name, className) {
  const url = avatarUrl(avatarType, avatarValue);
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.className = className;
    img.alt = name || "";
    return img;
  }
  const div = document.createElement("div");
  div.className = className + " avatar-placeholder";
  div.textContent = (name || "?").charAt(0);
  return div;
}

function renderProfileAvatar() {
  const img = document.getElementById("profile-avatar-img");
  const placeholder = document.getElementById("profile-avatar-placeholder");
  const url = avatarUrl(profile.avatarType, profile.avatarValue);
  if (url) {
    img.src = url;
    img.hidden = false;
    placeholder.hidden = true;
  } else {
    img.hidden = true;
    placeholder.hidden = false;
    placeholder.textContent = (profile.name || "?").charAt(0);
  }
}

function toggleAvatarPicker() {
  const picker = document.getElementById("avatar-picker");
  picker.hidden = !picker.hidden;
  document.getElementById("avatar-message").textContent = "";
  if (!picker.hidden) {
    document.querySelectorAll(".avatar-template-option").forEach((imgEl) => {
      imgEl.classList.toggle(
        "selected",
        profile.avatarType === "template" && profile.avatarValue === imgEl.dataset.template
      );
    });
  }
}

async function saveAvatar(avatarType, avatarValue) {
  const msg = document.getElementById("avatar-message");
  const res = await fetch("/api/profile/avatar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avatarType, avatarValue }),
  });
  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data.error || "保存できませんでした";
    return;
  }
  profile.avatarType = data.avatarType;
  profile.avatarValue = data.avatarValue;
  renderProfileAvatar();
  msg.textContent = "アイコンを変えたよ！";
}

async function saveTowerSkin(skin) {
  const res = await fetch("/api/profile/tower-skin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skin }),
  });
  if (!res.ok) return;
  const data = await res.json();
  profile.towerSkin = data.towerSkin;
  renderTowerSkinPicker();
}

async function equipBadge(tier) {
  const res = await fetch("/api/profile/badge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier }),
  });
  if (!res.ok) return;
  const data = await res.json();
  profile.equippedBadge = data.equippedBadge;
  renderBadgeCase();
  renderWelcomeBadge();
}

function renderTowerSkinPicker() {
  document.querySelectorAll(".tower-skin-option").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.skin === (profile.towerSkin || "default"));
  });
}

function renderBadgeCase() {
  const grid = document.getElementById("badge-case-grid");
  grid.innerHTML = "";
  const blockCount = records.length;

  BADGE_TIERS.forEach((b) => {
    const unlocked = blockCount >= b.tier;
    const card = document.createElement("button");
    card.className = "badge-case-item" + (unlocked ? "" : " locked");
    if (unlocked) {
      card.style.background = b.grad;
    }

    const icon = document.createElement("div");
    icon.className = "badge-case-icon";
    icon.textContent = unlocked ? b.icon : "🔒";
    card.appendChild(icon);

    const label = document.createElement("div");
    label.className = "badge-case-label";
    label.textContent = unlocked ? `${b.tier}段` : `${b.tier}段`;
    card.appendChild(label);

    if (unlocked && profile.equippedBadge === b.tier) {
      card.classList.add("equipped");
    }

    if (unlocked) {
      card.addEventListener("click", () => {
        equipBadge(profile.equippedBadge === b.tier ? null : b.tier);
      });
    }

    grid.appendChild(card);
  });
}

function renderWelcomeBadge() {
  const el = document.getElementById("welcome-badge-icon");
  if (profile && profile.equippedBadge) {
    const info = badgeInfo(profile.equippedBadge);
    el.textContent = info ? `${info.icon} ${info.name}` : "";
    el.hidden = !info;
  } else {
    el.hidden = true;
  }
}

async function selectTemplateAvatar(templateId) {
  await saveAvatar("template", templateId);
  document.getElementById("avatar-picker").hidden = true;
}

function resizeImageFile(file, maxSize) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round(height * (maxSize / width));
            width = maxSize;
          }
        } else if (height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await resizeImageFile(file, 200);
  await saveAvatar("custom", dataUrl);
  e.target.value = "";
}

function renderProfile() {
  document.getElementById("profile-name").textContent = profile.name;
  renderProfileAvatar();

  const pinEl = document.getElementById("profile-pin");
  pinEl.textContent = "••••";
  pinEl.dataset.value = profile.pin;
  pinEl.dataset.revealed = "false";

  document.getElementById("profile-question-label").textContent =
    profile.securityQuestion || "秘密の質問";
  const answerEl = document.getElementById("profile-answer");
  answerEl.textContent = "••••";
  answerEl.dataset.value = profile.securityAnswer;
  answerEl.dataset.revealed = "false";

  document.getElementById("profile-friend-code").textContent = profile.friendCode;

  document.querySelectorAll(".reveal-btn").forEach((btn) => {
    btn.textContent = "表示";
  });
}

function toggleReveal(targetId) {
  const el = document.getElementById(targetId);
  const btn = document.querySelector(`.reveal-btn[data-target="${targetId}"]`);
  const revealed = el.dataset.revealed === "true";

  if (revealed) {
    el.textContent = "••••";
    el.dataset.revealed = "false";
    btn.textContent = "表示";
  } else {
    el.textContent = el.dataset.value;
    el.dataset.revealed = "true";
    btn.textContent = "隠す";
  }
}

async function fetchFriendsData() {
  const res = await fetch("/api/friends");
  friendsData = await res.json();
}

function renderFriendsSection() {
  const incomingCard = document.getElementById("incoming-requests-card");
  const incomingList = document.getElementById("incoming-requests-list");
  incomingList.innerHTML = "";
  incomingCard.hidden = friendsData.incomingRequests.length === 0;
  friendsData.incomingRequests.forEach((r) => {
    const row = document.createElement("div");
    row.className = "friend-row";

    const label = document.createElement("span");
    label.textContent = r.fromName;
    row.appendChild(label);

    const acceptBtn = document.createElement("button");
    acceptBtn.className = "small-inline-btn accept-btn";
    acceptBtn.textContent = "承認";
    acceptBtn.addEventListener("click", async () => {
      await fetch("/api/friends/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: r.id }),
      });
      await refreshFriendsSection();
    });
    row.appendChild(acceptBtn);

    const rejectBtn = document.createElement("button");
    rejectBtn.className = "small-delete-btn";
    rejectBtn.textContent = "拒否";
    rejectBtn.addEventListener("click", async () => {
      await fetch("/api/friends/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: r.id }),
      });
      await refreshFriendsSection();
    });
    row.appendChild(rejectBtn);

    incomingList.appendChild(row);
  });

  const outgoingCard = document.getElementById("outgoing-requests-card");
  const outgoingList = document.getElementById("outgoing-requests-list");
  outgoingList.innerHTML = "";
  outgoingCard.hidden = friendsData.outgoingRequests.length === 0;
  friendsData.outgoingRequests.forEach((r) => {
    const row = document.createElement("div");
    row.className = "friend-row";
    row.innerHTML = `<span>${r.toName}</span><span class="pending-label">返事待ち</span>`;
    outgoingList.appendChild(row);
  });

  const friendsList = document.getElementById("friends-list");
  friendsList.innerHTML = "";
  if (friendsData.friends.length === 0) {
    friendsList.innerHTML = `<p class="no-record-text">まだフレンドがいません</p>`;
  } else {
    friendsData.friends.forEach((f) => {
      const row = document.createElement("div");
      row.className = "friend-row clickable";
      row.appendChild(createAvatarElement(f.avatarType, f.avatarValue, f.name, "avatar-icon"));

      const label = document.createElement("span");
      label.textContent = `💬 ${f.name}`;
      row.appendChild(label);

      row.addEventListener("click", () =>
        openChat(f.id, f.name, f.avatarType, f.avatarValue)
      );
      friendsList.appendChild(row);
    });
  }
}

async function refreshFriendsSection() {
  await fetchFriendsData();
  renderFriendsSection();
}

async function renderProfileScreen() {
  await Promise.all([fetchProfile(), fetchFriendsData()]);
  renderProfile();
  renderFriendsSection();
  renderTowerSkinPicker();
  renderBadgeCase();
}

async function sendFriendRequest() {
  const input = document.getElementById("friend-code-input");
  const msg = document.getElementById("friend-request-msg");

  const res = await fetch("/api/friends/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ friendCode: input.value.trim() }),
  });
  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data.error || "申請できませんでした";
    return;
  }

  msg.textContent = "申請を送ったよ！";
  input.value = "";
  await refreshFriendsSection();
}

// ---------- チャット ----------

async function openChat(friendId, friendName, avatarType, avatarValue) {
  currentChatFriendId = friendId;
  currentChatFriendName = friendName;
  currentChatFriendAvatar = { type: avatarType, value: avatarValue };
  document.getElementById("chat-friend-name").textContent = friendName;
  await loadMessages();
  switchScreen("chat-screen");

  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = setInterval(loadMessages, 3000);
}

function closeChat() {
  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = null;
  currentChatFriendId = null;
  switchScreen("profile-screen");
}

async function loadMessages() {
  if (!currentChatFriendId) return;
  const res = await fetch(`/api/messages/${currentChatFriendId}`);
  if (!res.ok) return;
  const messages = await res.json();
  renderMessages(messages);
}

function renderMessages(messages) {
  const container = document.getElementById("chat-messages");
  container.innerHTML = "";
  messages.forEach((m) => {
    const isMe = m.fromUserId === myUserId;

    const row = document.createElement("div");
    row.className = "chat-message-row " + (isMe ? "chat-message-me" : "chat-message-other");

    const avatarType = isMe ? profile.avatarType : currentChatFriendAvatar.type;
    const avatarValue = isMe ? profile.avatarValue : currentChatFriendAvatar.value;
    const avatarName = isMe ? currentUserName : currentChatFriendName;
    row.appendChild(createAvatarElement(avatarType, avatarValue, avatarName, "avatar-icon"));

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble " + (isMe ? "chat-bubble-me" : "chat-bubble-other");
    bubble.textContent = m.text;
    row.appendChild(bubble);

    container.appendChild(row);
  });
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text || !currentChatFriendId) return;

  input.value = "";
  const res = await fetch(`/api/messages/${currentChatFriendId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (res.ok) {
    await loadMessages();
  }
}

// ---------- 画面切り替え ----------

function switchScreen(screenId) {
  document.querySelectorAll(".screen").forEach((el) => {
    el.hidden = el.id !== screenId;
  });
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.screen === screenId);
  });

  if (screenId === "home-screen") renderHome();
  if (screenId === "history-screen") renderHistory();
  if (screenId === "grades-screen") renderGradesScreen();
  if (screenId === "profile-screen") renderProfileScreen();
}

// ---------- 初期化 ----------

function setupEvents() {
  document.querySelectorAll("#home-screen .subject-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectSubject(btn.dataset.subject));
  });
  document.querySelectorAll("#grades-screen .subject-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectGradeSubject(btn.dataset.subject));
  });

  document
    .getElementById("timer-start-btn")
    .addEventListener("click", startTimer);
  document
    .getElementById("timer-stop-btn")
    .addEventListener("click", stopTimerAndRecord);
  document
    .getElementById("manual-record-btn")
    .addEventListener("click", recordManualMinutes);
  document
    .getElementById("back-home-btn")
    .addEventListener("click", () => switchScreen("home-screen"));
  document
    .getElementById("day-detail-back-btn")
    .addEventListener("click", () => switchScreen("history-screen"));
  document
    .getElementById("day-note-save-btn")
    .addEventListener("click", saveDayNote);
  document
    .getElementById("day-event-add-btn")
    .addEventListener("click", addDayEvent);
  document.querySelectorAll(".category-pick-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectEventCategory(btn.dataset.category));
  });
  document
    .getElementById("calendar-prev-btn")
    .addEventListener("click", () => changeCalendarMonth(-1));
  document
    .getElementById("calendar-next-btn")
    .addEventListener("click", () => changeCalendarMonth(1));

  document
    .getElementById("exam-day-save-btn")
    .addEventListener("click", saveExamDayFromForm);
  document
    .getElementById("exam-day-edit-btn")
    .addEventListener("click", showExamDayForm);
  document
    .getElementById("goal-edit-btn")
    .addEventListener("click", showGoalEditForm);
  document
    .getElementById("goal-save-btn")
    .addEventListener("click", saveGoalFromForm);
  document
    .getElementById("score-save-btn")
    .addEventListener("click", recordScore);
  document
    .getElementById("chart-mode-score-btn")
    .addEventListener("click", () => setGradeChartMode("score"));
  document
    .getElementById("chart-mode-hensachi-btn")
    .addEventListener("click", () => setGradeChartMode("hensachi"));

  document.getElementById("login-btn").addEventListener("click", handleLogin);
  document
    .getElementById("register-btn")
    .addEventListener("click", handleRegister);
  document
    .getElementById("logout-btn")
    .addEventListener("click", handleLogout);

  document.querySelectorAll(".reveal-btn").forEach((btn) => {
    btn.addEventListener("click", () => toggleReveal(btn.dataset.target));
  });
  document
    .getElementById("friend-request-btn")
    .addEventListener("click", sendFriendRequest);
  document.getElementById("chat-back-btn").addEventListener("click", closeChat);

  document
    .getElementById("avatar-change-btn")
    .addEventListener("click", toggleAvatarPicker);
  document
    .getElementById("avatar-picker-close-btn")
    .addEventListener("click", () => {
      document.getElementById("avatar-picker").hidden = true;
    });
  document.querySelectorAll(".avatar-template-option").forEach((imgEl) => {
    imgEl.addEventListener("click", () => selectTemplateAvatar(imgEl.dataset.template));
  });
  document
    .getElementById("avatar-upload-input")
    .addEventListener("change", handleAvatarUpload);
  document.querySelectorAll(".tower-skin-option").forEach((btn) => {
    btn.addEventListener("click", () => saveTowerSkin(btn.dataset.skin));
  });
  document
    .getElementById("badge-reveal-close-btn")
    .addEventListener("click", () => {
      document.getElementById("badge-reveal-overlay").hidden = true;
    });

  document
    .getElementById("chat-send-btn")
    .addEventListener("click", sendChatMessage);
  document.getElementById("chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChatMessage();
  });

  document
    .getElementById("go-register-btn")
    .addEventListener("click", () => switchScreen("register-screen"));
  document
    .getElementById("go-reset-btn")
    .addEventListener("click", () => switchScreen("reset-screen"));
  document
    .getElementById("back-to-login-from-register-btn")
    .addEventListener("click", () => switchScreen("login-screen"));
  document
    .getElementById("back-to-login-from-reset-btn")
    .addEventListener("click", () => switchScreen("login-screen"));
  document
    .getElementById("reset-find-btn")
    .addEventListener("click", handleResetFind);
  document
    .getElementById("reset-submit-btn")
    .addEventListener("click", handleResetSubmit);

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchScreen(btn.dataset.screen));
  });
}

// ---------- ログイン ----------

async function fetchMe() {
  const res = await fetch("/api/auth/me");
  return res.json();
}

async function handleLogin() {
  const name = document.getElementById("login-name-input").value;
  const pin = document.getElementById("login-pin-input").value;
  const msg = document.getElementById("login-message");

  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, pin }),
  });
  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data.error || "ログインできませんでした";
    return;
  }
  msg.textContent = "";
  await enterApp(data.name, data.id);
}

async function handleRegister() {
  const name = document.getElementById("register-name-input").value;
  const pin = document.getElementById("register-pin-input").value;
  const securityQuestion = document.getElementById("register-question-select").value;
  const securityAnswer = document.getElementById("register-answer-input").value;
  const msg = document.getElementById("register-message");

  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, pin, securityQuestion, securityAnswer }),
  });
  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data.error || "登録できませんでした";
    return;
  }
  msg.textContent = "";
  await enterApp(data.name, data.id);
}

async function handleLogout() {
  await fetch("/api/auth/logout", { method: "POST" });
  location.reload();
}

// ---------- 暗証番号の再設定 ----------

let resetTargetName = null;

async function handleResetFind() {
  const name = document.getElementById("reset-name-input").value;
  const msg = document.getElementById("reset-message");

  const res = await fetch(`/api/auth/security-question?name=${encodeURIComponent(name)}`);
  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data.error || "見つかりませんでした";
    return;
  }

  resetTargetName = name.trim();
  msg.textContent = "";
  document.getElementById("reset-question-text").textContent = data.question;
  document.getElementById("reset-step1").hidden = true;
  document.getElementById("reset-step2").hidden = false;
}

async function handleResetSubmit() {
  const securityAnswer = document.getElementById("reset-answer-input").value;
  const newPin = document.getElementById("reset-newpin-input").value;
  const msg = document.getElementById("reset-message");

  const res = await fetch("/api/auth/reset-pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: resetTargetName, securityAnswer, newPin }),
  });
  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data.error || "再設定できませんでした";
    return;
  }

  msg.textContent = "";
  document.getElementById("reset-step1").hidden = false;
  document.getElementById("reset-step2").hidden = true;
  document.getElementById("reset-name-input").value = "";
  document.getElementById("reset-answer-input").value = "";
  document.getElementById("reset-newpin-input").value = "";
  document.getElementById("login-message").textContent =
    "暗証番号を再設定したよ。新しい番号でログインしてね";
  switchScreen("login-screen");
}

async function enterApp(name, id) {
  currentUserName = name;
  myUserId = id;
  document.getElementById("welcome-text-greeting").textContent = `ようこそ、${name}さん`;
  await Promise.all([
    fetchRecords(),
    fetchNotes(),
    fetchGoal(),
    fetchExamDay(),
    fetchEvents(),
    fetchScores(),
    fetchProfile(),
  ]);
  renderWelcomeBadge();
  switchScreen("home-screen");
}

async function init() {
  setupEvents();
  const me = await fetchMe();
  if (me.loggedIn) {
    await enterApp(me.name, me.id);
  }
}

init();
