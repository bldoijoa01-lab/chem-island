// 팀 대 팀 기지 합치기 시험(17-c): 제안·거절·취소·만료·수락, 인원 상한, 호스트 선정, 교역 차단, 게스트 전원 확인 창, 환불·창고·기여 이전, 같은 월드,
// 중간 끊김 복구(장부), 입금 한 번만, 코드 가입 상한 사후 정리, 리더보드 줄지 않음. 가짜 서버(tools/fakenet.js)가 database.rules.json의 /merges와 같은 뜻을 흉내 낸다.
// 실제 규칙은 Firebase 콘솔 규칙 시뮬레이터로 따로 확인한다(ARGON.md). 사용: node tools/smokemerge.js (Playwright, python3 http.server)
const path = require('path'), { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright를 찾을 수 없습니다.'); process.exit(2); }
const PORT = 9700 + Math.floor(Math.random() * 200), ROOT = path.resolve(__dirname, '..');
const { server, handle, initScript, emit, emitMerge } = require('./fakenet');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const errors = [], checks = [];
  const ok = (name, cond, extra = '') => { checks.push(name + (cond ? ' ✔' : ' ✘')); if (!cond) errors.push(`점검 실패: ${name} ${extra}`); };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const until = async (f, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await sleep(300); } return false; };
  const ev = (pg, f, a) => pg.evaluate(f, a);
  async function start(page) {
    await page.goto(`http://127.0.0.1:${PORT}/index.html?test`); await sleep(800);
    await page.click('#t-continue'); await sleep(1500);
    if (await page.evaluate(() => !document.getElementById('modal').hidden)) await page.click('#mclose');
  }
  async function open(uid, nick) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } }), page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`페이지 에러(${nick}): ` + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load|404/.test(m.text())) errors.push(`콘솔 에러(${nick}): ` + m.text()); });
    page.on('dialog', d => d.accept());
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    server.pages.set(page, new Set());
    await page.exposeFunction('__rpc', (m, a) => handle(page, uid, nick, m, a));
    await page.addInitScript(initScript, { uid, nick });
    await page.addInitScript(() => { try { window.__mergeStop = localStorage.getItem('mergeStopTest') || undefined; } catch { /* 무시 */ } });   // 시험용 끊김 지점(새로고침해도 유지)
    await start(page);
    return page;
  }
  const closeM = (pg) => ev(pg, () => { if (!document.getElementById('modal').hidden) document.getElementById('mclose').click(); });
  const title = (pg) => ev(pg, () => (document.getElementById('modal').hidden ? '' : document.getElementById('mtitle').textContent));
  const body = (pg) => ev(pg, () => document.getElementById('mbody').textContent);
  const msg = (pg) => ev(pg, () => document.getElementById('msg').textContent);
  const furnish = (pg, ox) => ev(pg, (ox) => { const S = G.debug(); S.inv.stick = 30; S.inv.sand = 30; S.inv.bottle = 5; for (let x = -12; x <= -1; x++) for (const y of [5, 6]) World.setTile(S, x + ox, y, World.AIR); S.px = (-5 + ox) * 16; S.py = 7 * 16 - 18; return Sim.act.placeFree(S, 'fire', -6 + ox, 5, 'start'); }, ox);
  const hubGo = (pg) => ev(pg, () => { Sim.act.teleport(G.debug(), 'plaza'); UI.flush(); });
  const startGo = (pg) => ev(pg, () => { Sim.act.teleport(G.debug(), 'start'); UI.flush(); });
  async function makeTeam(pg, name) {
    await ev(pg, () => TeamUI.open()); await sleep(300);
    await ev(pg, (name) => { document.getElementById('tm-name').value = name; document.querySelector('#mbody button.primary').click(); }, name); await sleep(1500);
    await closeM(pg);
    return ev(pg, () => Team.pid());
  }
  const setWh = (pg, wh, extra) => ev(pg, (a) => Team.guard(() => { const S = G.debug(); S.team.warehouse = a.wh; if (a.dW) S.f.dW = a.dW; }), { wh, dW: extra });
  const pubAll = async (...pgs) => { for (const p of pgs) await ev(p, () => HubUI.forcePub()); await sleep(600); };
  const signs = async (pg) => { await ev(pg, () => HubUI.signs()); await sleep(900); };
  const whOf = (pid) => ((server.parties[pid].state || {}).team || {}).warehouse || {};
  try {
    const A1 = await open('uA1', '에이원'), A2 = await open('uA2', '에이투'), B1 = await open('uB1', '비원'), C1 = await open('uC1', '씨원');
    // ---------- 준비: 알파(A1·A2), 베타(B1), 감마(C1) ----------
    await furnish(A1, 0);
    const pa = await makeTeam(A1, '알파'), codeA = await ev(A1, () => Team.meta().code);
    await hubGo(A2); await ev(A2, (c) => TeamUI.joinGo(c), codeA); await sleep(2500); await closeM(A2);
    ok('준비: 알파 팀원 2명', Object.keys(server.parties[pa].members).length === 2);
    await furnish(B1, 20);
    const pb = await makeTeam(B1, '베타');
    await setWh(B1, { salt: 12, ice: 3 }, 500);
    await hubGo(A1); await hubGo(B1); await hubGo(C1);
    const pc = await makeTeam(C1, '감마');
    await setWh(C1, { salt: 5 });
    await setWh(A1, { stick: 10, sand: 4 }, 300);
    await sleep(1500);
    await pubAll(A1, B1, C1);
    const beforeBoard = (server.boards.water || {})[pa] ? server.boards.water[pa].score : 0;
    // ---------- 호스트 선정: 같은 인원이면 먼저 만든 팀(베타가 감마보다 먼저) ----------
    await signs(C1); await ev(C1, (pb) => TeamUI.mergeOffer(pb), pb); await sleep(900);
    const o1 = (server.merges[pb] || {})[pc] && server.merges[pb][pc].offer;
    ok('호스트 선정: 인원이 같으면(1명 대 1명) 먼저 만든 팀(베타)이 호스트', o1 && o1.host === pb && o1.n === 1, JSON.stringify(o1));
    ok('제안은 서버에 /merges/{to}/{from}/offer와 /parties/{from}/merge로 기록되고 코드는 없음', server.parties[pc].merge && server.parties[pc].merge.to === pb && !JSON.stringify(server.merges[pb][pc]).includes(server.parties[pb].code));
    await ev(C1, () => TeamUI.mergeCancel());
    ok('취소: 제안과 팀 표시가 지워짐', await until(async () => !(server.merges[pb][pc] || {}).offer && !server.parties[pc].merge, 4000));
    await closeM(C1);
    // ---------- 교역이 남아 있으면 제안 거절 ----------
    await ev(B1, () => HubUI.trade()); await sleep(500);
    await ev(B1, () => { for (const [id, v] of [['tr-gi', 'salt'], ['tr-gn', 2], ['tr-wi', 'sand'], ['tr-wn', 1]]) document.getElementById(id).value = v; return HubUI.tradePost(); }); await sleep(1000);
    const tid = Object.keys(server.trades).find(t => server.trades[t].fromPid === pb);
    await closeM(B1); await signs(B1);
    await ev(B1, (pa) => TeamUI.mergeOffer(pa), pa); await sleep(900);
    ok('교역이 열려 있으면 제안을 거절하고 안내', !(server.merges[pa] || {})[pb] && /교역/.test(await msg(B1)), await msg(B1));
    await ev(B1, (t) => HubUI.tradeCancel(t), tid); await sleep(1000); await closeM(B1);
    // ---------- 호스트 선정(인원) + 거절 ----------
    await signs(B1); await ev(B1, (pa) => TeamUI.mergeOffer(pa), pa); await sleep(900);
    const o2 = (server.merges[pa] || {})[pb] && server.merges[pa][pb].offer;
    ok('호스트 선정: 인원이 많은 팀(알파 2명)이 호스트', o2 && o2.host === pa && o2.n === 1, JSON.stringify(o2));
    await signs(A1);
    ok('받은 제안이 알파 간판 창 맨 위에 보임', (await body(A1)).includes('베타') && (await body(A1)).includes('수락'));
    await ev(A1, (pb) => TeamUI.mergeReject(pb), pb); await sleep(900);
    ok('거절: 응답이 서버에 기록되고 제안한 쪽에 거절로 보임', (await ev(B1, () => Merge.debug.mine()[0] && Merge.debug.mine()[0].state)) === 'rejected');
    await ev(B1, () => TeamUI.mergeCancel()); await sleep(800); await closeM(A1); await closeM(B1);
    // ---------- 만료 ----------
    await signs(B1); await ev(B1, (pa) => TeamUI.mergeOffer(pa), pa); await sleep(900);
    server.merges[pa][pb].offer.exp = Date.now() - 1000; await emitMerge(pa, pb); await sleep(500);
    ok('만료: 기한이 지난 제안은 만료로 보임', (await ev(B1, () => Merge.debug.mine()[0].state)) === 'expired' && (await ev(A1, () => Merge.debug.mine()[0].state)) === 'expired');
    await signs(A1); await ev(A1, (pb) => TeamUI.mergeAccept(pb), pb); await sleep(400);
    ok('만료된 제안은 수락할 수 없음(응답이 쓰이지 않음)', (server.merges[pa][pb].answer || {}).o !== server.merges[pa][pb].offer.t && (await title(A1)) !== '합치기 수락 확인');
    await ev(B1, () => TeamUI.mergeCancel()); await sleep(800); await closeM(A1); await closeM(B1);
    // ---------- 인원 상한 6: 감마에 가짜 팀원 4명을 더해 5명으로 만들면 알파(2)와 합쳐 7명이라 거절 ----------
    for (let i = 1; i <= 4; i++) server.parties[pc].members['fake' + i] = { nick: '가짜' + i, t: Date.now(), code: server.parties[pc].code };
    await emit(pc); await sleep(600); await pubAll(C1);
    await signs(A1); await ev(A1, (pc) => TeamUI.mergeOffer(pc), pc); await sleep(900);
    ok('인원 상한: 합쳐 7명이면 제안 거절', !(server.merges[pc] || {})[pa] && /6명 상한/.test(await msg(A1)), await msg(A1));
    for (let i = 1; i <= 4; i++) delete server.parties[pc].members['fake' + i];
    await emit(pc); await sleep(600); await pubAll(C1); await closeM(A1);
    // ---------- 합치기: 베타(게스트) → 알파(호스트) ----------
    await ev(B1, () => { Sim.logEv(G.debug(), '증류', '끓는점 101.2 ℃ 관측'); HubUI.reports(); }); await sleep(500);
    await ev(B1, () => { document.getElementById('rp-title').value = '베타 보고서'; document.getElementById('rp-note').value = '합치기 전'; return HubUI.reportPost(); }); await sleep(900); await closeM(B1);
    const rid = Object.keys(server.reports).find(r => server.reports[r].pid === pb);
    const wA0 = Object.assign({}, whOf(pa)), bInv0 = await ev(B1, () => Math.floor(G.debug().inv.stick));
    const fireCost = await ev(B1, () => Sim.DEV.fire.cost);
    await signs(B1); await ev(B1, (pa) => TeamUI.mergeOffer(pa), pa); await sleep(900);
    await signs(A1); await ev(A1, (pb) => TeamUI.mergeAccept(pb), pb); await sleep(400);
    const acc = await body(A1);
    ok('수락 확인 창: 호스트/게스트 역할과 되돌릴 수 없음 표시', (await title(A1)) === '합치기 수락 확인' && /우리 팀/.test(acc) && /되돌릴 수 없습니다/.test(acc) && /6명/.test(acc), acc.slice(0, 150));
    await ev(A1, (pb) => TeamUI.mergeAcceptGo(pb), pb); await sleep(1200);
    ok('수락: 응답과 호스트의 초대 코드(grant)가 서버에 기록됨', (server.merges[pa][pb].answer || {}).res === 'accept' && (server.merges[pa][pb].grant || {}).code === server.parties[pa].code);
    await closeM(A1);
    await sleep(2500);
    ok('게스트 팀원이 확인하기 전에는 시작하지 않음(장부 없음, 아직 베타 소속)', !(await ev(B1, () => G.debug().mergeJob)) && !server.parties[pa].members.uB1);
    await signs(B1); await ev(B1, () => TeamUI.mergeConfirm()); await sleep(400);
    const conf = await body(B1);
    ok('게스트 확인 창: 잃는 것(월드·장치 환불·진행도)·가져가는 것·되돌릴 수 없음', (await title(B1)) === '합치기 합류 확인' && /잃는 것/.test(conf) && /가져가는 것/.test(conf) && /되돌릴 수 없/.test(conf) && /환불/.test(conf) && /전원/.test(conf), conf.slice(0, 200));
    await ev(B1, () => TeamUI.mergeReadyGo());
    await closeM(B1);   // 열린 창이 있으면 active 임대가 계속 갱신된다(9단계 동작)
    ok('합류하기를 누르면 ready 기록이 서버에 남음', await until(async () => (server.merges[pa][pb].ready || {}).uB1 === server.merges[pa][pb].offer.t, 5000));
    ok('합류 실행: 베타 팀원이 알파 팀에 들어가고 베타에서 나감', await until(async () => !!server.parties[pa].members.uB1 && !server.parties[pb].members.uB1 && !(await ev(B1, () => G.debug().mergeJob)), 40000));
    await sleep(2500);
    const wA1 = whOf(pa);
    const expect = (k) => (wA0[k] || 0) + ({ salt: 12, ice: 3 }[k] || 0) + (fireCost[k] || 0);
    ok('이전: 게스트 창고(소금 12·얼음 3)와 장치 환불 재료가 호스트 창고에 한 번만 합쳐짐', ['salt', 'ice', 'stick', 'sand'].every(k => (wA1[k] || 0) === expect(k)), JSON.stringify({ wA0, wA1, fireCost }));
    ok('이전: 게스트 기여 기록이 호스트 기여에 들어옴', !!((server.parties[pa].state.team || {}).contrib || {}).uB1);
    ok('이전: 합류한 사람의 가방은 그대로(막대 수 같음 — 환불은 팀 창고로)', (await ev(B1, () => Math.floor(G.debug().inv.stick))) === bInv0);
    ok('정리: 베타 간판은 members 0·합쳐짐으로 바뀜', (server.pubs[pb] || {}).members === 0 && (server.pubs[pb] || {}).motto === '합쳐짐');
    ok('호스트 팀 상태에 merged 표시(중복 입금 방지)', Object.keys((server.parties[pa].state.team || {}).merged || {}).length === 1);
    // 같은 월드: B1은 베타 월드를 버리고 알파 월드를 본다
    await startGo(B1); await startGo(A2); await sleep(800);
    const rows = (pg) => ev(pg, () => { let r = ''; for (let x = -14; x <= 19; x++) for (const y of [5, 6]) r += World.tileAt(x, y) + ','; return r; });
    ok('합친 뒤 두 사람(B1·A2)이 같은 월드를 봄(베타 월드는 포기됨)', (await rows(B1)) === (await rows(A2)) && (await ev(B1, () => World.tileAt(8, 5) !== World.AIR || World.tileAt(15, 5) !== World.AIR)));
    ok('합친 뒤 알파의 장치(화덕)가 B1에게 보임, 베타 장치는 없음', (await ev(B1, () => G.debug().placed.map(d => d.x + ',' + d.y).join())) === (await ev(A1, () => G.debug().placed.map(d => d.x + ',' + d.y).join())) && (await ev(B1, () => G.debug().placed.length)) === 1);
    await until(async () => await ev(A2, () => Team.guard(() => { for (const x of [-9, -8]) World.setTile(G.debug(), x, 3, World.AIR); })), 25000); await sleep(3500);   // 직전 임대자(B1)의 active 임대가 내려갈 때까지 기다린다
    const digSeen = await ev(B1, () => [-9, -8].every(x => World.tileAt(x, 3) === World.AIR));
    ok('합친 뒤 한 사람이 판 땅이 다른 사람에게 바로 보임', digSeen, JSON.stringify({ a2: await ev(A2, () => ({ pid: Team.pid(), holder: Team.holder(), msg: document.getElementById('msg').textContent, t: [World.tileAt(-9, 3), World.tileAt(-8, 3)] })), b1: await ev(B1, () => ({ pid: Team.pid(), holder: Team.holder(), t: [World.tileAt(-9, 3), World.tileAt(-8, 3)] })), lease: server.parties[pa].lease, ver: server.parties[pa].state.ver, world: Object.keys(server.parties[pa].state.world || {}) }));
    // 리더보드: 줄지 않고 합산 점수가 상한 안에서 오름
    await hubGo(A1); for (let i = 0; i < 2; i++) { for (const p of [A1, A2, B1]) await ev(p, () => HubUI.forcePub()); await sleep(900); }   // 점수는 임대를 가진 팀원이 올린다
    const bd = ((server.boards.water || {})[pa] || {}).score || 0;
    ok('리더보드: 합산(알파 300 + 베타 500)으로 오르고 이전 값보다 줄지 않음', bd >= beforeBoard && bd === 800, `${beforeBoard} → ${bd}`);
    ok('리더보드: 게스트 팀의 옛 점수 줄은 지우지 않음(줄지 않는 규칙)', server.boards.water && server.boards.water[pb] && server.boards.water[pb].score >= 0);
    ok('이미 올린 보고서와 취소된 교역은 그대로(작성 팀은 베타 그대로)', !!rid && server.reports[rid].pid === pb && server.trades[tid].status === 'cancelled');
    // ---------- 중간 끊김 복구: 감마(C1)가 알파에 합류하는 중 세 번 끊긴다 ----------
    const wB0 = Object.assign({}, whOf(pa));
    await hubGo(C1); await ev(C1, () => { localStorage.setItem('mergeStopTest', 'switch'); window.__mergeStop = 'switch'; });
    await signs(C1); await ev(C1, (pa) => TeamUI.mergeOffer(pa), pa); await sleep(900);
    ok('감마 제안: 알파(3명)가 호스트', ((server.merges[pa][pc] || {}).offer || {}).host === pa);
    await closeM(B1); await closeM(A1); await sleep(7500);   // 직전 임대가 내려갈 때까지
    for (let i = 0; i < 6 && !(server.merges[pa][pc].answer); i++) { await signs(A1); await ev(A1, (pc) => TeamUI.mergeAcceptGo(pc), pc); await sleep(2500); }   // 동료가 조작 중이면(임대) 사람이 다시 누르는 것과 같다
    await closeM(A1);
    await signs(C1); await ev(C1, () => TeamUI.mergeConfirm()); await sleep(300); await ev(C1, () => TeamUI.mergeReadyGo()); await closeM(C1);
    ok('끊김 1(커밋 직후): 호스트 members에는 들어갔고 아직 감마에도 남아 있음(두 팀 소속)', await until(async () => !!server.parties[pa].members.uC1 && !!server.parties[pc].members.uC1 && (await ev(C1, () => (G.debug().mergeJob || {}).phase)) === 'switch', 30000));
    ok('끊김 1: 장부(로컬 저장)에 switch 단계가 남아 있음', (await ev(C1, () => JSON.parse(localStorage.getItem(Store.KEY)).mergeJob.phase)) === 'switch');
    await ev(C1, () => localStorage.setItem('mergeStopTest', 'deposit')); await start(C1);   // 탭을 닫았다 다시 연 것과 같다: 장부는 로컬 저장에 남아 있다
    await hubGo(C1);
    ok('끊김 1 복구: 이어서 로컬 전환(switch → deposit)', await until(async () => (await ev(C1, () => (G.debug().mergeJob || {}).phase)) === 'deposit', 30000));
    ok('끊김 2(입금 전): 호스트 창고는 아직 그대로(손실도 중복도 없음)', (whOf(pa).salt || 0) === (wB0.salt || 0));
    await ev(C1, () => localStorage.setItem('mergeStopTest', 'leave')); await start(C1); await hubGo(C1);
    ok('끊김 2 복구: 입금이 한 번만 이루어지고 leave 단계에 이름', await until(async () => (await ev(C1, () => (G.debug().mergeJob || {}).phase)) === 'leave', 40000));
    ok('입금은 정확히 한 번(소금 +5)', (whOf(pa).salt || 0) === (wB0.salt || 0) + 5 && Object.keys((server.parties[pa].state.team || {}).merged || {}).length === 2, JSON.stringify([wB0.salt, whOf(pa).salt]));
    await ev(C1, () => localStorage.removeItem('mergeStopTest')); await start(C1); await hubGo(C1);   // 끊김 3: 마지막 단계(정리) 직전
    ok('끊김 3 복구: 감마에서 나가고 장부가 정리됨, 두 팀 소속이 아님', await until(async () => !server.parties[pc].members.uC1 && !!server.parties[pa].members.uC1 && !(await ev(C1, () => G.debug().mergeJob)), 30000));
    ok('복구 뒤에도 입금은 한 번(소금 +5 유지)', (whOf(pa).salt || 0) === (wB0.salt || 0) + 5);
    // ---------- 코드 가입 상한: 알파가 6명이 된 뒤 7번째는 스스로 나감 ----------
    const D1 = await open('uD1', '디원');
    for (let i = 1; i <= 2; i++) server.parties[pa].members['fake' + i] = { nick: '가짜' + i, t: Date.now(), code: server.parties[pa].code };
    await emit(pa); await sleep(500);
    ok('준비: 알파 6명', Object.keys(server.parties[pa].members).length === 6, String(Object.keys(server.parties[pa].members).length));
    await furnish(D1, 0); await hubGo(D1); await ev(D1, (c) => TeamUI.joinGo(c), codeA); await sleep(2500);
    ok('코드 가입 상한: 7번째 가입자는 가득 참 안내를 받고 스스로 나감(서버 규칙은 못 센다)', !server.parties[pa].members.uD1 && !(await ev(D1, () => G.debug().party)) && /가득/.test(await msg(D1)), await msg(D1));
    ok('상한에 걸린 가입자의 장치는 철거되지 않음', (await ev(D1, () => G.debug().placed.length)) === 1);
  } finally { await browser.close(); srv.kill(); }
  console.log(checks.join('\n'));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('팀 합치기 시험 통과');
})();
