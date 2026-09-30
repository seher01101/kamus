// kamus 收藏 + 查询次数：存本机 localStorage，登录后跟账号同步（KSync app "fav"）
// 数据：f[词] = {w, m, a(印尼语音频), za(中文音频), t(收藏/取消时间), del(已取消)}；l[词] = {n(查过几次), t(最后一次)}
(function () {
  const KEY = "kamus-fav-v1";
  let D;
  try { D = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  D = Object.assign({ f: {}, l: {} }, D || {});
  const subs = [];
  let synced = false;
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) {} };
  const changed = () => {
    write(); subs.forEach(f => { try { f(); } catch (e) {} });
    if (window.KSync && synced) KSync.later("fav", sync, () => D);
  };
  function merge(r) {
    if (!r) return;
    for (const k in r.f || {}) if (!D.f[k] || (r.f[k].t || 0) > (D.f[k].t || 0)) D.f[k] = r.f[k];
    for (const k in r.l || {}) {
      const a = D.l[k], b = r.l[k];
      D.l[k] = a ? { n: Math.max(a.n || 0, b.n || 0), t: Math.max(a.t || 0, b.t || 0) } : b;
    }
  }
  async function sync() {
    if (!window.KSync || !KSync.user()) return;
    try { merge(await KSync.pull("fav")); write(); synced = true; await KSync.push("fav", D); subs.forEach(f => { try { f(); } catch (e) {} }); } catch (e) {}
  }
  window.KFav = {
    isFav: k => !!(D.f[k] && !D.f[k].del),
    // rec = {w, m, a, za}；返回新的状态（true = 已收藏）
    toggle(k, rec) {
      const on = !KFav.isFav(k);
      D.f[k] = on ? Object.assign({}, rec, { t: Date.now() }) : Object.assign({}, D.f[k], { del: 1, t: Date.now() });
      changed(); return on;
    },
    list: () => Object.entries(D.f).filter(([, v]) => !v.del).map(([k, v]) => Object.assign({ k }, v)).sort((a, b) => b.t - a.t),
    look(k) { const x = D.l[k] || { n: 0 }; D.l[k] = { n: (x.n || 0) + 1, t: Date.now() }; changed(); return D.l[k].n; },
    count: k => (D.l[k] && D.l[k].n) || 0,
    looks: () => Object.entries(D.l).map(([k, v]) => Object.assign({ k }, v)),
    onChange: f => subs.push(f),
    sync,
  };
  window.addEventListener("storage", e => { if (e.key === KEY) { try { D = Object.assign({ f: {}, l: {} }, JSON.parse(e.newValue || "{}")); subs.forEach(f => f()); } catch (x) {} } });
  sync();
})();
