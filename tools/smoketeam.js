// 팀·본부 교류 시험(옆면, 17-b): 팀 만들기 → 코드 가입(확인 창·환불·월드 교체) → 월드 덩어리 공유 → 쓰기 임대 → 동시 쓰기 충돌 → 델타 크기·빈도 측정
// → 본부 시설(교역 에스크로·보고서·리더보드·간판·공동 프로젝트) → 방문 미리보기 → 탈퇴. 가짜 서버(tools/fakenet.js)가 database.rules.json의 같은 뜻을 코드로 흉내 낸다.
// 실제 규칙은 Firebase 콘솔 규칙 시뮬레이터로 따로 확인한다(MULTIPLAYER.md). 사용: node tools/smoketeam.js   (Playwright, python3 http.server)
const path = require('path'), { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright를 찾을 수 없습니다.'); process.exit(2); }
const PORT = 9700 + Math.floor(Math.random() * 200), ROOT = path.resolve(__dirname, '..');
const { server, handle, initScript } = require('./fakenet');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const errors = [], checks = [];
  const ok = (name, cond, extra = '') => { checks.push(name + (cond ? ' ✔' : ' ✘')); if (!cond) errors.push(`점검 실패: ${name} ${extra}`); };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  async function open(uid, nick) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } }), page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`페이지 에러(${nick}): ` + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load|404/.test(m.text())) errors.push(`콘솔 에러(${nick}): ` + m.text()); });
    page.on('dialog', d => d.accept());
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    server.pages.set(page, new Set());
    await page.exposeFunction('__rpc', (m, a) => handle(page, uid, nick, m, a));
    await page.addInitScript(initScript, { uid, nick });
    await page.goto(`http://127.0.0.1:${PORT}/index.html?test&hub=1`); await sleep(800);
    await page.click('#t-continue'); await sleep(1500);
    if (await page.evaluate(() => !document.getElementById('modal').hidden)) await page.click('#mclose');
    return page;
  }
  const ev = (pg, f, a) => pg.evaluate(f, a);
  const closeM = (pg) => ev(pg, () => { if (!document.getElementById('modal').hidden) document.getElementById('mclose').click(); });
  const title = (pg) => ev(pg, () => (document.getElementById('modal').hidden ? '' : document.getElementById('mtitle').textContent));
  const body = (pg) => ev(pg, () => document.getElementById('mbody').textContent);
  // 내 월드에 방을 파고 화덕을 하나 짓는다(smokebase와 같은 방법). 칸 좌표는 코어 기준
  const furnish = (pg, ox) => ev(pg, (ox) => { const S = G.debug(); S.inv.stick = 30; S.inv.sand = 30; S.inv.bottle = 5; for (let x = -12; x <= -1; x++) for (const y of [5, 6]) World.setTile(S, x + ox, y, World.AIR); S.px = (-5 + ox) * 16; S.py = 7 * 16 - 18; return Sim.act.placeFree(S, 'fire', -6 + ox, 5, 'start'); }, ox);
  const hubGo = (pg) => ev(pg, () => { Sim.act.teleport(G.debug(), 'plaza'); UI.flush(); });
  const startGo = (pg) => ev(pg, () => { Sim.act.teleport(G.debug(), 'start'); UI.flush(); });
  async function makeTeam(pg, name) {
    await ev(pg, () => TeamUI.open()); await sleep(300);
    await ev(pg, (name) => { document.getElementById('tm-name').value = name; document.querySelector('#mbody button.primary').click(); }, name); await sleep(1500);
    await closeM(pg);
    return ev(pg, () => Team.pid());
  }
  try {
    const A = await open('uA', '에이'), B = await open('uB', '비이'), C = await open('uC', '씨이');
    // ---------- 1. 팀 만들기: 내 월드가 팀의 처음 월드 ----------
    ok('A 방+화덕 짓기', await furnish(A, 0) === true);
    const aKeys = await ev(A, () => Object.keys(G.debug().world).sort());
    const pa = await makeTeam(A, '알파');
    const code = await ev(A, () => Team.meta().code);
    const st0 = server.parties[pa] && server.parties[pa].state;
    ok('팀 만들기: 서버 팀 상태에 월드 덩어리와 장치가 올라감', st0 && Object.keys(st0.world || {}).sort().join() === aKeys.join() && aKeys.length > 0 && st0.placed && st0.placed.length === 1, JSON.stringify(Object.keys(st0 || {})));
    const first = server.delta[0];
    ok('팀 만들기: 첫 업로드 크기 기록(200 KB 이하)', first && first.bytes < 200000, `첫 업로드 ${first && first.bytes} 바이트, 덩어리 ${first && first.chunks}개`);
    console.log(`[측정] 첫 업로드 ${first.bytes} 바이트(덩어리 ${first.chunks}개, 덩어리 ${first.wbytes} 바이트)`);
    // ---------- 2. B: 가입 확인 창 → 취소 → 가입 ----------
    ok('B 방+화덕 짓기(B의 월드 x+20)', await furnish(B, 20) === true);
    const bBefore = await ev(B, () => { const S = G.debug(); return { chunks: Object.keys(S.world).length, placed: S.placed.length, stick: S.inv.stick, sand: S.inv.sand, bottle: S.inv.bottle }; });
    const myRow = await ev(B, () => { let r = ''; for (let x = 8; x <= 19; x++) for (const y of [5, 6]) r += World.tileAt(x, y) + ','; return r; });
    await startGo(B);
    await ev(B, (code) => { TeamUI.open(); document.getElementById('tm-code').value = code; TeamUI.join(); }, code); await sleep(300);
    ok('본부 밖에서는 가입 확인 창 없이 거절', (await title(B)) !== '팀 가입 확인' && !(await ev(B, () => G.debug().party)));
    await closeM(B); await hubGo(B);
    await ev(B, (code) => { TeamUI.open(); document.getElementById('tm-code').value = code; TeamUI.join(); }, code); await sleep(300);
    const confirmTxt = await body(B);
    ok('가입 확인 창: 잃는 것(월드·장치 환불·진행도)과 가져가는 것(가방)을 보여 줌', await title(B) === '팀 가입 확인' && /잃는 것/.test(confirmTxt) && /가져가는 것/.test(confirmTxt) && /장치 1개/.test(confirmTxt) && /환불/.test(confirmTxt) && /덩어리 \d+개/.test(confirmTxt), confirmTxt.slice(0, 200));
    await ev(B, () => { [...document.querySelectorAll('#mbody button')].find(b => b.textContent === '취소').click(); }); await sleep(300);
    const bCancel = await ev(B, () => { const S = G.debug(); return { chunks: Object.keys(S.world).length, placed: S.placed.length, party: !!S.party, stick: S.inv.stick }; });
    ok('가입 취소: 월드·장치·가방 그대로, 팀 없음', bCancel.chunks === bBefore.chunks && bCancel.placed === 1 && !bCancel.party && bCancel.stick === bBefore.stick, JSON.stringify(bCancel));
    await closeM(B);
    await ev(B, (code) => { TeamUI.open(); document.getElementById('tm-code').value = code; TeamUI.join(); }, code); await sleep(300);
    await ev(B, () => { [...document.querySelectorAll('#mbody button')].find(b => b.textContent === '가입하기').click(); }); await sleep(2500);
    const bAfter = await ev(B, () => { const S = G.debug(); return { pid: S.party && S.party.pid, placed: S.placed.map(d => d.id + '@' + d.x + ',' + d.y), keys: Object.keys(S.world).sort(), stick: S.inv.stick, sand: S.inv.sand, bottle: S.inv.bottle }; });
    ok('가입: 장치 환불(막대·모래·병이 늘어남), 내 장치는 사라지고 팀의 장치가 보임', bAfter.pid === pa && bAfter.stick > bBefore.stick && bAfter.placed.length === 1 && bAfter.placed[0] === 'fire@-6,5', JSON.stringify([bBefore, bAfter.placed, bAfter.stick]));
    ok('가입: 내 월드 덩어리는 포기하고 팀 월드 덩어리로 바뀜', bAfter.keys.join() === aKeys.join(), bAfter.keys.join() + ' / ' + aKeys.join());
    await closeM(B);
    // 팀원의 개인 저장에는 월드가 없다
    const saved = await ev(B, () => { window.__saved = null; Net.saveSave = async (o) => { window.__saved = o; }; Store.forceNext(); Store.save(true); return { has: window.__saved && 'world' in window.__saved, party: window.__saved && !!window.__saved.party, localHas: !!JSON.parse(localStorage.getItem(Store.KEY)).world }; });
    ok('팀원의 서버 개인 저장에는 world가 없고 로컬에는 사본이 있음', saved.has === false && saved.party === true && saved.localHas === true, JSON.stringify(saved));
    // 시계: 임대 보유자만 흘리고, 접속한 팀원이 둘이면 x1
    await sleep(1500);
    const clk = await ev(A, () => ({ adv: Team.canAdvance(), sp: (G.debug().speed = 10, Team.speed()) })), clkB = await ev(B, () => Team.canAdvance());
    ok('시계: 임대 보유자(A)만 시간을 흘리고 B는 따라감, 팀원이 둘이면 속도 x1', clk.adv === true && clkB === false && clk.sp === 1, JSON.stringify([clk, clkB]));
    // ---------- 3. 월드 공유(덩어리 단위) ----------
    await startGo(A); await startGo(B);
    const rowOf = (pg) => ev(pg, () => { let r = ''; for (let x = 8; x <= 19; x++) for (const y of [5, 6]) r += World.tileAt(x, y) + ','; return r; });
    ok('가입: B가 파던 곳(x+20)은 포기되어 A의 월드와 같은 칸이 됨', (await rowOf(A)) === (await rowOf(B)) && (await rowOf(B)) !== myRow);
    const n0 = server.delta.length;
    await ev(A, () => Team.guard(() => { const S = G.debug(); for (const x of [-3, -2, -1]) World.setTile(S, x, 3, World.AIR); })); await sleep(3500);
    ok('월드 공유: A가 판 칸이 B에게 보임', await ev(B, () => [-3, -2, -1].every(x => World.tileAt(x, 3) === World.AIR)));
    ok('델타 업로드: 월드 변경은 바뀐 덩어리만(1~2개)', server.delta.length > n0 && server.delta.slice(n0).some(d => d.chunks >= 1 && d.chunks <= 2), JSON.stringify(server.delta.slice(n0)));
    // ---------- 4. 쓰기 임대: A가 조작 중이면 B는 파기·건설을 못 한다 ----------
    await ev(A, async () => { await Team.guard(() => {}); window.__keep = setInterval(() => Team.gate(), 200); });   // A가 확실히 active 임대를 쥔 채로 B를 시험한다(느린 컴퓨터에서 임대가 내려가는 틈 방지)
    const bTry = await ev(B, async () => { window.__ran = false; const r = await Team.guard(() => { window.__ran = true; }); return { r, ran: window.__ran, gate: Team.gate(), msg: document.getElementById('msg').textContent }; });
    ok('쓰기 임대: A가 조작 중이면 B의 가드는 거부되고 안내가 뜸', bTry.r === false && bTry.ran === false && bTry.gate === false && /동료가 조작 중/.test(bTry.msg), JSON.stringify(bTry));
    await ev(A, () => clearInterval(window.__keep));
    await sleep(7500);   // A의 active 임대가 passive로 내려갈 때까지
    const bTake = await ev(B, async () => { const r = await Team.guard(() => { const S = G.debug(); for (const x of [-6, -5, -4]) World.setTile(S, x, 3, World.AIR); }); return r; });
    await sleep(3500);
    ok('쓰기 임대: A가 멈추면 B가 임대를 넘겨받아 파고, 그 땅이 A에게 보임', bTake === true && await ev(A, () => [-6, -5, -4].every(x => World.tileAt(x, 3) === World.AIR)));
    // ---------- 5. 동시 쓰기 충돌: 같은 ver로 둘이 올리면 한 쪽만 ----------
    const ver = server.parties[pa].state.ver;
    const stale = await ev(A, (v) => Net.partyPublishDelta(Team.pid(), v - 1, {}, {}), ver);
    ok('충돌: 오래된 ver로 올리면 거절', stale.ok === false);
    const both = await Promise.all([ev(A, (v) => Net.partyPublishDelta(Team.pid(), v, {}, {}), ver), ev(B, (v) => Net.partyPublishDelta(Team.pid(), v, {}, {}), ver)]);
    ok('충돌: 같은 ver로 동시에 올리면 정확히 한 쪽만 성공', both.filter(r => r.ok).length === 1, JSON.stringify(both));
    await sleep(1500);
    if (!process.env.QUICK) {   // QUICK=1: 20초씩 걸리는 측정 구간을 건너뜀(개발 중 빠른 확인)
    // ---------- 6. 델타 크기·빈도 측정: 20초 동안 칸 100개 파기, 20초 가만히 ----------
    await ev(A, () => { window.__keep = setInterval(() => Team.gate(), 300); });
    await ev(A, () => Team.guard(() => {}));
    const m0 = server.delta.length, t0 = Date.now();
    await ev(A, () => new Promise(res => { const S = G.debug(); let i = 0; const h = setInterval(() => { const x = -4 - i; World.setTile(S, x, 3, World.AIR); World.setTile(S, x, 4, World.AIR); if (++i >= 50) { clearInterval(h); res(); } }, 400); }));   // 20초 동안 100칸
    await sleep(2500);
    const dig = server.delta.slice(m0), dt = (Date.now() - t0) / 1000;
    const dw = dig.filter(d => d.chunks > 0), maxW = Math.max(...dw.map(d => d.wbytes)), sumW = dw.reduce((a, d) => a + d.wbytes, 0);
    console.log(`[측정] 100칸 파기 ${dt.toFixed(0)}초: 서버 쓰기 ${dig.length}회(월드 덩어리 포함 ${dw.length}회, 분당 ${(dw.length / dt * 60).toFixed(0)}회), 덩어리 바이트 합 ${sumW}·최대 ${maxW}, 전체 바이트 합 ${dig.reduce((a, d) => a + d.bytes, 0)}`);
    ok('델타 빈도: 연속 파기 중 월드 쓰기는 분당 30회 이하', dw.length / dt * 60 <= 30, `${dw.length}회 / ${dt}초`);
    ok('델타 크기: 한 번에 올린 덩어리 바이트 3 KB 이하', maxW <= 3000, `최대 ${maxW}`);
    await ev(A, () => clearInterval(window.__keep));
    await sleep(8000);
    const q0 = server.delta.length; await sleep(20000);
    const idle = server.delta.slice(q0);
    console.log(`[측정] 가만히 20초: 서버 쓰기 ${idle.length}회(월드 덩어리 ${idle.filter(d => d.chunks > 0).length}회), 평균 ${idle.length ? Math.round(idle.reduce((a, d) => a + d.bytes, 0) / idle.length) : 0} 바이트`);
    ok('델타 빈도: 가만히 있을 때 월드 덩어리는 쓰지 않음', idle.filter(d => d.chunks > 0).length === 0);
    // 땅 파기 결과가 B에도 같다(덩어리 단위로 받음)
    ok('연속 파기 결과가 B에게 모두 보임', await ev(B, () => [-4, -30, -53].every(x => World.tileAt(x, 3) === World.AIR && World.tileAt(x, 4) === World.AIR)));
    }
    // ---------- 7. 본부 시설: 위치·상호작용 ----------
    await hubGo(A);
    const kinds = ['project', 'trade', 'reports', 'boards', 'signs'];
    const opened = {};
    for (const k of kinds) {
      opened[k] = await ev(A, async (k) => { const S = G.debug(); const o = World.OBJS.find(o => o.type === k) || World.objsIn(30, 0, 100, 40).find(o => o.type === k); if (!o) return 'missing'; const [x, y] = World.objCenter(o); S.px = x - 8; S.py = y - 10; const t = World.targets(S).find(t => t.kind === k); if (!t) return 'notarget'; UI.interact(t); await new Promise(r => setTimeout(r, 400)); return document.getElementById('mtitle').textContent; }, k);
      await closeM(A);
    }
    ok('본부 시설 5개를 E로 열면 각 창이 뜸', opened.project.includes('공동 프로젝트') && opened.trade === '교역소' && opened.reports.includes('보고서') && opened.boards === '리더보드' && opened.signs === '팀 간판', JSON.stringify(opened));
    // ---------- 8. 교류: 다른 팀(C)과 교역·프로젝트·보고서·리더보드 ----------
    await hubGo(C);
    const pc = await makeTeam(C, '씨팀');
    const wh = (pg, k) => ev(pg, (k) => Math.floor((G.debug().team.warehouse || {})[k] || 0), k);
    await ev(A, () => Team.guard(() => { G.debug().team.warehouse = { stick: 30, water: 400, salt: 40 }; }));   // 팀 창고는 쓰기 임대를 얻은 뒤에 바꾼다(실제 게임의 창고 넣기와 같다)
    await ev(C, () => Team.guard(() => { G.debug().team.warehouse = { sand: 20, ice: 5, water: 300 }; }));
    await sleep(1500);
    await ev(A, () => HubUI.signs()); await sleep(500);
    await ev(A, () => { document.getElementById('hub-motto').value = '증류 연구 중'; return HubUI.setMotto(); }); await sleep(800);
    await closeM(A);
    await ev(A, () => HubUI.trade()); await sleep(500);
    await ev(A, () => { for (const [id, v] of [['tr-gi', 'stick'], ['tr-gn', 10], ['tr-wi', 'sand'], ['tr-wn', 5]]) document.getElementById(id).value = v; return HubUI.tradePost(); }); await sleep(1000);
    const tid = Object.keys(server.trades)[0];
    if (!tid) console.log('[디버그] 교역 올리기 실패 안내:', await ev(A, () => document.getElementById('msg').textContent));
    ok('교역: 올리면 줄 물품이 창고에서 빠지고(에스크로) 서버에 열림', tid && server.trades[tid].status === 'open' && await wh(A, 'stick') === 20, JSON.stringify(server.trades[tid]));
    await closeM(A);
    ok('교역: 같은 팀(B)이 올린 교역을 수락할 수 없음', await ev(B, (tid) => Net.tradeTake(tid, Team.pid(), 'x', { sand: 5 }), tid) === false);
    await ev(C, (tid) => HubUI.tradeTake(tid), tid); await sleep(1000);
    ok('교역: C 수락 → 낸 물품(모래 5)이 빠지고 받은 막대 10이 들어옴', await wh(C, 'sand') === 15 && await wh(C, 'stick') === 10 && server.trades[tid].status === 'taken');
    await closeM(C);
    await sleep(6500);
    await ev(A, () => HubUI.trade()); await sleep(1500);
    ok('교역: A가 창을 열면 상대가 낸 모래 5를 찾아옴', await wh(A, 'sand') === 5 && server.trades[tid].status === 'done', `${await wh(A, 'sand')} ${server.trades[tid].status}`);
    await closeM(A);
    // 프로젝트(팀별 기여량)
    await ev(A, () => HubUI.project()); await sleep(500);
    await ev(A, () => HubUI.projectAdd('water')); await sleep(900);
    await closeM(A);
    await sleep(6500);
    await ev(C, () => HubUI.projectAdd('water', 3)); await sleep(900);
    const pview = await ev(C, () => { HubUI.project(); return document.getElementById('mbody').textContent; });
    ok('공동 프로젝트: 팀별 기여량이 따로 쌓여 두 팀이 보임', pview.includes('알파') && pview.includes('씨팀') && server.project.have.water === 400, pview.slice(0, 120));
    await closeM(C);
    // 보고서(자동 첨부, 같은 시드 안내, 재현 표시)
    await sleep(6500);
    await ev(A, () => { Sim.logEv(G.debug(), '증류', '끓는점 101.2 ℃ 관측'); HubUI.reports(); }); await sleep(500);
    const repTxt = await body(A);
    ok('보고서 화면: 같은 시드라 재현이 공정하다는 안내', /같은 시드/.test(repTxt), repTxt.slice(0, 100));
    await ev(A, () => { document.getElementById('rp-title').value = '소금물 끓는점'; document.getElementById('rp-note').value = '0.5 mol, 1 atm'; return HubUI.reportPost(); }); await sleep(900);
    const rid = Object.keys(server.reports)[0], rep = server.reports[rid] || {};
    ok('보고서: 로그 한 줄과 환경이 자동 첨부됨', rep.title === '소금물 끓는점' && rep.line && /끓는점/.test(rep.line.text) && rep.env && rep.env.planet, JSON.stringify(rep));
    await closeM(A);
    await ev(C, (rid) => HubUI.vote(rid, 'diff'), rid); await sleep(800);
    ok('보고서: C가 "값이 다름" 표시', (server.reports[rid].votes || {})[pc] === 'diff');
    await closeM(C);
    // 리더보드(줄지 않음·상한)
    await sleep(6500);
    await ev(A, () => { G.debug().f.dW = 2500; HubUI.forcePub(); }); await sleep(900);
    ok('리더보드: 한 번에 오르는 폭 상한(증류수 2500 → 2000), 다음 게시에서 나머지', ((server.boards.water || {})[pa] || {}).score === 2000 && (await ev(A, () => { HubUI.forcePub(); return 1; }), await sleep(900), ((server.boards.water || {})[pa] || {}).score === 2500), JSON.stringify(server.boards.water));
    ok('리더보드: 줄이는 쓰기·상한 초과는 서버가 거부', await ev(A, async () => { const t = async (s) => { try { await Net.boardSet('water', Team.pid(), { name: 'x', members: 1, score: s }); return 1; } catch { return 0; } }; return (await t(5)) + (await t(9999)); }) === 0);
    // ---------- 9. 방문 미리보기(읽기 전용) ----------
    await ev(A, () => UI.publishBase(true)); await sleep(600);
    const bp = server.bases[pa];
    ok('/bases: 팀 id로 올라가고 장치 목록과 작은 지도를 가짐(코어 위치 말고는 칸 내용 없음)', bp && bp.name === '알파' && bp.devices && bp.devices.length === 1 && bp.map && bp.map.rows.length <= 48 && bp.map.rows.every(r => r.length <= 64) && Object.keys(bp.members).length === 2, JSON.stringify(bp && bp.map && { w: bp.map.w, h: bp.map.h, s: bp.map.s }));
    console.log(`[측정] /bases 요약 크기 ${JSON.stringify(bp).length} 바이트`);
    const nb = Object.keys(server.bases).length;
    await ev(B, () => UI.publishBase(true)); await sleep(300);
    ok('/bases: 임대를 못 가진 팀원(B)은 올리지 않음(한 팀에 한 건)', server.bases.uB === undefined || Object.keys(server.bases).length === nb);
    await ev(C, () => HubUI.signs()); await sleep(900);
    const signTxt = await body(C);
    ok('간판: 다른 팀(C)이 알파·소개·방문 버튼을 봄', signTxt.includes('알파') && signTxt.includes('증류 연구 중') && signTxt.includes('방문'), signTxt.slice(0, 120));
    await ev(C, (pa) => { [...document.querySelectorAll('#mbody button')].find(b => b.textContent === '방문').click(); }, pa); await sleep(900);
    const vis = await body(C), visT = await title(C);
    ok('방문: 읽기 전용 미리보기에 팀원·장치 목록·단면 그림이 보임, 편집 버튼 없음', visT.includes('방문') && vis.includes('에이') && vis.includes('비이') && vis.includes('화덕') && vis.includes('█') && !(await ev(C, () => document.querySelector('#mbody button.primary'))), vis.slice(0, 160));
    await closeM(C);
    // ---------- 10. 탈퇴(본부에서만) ----------
    await startGo(B);
    await ev(B, () => TeamUI.leave()); await sleep(600);
    ok('탈퇴: 본부 밖에서는 거절', !!(await ev(B, () => G.debug().party)));
    await hubGo(B); await closeM(B);
    const inv0 = await ev(B, () => Math.floor(G.debug().inv.stick));
    await ev(B, () => TeamUI.leave()); await sleep(1500);
    const bLeft = await ev(B, () => { const S = G.debug(); return { party: !!S.party, keys: Object.keys(S.world).length, placed: S.placed.length, stick: Math.floor(S.inv.stick) }; });
    ok('탈퇴: 새 빈 월드·장치 없음, 가방은 가져감', !bLeft.party && bLeft.keys === 0 && bLeft.placed === 0 && bLeft.stick === inv0, JSON.stringify(bLeft));
    ok('탈퇴 뒤에도 팀의 월드는 서버에 남음', Object.keys(server.parties[pa].state.world).length >= aKeys.length);
  } finally { await browser.close(); srv.kill(); }
  console.log(checks.join('\n'));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('팀·교류 시험 통과');
})();
