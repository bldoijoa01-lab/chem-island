// 가짜 Firebase 서버(Node 메모리): tools/smokeparty.js와 tools/smokeinter.js가 같이 쓴다. database.rules.json의 같은 의미(ver +1, 임대 만료, 4명 제한,
// 교역 상태 전이, 프로젝트 상한, 점수는 줄지 않음·상한)를 코드로 흉내 낸다. 실제 규칙은 Firebase 콘솔 규칙 시뮬레이터로 확인한다.
// ---- 가짜 서버: Firebase와 같은 규칙을 코드로 흉내 낸다 ----
const clean = (v) => { if (Array.isArray(v)) { const a = v.map(clean).filter(x => x !== undefined); return a.length ? a : undefined; } if (v && typeof v === 'object') { const o = {}; for (const k in v) { const c = clean(v[k]); if (c !== undefined) o[k] = c; } return Object.keys(o).length ? o : undefined; } return v === null ? undefined : v; };   // 빈 배열·빈 객체·null을 지운다(Firebase처럼)
const server = { parties: {}, codes: {}, pages: new Map(), n: 0 };
function snapOf(pid) { const p = server.parties[pid]; return p ? JSON.parse(JSON.stringify({ meta: { name: p.name, color: p.color, code: p.code, owner: p.owner }, members: p.members, state: p.state || null, lease: p.lease || null, merge: p.merge || null })) : null; }
async function emit(pid) { for (const [page, w] of server.pages) if (w.has(pid)) { const s = snapOf(pid); await page.evaluate(([pid, s]) => window.__fakeEmit(pid, s), [pid, s]).catch(() => {}); } }
async function emitLog(pid) { for (const [page, w] of server.pages) if (w.has(pid)) { const l = (server.parties[pid] && server.parties[pid].log || []).slice(-20); await page.evaluate(([pid, l]) => window.__fakeEmitLog(pid, l), [pid, l]).catch(() => {}); } }
async function handle(page, uid, nick, method, a) {
  const P = (pid) => server.parties[pid];
  switch (method) {
    case 'create': { const [name, color] = a; const pid = 'p' + (++server.n); const code = 'AB' + String(server.n).padStart(4, '2'); server.parties[pid] = { name, color, code, owner: uid, members: { [uid]: { nick, t: Date.now(), code } }, log: [] }; server.codes[code] = pid; return { pid, code }; }
    case 'join': { const pid = server.codes[String(a[0]).toUpperCase()]; if (!pid) throw new Error('없는 초대 코드입니다.'); const p = P(pid); p.members[uid] = { nick, t: Date.now(), code: p.code }; await emit(pid); return pid; }
    case 'leave': { const p = P(a[0]); if (p) delete p.members[uid]; for (const [pg, w] of server.pages) if (pg === page) w.delete(a[0]); await emit(a[0]); return null; }
    case 'watch': { server.pages.get(page).add(a[0]); setTimeout(() => emit(a[0]), 20); return null; }
    case 'unwatch': { server.pages.get(page).delete(a[0]); return null; }
    case 'watchlog': { setTimeout(() => emitLog(a[0]), 20); return null; }
    case 'lease': { const [pid, active, ms] = a, p = P(pid), L = p.lease, now = Date.now(); if (L && L.uid !== uid && L.active && L.exp > now) return false; p.lease = { uid, nick, active: !!active, exp: now + ms }; await emit(pid); return true; }
    case 'publish': { const [pid, base, st] = a, p = P(pid); if (!p.members[uid]) return { ok: false }; const cur = p.state ? p.state.ver : 0; if (cur !== base) return { ok: false, ver: cur }; p.state = Object.assign(clean(st), { ver: base + 1, by: uid }); await emit(pid); return { ok: true, ver: base + 1 }; }
    // 옆면(17-b): 바뀐 필드·덩어리만 update() 한 번에(ver가 정확히 +1일 때만, 만들 때는 필수 필드가 모두 있어야 한다). state/world는 규칙이 검증하지 않는 자식이다
    case 'publishDelta': {
      const [pid, base, fields, wd] = a, p = P(pid); if (!p || !p.members[uid]) return { ok: false };
      const cur = p.state ? p.state.ver : 0; if (cur !== base) return { ok: false, ver: cur };
      const next = Object.assign({}, p.state || {}, clean(fields), { ver: base + 1, by: uid });
      if (!['raft', 'f', 'qDone', 'day', 'min'].every(k => next[k] !== undefined)) return { ok: false, ver: cur };
      const world = Object.assign({}, (p.state && p.state.world) || {});
      for (const k in wd || {}) { if (wd[k] === null) delete world[k]; else world[k] = wd[k]; }
      next.world = world; p.state = next; server.delta = server.delta || []; server.delta.push({ pid, uid, bytes: JSON.stringify(fields).length + JSON.stringify(wd || {}).length, chunks: Object.keys(wd || {}).length, wbytes: JSON.stringify(wd || {}).length, t: Date.now() });
      await emit(pid); return { ok: true, ver: base + 1 };
    }
    case 'log': { const [pid, e] = a; P(pid).log.push(Object.assign({ uid, nick, t: Date.now() }, e)); await emitLog(pid); return null; }
    case 'beat': { const p = P(a[0]); if (p && p.members[uid]) p.members[uid].t = Date.now(); return null; }
  }
}

// ---- 팀 간 교류(11단계) ----
server.pubs = {}; server.trades = {}; server.project = { have: {}, byTeam: {} }; server.reports = {}; server.boards = {};
const PROJECT_NEED = { water: 3000, salt: 300, ice: 20 }, BOARD_CAP = { env: 3, core: 60, water: 2000, predict: 30 };
const memberOf = (pid, uid) => server.parties[pid] && server.parties[pid].members[uid];
async function emitProject() { for (const [page, w] of server.pages) if (w.has('__project')) await page.evaluate((p) => window.__fakeEmitProject && window.__fakeEmitProject(p), JSON.parse(JSON.stringify(server.project))).catch(() => {}); }
server.bases = {};
server.maps = {}; server.info = new Map();
async function pushPeers(map) {   // 같은 지도에 있는 모든 화면에 나를 뺀 사람들의 위치를 보낸다(접속 표시, 10단계의 presence 흉내)
  for (const [page, inf] of server.info) if (inf.map === map) { const peers = {}; for (const [id, q] of Object.entries(server.maps[map] || {})) if (id !== inf.uid) peers[id] = q; await page.evaluate((pp) => window.__fakePeers && window.__fakePeers(pp), peers).catch(() => {}); }
}
// ---- 팀 대 팀 합치기(17-c): database.rules.json의 /merges와 /parties/{pid}/merge와 같은 뜻(쓰기 권한·형식)을 코드로 흉내 낸다 ----
server.merges = {};
const MD = (to, from) => ((server.merges[to] = server.merges[to] || {})[from] = server.merges[to][from] || { ready: {}, moved: {} });
const cl = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
async function emitMerge(to, from) {
  for (const [page, w] of server.pages) {
    if (w.has('__m:' + to + ':' + from)) await page.evaluate(([k, d]) => window.__fakeEmitMerge && window.__fakeEmitMerge(k, d), ['m:' + to + ':' + from, cl((server.merges[to] || {})[from])]).catch(() => {});
    if (w.has('__mi:' + to)) await page.evaluate(([k, d]) => window.__fakeEmitMerge && window.__fakeEmitMerge(k, d), ['mi:' + to, cl(server.merges[to] || {})]).catch(() => {});
  }
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
    // ---- 내 월드 공개 요약(17-a′): database.rules.json의 /bases와 같은 뜻(쓰기는 본인 id 또는 속한 팀, 필드 형식·길이 검사) ----
    case 'basePublish': {
      const [id, rec] = a;
      if (id !== uid && !memberOf(id, uid)) throw new Error('PERMISSION_DENIED(id)');
      const okRec = rec && typeof rec.name === 'string' && rec.name.length >= 2 && rec.name.length <= 10 && /^#[0-9a-fA-F]{6}$/.test(rec.color) && rec.members && typeof rec.tech === 'number' && rec.tech >= 0 && rec.tech <= 6 && typeof rec.summary === 'string' && rec.summary.length <= 200 && !('cx' in rec) && !('x' in rec) && (!rec.devices || (Array.isArray(rec.devices) && rec.devices.length <= 40 && rec.devices.every(d => typeof d.id === 'string' && d.id.length <= 12 && Math.abs(d.x) <= 100000 && Math.abs(d.y) <= 100000))) && (!rec.map || (rec.map.w >= 1 && rec.map.w <= 64 && rec.map.h >= 1 && rec.map.h <= 48 && Array.isArray(rec.map.rows) && rec.map.rows.every(r => typeof r === 'string' && r.length <= 64)));
      if (!okRec) throw new Error('PERMISSION_DENIED(validate)');
      server.bases[id] = Object.assign(clean(rec), { t: Date.now() }); return null;
    }
    case 'baseLoad': return Object.entries(server.bases).map(([id, v]) => Object.assign({ id }, v)).sort((x, y) => y.t - x.t).slice(0, a[0] || 20);
    case 'mergeOffer': {
      const [to, from, o] = a; if (!memberOf(from, uid)) throw new Error('PERMISSION_DENIED(offer)');
      const okO = o && typeof o.fromName === 'string' && o.fromName.length >= 2 && o.fromName.length <= 10 && typeof o.toName === 'string' && o.toName.length >= 2 && o.n >= 1 && o.n <= 6 && o.q >= 0 && o.q <= 20 && typeof o.host === 'string' && typeof o.t === 'number' && o.exp <= Date.now() + 3600000;
      if (!okO) throw new Error('PERMISSION_DENIED(validate offer)');
      MD(to, from).offer = cl(o); server.parties[from].merge = { to, t: o.t }; await emitMerge(to, from); await emit(from); return null;
    }
    case 'mergeCancel': { const [to, from] = a; if (!memberOf(from, uid)) throw new Error('PERMISSION_DENIED'); delete MD(to, from).offer; delete server.parties[from].merge; await emitMerge(to, from); await emit(from); return null; }
    case 'mergeAnswer': { const [to, from, ans] = a; if (!memberOf(to, uid)) throw new Error('PERMISSION_DENIED(answer)'); if (!ans || !['accept', 'reject'].includes(ans.res) || !(ans.n >= 1 && ans.n <= 6)) throw new Error('PERMISSION_DENIED(validate answer)'); MD(to, from).answer = cl(ans); await emitMerge(to, from); return null; }
    case 'mergeGrant': { const [to, from, g] = a; if (!memberOf(to, uid) && !memberOf(from, uid)) throw new Error('PERMISSION_DENIED(grant)'); if (!g || typeof g.code !== 'string' || g.code.length !== 6) throw new Error('PERMISSION_DENIED(validate grant)'); MD(to, from).grant = cl(g); await emitMerge(to, from); return null; }
    case 'mergeReady': case 'mergeMoved': { const [to, from, o] = a; if (!memberOf(to, uid) && !memberOf(from, uid)) throw new Error('PERMISSION_DENIED(' + method + ')'); MD(to, from)[method === 'mergeReady' ? 'ready' : 'moved'][uid] = o; await emitMerge(to, from); return null; }
    case 'mergeClear': { const p = server.parties[a[0]]; if (!p || !p.members[uid]) throw new Error('PERMISSION_DENIED'); delete p.merge; await emit(a[0]); return null; }
    case 'mergeWatch': { const [to, from] = a; if (!memberOf(to, uid) && !memberOf(from, uid)) throw new Error('PERMISSION_DENIED(read)'); server.pages.get(page).add('__m:' + to + ':' + from); setTimeout(() => emitMerge(to, from), 20); return null; }
    case 'mergeWatchIn': { const [to] = a; if (!memberOf(to, uid)) throw new Error('PERMISSION_DENIED(read)'); server.pages.get(page).add('__mi:' + to); setTimeout(() => { for (const f of Object.keys(server.merges[to] || {})) emitMerge(to, f); if (!Object.keys(server.merges[to] || {}).length) emitMerge(to, '_'); }, 20); return null; }
    case 'mergeUnwatch': { server.pages.get(page).delete(a[0]); return null; }
    case 'baseGet': return server.bases[a[0]] ? Object.assign({ id: a[0] }, server.bases[a[0]]) : null;
    default: return handle0(page, uid, nick, method, a);
  }
}

const rpcNames = ['publishDelta', 'baseGet', 'mergeOffer', 'mergeCancel', 'mergeAnswer', 'mergeGrant', 'mergeReady', 'mergeMoved', 'mergeClear', 'mergeWatch', 'mergeWatchIn', 'mergeUnwatch', 'create', 'join', 'leave', 'watch', 'unwatch', 'watchlog', 'lease', 'publish', 'log', 'beat', 'pubSet', 'pubLoad', 'tradePost', 'tradesLoad', 'tradeTake', 'tradeCancel', 'tradeClaim', 'projectWatch', 'projectAdd', 'projectTeam', 'projectDone', 'reportPost', 'reportsLoad', 'reportVote', 'boardSet', 'boardLoad', 'basePublish', 'baseLoad'];
module.exports = { server, handle: handle2, clean, initScript: null, emit, emitMerge };

// 페이지 쪽 가짜 Net: 팀 API + 팀 간 교류 API를 모두 rpc로 서버에 넘긴다
module.exports.initScript = ({ uid, nick, anon }) => {   // anon: 아직 캐릭터가 없는 브라우저(메인 화면 [코드로 들어가기] 시험) — restore는 null, register로 닉네임을 정한다
  const watchers = {}, logw = {}, mwatch = {}; let projectCb = null;
  const rpc = (m, a) => window.__rpc(m, a);
  const fake = { ok: true, user: anon ? null : { uid }, nick: anon ? null : nick, guest: true, peers: {}, init: () => true, restore: async () => (anon && !fake.user ? null : fake.nick),
    register: async (n) => { n = String(n).trim(); if (!/^[0-9A-Za-z가-힣]{2,8}$/.test(n)) throw new Error('닉네임은 2~8자의 한글·영문·숫자만 쓸 수 있습니다.'); await rpc('register', [n]); fake.user = { uid }; fake.nick = n; }, loadSave: async () => null, saveSave: async () => {}, saveRaft: async () => {}, joinMap: (m, pk) => rpc('joinMap', [m, pk]), sendPos: (pk) => rpc('sendPos', [pk]), leaveMap: () => rpc('leaveMap', []), loadRafts: async () => [], loadBottles: async () => [],
    partyCreate: (n, c) => rpc('create', [n, c]), partyJoin: (code) => rpc('join', [code]), partyLeave: (pid) => rpc('leave', [pid]),
    partyWatch: (pid, cb) => { watchers[pid] = cb; rpc('watch', [pid]); return () => { delete watchers[pid]; rpc('unwatch', [pid]); }; },
    partyWatchLog: (pid, cb) => { logw[pid] = cb; rpc('watchlog', [pid]); return () => {}; },
    partyPublishDelta: (pid, base, fields, wd) => rpc('publishDelta', [pid, base, fields, wd]), partyLease: (pid, active, ms) => rpc('lease', [pid, active, ms]), partyPublish: (pid, base, st) => rpc('publish', [pid, base, st]), partyLog: (pid, e) => rpc('log', [pid, e]), partyBeat: (pid) => rpc('beat', [pid]),
    pubSet: (pid, o) => rpc('pubSet', [pid, o]), pubLoad: (n) => rpc('pubLoad', [n]),
    tradePost: (t) => rpc('tradePost', [t]), tradesLoad: (n) => rpc('tradesLoad', [n]), tradeTake: (tid, pid, name, paid) => rpc('tradeTake', [tid, pid, name, paid]), tradeCancel: (tid) => rpc('tradeCancel', [tid]), tradeClaim: (tid) => rpc('tradeClaim', [tid]),
    projectWatch: (cb) => { projectCb = cb; rpc('projectWatch', []); return () => { projectCb = null; }; }, projectAdd: (pid, name, color, item, n, need) => rpc('projectAdd', [pid, name, color, item, n, need]), projectTeam: (pid, o) => rpc('projectTeam', [pid, o]), projectDone: () => rpc('projectDone', []),
    reportPost: (r) => rpc('reportPost', [r]), reportsLoad: (n) => rpc('reportsLoad', [n]), reportVote: (rid, pid, v) => rpc('reportVote', [rid, pid, v]),
    boardSet: (b, pid, o) => rpc('boardSet', [b, pid, o]), boardLoad: (b, n) => rpc('boardLoad', [b, n]),
    basePublish: (id, rec) => rpc('basePublish', [id, rec]), baseLoad: (n) => rpc('baseLoad', [n]), baseGet: (id) => rpc('baseGet', [id]),
    mergeOffer: (to, from, o) => rpc('mergeOffer', [to, from, o]), mergeCancel: (to, from) => rpc('mergeCancel', [to, from]), mergeAnswer: (to, from, a) => rpc('mergeAnswer', [to, from, a]), mergeGrant: (to, from, g) => rpc('mergeGrant', [to, from, g]),
    mergeReady: (to, from, o) => rpc('mergeReady', [to, from, o]), mergeMoved: (to, from, o) => rpc('mergeMoved', [to, from, o]), mergeClear: (from) => rpc('mergeClear', [from]),
    mergeWatch: (to, from, cb) => { mwatch['m:' + to + ':' + from] = cb; rpc('mergeWatch', [to, from]); return () => { delete mwatch['m:' + to + ':' + from]; rpc('mergeUnwatch', ['__m:' + to + ':' + from]); }; },
    mergeWatchIn: (to, cb) => { mwatch['mi:' + to] = cb; rpc('mergeWatchIn', [to]); return () => { delete mwatch['mi:' + to]; rpc('mergeUnwatch', ['__mi:' + to]); }; } };
  window.__fakePeers = (pp) => { for (const k of Object.keys(fake.peers)) delete fake.peers[k]; Object.assign(fake.peers, pp); };
  window.__fakeEmit = (pid, s) => watchers[pid] && watchers[pid](s);
  window.__fakeEmitLog = (pid, l) => logw[pid] && logw[pid](l);
  window.__fakeEmitMerge = (k, d) => { if (!mwatch[k]) return; if (k.startsWith('mi:')) { const o = d || {}; delete o._; mwatch[k](o); } else mwatch[k](d); };
  window.__fakeEmitProject = (p) => projectCb && projectCb(p);
  Object.defineProperty(window, 'Net', { get: () => fake, set: () => {} });
};
