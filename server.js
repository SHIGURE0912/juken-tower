// 中学受験勉強を記録するアプリのサーバー
// 名前と暗証番号(PIN)でログインし、人ごとに記録を分けてMongoDBに保存する

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { MongoClient, ObjectId } = require("mongodb");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.RENDER ? "0.0.0.0" : "127.0.0.1";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/juken-tower";
const SESSION_SECRET = process.env.SESSION_SECRET || "juken-tower-himitsu-key";
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || "juken-tower-encryption-key";
const SUBJECTS = ["国語", "算数", "理科", "社会"];

let db;

// マイページで本人にPIN・秘密の質問の答えを見せるための、元に戻せる暗号化
// (ログインの本人確認は今まで通りbcryptのハッシュ比較で行う)
function getEncryptionKey() {
  return crypto.createHash("sha256").update(ENCRYPTION_SECRET).digest();
}

function encryptText(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decryptText(encoded) {
  const data = Buffer.from(encoded, "base64");
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

// 6桁の数字だけのフレンドコードを、重複しないように作る
async function generateFriendCode() {
  for (let i = 0; i < 10; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await db.collection("users").findOne({ friendCode: code });
    if (!existing) return code;
  }
  throw new Error("フレンドコードの作成に失敗しました");
}

app.set("trust proxy", 1);
app.use(express.json({ limit: "5mb" })); // アイコン画像・チャット画像(base64)を受け取れるように上限を広げる
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

// 秘密の質問の答えは、表記ゆれ（大文字小文字・前後の空白）を気にしないよう正規化する
function normalizeAnswer(text) {
  return text.trim().toLowerCase();
}

// メールアドレスの形式チェック（実在確認メールは送らない方針。形式だけしっかり見る）
function isValidEmail(text) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

app.post("/api/auth/register", async (req, res) => {
  const { name, pin, securityQuestion, securityAnswer, isParent, email } = req.body;

  if (typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ error: "名前を入力してね" });
  }
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: "暗証番号は4桁の数字で入力してね" });
  }
  if (typeof securityQuestion !== "string" || securityQuestion.trim() === "") {
    return res.status(400).json({ error: "秘密の質問を選んでね" });
  }
  if (typeof securityAnswer !== "string" || securityAnswer.trim() === "") {
    return res.status(400).json({ error: "秘密の質問の答えを入力してね" });
  }
  if (isParent && (typeof email !== "string" || !isValidEmail(email))) {
    return res.status(400).json({ error: "正しいメールアドレスを入力してね" });
  }

  const trimmedName = name.trim();
  const existing = await db.collection("users").findOne({ name: trimmedName });
  if (existing) {
    return res.status(400).json({ error: "その名前はすでに使われています" });
  }

  const pinHash = await bcrypt.hash(pin, 10);
  const securityAnswerHash = await bcrypt.hash(normalizeAnswer(securityAnswer), 10);
  const friendCode = await generateFriendCode();
  const result = await db.collection("users").insertOne({
    name: trimmedName,
    pinHash,
    pinEncrypted: encryptText(pin),
    securityQuestion: securityQuestion.trim(),
    securityAnswerHash,
    securityAnswerEncrypted: encryptText(securityAnswer.trim()),
    friendCode,
    accountType: isParent ? "parent" : "child",
    email: isParent ? email.trim() : null,
  });

  req.session.userId = result.insertedId.toString();
  req.session.userName = trimmedName;
  res.json({ name: trimmedName, id: req.session.userId });
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
  res.json({ name: user.name, id: req.session.userId });
});

app.get("/api/auth/security-question", async (req, res) => {
  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  if (!name) {
    return res.status(400).json({ error: "名前を入力してね" });
  }

  const user = await db.collection("users").findOne({ name });
  if (!user || !user.securityQuestion) {
    return res.status(400).json({ error: "その名前は見つかりませんでした" });
  }
  res.json({ question: user.securityQuestion });
});

app.post("/api/auth/reset-pin", async (req, res) => {
  const { name, securityAnswer, newPin } = req.body;

  if (typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ error: "名前を入力してね" });
  }
  if (typeof securityAnswer !== "string" || securityAnswer.trim() === "") {
    return res.status(400).json({ error: "答えを入力してね" });
  }
  if (typeof newPin !== "string" || !/^\d{4}$/.test(newPin)) {
    return res.status(400).json({ error: "新しい暗証番号は4桁の数字で入力してね" });
  }

  const user = await db.collection("users").findOne({ name: name.trim() });
  if (!user || !user.securityAnswerHash) {
    return res.status(400).json({ error: "名前か答えがちがいます" });
  }
  const ok = await bcrypt.compare(normalizeAnswer(securityAnswer), user.securityAnswerHash);
  if (!ok) {
    return res.status(400).json({ error: "名前か答えがちがいます" });
  }

  const newPinHash = await bcrypt.hash(newPin, 10);
  await db
    .collection("users")
    .updateOne(
      { _id: user._id },
      { $set: { pinHash: newPinHash, pinEncrypted: encryptText(newPin) } }
    );
  res.json({ ok: true });
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
  res.json({ loggedIn: true, name: req.session.userName, id: req.session.userId });
});

// ---------- マイページ ----------

app.get("/api/profile", requireAuth, async (req, res) => {
  const user = await db
    .collection("users")
    .findOne({ _id: new ObjectId(req.session.userId) });
  if (!user) {
    return res.status(404).json({ error: "見つかりませんでした" });
  }

  const { balance } = await getPointsBalance(req.session.userId);

  res.json({
    name: user.name,
    friendCode: user.friendCode,
    pin: user.pinEncrypted ? decryptText(user.pinEncrypted) : null,
    securityQuestion: user.securityQuestion || "",
    securityAnswer: user.securityAnswerEncrypted
      ? decryptText(user.securityAnswerEncrypted)
      : null,
    avatarType: user.avatarType || null,
    avatarValue: user.avatarValue || null,
    towerSkin: user.towerSkin || "default",
    equippedBadge: user.equippedBadge || null,
    points: balance,
    accountType: user.accountType || "child",
    email: user.email || null,
  });
});

// 子供アカウントを保護者アカウントに変更する（逆方向はなし）
app.post("/api/profile/become-parent", requireAuth, async (req, res) => {
  const { email } = req.body;
  if (typeof email !== "string" || !isValidEmail(email)) {
    return res.status(400).json({ error: "正しいメールアドレスを入力してね" });
  }

  await db
    .collection("users")
    .updateOne(
      { _id: new ObjectId(req.session.userId) },
      { $set: { accountType: "parent", email: email.trim() } }
    );

  res.json({ ok: true });
});

const AVATAR_TEMPLATE_IDS = ["1", "2", "3", "4", "5"];
const TOWER_SKINS = ["default", "castle", "lego"];
const BADGE_TIERS = [10, 50, 100, 200, 300, 400, 500];

app.post("/api/profile/tower-skin", requireAuth, async (req, res) => {
  const { skin } = req.body;
  if (!TOWER_SKINS.includes(skin)) {
    return res.status(400).json({ error: "デザインが正しくありません" });
  }
  await db
    .collection("users")
    .updateOne({ _id: new ObjectId(req.session.userId) }, { $set: { towerSkin: skin } });
  res.json({ towerSkin: skin });
});

app.post("/api/profile/badge", requireAuth, async (req, res) => {
  const { tier } = req.body;
  const tierNumber = tier === null ? null : Number(tier);

  if (tierNumber !== null && !BADGE_TIERS.includes(tierNumber)) {
    return res.status(400).json({ error: "バッジが正しくありません" });
  }
  if (tierNumber !== null) {
    const count = await db
      .collection("records")
      .countDocuments({ userId: req.session.userId });
    if (count < tierNumber) {
      return res.status(400).json({ error: "まだ達成していないバッジだよ" });
    }
  }

  await db
    .collection("users")
    .updateOne(
      { _id: new ObjectId(req.session.userId) },
      { $set: { equippedBadge: tierNumber } }
    );
  res.json({ equippedBadge: tierNumber });
});

app.post("/api/profile/avatar", requireAuth, async (req, res) => {
  const { avatarType, avatarValue } = req.body;

  if (avatarType === "template") {
    if (!AVATAR_TEMPLATE_IDS.includes(avatarValue)) {
      return res.status(400).json({ error: "テンプレートが正しくありません" });
    }
  } else if (avatarType === "custom") {
    if (
      typeof avatarValue !== "string" ||
      !avatarValue.startsWith("data:image/") ||
      avatarValue.length > 1500000
    ) {
      return res.status(400).json({ error: "画像が正しくありません" });
    }
  } else {
    return res.status(400).json({ error: "アイコンの種類が正しくありません" });
  }

  await db
    .collection("users")
    .updateOne({ _id: new ObjectId(req.session.userId) }, { $set: { avatarType, avatarValue } });

  res.json({ avatarType, avatarValue });
});

// ---------- フレンド機能 ----------

app.get("/api/friends", requireAuth, async (req, res) => {
  const myId = req.session.userId;

  const friendships = await db
    .collection("friendships")
    .find({ $or: [{ userA: myId }, { userB: myId }] })
    .toArray();
  const friendIds = friendships.map((f) => (f.userA === myId ? f.userB : f.userA));
  const friendUsers = await db
    .collection("users")
    .find({ _id: { $in: friendIds.map((id) => new ObjectId(id)) } })
    .toArray();
  const friends = friendUsers.map((u) => {
    const friendId = u._id.toString();
    const friendship = friendships.find(
      (f) => f.userA === friendId || f.userB === friendId
    );
    const shareMap = (friendship && friendship.share) || {};
    return {
      id: friendId,
      name: u.name,
      avatarType: u.avatarType || null,
      avatarValue: u.avatarValue || null,
      accountType: u.accountType || "child",
      iShareWithThem: Boolean(shareMap[myId]),
      sharesWithMe: Boolean(shareMap[friendId]),
    };
  });

  const incoming = await db
    .collection("friendRequests")
    .find({ toUserId: myId, status: "pending" })
    .toArray();
  const outgoing = await db
    .collection("friendRequests")
    .find({ fromUserId: myId, status: "pending" })
    .toArray();

  res.json({
    friends,
    incomingRequests: incoming.map((r) => ({
      id: r._id.toString(),
      fromName: r.fromName,
    })),
    outgoingRequests: outgoing.map((r) => ({
      id: r._id.toString(),
      toName: r.toName,
    })),
  });
});

app.post("/api/friends/request", requireAuth, async (req, res) => {
  const { friendCode } = req.body;
  const myId = req.session.userId;

  if (typeof friendCode !== "string" || friendCode.trim() === "") {
    return res.status(400).json({ error: "フレンドコードを入力してね" });
  }

  const target = await db.collection("users").findOne({ friendCode: friendCode.trim() });
  if (!target) {
    return res.status(400).json({ error: "そのフレンドコードは見つかりませんでした" });
  }
  const targetId = target._id.toString();
  if (targetId === myId) {
    return res.status(400).json({ error: "自分自身には申請できません" });
  }

  const existingFriendship = await db.collection("friendships").findOne({
    $or: [
      { userA: myId, userB: targetId },
      { userA: targetId, userB: myId },
    ],
  });
  if (existingFriendship) {
    return res.status(400).json({ error: "すでにフレンドです" });
  }

  const existingRequest = await db.collection("friendRequests").findOne({
    status: "pending",
    $or: [
      { fromUserId: myId, toUserId: targetId },
      { fromUserId: targetId, toUserId: myId },
    ],
  });
  if (existingRequest) {
    return res.status(400).json({ error: "すでに申請中です" });
  }

  const me = await db.collection("users").findOne({ _id: new ObjectId(myId) });
  await db.collection("friendRequests").insertOne({
    fromUserId: myId,
    fromName: me.name,
    toUserId: targetId,
    toName: target.name,
    status: "pending",
    createdAt: new Date(),
  });

  res.json({ ok: true });
});

app.post("/api/friends/accept", requireAuth, async (req, res) => {
  const { requestId } = req.body;
  const myId = req.session.userId;

  const request = await db
    .collection("friendRequests")
    .findOne({ _id: new ObjectId(requestId), toUserId: myId, status: "pending" });
  if (!request) {
    return res.status(400).json({ error: "申請が見つかりませんでした" });
  }

  await db.collection("friendships").insertOne({
    userA: request.fromUserId,
    userB: request.toUserId,
    createdAt: new Date(),
    share: {}, // 誰が誰に「がんばりノート・せいせきコメント」を公開しているか(初期状態は非公開)
  });
  await db.collection("friendRequests").deleteOne({ _id: request._id });

  res.json({ ok: true });
});

app.post("/api/friends/reject", requireAuth, async (req, res) => {
  const { requestId } = req.body;
  const myId = req.session.userId;

  await db
    .collection("friendRequests")
    .deleteOne({ _id: new ObjectId(requestId), toUserId: myId, status: "pending" });

  res.json({ ok: true });
});

// このフレンドに自分のがんばりノート・せいせきコメントを見せるかどうかを設定する
app.post("/api/friends/share", requireAuth, async (req, res) => {
  const { friendId, share } = req.body;
  const myId = req.session.userId;

  const friendship = await db.collection("friendships").findOne({
    $or: [
      { userA: myId, userB: friendId },
      { userA: friendId, userB: myId },
    ],
  });
  if (!friendship) {
    return res.status(400).json({ error: "フレンドが見つかりませんでした" });
  }

  await db
    .collection("friendships")
    .updateOne({ _id: friendship._id }, { $set: { [`share.${myId}`]: Boolean(share) } });

  res.json({ ok: true, share: Boolean(share) });
});

// フレンドが公開してくれている場合だけ、そのフレンドのデータを見られるようにする関所
async function requireSharedAccess(req, res, next) {
  const myId = req.session.userId;
  const friendId = req.params.friendId;

  const friendship = await db.collection("friendships").findOne({
    $or: [
      { userA: myId, userB: friendId },
      { userA: friendId, userB: myId },
    ],
  });
  const shareMap = (friendship && friendship.share) || {};
  if (!friendship || !shareMap[friendId]) {
    return res.status(403).json({ error: "この人はまだ公開していません" });
  }
  next();
}

app.get("/api/friends/:friendId/notes", requireAuth, requireSharedAccess, async (req, res) => {
  const notes = await db
    .collection("notes")
    .find({ userId: req.params.friendId })
    .toArray();
  const map = {};
  notes.forEach((n) => {
    map[n.date] = n.text;
  });
  res.json(map);
});

app.get("/api/friends/:friendId/scores", requireAuth, requireSharedAccess, async (req, res) => {
  const scores = await db
    .collection("scores")
    .find({ userId: req.params.friendId })
    .toArray();
  res.json(scores.map(toClientDoc));
});

app.get("/api/friends/:friendId/records", requireAuth, requireSharedAccess, async (req, res) => {
  const records = await db
    .collection("records")
    .find({ userId: req.params.friendId })
    .toArray();
  res.json(records.map(toClientDoc));
});

// フレンドのがんばりを見た人が残す、応援の一言コメント
app.get(
  "/api/friends/:friendId/comments",
  requireAuth,
  requireSharedAccess,
  async (req, res) => {
    const comments = await db
      .collection("progressComments")
      .find({ targetUserId: req.params.friendId })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(comments.map(toClientDoc));
  }
);

app.post(
  "/api/friends/:friendId/comment",
  requireAuth,
  requireSharedAccess,
  async (req, res) => {
    const { text } = req.body;
    if (typeof text !== "string" || text.trim() === "") {
      return res.status(400).json({ error: "コメントを入力してね" });
    }
    const me = await db
      .collection("users")
      .findOne({ _id: new ObjectId(req.session.userId) });

    const doc = {
      targetUserId: req.params.friendId,
      fromUserId: req.session.userId,
      fromName: me.name,
      text: text.trim(),
      createdAt: new Date(),
    };
    const result = await db.collection("progressComments").insertOne(doc);
    res.json(toClientDoc({ ...doc, _id: result.insertedId }));
  }
);

// 自分のがんばりに、みんなが残してくれたコメントを見る
app.get("/api/my-progress-comments", requireAuth, async (req, res) => {
  const comments = await db
    .collection("progressComments")
    .find({ targetUserId: req.session.userId })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(comments.map(toClientDoc));
});

// ---------- チャット ----------

function conversationId(userIdA, userIdB) {
  return [userIdA, userIdB].sort().join("_");
}

async function areFriends(userIdA, userIdB) {
  const friendship = await db.collection("friendships").findOne({
    $or: [
      { userA: userIdA, userB: userIdB },
      { userA: userIdB, userB: userIdA },
    ],
  });
  return Boolean(friendship);
}

app.get("/api/messages/:friendId", requireAuth, async (req, res) => {
  const myId = req.session.userId;
  const friendId = req.params.friendId;

  if (!(await areFriends(myId, friendId))) {
    return res.status(403).json({ error: "フレンドではありません" });
  }

  const messages = await db
    .collection("messages")
    .find({ conversationId: conversationId(myId, friendId) })
    .sort({ createdAt: 1 })
    .toArray();

  res.json(
    messages.map((m) => ({
      id: m._id.toString(),
      fromUserId: m.fromUserId,
      text: m.text,
      imageData: m.imageData || null,
      createdAt: m.createdAt,
    }))
  );
});

app.post("/api/messages/:friendId", requireAuth, async (req, res) => {
  const myId = req.session.userId;
  const friendId = req.params.friendId;
  const { text, imageData } = req.body;

  if (!(await areFriends(myId, friendId))) {
    return res.status(403).json({ error: "フレンドではありません" });
  }
  const trimmedText = typeof text === "string" ? text.trim() : "";
  const hasImage = typeof imageData === "string" && imageData.startsWith("data:image/");
  if (trimmedText === "" && !hasImage) {
    return res.status(400).json({ error: "メッセージを入力してね" });
  }

  const doc = {
    conversationId: conversationId(myId, friendId),
    fromUserId: myId,
    text: trimmedText,
    imageData: hasImage ? imageData : null,
    createdAt: new Date(),
  };
  const result = await db.collection("messages").insertOne(doc);

  res.json({
    id: result.insertedId.toString(),
    fromUserId: myId,
    text: doc.text,
    imageData: doc.imageData,
    createdAt: doc.createdAt,
  });
});

// チャットの背景（自分だけに見える、フレンドごとの設定。変更するたびにポイントを消費する）
const CHAT_BG_COST = 6;

app.get("/api/chat-background/:friendId", requireAuth, async (req, res) => {
  const bg = await db
    .collection("chatBackgrounds")
    .findOne({ userId: req.session.userId, friendId: req.params.friendId });
  res.json({ imageData: bg ? bg.imageData : null });
});

app.post("/api/chat-background/:friendId", requireAuth, async (req, res) => {
  const myId = req.session.userId;
  const friendId = req.params.friendId;
  const { imageData } = req.body;

  if (!(await areFriends(myId, friendId))) {
    return res.status(403).json({ error: "フレンドではありません" });
  }
  if (typeof imageData !== "string" || !imageData.startsWith("data:image/")) {
    return res.status(400).json({ error: "画像が正しくありません" });
  }

  const spent = await trySpendPoints(myId, CHAT_BG_COST);
  if (!spent) {
    return res.status(400).json({ error: `ポイントが足りません（${CHAT_BG_COST}ポイント必要）` });
  }

  await db
    .collection("chatBackgrounds")
    .updateOne(
      { userId: myId, friendId },
      { $set: { imageData, updatedAt: new Date() } },
      { upsert: true }
    );

  const { balance } = await getPointsBalance(myId);
  res.json({ ok: true, imageData, points: balance });
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

// ---------- ポイント（30分勉強するごとに1ポイント）----------

// 貯めたポイントはrecordsの合計時間から毎回計算する(spentだけ user ドキュメントに記録)ので、
// ずれが起きにくい
async function getPointsBalance(userId) {
  const agg = await db
    .collection("records")
    .aggregate([
      { $match: { userId } },
      { $group: { _id: null, total: { $sum: "$minutes" } } },
    ])
    .toArray();
  const totalMinutes = agg.length > 0 ? agg[0].total : 0;
  const pointsEarned = Math.floor(totalMinutes / 30);

  const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
  const pointsSpent = (user && user.pointsSpent) || 0;

  return { totalMinutes, pointsEarned, pointsSpent, balance: pointsEarned - pointsSpent };
}

// ポイントを消費する。残高が足りなければ何もせずfalseを返す
async function trySpendPoints(userId, amount) {
  const { balance } = await getPointsBalance(userId);
  if (balance < amount) return false;
  await db
    .collection("users")
    .updateOne({ _id: new ObjectId(userId) }, { $inc: { pointsSpent: amount } });
  return true;
}

app.get("/api/points", requireAuth, async (req, res) => {
  const { balance } = await getPointsBalance(req.session.userId);
  res.json({ points: balance });
});

// ---------- ご褒美チケット（保護者が作り、子供がポイントで交換する）----------

async function requireParent(req, res, next) {
  const user = await db.collection("users").findOne({ _id: new ObjectId(req.session.userId) });
  if (!user || user.accountType !== "parent") {
    return res.status(403).json({ error: "保護者アカウントのみ利用できます" });
  }
  next();
}

app.post("/api/rewards", requireAuth, requireParent, async (req, res) => {
  const { title, imageData, price, repeatable } = req.body;

  if (typeof title !== "string" || title.trim() === "") {
    return res.status(400).json({ error: "ご褒美の内容を入力してね" });
  }
  const priceNumber = Number(price);
  if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
    return res.status(400).json({ error: "ポイント数が正しくありません" });
  }
  const hasImage = typeof imageData === "string" && imageData.startsWith("data:image/");

  const doc = {
    parentId: req.session.userId,
    title: title.trim(),
    imageData: hasImage ? imageData : null,
    price: Math.round(priceNumber),
    repeatable: Boolean(repeatable),
    createdAt: new Date(),
  };
  const result = await db.collection("rewards").insertOne(doc);
  res.json(toClientDoc({ ...doc, _id: result.insertedId }));
});

app.get("/api/rewards", requireAuth, requireParent, async (req, res) => {
  const rewards = await db
    .collection("rewards")
    .find({ parentId: req.session.userId })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(rewards.map(toClientDoc));
});

app.delete("/api/rewards/:rewardId", requireAuth, requireParent, async (req, res) => {
  await db
    .collection("rewards")
    .deleteOne({ _id: new ObjectId(req.params.rewardId), parentId: req.session.userId });
  res.json({ ok: true });
});

app.get("/api/parents/:parentId/rewards", requireAuth, async (req, res) => {
  const myId = req.session.userId;
  const parentId = req.params.parentId;

  if (!(await areFriends(myId, parentId))) {
    return res.status(403).json({ error: "フレンドではありません" });
  }

  const rewards = await db
    .collection("rewards")
    .find({ parentId })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(rewards.map(toClientDoc));
});

app.post(
  "/api/parents/:parentId/rewards/:rewardId/redeem",
  requireAuth,
  async (req, res) => {
    const myId = req.session.userId;
    const parentId = req.params.parentId;

    if (!(await areFriends(myId, parentId))) {
      return res.status(403).json({ error: "フレンドではありません" });
    }

    const reward = await db
      .collection("rewards")
      .findOne({ _id: new ObjectId(req.params.rewardId), parentId });
    if (!reward) {
      return res.status(404).json({ error: "ご褒美が見つかりませんでした" });
    }

    const spent = await trySpendPoints(myId, reward.price);
    if (!spent) {
      return res.status(400).json({ error: "ポイントが足りません" });
    }

    await db.collection("rewardTickets").insertOne({
      parentId,
      childId: myId,
      title: reward.title,
      imageData: reward.imageData,
      price: reward.price,
      redeemedAt: new Date(),
      seenByParent: false,
    });

    if (!reward.repeatable) {
      await db.collection("rewards").deleteOne({ _id: reward._id });
    }

    const { balance } = await getPointsBalance(myId);
    res.json({ ok: true, points: balance });
  }
);

app.get("/api/reward-tickets", requireAuth, async (req, res) => {
  const myId = req.session.userId;
  const user = await db.collection("users").findOne({ _id: new ObjectId(myId) });
  const isParent = user && user.accountType === "parent";

  const query = isParent ? { parentId: myId } : { childId: myId };
  const tickets = await db
    .collection("rewardTickets")
    .find(query)
    .sort({ redeemedAt: -1 })
    .toArray();

  if (isParent) {
    // 保護者が一覧を見たら「未確認」を消す（通知バッジ用）
    await db
      .collection("rewardTickets")
      .updateMany({ parentId: myId, seenByParent: false }, { $set: { seenByParent: true } });
  }

  const otherIds = tickets.map((t) => (isParent ? t.childId : t.parentId));
  const otherUsers = await db
    .collection("users")
    .find({ _id: { $in: otherIds.map((id) => new ObjectId(id)) } })
    .toArray();
  const nameById = {};
  otherUsers.forEach((u) => {
    nameById[u._id.toString()] = u.name;
  });

  res.json(
    tickets.map((t) => ({
      ...toClientDoc(t),
      otherName: nameById[isParent ? t.childId : t.parentId] || "",
    }))
  );
});

app.delete("/api/reward-tickets/:ticketId", requireAuth, async (req, res) => {
  const myId = req.session.userId;
  await db.collection("rewardTickets").deleteOne({
    _id: new ObjectId(req.params.ticketId),
    $or: [{ parentId: myId }, { childId: myId }],
  });
  res.json({ ok: true });
});

app.get("/api/reward-tickets/unseen-count", requireAuth, requireParent, async (req, res) => {
  const count = await db
    .collection("rewardTickets")
    .countDocuments({ parentId: req.session.userId, seenByParent: false });
  res.json({ count });
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

const EVENT_CATEGORIES = ["test", "school", "club", "cram", "rest", "birthday", "other"];

app.post("/api/events", requireAuth, async (req, res) => {
  const { date, endDate, category, title } = req.body;

  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "日付が正しくありません" });
  }
  const finalEndDate =
    typeof endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : date;
  if (finalEndDate < date) {
    return res.status(400).json({ error: "終了日は開始日より後にしてね" });
  }
  if (!EVENT_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "カテゴリが正しくありません" });
  }
  if (typeof title !== "string") {
    return res.status(400).json({ error: "予定のタイトルが正しくありません" });
  }

  const doc = {
    userId: req.session.userId,
    date,
    endDate: finalEndDate,
    category,
    title: title.trim(),
  };
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
    console.log(`スタディ記録タワーアプリが起動しました: http://localhost:${PORT}`);
  });
}

start();
