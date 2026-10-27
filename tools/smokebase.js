// 기지 코어 시험(17-a): 설치 조건 거절, 동시 설치에서 한쪽만 성공, 영역 밖 땅파기 거절, 5분 안 취소 / 5분 뒤 이동 불가, 서버 기록 복구, 콘솔 에러 0.
// 가짜 서버(tools/fakenet.js)가 database.rules.json의 /bases·/baseClaims와 같은 뜻을 코드로 흉내 낸다. 실제 규칙은 Firebase 콘솔 규칙 시뮬레이터로 따로 확인한다(MULTIPLAYER.md).
// 사용: node tools/smokebase.js   (Playwright가 있는 환경에서)
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
    await page.goto(`http://127.0.0.1:${PORT}/index.html?test`); await sleep(800);
    await page.click('#t-start'); await sleep(1200);
    if (await page.evaluate(() => !document.getElementById('modal').hidden)) await page.click('#mclose');
    return page;
  }
  const ev = (pg, f, a) => pg.evaluate(f, a);
  try {
    const A = await open('uA', '에이'), B = await open('uB', '비이');
    ok('A·B: 코어가 없으면 설치 모드로 이어짐', await ev(A, () => G.debug().base === null && /설치/.test(document.getElementById('target').textContent)) && await ev(B, () => G.debug().base === null));
    // 1. 조건 거절(순수 검사 World.coreCheck + 설치 경로 UI.installBase)
    const chk = (pg, x, y) => ev(pg, ([x, y]) => World.coreCheck(G.debug(), x, y, UI.otherBases()), [x, y]);
    const r1 = await chk(A, 400, 80);
    ok('깊이 50칸 초과 거절', !r1.ok && /50칸/.test(r1.msg), JSON.stringify(r1));
    const r2 = await chk(A, 190, 20);
    ok('호수 가까이 거절', !r2.ok && /호수/.test(r2.msg), JSON.stringify(r2));
    const r3 = await chk(A, 66, 36);
    ok('단단하지 않은 바닥(동굴 위) 거절', !r3.ok && /단단한/.test(r3.msg), JSON.stringify(r3));
    const r4 = await chk(A, 100, 40);
    ok('추락 지점 20칸 안 거절', !r4.ok && /20칸/.test(r4.msg), JSON.stringify(r4));
    const r5 = await chk(A, 5, 60);
    ok('맵 가장자리(영역이 맵 밖) 거절', !r5.ok && /맵 밖/.test(r5.msg), JSON.stringify(r5));
    const r6 = await chk(A, 400, 60);
    ok('좋은 자리(깊이 41칸)는 허용', r6.ok && r6.depth === 41, JSON.stringify(r6));
    ok('거절된 설치는 상태를 바꾸지 않음', !(await ev(A, () => UI.installBase(400, 80))) && await ev(A, () => G.debug().base === null) && Object.keys(server.bases).length === 0);
    // 2. 동시 설치: 같은 자리를 A와 B가 동시에 잡는다 → 서버가 한쪽만 통과시킨다
    const [ra, rb] = await Promise.all([ev(A, () => UI.installBase(400, 60)), ev(B, () => UI.installBase(401, 60))]);
    ok('동시 설치: 정확히 한쪽만 성공', (ra ? 1 : 0) + (rb ? 1 : 0) === 1, JSON.stringify([ra, rb]));
    const win = ra ? A : B, lose = ra ? B : A, winId = ra ? 'uA' : 'uB', loseId = ra ? 'uB' : 'uA';
    ok('서버: 기지 기록 1개와 선점 칸 140개', Object.keys(server.bases).length === 1 && server.bases[winId] && Object.keys(server.claims).length === 140 && Object.values(server.claims).every(v => v === winId), JSON.stringify([Object.keys(server.bases), Object.keys(server.claims).length]));
    ok('진 쪽: 코어가 없고 설치 모드 유지', await ev(lose, () => G.debug().base === null));
    await sleep(300);
    // 3. 이긴 쪽의 기지를 진 쪽이 서버에서 읽는다 → 간격 8칸 미만이면 거절, 8칸 이상이면 성공
    ok('진 쪽이 이긴 쪽 기지를 서버에서 읽음', await ev(lose, (id) => !!UI.bases()[id], winId));
    const near = await chk(lose, 400 + 48 + 4, 60);   // 영역 사이 간격이 8칸 미만
    ok('간격 8칸 미만 거절(로컬 검사)', !near.ok && /8칸/.test(near.msg), JSON.stringify(near));
    const farX = 400 + 48 + 12, okFar = await chk(lose, farX, 60);
    ok('간격 8칸 이상은 허용', okFar.ok, JSON.stringify(okFar));
    ok('진 쪽 재설치 성공 + 서버에 두 기지', await ev(lose, ([x]) => UI.installBase(x, 60), [farX]) && Object.keys(server.bases).length === 2 && Object.keys(server.claims).length === 280, Object.keys(server.claims).length);
    // 4. 영역 밖 땅파기 거절 / 영역 안은 허용 (이긴 쪽 기준: 코어 (400|401, 60) 둘레)
    const dig = await ev(win, () => { const S = G.debug(), b = S.base, a = World.areaOf(b); S.inv.pickaxe = 1; S.px = (b.x - 3) * 16; S.py = (b.y - 1) * 16; const inside = World.digCheck(S, b.x - 3, b.y); S.px = (a.x0 - 2) * 16; const outside = World.digCheck(S, a.x0 - 1, b.y); return { inside, outside, a }; });
    ok('영역 안은 팔 수 있음(돌, 곡괭이)', dig.inside.ok === true, JSON.stringify(dig.inside));
    ok('영역 밖은 못 팜(보기만)', dig.outside.ok === false && /영역 밖/.test(dig.outside.msg), JSON.stringify(dig.outside));
    // 5. 5분 안 취소 / 5분 뒤 이동 불가
    ok('취소 전: 5분 안이라 취소 가능', await ev(win, () => World.canCancelBase(G.debug())));
    ok('5분 안 취소 성공(서버 기록·선점 칸 삭제)', await ev(win, () => UI.cancelBase()) && !server.bases[winId] && Object.keys(server.claims).length === 140 && Object.values(server.claims).every(v => v === loseId));
    ok('취소 뒤 코어가 없고 맵에서 사라짐', await ev(win, () => G.debug().base === null && World.tileAt(402, 61) !== World.HULL));
    ok('취소한 자리를 다시 설치할 수 있음', await ev(win, () => UI.installBase(400, 60)) && !!server.bases[winId]);
    await ev(win, () => { G.debug().base.at -= 6 * 60 * 1000; });
    ok('5분이 지나면 클라이언트도 이동 불가', !(await ev(win, () => World.canCancelBase(G.debug()))) && !(await ev(win, () => UI.cancelBase())) && !!server.bases[winId]);
    server.bases[loseId].t -= 6 * 60 * 1000;
    ok('서버도 5분 뒤 지우기 거절', await ev(lose, () => G.debug().base && World.canCancelBase(G.debug())) && !(await ev(lose, () => UI.cancelBase())) && !!server.bases[loseId]);
    // 6. 저장은 서버 기록이 사라져도 복구된다(접속 직후 다시 올림)
    delete server.bases[loseId]; for (const c of Object.keys(server.claims)) if (server.claims[c] === loseId) delete server.claims[c];
    await ev(lose, () => UI.syncBase()); await sleep(300);
    ok('서버 기록이 없으면 접속 직후 다시 올림', !!server.bases[loseId] && Object.values(server.claims).filter(v => v === loseId).length === 140);
    // 7. 코어 칸 모양: 선체·해치·안쪽 빈 방, 저장은 S.base 한 개뿐(코어 칸은 S.dug에 없음)
    const shape = await ev(win, () => { const S = G.debug(), b = S.base, W = World; return { hull: W.tileAt(b.x + 2, b.y) === W.HULL, hatchL: W.tileAt(b.x, b.y + 2) === W.HATCH, hatchR: W.tileAt(b.x + 5, b.y + 2) === W.HATCH, inner: [1, 2, 3, 4].every(i => [1, 2].every(j => W.tileAt(b.x + i, b.y + j) === W.AIR)), dug: Object.keys(S.dug).length, solidHatch: W.solidAt(b.x, b.y + 2) }; });
    ok('코어 모양(선체·해치 2개·안쪽 4×2) + 코어 칸은 저장하지 않음', shape.hull && shape.hatchL && shape.hatchR && shape.inner && shape.dug === 0 && !shape.solidHatch, JSON.stringify(shape));
    ok('설치 직후 플레이어 위치·저장 형식', await ev(win, () => { const S = G.debug(); return typeof S.base.x === 'number' && typeof S.base.at === 'number' && S.base.id === 'uA' || S.base.id === 'uB'; }));
  } finally { await browser.close(); srv.kill(); }
  console.log(checks.join(' · '));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('기지 시험 통과');
})();
