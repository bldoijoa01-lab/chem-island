// 1인칭 3D 연기 시험: python3 -m http.server로 저장소를 열고 fp/index.html이 에러 없이 그려지고, 걷고, 땅을 파고, 건설하는지 본다.
// CDN이 막힌 환경에서는 저장소 밖에 같은 버전(three@0.160.0)을 설치하고 THREE_MODULE=<경로>/three.module.js 로 알려 준다(커밋하지 않는다).
// 사용: node tools/smokefp.js   (Playwright가 있는 환경에서)
const path = require('path'), { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright를 찾을 수 없습니다.'); process.exit(2); }
const PORT = 8700 + Math.floor(Math.random() * 500), ROOT = path.resolve(__dirname, '..');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } }), errors = [];
  page.on('pageerror', e => errors.push('페이지 에러: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load|404/.test(m.text())) errors.push('콘솔 에러: ' + m.text()); });
  const mod = process.env.THREE_MODULE;
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => {
    if (mod && /three\.module\.js/.test(r.request().url())) return r.fulfill({ path: mod, contentType: 'text/javascript' });
    return r.abort();
  });
  const ev = (f, a) => page.evaluate(f, a);
  const checks = [];
  const ok = (name, cond, extra = '') => { checks.push(name + (cond ? ' ✔' : ' ✘')); if (!cond) errors.push(`점검 실패: ${name} ${extra}`); };
  try {
    await page.goto(`http://127.0.0.1:${PORT}/fp/index.html?test`); await page.waitForTimeout(2000);
    ok('시작 화면', await ev(() => !document.getElementById('title').hidden));
    await page.click('#t-start'); await page.waitForTimeout(500);
    if (await ev(() => !document.getElementById('modal').hidden)) await page.click('#mclose');
    await page.waitForTimeout(1500);
    // 서 있다: 발밑이 단단하다
    const st0 = await ev(() => { const f = __fp; return { y: f.p.y, g: f.p.onGround, below: f.solid(Math.floor(f.p.x), Math.floor(f.p.y) - 1, Math.floor(f.p.z)) }; });
    ok('땅에 선다', st0.g && st0.below, JSON.stringify(st0));
    // 걷기: 동쪽(+x)을 보고 W
    await ev(() => __fp.setLook(-Math.PI / 2, 0));
    const x0 = await ev(() => __fp.p.x);
    await page.keyboard.down('w'); await page.waitForTimeout(1200); await page.keyboard.up('w');
    const moved = await ev(() => __fp.p.x) - x0;
    ok('걷는다', Math.abs(moved) > 1.5, moved.toFixed(2));
    // 화면이 비어 있지 않다
    // 땅 파기: 서쪽 땅(섬)으로 가서 아래를 보고 꾹 누른다
    await ev(() => { const f = __fp, I = f.island(); const x = 30, z = 24, y = I.topY(x, z); f.p.x = x + 0.5; f.p.z = z + 0.5; f.p.y = y + 0.1; f.p.vy = 0; f.setLook(0, -1.2); });
    await page.waitForTimeout(800);
    const dug0 = await ev(() => Object.keys(__fp.S.fp.mods.start || {}).length), inv0 = await ev(() => __fp.S.inv.dirt);
    await page.mouse.move(500, 300); await page.mouse.down(); await page.waitForTimeout(3500); await page.mouse.up();
    const dug1 = await ev(() => Object.keys(__fp.S.fp.mods.start || {}).length), inv1 = await ev(() => __fp.S.inv.dirt);
    ok('땅이 파진다', dug1 > dug0 && inv1 > inv0, `${dug0}→${dug1}, 흙 ${inv0}→${inv1}`);
    // 자원 채집: 나무 앞에서 나무를 보고 E → 나뭇가지가 늘어난다
    await ev(() => { window.aim = (x, y, z) => { const f = __fp, dx = x - f.p.x, dy = y - (f.p.y + 1.6), dz = z - f.p.z, l = Math.hypot(dx, dy, dz); f.setLook(Math.atan2(-dx, -dz), Math.asin(dy / l)); }; });
    const tree = await ev(() => { const f = __fp, o = f.island().objs.find(q => q.type === 'tree'); f.p.x = o.x + 3; f.p.z = o.z; f.p.y = f.island().topY(Math.floor(o.x + 3), Math.floor(o.z)) + 0.1; f.p.vy = 0; return [o.x, o.y, o.z]; });
    await page.waitForTimeout(600);
    await ev(([x, y, z]) => aim(x, y + 1.5, z), tree); await page.waitForTimeout(300);
    const stick0 = await ev(() => __fp.S.inv.stick); await page.keyboard.press('e'); await page.waitForTimeout(300);
    ok('나무 채집(E)', await ev(() => __fp.S.inv.stick) > stick0, 'E 대상: ' + JSON.stringify(await ev(() => { const f = __fp, d = new (f.camera.position.constructor)(); f.camera.getWorldDirection(d); return { p: [f.p.x, f.p.y, f.p.z], dir: [d.x, d.y, d.z], tgt: (f.aimedTarget() || {}).label, modal: !document.getElementById('modal').hidden, msg: document.getElementById('msg').textContent, col: Array.from({ length: 12 }, (_, i) => f.voxel(Math.floor(f.p.x), 16 + i, Math.floor(f.p.z))).join(''), top: f.island().topY(Math.floor(f.p.x), Math.floor(f.p.z)), mods: Object.keys(f.S.fp.mods.start || {}).slice(0, 8) }; })) + JSON.stringify(tree));
    // 바닷물 뜨기: 뗏목 가장자리에서 바다를 보고 E
    await ev(() => { const f = __fp; f.p.x = 55.5; f.p.z = 32.5; f.p.y = 10.05; f.p.vy = 0; });
    await page.waitForTimeout(500);
    await ev(() => { const f = __fp; f.setLook(-Math.PI / 2, -0.5); }); await page.waitForTimeout(300);
    const sea0 = await ev(() => __fp.S.inv.sea); await page.keyboard.press('e'); await page.waitForTimeout(300);
    ok('바닷물 뜨기(E)', await ev(() => __fp.S.inv.sea) > sea0, '대상: ' + await ev(() => (__fp.aimedTarget() || {}).kind));
    // 건설: 화덕 → 뗏목 바닥을 보고 우클릭 → 장치가 늘어난다, 목표 1 달성
    await ev(() => { const S = __fp.S; S.inv.stick = Math.max(S.inv.stick, 10); S.inv.sand = Math.max(S.inv.sand, 10); G.startBuild('fire'); const f = __fp; f.p.x = 53.5; f.p.z = 31.5; f.p.y = 10.05; f.p.vy = 0; f.setLook(-Math.PI / 2, -1.4); });
    await page.waitForTimeout(500);
    const cell = await ev(() => __fp.ghostCell());
    await page.mouse.move(500, 300); await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await page.waitForTimeout(400);
    const placed = await ev(() => __fp.S.placed.map(d => [d.id, d.x, d.y]));
    ok('화덕 건설(우클릭)', placed.length === 1 && placed[0][0] === 'fire', JSON.stringify([cell, placed, await ev(() => document.getElementById('msg').textContent)]));
    await page.waitForTimeout(800);
    ok('목표 1 달성', await ev(() => __fp.S.qDone) >= 1, String(await ev(() => __fp.S.qDone)));
    // 공용 패널: 메뉴 5개
    for (let i = 0; i < 5; i++) { await page.click(`#menu3 button:nth-child(${i + 1})`); await page.waitForTimeout(200); if (!(await ev(() => !document.getElementById('modal').hidden))) errors.push(`메뉴 ${i + 1}번이 열리지 않았습니다`); await page.click('#mclose'); await page.waitForTimeout(100); }
    // 항해: 광장섬으로 → 섬이 바뀌고 뗏목 위에 서며 장치가 따라온다
    await ev(() => { __fp.S.f.raft = true; G.sail('plaza'); });
    await page.waitForTimeout(1500);
    const arr = await ev(() => { const f = __fp; return { isl: f.islName(), onG: f.p.onGround, x: f.p.x, z: f.p.z, dev: f.S.placed.length, dock: f.S.raft.dock }; });
    ok('항해(광장섬 도착)', arr.isl === 'plaza' && arr.dock === 'plaza' && arr.onG && arr.dev === 1, JSON.stringify(arr));
    // 보스: 제단을 보고 E → 골렘 화면
    await ev(() => { const f = __fp, o = f.island().objs.find(q => q.type === 'altar'); f.p.x = o.x + 3; f.p.z = o.z; f.p.y = f.island().topY(Math.floor(o.x + 3), Math.floor(o.z)) + 0.1; f.p.vy = 0; });
    await page.waitForTimeout(600);
    await ev(() => { const f = __fp, o = f.island().objs.find(q => q.type === 'altar'); aim(o.x, o.y + 1, o.z); }); await page.waitForTimeout(300);
    await page.keyboard.press('e'); await page.waitForTimeout(500);
    ok('제단에서 골렘 화면', await ev(() => !!document.getElementById('golem')));
    await page.click('#mclose');
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
    console.log(checks.join(' · '));
  } finally { await browser.close(); srv.kill(); }
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('1인칭 3D 연기 시험 통과');
})();
