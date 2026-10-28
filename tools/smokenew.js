// 새 사람 시점 시험(본부 배제, DESIGN.md §4-30): 키보드로 걷고 점프하고, 마우스를 꾹 눌러 코어 문 밖 땅을 파고, 보급 모듈에서 E로 염수를 뜨고,
// 건설 메뉴를 눌러 화덕·증류기를 짓는다 — 게임 상태를 직접 고치지 않고 실제 입력(키·마우스)만 쓴다. 튜토리얼 안내가 단계마다 넘어가는지, 끄기·다시 보기, 목표 1 달성과 힌트 통일,
// 해치 표지판, 본부가 꺼져 있을 때 코어에 전송 패드가 없는 것도 본다. 사용: node tools/smokenew.js   (Playwright, file://)
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright를 찾을 수 없습니다.'); process.exit(2); }
(async () => {
  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1100, height: 650 } }), errors = [], steps = [];
  page.on('pageerror', e => errors.push('페이지 에러: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) errors.push('콘솔 에러: ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.route(/^https?:/, r => r.abort());
  const ok = (name, cond, extra = '') => { steps.push(name + (cond ? ' ✔' : ' ✘')); if (!cond) errors.push(`점검 실패: ${name} ${extra}`); };
  const ev = (f, a) => page.evaluate(f, a);
  const sleep = (ms) => page.waitForTimeout(ms);
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(url); await sleep(600);
  ok('메인 화면에서 [이어하기]로 시작(새 사람: 진행 없음)', await ev(() => !document.getElementById('title').hidden && G.debug().qDone === 0));
  await page.click('#t-continue'); await sleep(800);
  if (await ev(() => !document.getElementById('modal').hidden)) await page.click('#mclose');
  await sleep(700);
  // ---- 시작 상태 ----
  const info = await ev(() => { const S = G.debug(); return { hub: Sim.hubOn(), start: [S.px, S.py], pad: World.objsIn(0, 0, 6, 5).some(o => o.type === 'pad'), tut: !document.getElementById('tut').hidden, txt: document.getElementById('tut').innerText }; });
  ok('본부 스위치는 꺼져 있고 코어에 전송 패드가 없다', info.hub === false && info.pad === false);
  ok('튜토리얼 1/6 안내(이동)가 화면에 보인다', info.tut && /1\/6/.test(info.txt) && /걸어/.test(info.txt), info.txt);
  const stepNow = () => ev(() => { const t = document.getElementById('tut'); return t.hidden ? '' : t.innerText; });
  const waitStep = async (n) => { for (let i = 0; i < 30; i++) { if (new RegExp(`${n}/6`).test(await stepNow())) return true; await sleep(150); } return false; };
  // ---- 1. 이동(키보드) ----
  await page.keyboard.down('d'); await sleep(700); await page.keyboard.up('d');
  ok('D 키로 걸으면 2/6(점프) 안내로 넘어간다', await waitStep(2), await stepNow());
  // ---- 2. 점프 ----
  await page.keyboard.down('w'); await sleep(250); await page.keyboard.up('w'); await sleep(900);
  ok('W 키로 점프하면 3/6(땅 파기) 안내로 넘어간다', await waitStep(3), await stepNow());
  ok('해치 쪽 "문 밖은 단단한 땅" 표지판이 보인다', await ev(() => !document.getElementById('hatch-sign').hidden && /단단한 땅/.test(document.getElementById('hatch-sign').textContent)));
  // ---- 3. 코어 문 밖 땅 파기(마우스를 꾹 눌러) ----
  const view = () => ev(() => { const c = SideGame.cam(), k = SideGame.scale(), r = document.getElementById('cv').getBoundingClientRect(); return { cx: c.x, cy: c.y, k, left: r.left, top: r.top, px: G.debug().px, py: G.debug().py }; });
  const tilePt = async (tx, ty) => { const v = await view(); return { x: v.left + (tx * 16 + 8 - v.cx) * v.k, y: v.top + (ty * 16 + 8 - v.cy) * v.k }; };
  const walkTo = async (px) => { for (let i = 0; i < 60; i++) { const v = await view(); if (Math.abs(v.px - px) < 6) break; await page.keyboard.down(v.px < px ? 'd' : 'a'); await sleep(60); await page.keyboard.up(v.px < px ? 'd' : 'a'); } };
  await walkTo(4 * 16 + 4);                                  // 코어 안 동쪽 끝(해치 앞)
  for (let x = 6; x <= 9; x++) {
    await walkTo((x - 1) * 16 + 4);
    for (const y of [1, 2]) {
      if (await ev(([x, y]) => World.tileAt(x, y) === World.AIR, [x, y])) continue;
      const p = await tilePt(x, y); await page.mouse.move(p.x, p.y); await page.mouse.down();
      for (let i = 0; i < 40; i++) { if (await ev(([x, y]) => World.tileAt(x, y) === World.AIR, [x, y])) break; await sleep(100); }
      await page.mouse.up();
    }
  }
  const dug = await ev(() => [6, 7, 8, 9].every(x => [1, 2].every(y => World.tileAt(x, y) === World.AIR)));
  ok('마우스를 꾹 눌러 연결 굴 8칸(흙, 맨손)을 팠다', dug);
  ok('굴을 파면 4/6(염수) 안내로 넘어가고 해치 표지판이 사라진다', await waitStep(4) && await ev(() => document.getElementById('hatch-sign').hidden), await stepNow());
  // ---- 4. 보급 모듈에서 E로 염수 ----
  await walkTo(10 * 16 + 8); await sleep(200);
  ok('굴 끝에서 보급 모듈로 들어갔다(안쪽 칸, 오브젝트가 보인다)', await ev(() => World.tileAt(12, 1) === World.AIR && World.objsIn(10, 0, 34, 4).some(o => o.type === 'harbor')));
  await page.keyboard.press('e'); await sleep(400);
  ok('물웅덩이 옆에서 E를 누르면 바닷물 1통(목표 1의 앞쪽 절반)', await ev(() => G.debug().inv.sea >= 1 && G.debug().f.sea === true), await ev(() => JSON.stringify(G.debug().inv.sea)));
  ok('5/6(화덕) 안내로 넘어간다', await waitStep(5), await stepNow());
  // ---- 5. 건설 메뉴로 화덕 ----
  const build = async (id, tx) => {
    await page.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); });
    const hud = await ev(() => G.hudRect('건설')); const c = await ev(() => document.getElementById('cv').getBoundingClientRect().toJSON());
    await page.mouse.click(c.left + (hud.x + hud.w / 2) / hud.vw * c.width, c.top + (hud.y + hud.h / 2) / hud.vh * c.height); await sleep(300);
    await page.click(`button[onclick*="startBuild('${id}')"]`); await sleep(200);
    const p = await tilePt(tx + 1, 1 + 1); await page.mouse.move(p.x - 8, p.y - 8); await sleep(80); await page.mouse.click(p.x - 8, p.y - 8); await sleep(300);
  };
  await walkTo(15 * 16);
  const nBefore = await ev(() => G.debug().placed.length);
  await build('fire', 15);
  ok('건설 메뉴 → 화덕을 모듈 바닥에 지었다(마우스 클릭)', await ev(() => G.debug().placed.some(d => d.id === 'fire')) && await ev(() => G.debug().f.fire === true), String(nBefore));
  ok('목표 1(바닷물 + 화덕) 달성, 6/6(증류기) 안내로 넘어간다', await ev(() => G.debug().qDone >= 1) && await waitStep(6), await stepNow());
  const q0 = await ev(() => document.getElementById('quest').innerText);
  ok('목표 2가 증류기 안내를 보여 준다(목표 1 문구·힌트는 통일된 한 군데)', /증류기/.test(q0), q0);
  // ---- 6. 증류기 ----
  await ev(() => { const S = G.debug(); S.inv.bottle = Math.max(S.inv.bottle, 2); S.inv.stick = Math.max(S.inv.stick, 12); });   // 재료는 보급 모듈에서 채집·제작한다(여기서는 시간을 줄이려고 가방을 채운다)
  await build('still', 18);
  ok('증류기를 화덕 옆에 지었다(마우스 클릭)', await ev(() => G.debug().placed.some(d => d.id === 'still')), await ev(() => JSON.stringify(G.debug().placed.map(d => [d.id, d.x, d.y]))));
  await sleep(700);
  ok('첫 5분 안내를 마쳤다는 문구가 나온다', /마쳤/.test(await stepNow()), await stepNow());
  // ---- 끄기·다시 보기·유지 ----
  await page.click('#tut button[data-a="off"]'); await sleep(300);
  ok('[안내 끄기]를 누르면 상자는 사라지고 작은 "안내" 단추만 남는다', await ev(() => document.getElementById('tut').hidden && !document.getElementById('tut-chip').hidden));
  await page.reload(); await sleep(600); await page.click('#t-continue'); await sleep(900);
  if (await ev(() => !document.getElementById('modal').hidden)) await page.click('#mclose');
  ok('새로 열어도 꺼 둔 상태가 유지된다(브라우저 설정)', await ev(() => document.getElementById('tut').hidden && JSON.parse(localStorage.getItem('chemisle_tut_v1')).off === true));
  await page.click('#tut-chip'); await sleep(500);
  ok('"안내" 단추로 다시 켠다', await ev(() => !document.getElementById('tut').hidden));
  await page.click('#tut button[data-a="again"]'); await sleep(600);
  ok('[처음부터 다시 보기]는 1/6으로 돌아간다(이동·점프 기록 초기화, 이미 한 단계는 자동으로 넘어감)', /\d\/6/.test(await stepNow()), await stepNow());
  ok('도움말에서도 안내를 끄고 켤 수 있다', await ev(() => { UI.openHelp(); const t = document.getElementById('mbody').innerText; document.getElementById('mclose').click(); return /첫 5분 안내/.test(t); }));
  await browser.close();
  console.log(steps.join('\n'));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('새 사람 시점 시험 통과: 키·마우스 입력만으로 첫 목표(바닷물 + 화덕)와 증류기까지, 콘솔 에러 없음');
})();
