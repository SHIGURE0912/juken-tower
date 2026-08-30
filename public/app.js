// 妹の中学受験勉強を記録するアプリのフロントエンド処理

const SUBJECT_COLORS = {
  国語: "#ff6b81",
  算数: "#4a90e2",
  理科: "#4caf50",
  社会: "#ffa726",
};
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

let currentUserName = null;
let records = [];
let notes = {};
let goal = { minutesTarget: 0, memo: "" };
let examDay = { date: "", label: "受験本番" };
let events = [];
let scores = [];
let selectedSubject = null;
let selectedGradeSubject = null;
let timerSeconds = 0;
let timerInterval = null;
let detailDate = null;

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

async function saveEventApi(date, title) {
  const res = await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, title }),
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
  container.innerHTML = "";
  const recent = recordList.slice(-30); // 表示は直近30件まで
  recent.forEach((r, index) => {
    const block = document.createElement("div");
    block.className = "tower-block";
    block.style.background = SUBJECT_COLORS[r.subject];
    block.style.height = blockHeight(r.minutes) + "px";
    block.title = `${r.date} ${r.subject} ${r.minutes}分`;
    if (highlightLastAsNew && index === recent.length - 1) {
      block.classList.add("new");
    }
    container.appendChild(block);
  });
}

// ---------- ホーム画面 ----------

function renderHome() {
  renderTower(document.getElementById("tower"), records, false);

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

function showCompleteScreen(subject, minutes) {
  document.getElementById(
    "complete-message"
  ).textContent = `${subject} を ${minutes}分がんばったね！`;
  renderTower(document.getElementById("complete-tower"), records, true);
  switchScreen("complete-screen");
}

// ---------- 履歴・カレンダー画面 ----------

function renderCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

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

  WEEKDAYS.forEach((w) => {
    const el = document.createElement("div");
    el.className = "weekday";
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
    const cell = document.createElement("div");
    cell.className = "calendar-day";
    if (dateStr === todayStr) cell.classList.add("today");

    const num = document.createElement("span");
    num.textContent = day;
    cell.appendChild(num);

    const subjectsToday = recordsByDate[dateStr];
    if (subjectsToday) {
      const dots = document.createElement("div");
      dots.className = "day-dots";
      subjectsToday.forEach((subject) => {
        const dot = document.createElement("span");
        dot.className = "day-dot";
        dot.style.background = SUBJECT_COLORS[subject];
        dots.appendChild(dot);
      });
      cell.appendChild(dots);
    }

    if (notes[dateStr]) {
      cell.classList.add("has-note");
    }
    if (events.some((e) => e.date === dateStr)) {
      cell.classList.add("has-event");
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

  renderDayEvents(dateStr);

  switchScreen("day-detail-screen");
}

function renderDayEvents(dateStr) {
  const list = document.getElementById("day-events-list");
  list.innerHTML = "";
  const dayEvents = events.filter((e) => e.date === dateStr);

  if (dayEvents.length === 0) {
    list.innerHTML = `<p class="no-record-text">予定はまだありません</p>`;
    return;
  }

  dayEvents.forEach((e) => {
    const row = document.createElement("div");
    row.className = "day-event-row";

    const label = document.createElement("span");
    label.textContent = `📌 ${e.title}`;
    row.appendChild(label);

    const delBtn = document.createElement("button");
    delBtn.className = "small-delete-btn";
    delBtn.textContent = "削除";
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
  const input = document.getElementById("day-event-input");
  const title = input.value.trim();
  if (!title) return;

  const event = await saveEventApi(detailDate, title);
  events.push(event);
  input.value = "";
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

function renderHistory() {
  const streak = calcStreak(records);
  document.getElementById(
    "streak-badge-history"
  ).textContent = `🔥 ${streak}日連続`;
  renderWeeklyChart();
  renderCalendar();
  renderSubjectTotals();
}

// ---------- せいせき画面 ----------

function selectGradeSubject(subject) {
  selectedGradeSubject = subject;
  document.querySelectorAll("#grades-screen .subject-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.subject === subject);
  });
  renderGradesScreen();
}

function renderGradeChart(subjectScores) {
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
  hint.hidden = true;
  svg.hidden = false;

  const PAD_SIDE = 24;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 34;
  const W = 300;
  const H = 180;
  const n = subjectScores.length;
  const xStep = n > 1 ? (W - PAD_SIDE * 2) / (n - 1) : 0;
  const color = SUBJECT_COLORS[subjectScores[0].subject];
  const svgNS = "http://www.w3.org/2000/svg";
  const plotHeight = H - PAD_TOP - PAD_BOTTOM;

  const yForScore = (score) => PAD_TOP + plotHeight - (score / 100) * plotHeight;

  const axis = document.createElementNS(svgNS, "line");
  axis.setAttribute("x1", PAD_SIDE);
  axis.setAttribute("y1", PAD_TOP + plotHeight);
  axis.setAttribute("x2", W - PAD_SIDE);
  axis.setAttribute("y2", PAD_TOP + plotHeight);
  axis.setAttribute("stroke", "#ddd");
  svg.appendChild(axis);

  const points = subjectScores.map((s, i) => {
    const x = PAD_SIDE + (n > 1 ? i * xStep : (W - PAD_SIDE * 2) / 2);
    const y = yForScore(s.score);
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

  points.forEach((p) => {
    const d = new Date(p.s.date + "T00:00:00");
    const dateLabel = document.createElementNS(svgNS, "text");
    dateLabel.setAttribute("x", p.x);
    dateLabel.setAttribute("y", H - 10);
    dateLabel.setAttribute("text-anchor", "middle");
    dateLabel.setAttribute("font-size", "9");
    dateLabel.setAttribute("fill", "#999");
    dateLabel.textContent = `${d.getMonth() + 1}/${d.getDate()}`;
    svg.appendChild(dateLabel);

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
  document.querySelectorAll("#grades-screen .subject-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.subject === selectedGradeSubject);
  });

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

  renderGradeChart(subjectScores);
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

  document.getElementById("login-btn").addEventListener("click", handleLogin);
  document
    .getElementById("register-btn")
    .addEventListener("click", handleRegister);
  document
    .getElementById("logout-btn")
    .addEventListener("click", handleLogout);

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
  await enterApp(data.name);
}

async function handleRegister() {
  const name = document.getElementById("login-name-input").value;
  const pin = document.getElementById("login-pin-input").value;
  const msg = document.getElementById("login-message");

  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, pin }),
  });
  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data.error || "登録できませんでした";
    return;
  }
  msg.textContent = "";
  await enterApp(data.name);
}

async function handleLogout() {
  await fetch("/api/auth/logout", { method: "POST" });
  location.reload();
}

async function enterApp(name) {
  currentUserName = name;
  document.getElementById("welcome-text").textContent = `ようこそ、${name}さん`;
  await Promise.all([
    fetchRecords(),
    fetchNotes(),
    fetchGoal(),
    fetchExamDay(),
    fetchEvents(),
    fetchScores(),
  ]);
  switchScreen("home-screen");
}

async function init() {
  setupEvents();
  const me = await fetchMe();
  if (me.loggedIn) {
    await enterApp(me.name);
  }
}

init();
