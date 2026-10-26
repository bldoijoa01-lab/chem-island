// 팀 간 교류(11단계) 시험: 서로 다른 두 팀(알파·베타)이 가짜 서버(tools/fakenet.js)를 거쳐 교역·프로젝트·보고서·리더보드·간판을 쓴다.
// 서버 규칙을 코드로 흉내 낸 것이므로 실제 규칙은 Firebase 콘솔 규칙 시뮬레이터로 따로 확인한다(MULTIPLAYER.md).
// 실행: THREE_MODULE=<three.module.js 경로> node tools/smokeinter.js
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright를 찾을 수 없습니다.'); process.exit(2); }
const path = require('path'), { spawn } = require('child_process');
const PORT = 9700 + Math.floor(Math.random() * 200), ROOT = path.resolve(__dirname, '..');
const { server, handle, initScript } = require('./fakenet');
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
  async function makeTeam(pg, name) {
    await pg.click('#teambtn'); await sleep(300);
    await pg.fill('#tm-name', name); await pg.click('#mbody button.primary'); await sleep(1200);
    await pg.click('#mclose'); await sleep(200);
    return pg.evaluate(() => __fp.party.pid);
  }
  try {
    const A = await open('uA', '에이'), B = await open('uB', '비이');
    const ev = (pg, f, a) => pg.evaluate(f, a);
    const pa = await makeTeam(A, '알파'), pb = await makeTeam(B, '베타');
    ok('두 팀 생성', !!pa && !!pb && pa !== pb);
    const wh = (pg, k) => ev(pg, (k) => Math.floor((__fp.S.team.warehouse || {})[k] || 0), k);
    await ev(A, () => { __fp.S.team.warehouse = { stick: 30, water: 400, salt: 40 }; });
    await ev(B, () => { __fp.S.team.warehouse = { sand: 20, ice: 5, water: 300 }; });
    // 1. 간판
    await ev(A, () => HubUI.signs()); await sleep(500);
    await ev(A, () => { document.getElementById('hub-motto').value = '증류 연구 중'; return HubUI.setMotto(); }); await sleep(800);
    ok('간판: 소개가 서버에 올라감', (server.pubs[pa] || {}).motto === '증류 연구 중', JSON.stringify(server.pubs[pa]));
    await ev(B, () => HubUI.signs()); await sleep(800);
    const sign = await ev(B, () => document.getElementById('mbody').textContent);
    ok('간판: 다른 팀(B)이 알파와 소개를 봄', sign.includes('알파') && sign.includes('증류 연구 중'), sign.slice(0, 100));
    await ev(B, () => document.getElementById('mclose').click());
    // 2. 교역(에스크로)
    await ev(A, () => HubUI.trade()); await sleep(500);
    await ev(A, () => { for (const [id, v] of [['tr-gi', 'stick'], ['tr-gn', 10], ['tr-wi', 'sand'], ['tr-wn', 5]]) document.getElementById(id).value = v; return HubUI.tradePost(); }); await sleep(1000);
    const tid = Object.keys(server.trades)[0];
    ok('교역: 올리면 줄 물품이 창고에서 빠지고(에스크로) 서버에 열림', tid && server.trades[tid].status === 'open' && await wh(A, 'stick') === 20, JSON.stringify(server.trades[tid]));
    await ev(A, () => document.getElementById('mclose').click());
    // 자기 팀 수락 불가(서버 규칙), 다른 팀은 수락
    const selfTake = await ev(A, (tid) => Net.tradeTake(tid, __fp.party.pid, 'x', { sand: 5 }), tid);
    ok('교역: 자기 팀 교역은 수락 못함', selfTake === false);
    await ev(B, (tid) => HubUI.tradeTake(tid), tid); await sleep(1000);
    ok('교역: B 수락 → 낸 물품(모래 5)이 빠지고 받은 막대 10이 들어옴', await wh(B, 'sand') === 15 && await wh(B, 'stick') === 10 && server.trades[tid].status === 'taken', `${await wh(B, 'sand')} ${await wh(B, 'stick')}`);
    await ev(B, () => document.getElementById('mclose').click());
    await ev(B, (tid) => HubUI.tradeTake(tid), tid); await sleep(600);
    ok('교역: 이미 수락된 교역을 또 수락해도 물품이 늘지 않음(이중 수락 방지)', await wh(B, 'sand') === 15 && await wh(B, 'stick') === 10);
    await ev(B, () => document.getElementById('mclose').click());
    await sleep(6500);   // 임대 만료 대기
    await ev(A, () => HubUI.trade()); await sleep(1500);
    ok('교역: A가 창을 열면 상대가 낸 모래 5를 찾아옴(완료)', await wh(A, 'sand') === 5 && server.trades[tid].status === 'done', `${await wh(A, 'sand')} ${server.trades[tid].status}`);
    await ev(A, () => document.getElementById('mclose').click());
    // 취소: 올린 뒤 취소하면 물품 회수
    await ev(A, () => HubUI.trade()); await sleep(400);
    await ev(A, () => { for (const [id, v] of [['tr-gi', 'salt'], ['tr-gn', 10], ['tr-wi', 'ice'], ['tr-wn', 2]]) document.getElementById(id).value = v; return HubUI.tradePost(); }); await sleep(900);
    const tid2 = Object.keys(server.trades).find(k => k !== tid);
    ok('교역 취소 전: 소금 10 맡김', await wh(A, 'salt') === 30);
    await ev(A, (t) => HubUI.tradeCancel(t), tid2); await sleep(900);
    ok('교역: 취소하면 맡긴 소금이 돌아옴', await wh(A, 'salt') === 40 && server.trades[tid2].status === 'cancelled');
    await ev(A, () => document.getElementById('mclose').click());
    // 3. 공동 프로젝트
    await sleep(6500);
    await ev(A, () => { HubUI.project(); }); await sleep(600);
    await ev(A, () => HubUI.projectAdd('water')); await sleep(900);
    ok('프로젝트: A가 증류수 100을 넣음(창고 400→300, 서버 100)', await wh(A, 'water') === 300 && server.project.have.water === 100 && (server.project.byTeam[pa] || {}).n === 1, JSON.stringify(server.project));
    await ev(A, () => document.getElementById('mclose').click());
    await sleep(6500);
    await ev(B, () => HubUI.projectAdd('water', 3)); await sleep(900);
    ok('프로젝트: B도 넣음 → 팀별 기여가 따로 쌓임', server.project.have.water === 400 && (server.project.byTeam[pb] || {}).n === 3, JSON.stringify(server.project));
    await ev(B, () => document.getElementById('mclose').click());
    const view = await ev(B, () => { HubUI.project(); return document.getElementById('mbody').textContent; });
    ok('프로젝트 창: 팀별 기여량 표시', view.includes('알파') && view.includes('베타'), view.slice(0, 120));
    await ev(B, () => document.getElementById('mclose').click());
    // 거의 다 찬 상태에서 한 번 더: 초과분은 돌려받고, 다 차면 완료 표시
    server.project.have = { water: 2900, salt: 300, ice: 20 };
    await sleep(6500);
    await ev(A, () => HubUI.projectAdd('water')); await sleep(1200);
    ok('프로젝트: 요구량을 채우면 완료 표시', server.project.done === true && server.project.have.water === 3000, JSON.stringify(server.project));
    await ev(A, () => document.getElementById('mclose').click());
    // 4. 보고서(자동 첨부 + 재현 표시)
    await sleep(6500);
    await ev(A, () => { Sim.logEv(__fp.S, '증류', '끓는점 101.2 ℃ 관측'); HubUI.reports(); }); await sleep(500);
    await ev(A, () => { document.getElementById('rp-title').value = '소금물 끓는점'; document.getElementById('rp-note').value = '0.5 mol, 1 atm'; return HubUI.reportPost(); }); await sleep(900);
    const rid = Object.keys(server.reports)[0], rep = server.reports[rid] || {};
    ok('보고서: 기록 한 줄과 환경이 자동 첨부됨', rep.title === '소금물 끓는점' && rep.line && /끓는점/.test(rep.line.text) && rep.env && rep.env.planet, JSON.stringify(rep));
    await ev(A, () => document.getElementById('mclose').click());
    const selfVote = await ev(A, async (rid) => { try { await Net.reportVote(rid, __fp.party.pid, 'ok'); return true; } catch { return false; } }, rid);
    ok('보고서: 자기 팀 보고서에는 표시 못함', selfVote === false);
    await ev(B, (rid) => HubUI.vote(rid, 'diff'), rid); await sleep(800);
    ok('보고서: B가 "값이 다름" 표시', (server.reports[rid].votes || {})[pb] === 'diff', JSON.stringify(server.reports[rid].votes));
    await ev(B, () => document.getElementById('mclose').click());
    // 5. 리더보드(줄지 않음 · 상한)
    await sleep(6500);
    await ev(A, () => { __fp.S.f.dW = 2500; HubUI.forcePub(); }); await sleep(900);
    ok('리더보드: 한 번에 오르는 폭 상한(증류수 2500 → 2000)', ((server.boards.water || {})[pa] || {}).score === 2000, JSON.stringify(server.boards.water));
    await ev(A, () => { HubUI.forcePub(); }); await sleep(900);
    ok('리더보드: 다음 게시에서 나머지가 올라감(2500)', ((server.boards.water || {})[pa] || {}).score === 2500, JSON.stringify(server.boards.water));
    const down = await ev(A, async () => { try { await Net.boardSet('water', __fp.party.pid, { name: 'x', members: 1, score: 5 }); return 'accepted'; } catch { return 'rejected'; } });
    ok('리더보드: 점수를 줄이는 쓰기는 서버가 거부', down === 'rejected');
    const jump = await ev(A, async () => { try { await Net.boardSet('water', __fp.party.pid, { name: 'x', members: 1, score: 9999 }); return 'accepted'; } catch { return 'rejected'; } });
    ok('리더보드: 상한을 넘는 쓰기는 서버가 거부', jump === 'rejected');
    const other = await ev(A, async (pb) => { try { await Net.boardSet('water', pb, { name: 'x', members: 1, score: 1 }); return 'accepted'; } catch { return 'rejected'; } }, pb);
    ok('리더보드: 남의 팀 점수는 못 씀', other === 'rejected');
    await ev(B, () => HubUI.boards('water')); await sleep(800);
    const lbText = await ev(B, () => document.getElementById('mbody').textContent);
    ok('리더보드 창: 팀 이름·총합·1인당', lbText.includes('알파') && lbText.includes('2500') && lbText.includes('1인당'), lbText.slice(0, 160));
  } finally { await browser.close(); srv.kill(); }
  console.log(checks.join('\n'));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('팀 간 교류 시험 통과');
})();
