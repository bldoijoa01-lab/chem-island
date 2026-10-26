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
  await page.waitForTimeout(1200);   // 허공에서 떨어져 땅에 앉을 때까지
  const x0 = await page.evaluate(() => G.debug().px);
  await page.keyboard.down('a'); await page.waitForTimeout(800); await page.keyboard.up('a');
  const moved = await page.evaluate(() => G.debug().px) - x0;
  if (!(Math.abs(moved) > 20)) errors.push(`이동하지 않았습니다(${moved.toFixed(1)} px)`);
  await page.waitForTimeout(500);
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log(`연기 시험 통과: 시작 화면 → 시작 → 이동(${moved.toFixed(0)} px), 에러 없음`);
})();
