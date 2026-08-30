// 中学受験勉強を記録するアプリのサーバー
// 名前と暗証番号(PIN)でログインし、人ごとに記録を分けてMongoDBに保存する

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { MongoClient, ObjectId } = require("mongodb");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.RENDER ? "0.0.0.0" : "127.0.0.1";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/juken-tower";
const SESSION_SECRET = process.env.SESSION_SECRET || "juken-tower-himitsu-key";
const SUBJECTS = ["国語", "算数", "理科", "社会"];

let db;

app.set("trust proxy", 1);
app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30日
      secure: Boolean(process.env.RENDER),
    },
  })
);
app.use(express.static(path.join(__dirname, "public")));

// 今日の日付を YYYY-MM-DD 形式で取得（サーバーの時刻を使う）
function todayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// MongoDBのドキュメントをフロント向けの形に変換する（_idをidにする）
function toClientDoc(doc) {
  const { _id, userId, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "ログインしてください" });
  }
  next();
}

// ---------- ログイン・新規登録 ----------

app.post("/api/auth/register", async (req, res) => {
  const { name, pin } = req.body;

  if (typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ error: "名前を入力してね" });
  }
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: "暗証番号は4桁の数字で入力してね" });
  }

  const trimmedName = name.trim();
  const existing = await db.collection("users").findOne({ name: trimmedName });
  if (existing) {
    return res.status(400).json({ error: "その名前はすでに使われています" });
  }

  const pinHash = await bcrypt.hash(pin, 10);
  const result = await db.collection("users").insertOne({ name: trimmedName, pinHash });

  req.session.userId = result.insertedId.toString();
  req.session.userName = trimmedName;
  res.json({ name: trimmedName });
});

app.post("/api/auth/login", async (req, res) => {
  const { name, pin } = req.body;

  if (typeof name !== "string" || typeof pin !== "string") {
    return res.status(400).json({ error: "名前と暗証番号を入力してね" });
  }

  const user = await db.collection("users").findOne({ name: name.trim() });
  if (!user) {
    return res.status(400).json({ error: "名前か暗証番号がちがいます" });
  }
  const ok = await bcrypt.compare(pin, user.pinHash);
  if (!ok) {
    return res.status(400).json({ error: "名前か暗証番号がちがいます" });
  }

  req.session.userId = user._id.toString();
  req.session.userName = user.name;
  res.json({ name: user.name });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session.userId) {
    return res.json({ loggedIn: false });
  }
  res.json({ loggedIn: true, name: req.session.userName });
});

// ---------- 勉強記録 ----------

app.get("/api/records", requireAuth, async (req, res) => {
  const records = await db
    .collection("records")
    .find({ userId: req.session.userId })
    .toArray();
  res.json(records.map(toClientDoc));
});

app.post("/api/records", requireAuth, async (req, res) => {
  const { subject, minutes } = req.body;

  if (!SUBJECTS.includes(subject)) {
    return res.status(400).json({ error: "教科が正しくありません" });
  }
  const minutesNumber = Number(minutes);
  if (!Number.isFinite(minutesNumber) || minutesNumber <= 0) {
    return res.status(400).json({ error: "勉強時間が正しくありません" });
  }

  const doc = {
    userId: req.session.userId,
    date: todayString(),
    subject,
    minutes: Math.round(minutesNumber),
  };
  const result = await db.collection("records").insertOne(doc);
  res.json(toClientDoc({ ...doc, _id: result.insertedId }));
});

// ---------- 日付ごとのメモ ----------

app.get("/api/notes", requireAuth, async (req, res) => {
  const notes = await db
    .collection("notes")
    .find({ userId: req.session.userId })
    .toArray();
  const map = {};
  notes.forEach((n) => {
    map[n.date] = n.text;
  });
  res.json(map);
});

app.post("/api/notes", requireAuth, async (req, res) => {
  const { date, text } = req.body;

  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "日付が正しくありません" });
  }
  if (typeof text !== "string") {
    return res.status(400).json({ error: "メモが正しくありません" });
  }

  if (text.trim() === "") {
    await db.collection("notes").deleteOne({ userId: req.session.userId, date });
  } else {
    await db
      .collection("notes")
      .updateOne(
        { userId: req.session.userId, date },
        { $set: { text } },
        { upsert: true }
      );
  }
  res.json({ date, text });
});

// ---------- 成績（点数・偏差値） ----------

app.get("/api/scores", requireAuth, async (req, res) => {
  const scores = await db
    .collection("scores")
    .find({ userId: req.session.userId })
    .toArray();
  res.json(scores.map(toClientDoc));
});

app.post("/api/scores", requireAuth, async (req, res) => {
  const { date, subject, score, hensachi, comment } = req.body;

  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "日付が正しくありません" });
  }
  if (!SUBJECTS.includes(subject)) {
    return res.status(400).json({ error: "教科が正しくありません" });
  }
  const scoreNumber = Number(score);
  if (!Number.isFinite(scoreNumber) || scoreNumber < 0 || scoreNumber > 100) {
    return res.status(400).json({ error: "点数が正しくありません" });
  }
  let hensachiNumber = null;
  if (hensachi !== "" && hensachi !== null && hensachi !== undefined) {
    hensachiNumber = Number(hensachi);
    if (!Number.isFinite(hensachiNumber) || hensachiNumber < 0 || hensachiNumber > 100) {
      return res.status(400).json({ error: "偏差値が正しくありません" });
    }
  }

  const doc = {
    userId: req.session.userId,
    date,
    subject,
    score: scoreNumber,
    hensachi: hensachiNumber,
    comment: typeof comment === "string" ? comment.trim() : "",
  };
  const result = await db.collection("scores").insertOne(doc);
  res.json(toClientDoc({ ...doc, _id: result.insertedId }));
});

app.delete("/api/scores/:id", requireAuth, async (req, res) => {
  await db
    .collection("scores")
    .deleteOne({ _id: new ObjectId(req.params.id), userId: req.session.userId });
  res.json({ ok: true });
});

// ---------- 今週の目標 ----------

app.get("/api/goal", requireAuth, async (req, res) => {
  const goal = await db.collection("goals").findOne({ userId: req.session.userId });
  res.json({
    minutesTarget: goal ? goal.minutesTarget : 0,
    memo: goal ? goal.memo : "",
  });
});

app.post("/api/goal", requireAuth, async (req, res) => {
  const { minutesTarget, memo } = req.body;
  const minutesNumber = Number(minutesTarget);

  if (!Number.isFinite(minutesNumber) || minutesNumber < 0) {
    return res.status(400).json({ error: "目標時間が正しくありません" });
  }
  if (typeof memo !== "string") {
    return res.status(400).json({ error: "目標メモが正しくありません" });
  }

  const goalDoc = { minutesTarget: Math.round(minutesNumber), memo };
  await db
    .collection("goals")
    .updateOne({ userId: req.session.userId }, { $set: goalDoc }, { upsert: true });
  res.json(goalDoc);
});

// ---------- カレンダーの予定 ----------

app.get("/api/events", requireAuth, async (req, res) => {
  const events = await db
    .collection("events")
    .find({ userId: req.session.userId })
    .toArray();
  res.json(events.map(toClientDoc));
});

app.post("/api/events", requireAuth, async (req, res) => {
  const { date, title } = req.body;

  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "日付が正しくありません" });
  }
  if (typeof title !== "string" || title.trim() === "") {
    return res.status(400).json({ error: "予定のタイトルが正しくありません" });
  }

  const doc = { userId: req.session.userId, date, title: title.trim() };
  const result = await db.collection("events").insertOne(doc);
  res.json(toClientDoc({ ...doc, _id: result.insertedId }));
});

app.delete("/api/events/:id", requireAuth, async (req, res) => {
  await db
    .collection("events")
    .deleteOne({ _id: new ObjectId(req.params.id), userId: req.session.userId });
  res.json({ ok: true });
});

// ---------- 受験本番の日 ----------

app.get("/api/exam-day", requireAuth, async (req, res) => {
  const examDay = await db.collection("examDays").findOne({ userId: req.session.userId });
  res.json({
    date: examDay ? examDay.date : "",
    label: examDay ? examDay.label : "受験本番",
  });
});

app.post("/api/exam-day", requireAuth, async (req, res) => {
  const { date, label } = req.body;

  if (date !== "" && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return res.status(400).json({ error: "日付が正しくありません" });
  }
  if (typeof label !== "string" || label.trim() === "") {
    return res.status(400).json({ error: "名前が正しくありません" });
  }

  const examDoc = { date, label: label.trim() };
  await db
    .collection("examDays")
    .updateOne({ userId: req.session.userId }, { $set: examDoc }, { upsert: true });
  res.json(examDoc);
});

// ---------- 起動 ----------

async function start() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db();
  console.log("データベースにつながりました");

  app.listen(PORT, HOST, () => {
    console.log(`受験タワーアプリが起動しました: http://localhost:${PORT}`);
  });
}

start();
