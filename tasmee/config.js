/* رابط تطبيق Apps Script (من: نشر ← إدارة عمليات النشر)، وينتهي بـ /exec */
window.TASMEE_API = "https://script.google.com/macros/s/AKfycbz2FptgFaJUgSi4qZ7ymk85zBFcUJrJMLwPLz7KElxS-K3kfdtquceDBTp8ClSIMJYRXg/exec";

/* التحديث التلقائي: كل تعديل ترفعه على GitHub يظهر عند الطلاب بلا أي خطوة منهم.
   يفحص التطبيق كل دقيقتين وعند الرجوع إليه؛ إن تغيّرت ملفاته أعاد التحميل
   في لحظة آمنة (التطبيق في الخلفية، أو لا أحد يكتب فيه منذ 20 ثانية). */
(function () {
  if (!window.fetch || location.protocol !== "https:") return;
  var FILES = ["./", "config.js", "sw.js"], base = null, pending = false, lastAct = Date.now(), busy = false;

  function hash(s) { var h = 5381, i; for (i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return s.length + ":" + h }
  function stamp() {
    return Promise.all(FILES.map(function (f) {
      return fetch(f, { cache: "no-store", credentials: "same-origin" }).then(function (r) { return r.ok ? r.text() : Promise.reject(r.status) });
    })).then(function (t) { return t.map(hash).join("|") });
  }
  function typing() {
    var a = document.activeElement;
    return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable);
  }
  function apply() {
    if (!pending) return;
    if (document.hidden || (!typing() && Date.now() - lastAct > 20000)) { pending = false; location.reload() }
  }
  function check() {
    if (busy || !navigator.onLine) return; busy = true;
    try { if (navigator.serviceWorker) navigator.serviceWorker.getRegistration().then(function (g) { if (g) g.update() }).catch(function () { }) } catch (e) { }
    stamp().then(function (s) {
      if (base === null) base = s;
      else if (s !== base) { pending = true; apply() }
    }).catch(function () { }).then(function () { busy = false });
  }

  ["pointerdown", "keydown", "input", "touchstart", "scroll"].forEach(function (ev) {
    window.addEventListener(ev, function () { lastAct = Date.now() }, { passive: true, capture: true });
  });
  document.addEventListener("visibilitychange", function () { if (document.hidden) apply(); else check() });
  window.addEventListener("online", check);
  setInterval(function () { if (pending) apply(); else if (!document.hidden) check() }, 120000);
  setInterval(apply, 5000);
  window.addEventListener("load", function () { setTimeout(check, 3000) });
})();
