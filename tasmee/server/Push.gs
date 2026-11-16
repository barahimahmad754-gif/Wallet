/* ============================================================================
   دفتر التسميع — الإشعارات وواجهة التطبيق على GitHub
   ----------------------------------------------------------------------------
   أضف هذا الملف كما هو إلى مشروع Apps Script (ملف جديد باسم Push)، ثم:
     1) اختر الدالة pushSetup من القائمة أعلى المحرر واضغط «تشغيل» مرة واحدة،
        ووافق على الأذونات.
     2) نشر ← إدارة عمليات النشر ← تعديل ← الإصدار: «إصدار جديد» ← نشر.
        (الوصول يجب أن يكون: أي شخص)
   لا يغيّر هذا الملف شيئًا في بياناتك: يضيف فقط
     • doPost: يستقبل طلبات التطبيق المستضاف على GitHub ويوجّهها لدوالّك الحالية.
     • دوالّ push…: تحفظ اشتراكات الأجهزة وترسل الإشعارات (Web Push).
   ============================================================================ */

var PUSH_GLOBAL_ = this;

/* الدوالّ التي يُسمح للتطبيق باستدعائها عبر doPost (نفس ما كان يستدعيه من صفحة Google) */
var PUSH_API_ = ["getPublic", "teacherData", "planPublic", "planAnchorsOnly", "planHello", "planSet",
  "saveRecord", "deleteMine", "deletePart", "saveLesson", "deleteLesson", "setExcused", "setRoster",
  "setPin", "checkPin", "trustDevice", "trustedPin", "untrustDevice", "brandGet", "brandSet", "appUrl",
  "reportsInfo", "reportsNow", "reportsSetup", "saveExport", "importData", "deleteAll",
  "aiStatus", "aiAsk", "aiSetKey",
  "pushKey", "pushSub", "pushUnsub", "pushTest", "pushInfo", "pushCfgSet", "pushSend", "pushRecited", "pushRemindNow"];

function doPost(e) {
  var out;
  try {
    var q = JSON.parse(e.postData.contents), fn = String(q.fn || ""), args = Array.isArray(q.args) ? q.args : [];
    if (PUSH_API_.indexOf(fn) < 0) throw new Error("unknown function");
    var f = PUSH_GLOBAL_[fn];
    if (typeof f !== "function") throw new Error("missing function: " + fn);
    var res = f.apply(null, args);
    if (fn === "setExcused") { try { pushNoteExcused_(args[1], args[2], args[3]) } catch (err) { } }
    out = { ok: true, res: res === undefined ? null : res };
  } catch (err) { out = { ok: false, err: String((err && err.message) || err) } }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================ الإعداد والتخزين ============================ */

function pushProps_() { return PropertiesService.getScriptProperties() }

/* شغّلها مرة واحدة من المحرر */
function pushSetup() {
  var v = pushVapid_();
  pushTrigger_(true);
  Logger.log("الإشعارات جاهزة. المفتاح العام: " + v.pub);
  return "ok";
}

function pushCfg_() {
  var c = {}; try { c = JSON.parse(pushProps_().getProperty("push.cfg") || "{}") } catch (e) { }
  return { remind: c.remind !== false, hour: typeof c.hour === "number" ? c.hour : 17, results: c.results !== false, site: c.site || "" };
}
function pushCfgSave_(c) { pushProps_().setProperty("push.cfg", JSON.stringify(c)) }

function pushAuth_(pin) {
  var r = PUSH_GLOBAL_.checkPin(String(pin || ""));
  if (!r || !r.ok) throw new Error("pin");
}

function pushHasTrigger_() {
  try { return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "pushTick" }) } catch (e) { return false }
}
function pushTrigger_(on) {
  var ts = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === "pushTick" });
  if (on && !ts.length) ScriptApp.newTrigger("pushTick").timeBased().everyHours(1).create();
  if (!on) ts.forEach(function (t) { ScriptApp.deleteTrigger(t) });
}

/* مفتاحا VAPID: يُنشآن مرة واحدة ويبقيان في خصائص السكربت */
function pushVapid_() {
  var P = pushProps_(), v = P.getProperty("push.vapid");
  if (v) return JSON.parse(v);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    v = P.getProperty("push.vapid"); if (v) return JSON.parse(v);
    var kp = pcKeyPair_();
    v = { d: pcHex_(kp.d), pub: pcB64_(kp.pub) };
    P.setProperty("push.vapid", JSON.stringify(v));
    return v;
  } finally { lock.releaseLock() }
}

function pushSubs_() {
  var all = pushProps_().getProperties(), out = [];
  for (var k in all) if (k.indexOf("push.s.") === 0) { try { var s = JSON.parse(all[k]); s.k = k; out.push(s) } catch (e) { } }
  return out;
}
var PUSH_HOSTS_ = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|push\.apple\.com|mozilla\.com|notify\.windows\.com)\//i;

/* ============================== واجهة التطبيق ============================== */

function pushKey() { return { key: pushVapid_().pub } }

/* جهاز طالب يفعّل الإشعارات */
function pushSub(name, sub, site) {
  name = String(name || "").slice(0, 80);
  if (!name || !sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return { ok: false };
  var ep = String(sub.endpoint);
  if (ep.length > 1000 || !PUSH_HOSTS_.test(ep)) return { ok: false, error: "endpoint" };
  var key = "push.s." + pcHex_(pcSha_(pcUtf8_(ep))).slice(0, 24), P = pushProps_();
  if (!P.getProperty(key) && pushSubs_().length >= 500) return { ok: false, error: "full" };
  P.setProperty(key, JSON.stringify({ n: name, e: ep, p: String(sub.keys.p256dh).slice(0, 200), a: String(sub.keys.auth).slice(0, 100), t: Date.now() }));
  var c = pushCfg_();
  if (!c.site && /^https:\/\/[^\s]{4,200}$/.test(String(site || ""))) { c.site = String(site); pushCfgSave_(c) }
  return { ok: true };
}

function pushUnsub(endpoint) {
  pushProps_().deleteProperty("push.s." + pcHex_(pcSha_(pcUtf8_(String(endpoint || "")))).slice(0, 24));
  return { ok: true };
}

/* إشعار تجريبي لجهاز واحد (صاحب الجهاز نفسه) */
function pushTest(endpoint) {
  var c = CacheService.getScriptCache(), ck = "push.t." + pcHex_(pcSha_(pcUtf8_(String(endpoint || "")))).slice(0, 24);
  if (c.get(ck)) return { ok: true, sent: 0, wait: true };
  c.put(ck, "1", 20);
  var list = pushSubs_().filter(function (s) { return s.e === endpoint });
  var r = pushDeliver_(list, { title: "دفتر التسميع", body: "الإشعارات تعمل على هذا الجهاز." }, 600);
  r.ok = true; return r;
}

function pushInfo(pin) {
  pushAuth_(pin);
  var seen = {}, names = [];
  pushSubs_().forEach(function (s) { if (!seen[s.n]) { seen[s.n] = 1; names.push(s.n) } });
  var c = pushCfg_();
  return { ok: true, names: names, cfg: { remind: c.remind, hour: c.hour, results: c.results }, trigger: pushHasTrigger_() };
}

function pushCfgSet(pin, cfg) {
  pushAuth_(pin);
  var c = pushCfg_(); cfg = cfg || {};
  if (typeof cfg.remind === "boolean") c.remind = cfg.remind;
  if (typeof cfg.results === "boolean") c.results = cfg.results;
  var h = Math.round(Number(cfg.hour)); if (h >= 0 && h <= 23) c.hour = h;
  pushCfgSave_(c);
  var trig = true; try { pushTrigger_(c.remind) } catch (e) { trig = false }
  return { ok: true, trigger: trig && pushHasTrigger_() };
}

/* رسالة من المعلم: to = "*" لكل الطلاب، أو قائمة أسماء */
function pushSend(pin, to, title, body, kind) {
  pushAuth_(pin);
  var c = pushCfg_();
  if (kind === "result" && !c.results) return { ok: true, sent: 0, total: 0, off: true };
  title = String(title || "دفتر التسميع").slice(0, 80); body = String(body || "").trim().slice(0, 400);
  if (!body) return { ok: false };
  var subs = pushSubs_(), list = to === "*" ? subs.filter(function (s) { return s.n !== "المعلم" })
    : subs.filter(function (s) { return Array.isArray(to) && to.indexOf(s.n) >= 0 });
  var r = pushDeliver_(list, { title: title, body: body });
  r.ok = true; return r;
}

/* نتيجة تسميع سجّله طالب لزميله: النص يُبنى هنا، فلا يستطيع أحد إرسال نص من عنده */
function pushRecited(rec, rates, by) {
  if (!pushCfg_().results) return { ok: true, sent: 0 };
  if (!rec || !rec.reader || rec.reader === rec.listener) return { ok: true, sent: 0 };
  var R = ["مثالي", "ممتاز", "جيد", "مقبول", "يُعاد"], NM = { near: "القريبة", far: "البعيدة" }, parts = [], redo = false;
  ["near", "far"].forEach(function (k) {
    var x = rates && rates[k];
    if (x === 0 || x === 1 || x === 2 || x === 3 || x === 4) { parts.push(NM[k] + ": " + R[x]); if (x === 4) redo = true }
  });
  if (!parts.length) return { ok: true, sent: 0 };
  var c = CacheService.getScriptCache(), ck = "push.r." + pcHex_(pcSha_(pcUtf8_(String(rec.id || "") + "|" + rec.reader))).slice(0, 24);
  if (c.get(ck)) return { ok: true, sent: 0 };
  c.put(ck, "1", 600);
  by = String(by || "").replace(/[\r\n]+/g, " ").slice(0, 40);
  var body = parts.join(" · ") + (by ? " (عند " + by + ")" : "") + (redo ? ". راجع ما عليه إعادة وسمّعه من جديد." : "");
  var list = pushSubs_().filter(function (s) { return s.n === rec.reader });
  var r = pushDeliver_(list, { title: "سُجّل تسميعك", body: body });
  r.ok = true; return r;
}

/* ============================== التذكير اليومي ============================== */

function pushDay_(d) { return Utilities.formatDate(d || new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd") }

/* من استأذن اليوم لا يُذكَّر */
function pushNoteExcused_(day, name, on) {
  var P = pushProps_(), m = {}; try { m = JSON.parse(P.getProperty("push.exc") || "{}") } catch (e) { }
  day = String(day || ""); name = String(name || "");
  if (!m[day]) m[day] = {};
  if (on) m[day][name] = 1; else delete m[day][name];
  var keep = Object.keys(m).sort().slice(-4), o = {}; keep.forEach(function (d) { o[d] = m[d] });
  P.setProperty("push.exc", JSON.stringify(o));
}

function pushRemind_(day) {
  var pub = PUSH_GLOBAL_.getPublic("push", day, "") || {}, roster = pub.roster || [], done = {}, exc = {};
  (pub.taken || []).forEach(function (t) { done[t.reader] = 1 });
  try { exc = (JSON.parse(pushProps_().getProperty("push.exc") || "{}"))[day] || {} } catch (e) { }
  var list = pushSubs_().filter(function (s) { return roster.indexOf(s.n) >= 0 && !done[s.n] && !exc[s.n] });
  return pushDeliver_(list, { title: "تذكير التسميع", body: "لم يُسجَّل لك تسميع اليوم بعد. سمّع مقررك قبل نهاية اليوم.", tag: "remind" }, 6 * 3600);
}

function pushRemindNow(pin) {
  pushAuth_(pin);
  var r = pushRemind_(pushDay_()); r.ok = true; return r;
}

/* يعمل كل ساعة (مشغّل زمني): يرسل التذكير مرة واحدة في اليوم عند الساعة المحددة، عدا الجمعة والسبت */
function pushTick() {
  var c = pushCfg_(); if (!c.remind) return;
  var now = new Date(), tz = Session.getScriptTimeZone(), day = pushDay_(now);
  var hour = Number(Utilities.formatDate(now, tz, "H")), dow = Utilities.formatDate(now, tz, "EEE");
  if (dow === "Fri" || dow === "Sat") return;
  if (hour < c.hour || hour > c.hour + 2) return;
  var P = pushProps_(); if (P.getProperty("push.rem") === day) return;
  P.setProperty("push.rem", day);
  pushRemind_(day);
}

/* ================================ الإرسال ================================ */

function pushJwt_(aud, v, cfg) {
  var cache = null, ck = "push.j." + pcHex_(pcSha_(pcUtf8_(aud + "|" + v.pub))).slice(0, 24);
  try { cache = CacheService.getScriptCache(); var hit = cache.get(ck); if (hit) return hit } catch (e) { }
  var head = pcB64_(pcUtf8_(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  var claims = pcB64_(pcUtf8_(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: cfg.site || "https://github.com" })));
  var jwt = head + "." + claims + "." + pcB64_(pcSign_(pcUtf8_(head + "." + claims), pcBig_(pcUnhex_(v.d))));
  try { if (cache) cache.put(ck, jwt, 6 * 3600) } catch (e) { }
  return jwt;
}

function pushDeliver_(list, msg, ttl) {
  if (!list.length) return { sent: 0, total: 0 };
  var v = pushVapid_(), cfg = pushCfg_(), eph = pcKeyPair_(), payload = pcUtf8_(JSON.stringify(msg)), reqs = [], used = [];
  list.forEach(function (s) {
    try {
      var aud = s.e.match(/^https:\/\/[^\/]+/)[0], body = pcEncrypt_(payload, pcUnb64_(s.p), pcUnb64_(s.a), eph);
      reqs.push({
        url: s.e, method: "post", contentType: "application/octet-stream", muteHttpExceptions: true,
        payload: body.map(function (b) { return b > 127 ? b - 256 : b }),
        headers: { Authorization: "vapid t=" + pushJwt_(aud, v, cfg) + ", k=" + v.pub, "Content-Encoding": "aes128gcm", TTL: String(ttl || 86400), Urgency: "high" }
      });
      used.push(s);
    } catch (e) { }
  });
  if (!reqs.length) return { sent: 0, total: list.length };
  var rs; try { rs = UrlFetchApp.fetchAll(reqs) } catch (e) { return { sent: 0, total: list.length, error: String(e) } }
  var ok = 0, P = pushProps_();
  rs.forEach(function (r, i) {
    var c = r.getResponseCode();
    if (c >= 200 && c < 300) ok++;
    else if (c === 404 || c === 410) P.deleteProperty(used[i].k);   /* الجهاز ألغى الاشتراك */
  });
  return { sent: ok, total: list.length };
}

/* ============================================================================
   التشفير (JavaScript خالص، لأن Apps Script لا يوفّر ECDSA ولا AES-GCM)
   SHA-256 · HMAC · HKDF · AES-128-GCM · منحنى P-256 (ECDH و ECDSA) · RFC 8291
   ============================================================================ */

function pcUtf8_(s) {
  var o = [], i, c; s = String(s);
  for (i = 0; i < s.length; i++) {
    c = s.codePointAt(i); if (c > 0xffff) i++;
    if (c < 0x80) o.push(c);
    else if (c < 0x800) o.push(0xc0 | c >> 6, 0x80 | c & 63);
    else if (c < 0x10000) o.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    else o.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
  }
  return o;
}
var PC_A_ = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function pcB64_(b) {
  var s = "", i, n;
  for (i = 0; i < b.length; i += 3) {
    n = b[i] << 16 | (b[i + 1] || 0) << 8 | (b[i + 2] || 0);
    s += PC_A_[n >> 18 & 63] + PC_A_[n >> 12 & 63] + (i + 1 < b.length ? PC_A_[n >> 6 & 63] : "") + (i + 2 < b.length ? PC_A_[n & 63] : "");
  }
  return s;
}
function pcUnb64_(s) {
  s = String(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  var o = [], i, n, k, bits = 0, acc = 0;
  for (i = 0; i < s.length; i++) {
    k = PC_A_.indexOf(s[i]); if (k < 0) throw new Error("b64");
    acc = acc << 6 | k; bits += 6;
    if (bits >= 8) { bits -= 8; o.push(acc >> bits & 255) }
  }
  return o;
}
function pcHex_(b) { var s = "", i; for (i = 0; i < b.length; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16); return s }
function pcUnhex_(h) { var o = [], i; for (i = 0; i < h.length; i += 2) o.push(parseInt(h.substr(i, 2), 16)); return o }
function pcBig_(b) { return BigInt("0x" + (pcHex_(b) || "0")) }
function pcBytes_(n, len) { var h = n.toString(16); while (h.length < len * 2) h = "0" + h; return pcUnhex_(h) }

/* ---- SHA-256 ---- */
var PC_K_ = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
function pcSha_(m) {
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var l = m.length, b = m.slice(), i, j, w = [], a, t1, t2, s0, s1, v;
  b.push(0x80); while (b.length % 64 !== 56) b.push(0);
  var hi = Math.floor(l / 536870912), lo = (l * 8) >>> 0;
  b.push(hi >>> 24 & 255, hi >>> 16 & 255, hi >>> 8 & 255, hi & 255, lo >>> 24 & 255, lo >>> 16 & 255, lo >>> 8 & 255, lo & 255);
  for (i = 0; i < b.length; i += 64) {
    for (j = 0; j < 16; j++) w[j] = (b[i + j * 4] << 24 | b[i + j * 4 + 1] << 16 | b[i + j * 4 + 2] << 8 | b[i + j * 4 + 3]) >>> 0;
    for (j = 16; j < 64; j++) {
      s0 = (w[j - 15] >>> 7 | w[j - 15] << 25) ^ (w[j - 15] >>> 18 | w[j - 15] << 14) ^ (w[j - 15] >>> 3);
      s1 = (w[j - 2] >>> 17 | w[j - 2] << 15) ^ (w[j - 2] >>> 19 | w[j - 2] << 13) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }
    v = H.slice();
    for (j = 0; j < 64; j++) {
      s1 = (v[4] >>> 6 | v[4] << 26) ^ (v[4] >>> 11 | v[4] << 21) ^ (v[4] >>> 25 | v[4] << 7);
      t1 = (v[7] + s1 + ((v[4] & v[5]) ^ (~v[4] & v[6])) + PC_K_[j] + w[j]) >>> 0;
      s0 = (v[0] >>> 2 | v[0] << 30) ^ (v[0] >>> 13 | v[0] << 19) ^ (v[0] >>> 22 | v[0] << 10);
      t2 = (s0 + ((v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]))) >>> 0;
      v = [(t1 + t2) >>> 0, v[0], v[1], v[2], (v[3] + t1) >>> 0, v[4], v[5], v[6]];
    }
    for (j = 0; j < 8; j++) H[j] = (H[j] + v[j]) >>> 0;
  }
  a = []; for (j = 0; j < 8; j++) a.push(H[j] >>> 24, H[j] >>> 16 & 255, H[j] >>> 8 & 255, H[j] & 255);
  return a;
}
function pcHmac_(key, msg) {
  if (key.length > 64) key = pcSha_(key);
  var i = [], o = [], j; for (j = 0; j < 64; j++) { i.push((key[j] || 0) ^ 0x36); o.push((key[j] || 0) ^ 0x5c) }
  return pcSha_(o.concat(pcSha_(i.concat(msg))));
}
function pcRand_(n) {
  var o = [], i = 0;
  while (o.length < n) o = o.concat(pcSha_(pcUtf8_(Utilities.getUuid() + "|" + Utilities.getUuid() + "|" + (i++) + "|" + Date.now() + "|" + Math.random())));
  return o.slice(0, n);
}

/* ---- AES-128 + GCM ---- */
var PC_S_ = (function () {
  var s = [], p = 1, q = 1, x;
  do {
    p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0)) & 255;
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 255; if (q & 0x80) q ^= 0x09;
    x = q ^ (q << 1 | q >> 7) ^ (q << 2 | q >> 6) ^ (q << 3 | q >> 5) ^ (q << 4 | q >> 4);
    s[p] = (x ^ 0x63) & 255;
  } while (p !== 1);
  s[0] = 0x63; return s;
})();
function pcAesKey_(key) {
  var w = key.slice(), i, t, rc = 1;
  for (i = 16; i < 176; i += 4) {
    t = w.slice(i - 4, i);
    if (i % 16 === 0) { t = [PC_S_[t[1]] ^ rc, PC_S_[t[2]], PC_S_[t[3]], PC_S_[t[0]]]; rc = (rc << 1 ^ (rc & 0x80 ? 0x11b : 0)) & 255 }
    w.push(w[i - 16] ^ t[0], w[i - 15] ^ t[1], w[i - 14] ^ t[2], w[i - 13] ^ t[3]);
  }
  return w;
}
function pcAes_(w, blk) {
  var s = blk.slice(), r, i, t, c, a, b, x2 = function (v) { return (v << 1 ^ (v & 0x80 ? 0x11b : 0)) & 255 };
  for (i = 0; i < 16; i++) s[i] ^= w[i];
  for (r = 1; r <= 10; r++) {
    for (i = 0; i < 16; i++) s[i] = PC_S_[s[i]];
    t = s.slice(); for (i = 0; i < 16; i++) s[i] = t[(i + 4 * (i % 4)) % 16];
    if (r < 10) for (c = 0; c < 16; c += 4) {
      a = s.slice(c, c + 4); b = a.map(x2);
      s[c] = b[0] ^ a[1] ^ b[1] ^ a[2] ^ a[3]; s[c + 1] = a[0] ^ b[1] ^ a[2] ^ b[2] ^ a[3];
      s[c + 2] = a[0] ^ a[1] ^ b[2] ^ a[3] ^ b[3]; s[c + 3] = a[0] ^ b[0] ^ a[1] ^ a[2] ^ b[3];
    }
    for (i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
  }
  return s;
}
/* returns ciphertext || tag (16); iv is 12 bytes, no additional data */
function pcGcm_(key, iv, pt) {
  var w = pcAesKey_(key), B = BigInt, one = B(1), zero = B(0), R = B("0xe1000000000000000000000000000000");
  var H = pcBig_(pcAes_(w, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), ct = [], i, j, ks, n = 2;
  var ctr = function (k) { return iv.concat([k >>> 24 & 255, k >>> 16 & 255, k >>> 8 & 255, k & 255]) };
  for (i = 0; i < pt.length; i += 16) { ks = pcAes_(w, ctr(n++)); for (j = i; j < i + 16 && j < pt.length; j++) ct.push(pt[j] ^ ks[j - i]) }
  var mul = function (X) {
    var Z = zero, V = H, k;
    for (k = 127; k >= 0; k--) { if ((X >> B(k)) & one) Z ^= V; V = (V & one) ? (V >> one) ^ R : V >> one }
    return Z;
  };
  var X = zero, blk;
  for (i = 0; i < ct.length; i += 16) { blk = ct.slice(i, i + 16); while (blk.length < 16) blk.push(0); X = mul(X ^ pcBig_(blk)) }
  X = mul(X ^ B(ct.length * 8));
  var tag = pcBytes_(X ^ pcBig_(pcAes_(w, ctr(1))), 16);
  return ct.concat(tag);
}

/* ---- P-256 ---- */
var PC_EC_ = (function () {
  var B = BigInt, Z = B(0), O = B(1), T = B(2), TH = B(3), F = B(4), E = B(8);
  var P = B("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff"),
    N = B("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551"),
    Bc = B("0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b"),
    G = [B("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"), B("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5")];
  function mod(a, m) { var r = a % m; return r < Z ? r + m : r }
  function inv(a, m) {
    var lm = O, hm = Z, low = mod(a, m), high = m, q, nm, nw;
    while (low > O) { q = high / low; nm = hm - lm * q; nw = high - low * q; hm = lm; high = low; lm = nm; low = nw }
    return mod(lm, m);
  }
  function dbl(p) {
    if (p[2] === Z || p[1] === Z) return [Z, O, Z];
    var YY = mod(p[1] * p[1], P), S = mod(F * p[0] * YY, P), ZZ = mod(p[2] * p[2], P), M = mod(TH * (p[0] - ZZ) * (p[0] + ZZ), P);
    var X3 = mod(M * M - T * S, P);
    return [X3, mod(M * (S - X3) - E * YY * YY, P), mod(T * p[1] * p[2], P)];
  }
  function add(p, q) {
    if (p[2] === Z) return q; if (q[2] === Z) return p;
    var A = mod(p[2] * p[2], P), C = mod(q[2] * q[2], P), U1 = mod(p[0] * C, P), U2 = mod(q[0] * A, P);
    var S1 = mod(p[1] * q[2] * C, P), S2 = mod(q[1] * p[2] * A, P);
    if (U1 === U2) return S1 === S2 ? dbl(p) : [Z, O, Z];
    var H = mod(U2 - U1, P), R = mod(S2 - S1, P), HH = mod(H * H, P), HHH = mod(H * HH, P), V = mod(U1 * HH, P);
    var X3 = mod(R * R - HHH - T * V, P);
    return [X3, mod(R * (V - X3) - S1 * HHH, P), mod(H * p[2] * q[2], P)];
  }
  function mul(k, pt) {
    var r = [Z, O, Z], a = [pt[0], pt[1], O]; k = mod(k, N);
    while (k > Z) { if (k & O) r = add(r, a); a = dbl(a); k >>= O }
    if (r[2] === Z) return null;
    var zi = inv(r[2], P), z2 = mod(zi * zi, P);
    return [mod(r[0] * z2, P), mod(r[1] * z2 * zi, P)];
  }
  function onCurve(pt) { return pt[0] > Z && pt[0] < P && pt[1] > Z && pt[1] < P && mod(pt[1] * pt[1] - (pt[0] * pt[0] * pt[0] - TH * pt[0] + Bc), P) === Z }
  return { N: N, G: G, mod: mod, inv: inv, mul: mul, onCurve: onCurve, Z: Z, O: O };
})();
function pcPoint_(b) {   /* 65 bytes: 04 || X || Y */
  if (b.length !== 65 || b[0] !== 4) throw new Error("point");
  var pt = [pcBig_(b.slice(1, 33)), pcBig_(b.slice(33))];
  if (!PC_EC_.onCurve(pt)) throw new Error("point");
  return pt;
}
function pcPub_(pt) { return [4].concat(pcBytes_(pt[0], 32), pcBytes_(pt[1], 32)) }
function pcKeyPair_() {
  var E = PC_EC_, d = E.mod(pcBig_(pcRand_(40)), E.N - E.O) + E.O;
  return { d: pcBytes_(d, 32), pub: pcPub_(E.mul(d, E.G)) };
}
/* ECDSA P-256 / SHA-256, deterministic nonce (RFC 6979); returns r || s */
function pcSign_(msg, d) {
  var E = PC_EC_, h = pcSha_(msg), z = pcBig_(h), x = pcBytes_(d, 32), h1 = pcBytes_(E.mod(z, E.N), 32), V = [], K = [], i, k, pt, r, s;
  for (i = 0; i < 32; i++) { V.push(1); K.push(0) }
  K = pcHmac_(K, V.concat([0], x, h1)); V = pcHmac_(K, V);
  K = pcHmac_(K, V.concat([1], x, h1)); V = pcHmac_(K, V);
  for (; ;) {
    V = pcHmac_(K, V); k = pcBig_(V);
    if (k > E.Z && k < E.N) {
      pt = E.mul(k, E.G); r = E.mod(pt[0], E.N);
      if (r !== E.Z) { s = E.mod(E.inv(k, E.N) * (z + r * d), E.N); if (s !== E.Z) return pcBytes_(r, 32).concat(pcBytes_(s, 32)) }
    }
    K = pcHmac_(K, V.concat([0])); V = pcHmac_(K, V);
  }
}
/* RFC 8291 (aes128gcm): encrypts one push message for a subscription */
function pcEncrypt_(plain, uaPub, auth, eph, salt) {
  eph = eph || pcKeyPair_(); salt = salt || pcRand_(16);
  var shared = pcBytes_(PC_EC_.mul(pcBig_(eph.d), pcPoint_(uaPub))[0], 32);
  var ikm = pcHmac_(pcHmac_(auth, shared), pcUtf8_("WebPush: info").concat([0], uaPub, eph.pub, [1]));
  var prk = pcHmac_(salt, ikm);
  var cek = pcHmac_(prk, pcUtf8_("Content-Encoding: aes128gcm").concat([0, 1])).slice(0, 16);
  var nonce = pcHmac_(prk, pcUtf8_("Content-Encoding: nonce").concat([0, 1])).slice(0, 12);
  return salt.concat([0, 0, 16, 0, 65], eph.pub, pcGcm_(cek, nonce, plain.concat([2])));
}
