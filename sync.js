// kamus 云端同步：登录状态存本机，进度存 Cloudflare（kamus-sync Worker）
(function () {
  const API = "https://kamus-sync.seher01101.workers.dev";
  const AK = "kamus-auth";
  let auth = null;
  try { auth = JSON.parse(localStorage.getItem(AK) || "null"); } catch (e) {}
  const setAuth = a => { auth = a; try { a ? localStorage.setItem(AK, JSON.stringify(a)) : localStorage.removeItem(AK); } catch (e) {} };
  const listeners = [];
  let status = { state: auth ? "idle" : "off", at: 0, msg: "" };
  const emit = (state, msg) => { status = { state, at: state === "ok" ? Date.now() : status.at, msg: msg || "" }; listeners.forEach(f => { try { f(status); } catch (e) {} }); };

  async function call(path, opt = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth) headers.Authorization = "Bearer " + auth.token;
    let r;
    try { r = await fetch(API + path, { ...opt, headers }); }
    catch (e) { throw new Error("连不上同步服务器，检查一下网络"); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && auth && !/^\/(login|register)$/.test(path)) { setAuth(null); emit("off", "登录已失效，请重新登录"); }
    if (!r.ok) throw new Error(j.error || "同步失败（" + r.status + "）");
    return j;
  }

  const timers = {};
  window.KSync = {
    user: () => auth && auth.name,
    status: () => status,
    onStatus: f => listeners.push(f),
    async enter(name, pass, isNew) {
      const j = await call(isNew ? "/register" : "/login", { method: "POST", body: JSON.stringify({ name, pass }) });
      setAuth({ name: j.name, token: j.token }); emit("idle");
      return j.name;
    },
    async logout() { try { await call("/logout", { method: "POST" }); } catch (e) {} setAuth(null); emit("off"); },
    async pull(app) {
      if (!auth) return null;
      emit("busy");
      try { const j = await call("/progress?app=" + app); emit("ok"); return j.data; }
      catch (e) { emit("err", e.message); throw e; }
    },
    async push(app, data) {
      if (!auth) return;
      clearTimeout(timers[app]); timers[app] = 0; emit("busy");
      try { await call("/progress?app=" + app, { method: "PUT", body: JSON.stringify({ data }) }); emit("ok"); }
      catch (e) { emit("err", e.message); }
    },
    // 学习时频繁保存：停下来 4 秒后跑一次 run()（页面自己的“拉取→合并→上传”）
    later(app, run, getData) {
      if (!auth) return;
      clearTimeout(timers[app]);
      timers[app] = setTimeout(() => { timers[app] = 0; run(); }, 4000);
      timers[app + ":get"] = getData;
    },
    // 关页面 / 切到后台时，把还没上传的立刻发出去
    flush() {
      if (!auth) return;
      Object.keys(timers).filter(k => !k.includes(":")).forEach(app => {
        if (!timers[app]) return;
        clearTimeout(timers[app]); timers[app] = 0;
        const body = JSON.stringify({ data: timers[app + ":get"]() });
        // keepalive 最多 64KB，超过就用普通请求（切后台时一般也能发完）
        try { fetch(API + "/progress?app=" + app, { method: "PUT", keepalive: body.length < 60000, headers: { "Content-Type": "application/json", Authorization: "Bearer " + auth.token }, body }); } catch (e) {}
      });
    },
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") KSync.flush(); });
  window.addEventListener("pagehide", () => KSync.flush());
})();
