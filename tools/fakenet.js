// 가짜 Firebase 서버(Node 메모리): tools/smokeparty.js와 tools/smokeinter.js가 같이 쓴다. database.rules.json의 같은 의미(ver +1, 임대 만료, 4명 제한,
// 교역 상태 전이, 프로젝트 상한, 점수는 줄지 않음·상한)를 코드로 흉내 낸다. 실제 규칙은 Firebase 콘솔 규칙 시뮬레이터로 확인한다.
// ---- 가짜 서버: Firebase와 같은 규칙을 코드로 흉내 낸다 ----
const clean = (v) => { if (Array.isArray(v)) { const a = v.map(clean).filter(x => x !== undefined); return a.length ? a : undefined; } if (v && typeof v === 'object') { const o = {}; for (const k in v) { const c = clean(v[k]); if (c !== undefined) o[k] = c; } return Object.keys(o).length ? o : undefined; } return v === null ? undefined : v; };   // 빈 배열·빈 객체·null을 지운다(Firebase처럼)
const server = { parties: {}, codes: {}, pages: new Map(), n: 0 };
function snapOf(pid) { const p = server.parties[pid]; return p ? JSON.parse(JSON.stringify({ meta: { name: p.name, color: p.color, code: p.code, owner: p.owner }, members: p.members, state: p.state || null, lease: p.lease || null })) : null; }
async function emit(pid) { for (const [page, w] of server.pages) if (w.has(pid)) { const s = snapOf(pid); await page.evaluate(([pid, s]) => window.__fakeEmit(pid, s), [pid, s]).catch(() => {}); } }
async function emitLog(pid) { for (const [page, w] of server.pages) if (w.has(pid)) { const l = (server.parties[pid] && server.parties[pid].log || []).slice(-20); await page.evaluate(([pid, l]) => window.__fakeEmitLog(pid, l), [pid, l]).catch(() => {}); } }
async function handle(page, uid, nick, method, a) {
  const P = (pid) => server.parties[pid];
  switch (method) {
    case 'create': { const [name, color] = a; const pid = 'p' + (++server.n); const code = 'AB' + String(server.n).padStart(4, '2'); server.parties[pid] = { name, color, code, owner: uid, members: { [uid]: { nick, t: Date.now(), code } }, log: [] }; server.codes[code] = pid; return { pid, code }; }
    case 'join': { const pid = server.codes[String(a[0]).toUpperCase()]; if (!pid) throw new Error('없는 초대 코드입니다.'); const p = P(pid); if (!p.members[uid] && Object.keys(p.members).length >= 4) throw new Error('인원이 가득 찼습니다'); p.members[uid] = { nick, t: Date.now(), code: p.code }; await emit(pid); return pid; }
    case 'leave': { const p = P(a[0]); if (p) delete p.members[uid]; for (const [pg, w] of server.pages) if (pg === page) w.delete(a[0]); await emit(a[0]); return null; }
    case 'watch': { server.pages.get(page).add(a[0]); setTimeout(() => emit(a[0]), 20); return null; }
    case 'unwatch': { server.pages.get(page).delete(a[0]); return null; }
    case 'watchlog': { setTimeout(() => emitLog(a[0]), 20); return null; }
    case 'lease': { const [pid, active, ms] = a, p = P(pid), L = p.lease, now = Date.now(); if (L && L.uid !== uid && L.active && L.exp > now) return false; p.lease = { uid, nick, active: !!active, exp: now + ms }; await emit(pid); return true; }
    case 'publish': { const [pid, base, st] = a, p = P(pid); if (!p.members[uid]) return { ok: false }; const cur = p.state ? p.state.ver : 0; if (cur !== base) return { ok: false, ver: cur }; p.state = Object.assign(clean(st), { ver: base + 1, by: uid }); await emit(pid); return { ok: true, ver: base + 1 }; }
    case 'log': { const [pid, e] = a; P(pid).log.push(Object.assign({ uid, nick, t: Date.now() }, e)); await emitLog(pid); return null; }
    case 'beat': { const p = P(a[0]); if (p && p.members[uid]) p.members[uid].t = Date.now(); return null; }
  }
}

// ---- 팀 간 교류(11단계) ----
server.pubs = {}; server.trades = {}; server.project = { have: {}, byTeam: {} }; server.reports = {}; server.boards = {};
const PROJECT_NEED = { water: 3000, salt: 300, ice: 20 }, BOARD_CAP = { env: 3, core: 60, water: 2000, predict: 30 };
const memberOf = (pid, uid) => server.parties[pid] && server.parties[pid].members[uid];
async function emitProject() { for (const [page, w] of server.pages) if (w.has('__project')) await page.evaluate((p) => window.__fakeEmitProject && window.__fakeEmitProject(p), JSON.parse(JSON.stringify(server.project))).catch(() => {}); }
server.maps = {}; server.info = new Map();
async function pushPeers(map) {   // 같은 지도에 있는 모든 화면에 나를 뺀 사람들의 위치를 보낸다(접속 표시, 10단계의 presence 흉내)
  for (const [page, inf] of server.info) if (inf.map === map) { const peers = {}; for (const [id, q] of Object.entries(server.maps[map] || {})) if (id !== inf.uid) peers[id] = q; await page.evaluate((pp) => window.__fakePeers && window.__fakePeers(pp), peers).catch(() => {}); }
}
const handle0 = handle;
async function handle2(page, uid, nick, method, a) {
  const inf = server.info.get(page) || (server.info.set(page, { uid, nick, map: null }), server.info.get(page));
  switch (method) {
    case 'joinMap': { inf.map = a[0]; (server.maps[a[0]] = server.maps[a[0]] || {})[uid] = Object.assign({ nick }, clean(a[1])); await pushPeers(a[0]); return null; }
    case 'sendPos': { if (inf.map) { server.maps[inf.map][uid] = Object.assign({ nick }, clean(a[0])); await pushPeers(inf.map); } return null; }
    case 'leaveMap': { if (inf.map) { const m = inf.map; delete server.maps[m][uid]; inf.map = null; await pushPeers(m); } return null; }
    case 'pubSet': { const [pid, obj] = a; if (!memberOf(pid, uid)) throw new Error('권한 없음'); server.pubs[pid] = Object.assign(server.pubs[pid] || {}, clean(obj), { t: Date.now() }); return null; }
    case 'pubLoad': return Object.entries(server.pubs).map(([pid, v]) => Object.assign({ pid }, v)).sort((x, y) => y.t - x.t).slice(0, a[0] || 8);
    case 'tradePost': { const [t] = a; if (!memberOf(t.fromPid, uid)) throw new Error('권한 없음'); const tid = 't' + (++server.n); server.trades[tid] = Object.assign({ t: Date.now(), status: 'open' }, t); return tid; }
    case 'tradesLoad': return Object.entries(server.trades).map(([tid, v]) => Object.assign({ tid }, v)).sort((x, y) => y.t - x.t).slice(0, a[0] || 30);
    case 'tradeTake': { const [tid, pid, name, paid] = a, t = server.trades[tid]; if (!t || t.status !== 'open' || t.fromPid === pid || !memberOf(pid, uid)) return false; Object.assign(t, { status: 'taken', takerPid: pid, takerName: name, paid }); return true; }
    case 'tradeCancel': { const t = server.trades[a[0]]; if (!t || t.status !== 'open' || !memberOf(t.fromPid, uid)) return false; t.status = 'cancelled'; return true; }
    case 'tradeClaim': { const t = server.trades[a[0]]; if (!t || t.status !== 'taken' || !memberOf(t.fromPid, uid)) return false; t.status = 'done'; return true; }
    case 'projectWatch': { server.pages.get(page).add('__project'); setTimeout(emitProject, 20); return null; }
    case 'projectAdd': { const [pid, name, color, item, n, need] = a, have = server.project.have; const before = have[item] || 0; if (!PROJECT_NEED[item] || n > 500) throw new Error('규칙 위반'); have[item] = Math.min(PROJECT_NEED[item], before + n); await emitProject(); return { before, after: have[item] }; }
    case 'projectTeam': { const [pid, obj] = a; if (!memberOf(pid, uid)) throw new Error('권한 없음'); const cur = server.project.byTeam[pid] || { n: 0 }; if (obj.n < cur.n || obj.n > cur.n + 200) throw new Error('규칙 위반'); server.project.byTeam[pid] = Object.assign(cur, obj); await emitProject(); return null; }
    case 'projectDone': { const h = server.project.have; if (!Object.keys(PROJECT_NEED).every(k => (h[k] || 0) >= PROJECT_NEED[k])) throw new Error('규칙 위반'); server.project.done = true; await emitProject(); return null; }
    case 'reportPost': { const [r] = a; if (!memberOf(r.pid, uid)) throw new Error('권한 없음'); const rid = 'r' + (++server.n); server.reports[rid] = Object.assign({ t: Date.now(), uid, nick }, r); return rid; }
    case 'reportsLoad': return Object.entries(server.reports).map(([rid, v]) => Object.assign({ rid }, v)).sort((x, y) => y.t - x.t).slice(0, a[0] || 20);
    case 'reportVote': { const [rid, pid, v] = a, r = server.reports[rid]; if (!r || !memberOf(pid, uid) || pid === r.pid || !['ok', 'diff'].includes(v)) throw new Error('규칙 위반'); (r.votes = r.votes || {})[pid] = v; return null; }
    case 'boardSet': { const [board, pid, obj] = a; if (!memberOf(pid, uid) || !BOARD_CAP[board]) throw new Error('권한 없음'); const cur = (server.boards[board] || {})[pid]; const old = cur ? cur.score : 0; if (obj.score < old || obj.score > old + BOARD_CAP[board]) throw new Error('규칙 위반(줄지 않음·상한)'); (server.boards[board] = server.boards[board] || {})[pid] = Object.assign({}, obj, { t: Date.now() }); return null; }
    case 'boardLoad': return Object.entries(server.boards[a[0]] || {}).map(([pid, v]) => Object.assign({ pid }, v)).sort((x, y) => y.score - x.score).slice(0, a[1] || 10);
    default: return handle0(page, uid, nick, method, a);
  }
}

const rpcNames = ['create', 'join', 'leave', 'watch', 'unwatch', 'watchlog', 'lease', 'publish', 'log', 'beat', 'pubSet', 'pubLoad', 'tradePost', 'tradesLoad', 'tradeTake', 'tradeCancel', 'tradeClaim', 'projectWatch', 'projectAdd', 'projectTeam', 'projectDone', 'reportPost', 'reportsLoad', 'reportVote', 'boardSet', 'boardLoad'];
module.exports = { server, handle: handle2, clean, initScript: null };

// 페이지 쪽 가짜 Net: 팀 API + 팀 간 교류 API를 모두 rpc로 서버에 넘긴다
module.exports.initScript = ({ uid, nick }) => {
  const watchers = {}, logw = {}; let projectCb = null;
  const rpc = (m, a) => window.__rpc(m, a);
  const fake = { ok: true, user: { uid }, nick, guest: true, peers: {}, init: () => true, restore: async () => nick, loadSave: async () => null, saveSave: async () => {}, saveRaft: async () => {}, joinMap: (m, pk) => rpc('joinMap', [m, pk]), sendPos: (pk) => rpc('sendPos', [pk]), leaveMap: () => rpc('leaveMap', []), loadRafts: async () => [], loadBottles: async () => [],
    partyCreate: (n, c) => rpc('create', [n, c]), partyJoin: (code) => rpc('join', [code]), partyLeave: (pid) => rpc('leave', [pid]),
    partyWatch: (pid, cb) => { watchers[pid] = cb; rpc('watch', [pid]); return () => { delete watchers[pid]; rpc('unwatch', [pid]); }; },
    partyWatchLog: (pid, cb) => { logw[pid] = cb; rpc('watchlog', [pid]); return () => {}; },
    partyLease: (pid, active, ms) => rpc('lease', [pid, active, ms]), partyPublish: (pid, base, st) => rpc('publish', [pid, base, st]), partyLog: (pid, e) => rpc('log', [pid, e]), partyBeat: (pid) => rpc('beat', [pid]),
    pubSet: (pid, o) => rpc('pubSet', [pid, o]), pubLoad: (n) => rpc('pubLoad', [n]),
    tradePost: (t) => rpc('tradePost', [t]), tradesLoad: (n) => rpc('tradesLoad', [n]), tradeTake: (tid, pid, name, paid) => rpc('tradeTake', [tid, pid, name, paid]), tradeCancel: (tid) => rpc('tradeCancel', [tid]), tradeClaim: (tid) => rpc('tradeClaim', [tid]),
    projectWatch: (cb) => { projectCb = cb; rpc('projectWatch', []); return () => { projectCb = null; }; }, projectAdd: (pid, name, color, item, n, need) => rpc('projectAdd', [pid, name, color, item, n, need]), projectTeam: (pid, o) => rpc('projectTeam', [pid, o]), projectDone: () => rpc('projectDone', []),
    reportPost: (r) => rpc('reportPost', [r]), reportsLoad: (n) => rpc('reportsLoad', [n]), reportVote: (rid, pid, v) => rpc('reportVote', [rid, pid, v]),
    boardSet: (b, pid, o) => rpc('boardSet', [b, pid, o]), boardLoad: (b, n) => rpc('boardLoad', [b, n]) };
  window.__fakePeers = (pp) => { for (const k of Object.keys(fake.peers)) delete fake.peers[k]; Object.assign(fake.peers, pp); };
  window.__fakeEmit = (pid, s) => watchers[pid] && watchers[pid](s);
  window.__fakeEmitLog = (pid, l) => logw[pid] && logw[pid](l);
  window.__fakeEmitProject = (p) => projectCb && projectCb(p);
  Object.defineProperty(window, 'Net', { get: () => fake, set: () => {} });
};
