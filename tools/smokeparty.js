// 팀(파티) 시험(9단계): 가짜 서버(Node 메모리) 하나에 브라우저 두 개(A, B)를 붙여 팀 만들기·초대 코드 가입·공유 상태·임대(동시 조작 차단)·개인 기여·공용 창고·탈퇴를 본다.
// 서버 규칙(database.rules.json)은 Firebase가 필요하므로 여기서 같은 의미(ver +1, 임대 만료, 4명 제한)를 흉내 낸다. 규칙 자체는 Firebase 콘솔 규칙 시뮬레이터로 확인한다.
// 사용: node tools/smokeparty.js   (CDN이 막히면 THREE_MODULE=...)
const path = require('path'), { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright를 찾을 수 없습니다.'); process.exit(2); }
const PORT = 9300 + Math.floor(Math.random() * 400), ROOT = path.resolve(__dirname, '..');

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
const initScript = ({ uid, nick }) => {
  const watchers = {}, logw = {};
  const rpc = (m, a) => window.__rpc(m, a);
  const fake = { ok: true, user: { uid }, nick, guest: true, peers: {}, init: () => true, restore: async () => nick, loadSave: async () => null, saveSave: async () => {}, saveRaft: async () => {}, joinMap() {}, sendPos() {}, leaveMap() {}, loadRafts: async () => [], loadBottles: async () => [],
    partyCreate: (n, c) => rpc('create', [n, c]), partyJoin: (code) => rpc('join', [code]), partyLeave: (pid) => rpc('leave', [pid]),
    partyWatch: (pid, cb) => { watchers[pid] = cb; rpc('watch', [pid]); return () => { delete watchers[pid]; rpc('unwatch', [pid]); }; },
    partyWatchLog: (pid, cb) => { logw[pid] = cb; rpc('watchlog', [pid]); return () => {}; },
    partyLease: (pid, active, ms) => rpc('lease', [pid, active, ms]), partyPublish: (pid, base, st) => rpc('publish', [pid, base, st]), partyLog: (pid, e) => rpc('log', [pid, e]), partyBeat: (pid) => rpc('beat', [pid]) };
  window.__fakeEmit = (pid, s) => watchers[pid] && watchers[pid](s);
  window.__fakeEmitLog = (pid, l) => logw[pid] && logw[pid](l);
  Object.defineProperty(window, 'Net', { get: () => fake, set: () => {} });
};
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [], checks = [], mod = process.env.THREE_MODULE;
  const ok = (name, cond, extra = '') => { checks.push(name + (cond ? ' ✔' : ' ✘')); if (!cond) errors.push(`점검 실패: ${name} ${extra}`); };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  async function open(uid, nick) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 560 } }), page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`페이지 에러(${nick}): ` + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load|404/.test(m.text())) errors.push(`콘솔 에러(${nick}): ` + m.text()); });
    page.on('dialog', d => d.accept());
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (mod && /three\.module\.js/.test(r.request().url())) ? r.fulfill({ path: mod, contentType: 'text/javascript' }) : r.abort());
    server.pages.set(page, new Set());
    await page.exposeFunction('__rpc', (m, a) => handle(page, uid, nick, m, a));
    await page.addInitScript(initScript, { uid, nick });
    await page.goto(`http://127.0.0.1:${PORT}/fp/index.html?test`); await sleep(1500);
    await page.click('#t-start'); await sleep(1500);
    if (await page.evaluate(() => !document.getElementById('modal').hidden)) await page.click('#mclose');
    return page;
  }
  try {
    const A = await open('uA', '에이'), B = await open('uB', '비이');
    const ev = (pg, f, a) => pg.evaluate(f, a);
    // 1. A가 팀을 만든다
    await A.click('#teambtn'); await sleep(300);
    await A.fill('#tm-name', '탐사대'); await A.click('#mbody button.primary'); await sleep(1200);
    const a1 = await ev(A, () => ({ pid: __fp.party.pid, name: (__fp.party.meta || {}).name, code: (__fp.party.meta || {}).code, held: __fp.party.holder }));
    ok('A: 팀 만들기', !!a1.pid && a1.name === '탐사대' && !!a1.code, JSON.stringify(a1));
    // 2. A가 화덕을 짓는다(임대 → 건설 → 기록)
    await A.click('#mclose'); await sleep(200);
    await ev(A, () => { const S = __fp.S; S.inv.stick = 40; S.inv.sand = 40; G.startBuild('fire'); const f = __fp; f.p.x = 53.0; f.p.z = 32.2; f.p.y = 10; f.p.vy = 0; f.setLook(0, -1.1); });
    await sleep(500); await A.mouse.move(450, 280); await A.mouse.down({ button: 'right' }); await A.mouse.up({ button: 'right' }); await sleep(1800);
    ok('A: 화덕 건설', await ev(A, () => __fp.S.placed.length) === 1, JSON.stringify(await ev(A, () => ({ msg: document.getElementById('msg').textContent, mode: __fp.getMode(), holder: __fp.party.holder, modal: !document.getElementById('modal').hidden, cell: __fp.ghostCell() }))));
    // 3. B가 초대 코드로 들어간다(개인 장치는 환불, 팀 상태를 이어받음)
    await ev(B, () => { __fp.S.inv.stick = 40; __fp.S.inv.sand = 40; });
    await B.click('#teambtn'); await sleep(300);
    await B.fill('#tm-code', a1.code); await B.click('#mbody .box:nth-of-type(3) button'); await sleep(2500);
    const b1 = await ev(B, () => ({ pid: __fp.party.pid, placed: __fp.S.placed.map(d => d.id), cells: __fp.S.raft.cells, members: Object.keys(__fp.party.members).length }));
    ok('B: 초대 코드 가입', b1.pid === a1.pid && b1.members === 2, JSON.stringify(b1));
    ok('B: 팀 장치 이어받음(화덕)', b1.placed.length === 1 && b1.placed[0] === 'fire', JSON.stringify(b1));
    // 4. 시계는 한 명만 흘린다: A·B의 시각이 거의 같고, 접속 2명이면 속도 x1
    await ev(A, () => { __fp.S.speed = 10; }); await ev(B, () => { __fp.S.speed = 10; });
    const t1 = [await ev(A, () => __fp.S.day * 1440 + __fp.S.min), await ev(B, () => __fp.S.day * 1440 + __fp.S.min)]; await sleep(3000);
    const t2 = [await ev(A, () => __fp.S.day * 1440 + __fp.S.min), await ev(B, () => __fp.S.day * 1440 + __fp.S.min)];
    ok('시계: 두 화면이 같은 시각', Math.abs(t2[0] - t2[1]) <= 6 && t2[0] > t1[0], JSON.stringify([t1, t2]));
    ok('속도: 접속 2명이면 x1', await ev(A, () => __fp.party.speed()) === 1 && await ev(B, () => __fp.party.speed()) === 1);
    // 5. A가 방금 조작했으니(임대 active) B의 장치 조작은 막힌다
    await ev(A, () => __fp.party.ensureActive()); await sleep(200);
    const blocked = await ev(B, async () => !(await __fp.party.ensureActive()));
    ok('임대: 동료가 조작 중이면 B는 못 얻음', blocked);
    // 6. A의 임대가 풀린 뒤(6초) B가 증류기를 짓는다 → A도 본다
    await sleep(7500);
    await ev(B, () => { const S = __fp.S; for (const k of ['stick', 'sand', 'bottle', 'stone']) S.inv[k] = 40; G.startBuild('still'); const f = __fp; f.p.x = 55.0; f.p.z = 33.8; f.p.y = 10; f.p.vy = 0; f.setLook(0, -1.1); });
    await sleep(500); await B.mouse.move(450, 280); await B.mouse.down({ button: 'right' }); await B.mouse.up({ button: 'right' }); await sleep(2500);
    const placedB = await ev(B, () => __fp.S.placed.map(d => d.id)), placedA = await ev(A, () => __fp.S.placed.map(d => d.id));
    ok('B: 증류기 건설(임대 얻음)', placedB.includes('still'), JSON.stringify([placedB, await ev(B, () => document.getElementById('msg').textContent)]));
    ok('A: B의 건설이 보임(공유 상태)', placedA.includes('still') && placedA.includes('fire'), JSON.stringify(placedA));
    // 7. 개인 기여와 공용 창고
    await ev(B, () => __fp.party.transfer('stick', 5)); await sleep(2500);
    const wh = await ev(A, () => ({ w: (__fp.S.team.warehouse || {}).stick, c: __fp.S.team.contrib }));
    ok('공용 창고: B가 넣은 막대 5개를 A도 봄', wh.w === 5, JSON.stringify(wh));
    ok('개인 기여: A 건설 1·B 건설 1·B 창고 1', wh.c.uA && wh.c.uA.build === 1 && wh.c.uB && wh.c.uB.build === 1 && wh.c.uB.deposit === 1, JSON.stringify(wh.c));
    ok('개인 인벤토리는 따로(B의 막대만 줄어듦)', await ev(B, () => __fp.S.inv.stick) < await ev(A, () => __fp.S.inv.stick));
    // 8. 팀 창에 기여 표와 기록
    await A.click('#teambtn'); await sleep(600);
    const panel = await ev(A, () => document.getElementById('mbody').textContent);
    ok('팀 창: 코드·팀원·기여·기록', panel.includes(a1.code) && panel.includes('비이') && panel.includes('개인 기여') && /건설/.test(panel), panel.slice(0, 160));
    await A.click('#mclose');
    // 9. B가 나간다: B는 새 탐사정으로, A의 팀 장치는 그대로
    await ev(B, () => { document.getElementById('mclose').click(); });
    await ev(B, () => TeamUI.leave()); await sleep(1500);
    const lb = await ev(B, () => ({ party: __fp.S.party || null, placed: __fp.S.placed.length, pid: __fp.party.pid })), la = await ev(A, () => ({ placed: __fp.S.placed.length, members: Object.keys(__fp.party.members).length }));
    ok('B: 탈퇴(새 탐사정)', !lb.party && lb.placed === 0 && !lb.pid, JSON.stringify(lb));
    ok('A: 팀 장치 유지·팀원 1명', la.placed === 2 && la.members === 1, JSON.stringify(la));
  } finally { await browser.close(); srv.kill(); }
  console.log(checks.join(' · '));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('팀 시험 통과');
})();
