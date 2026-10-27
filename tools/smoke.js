// 연기 시험: index.html을 브라우저(Playwright)로 열어 시작 화면 → 시작 → 조금 이동했을 때 콘솔·페이지 에러가 없는지 확인한다.
// `node --check`로는 "주석이 뒤따르는 코드를 삼키는" 실수를 못 잡는다(두 번 있었다). 변경 후 이 시험을 돌린다.
// 사용: node tools/smoke.js   (Playwright가 있는 환경에서. 저장소에 의존성을 추가하지 않는다)
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright를 찾을 수 없습니다(전역 설치 또는 NODE_PATH 설정 필요).'); process.exit(2); }
(async () => {
  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1000, height: 600 } }), errors = [];
  page.on('pageerror', e => errors.push('페이지 에러: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) errors.push('콘솔 에러: ' + m.text()); });
  await page.route(/^https?:/, r => r.abort());   // 외부(Firebase CDN) 없이 혼자 하기 모드로
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(500);
  const title = await page.evaluate(() => !document.getElementById('title').hidden);
  if (!title) errors.push('시작 화면이 보이지 않습니다');
  await page.click('#t-start'); await page.waitForTimeout(400);
  if (await page.evaluate(() => !document.getElementById('modal').hidden)) await page.click('#mclose');   // 처음 접속 도움말
  await page.waitForTimeout(800);   // 코어 캡슐 안에서 시작한다(17-a′)
  const st = await page.evaluate(() => { const S = G.debug(); return { base: S.base, ver: S.ver, island: Sim.dockOf(S).island, hull: World.tileAt(0, 0) === World.HULL, inner: World.tileAt(2, 1) === World.AIR, pad: World.targets(S).some(t => t.kind === 'pad'), inf: World.isInfinite(), px: S.px }; });
  if (!(st.base && st.base.x === 0 && st.base.y === 0 && st.ver === 5 && st.island === 'start' && st.hull && st.inner && st.pad && st.inf)) errors.push('코어 캡슐 안에서 시작하지 않았습니다: ' + JSON.stringify(st));
  const x0 = st.px;
  await page.keyboard.down('d'); await page.waitForTimeout(500); await page.keyboard.up('d');
  const moved = await page.evaluate(() => G.debug().px) - x0;
  if (!(Math.abs(moved) > 12)) errors.push(`이동하지 않았습니다(${moved.toFixed(1)} px)`);
  // 전송 패드: E → 3초 대기 → 본부
  await page.keyboard.press('e'); await page.waitForTimeout(300);
  if (!(await page.evaluate(() => /전송 패드/.test(document.getElementById('mtitle').textContent)))) errors.push('전송 패드 창이 열리지 않았습니다');
  await page.evaluate(() => G.padGo('plaza')); await page.waitForTimeout(1200);
  if ((await page.evaluate(() => Sim.dockOf(G.debug()).island)) !== 'start') errors.push('3초 대기 전에 전송되었습니다');
  await page.waitForTimeout(2900);
  const hub = await page.evaluate(() => ({ island: Sim.dockOf(G.debug()).island, modal: !document.getElementById('modal').hidden }));
  if (hub.island !== 'plaza' || hub.modal) errors.push('3초 뒤 본부로 전송되지 않았습니다: ' + JSON.stringify(hub));
  await page.waitForTimeout(1000);
  // 자동 오르기 없음: 한 칸 턱 앞에서 오른쪽으로만 걸으면 멈추고, 점프하면 넘는다(허브 서쪽 접안 구역 경사)
  const step = await page.evaluate(() => { const W = World, S = G.debug(); for (let x = 8; x < 60; x++) if (W.GY[x] - 1 === W.GY[x + 1] && W.tileAt(x, W.GY[x]) !== W.WATER && W.tileAt(x + 1, W.GY[x + 1]) !== W.WATER && W.tileAt(x, W.GY[x] - 1) === W.AIR) { S.px = x * 16 + 2; S.py = (W.GY[x] - 2) * 16; S.vy = 0; S.vx = 0; return x; } return -1; });
  await page.waitForTimeout(600);
  await page.keyboard.down('d'); await page.waitForTimeout(900); await page.keyboard.up('d');
  const stuckAt = await page.evaluate(() => G.debug().px);
  if (step < 0 || stuckAt >= (step + 1) * 16 - 9) errors.push(`한 칸 턱에서 멈추지 않았습니다(x=${step}, px=${stuckAt.toFixed(0)})`);
  await page.keyboard.down('d'); await page.keyboard.down('w'); await page.waitForTimeout(900); await page.keyboard.up('w'); await page.keyboard.up('d');
  if (await page.evaluate(() => G.debug().px) < (step + 1) * 16) errors.push('점프로도 한 칸 턱을 넘지 못했습니다');
  await page.waitForTimeout(500);
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log(`연기 시험 통과: 시작 화면 → 코어 캡슐 시작 → 이동(${moved.toFixed(0)} px) → 패드 3초 → 본부 → 턱 점프, 에러 없음`);
})();
