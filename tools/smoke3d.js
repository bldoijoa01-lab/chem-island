// 3D 연기 시험: python3 -m http.server로 저장소를 열고 3d/index.html이 에러 없이 그려지고 움직이는지 본다.
// Three.js는 3d/index.html의 importmap(CDN 고정 버전)에서 받는다. CDN이 막힌 환경에서는 저장소 밖에 같은 버전을 설치하고
// THREE_MODULE=<경로>/node_modules/three/build/three.module.js 로 알려 준다(커밋하지 않는다).
// 사용: node tools/smoke3d.js   (Playwright가 있는 환경에서)
const path = require('path'), fs = require('fs'), { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright를 찾을 수 없습니다.'); process.exit(2); }
const PORT = 8123 + Math.floor(Math.random() * 500), ROOT = path.resolve(__dirname, '..');
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
    return r.abort();   // Firebase 등 외부는 막아 혼자 하기 모드로
  });
  try {
    await page.goto(`http://127.0.0.1:${PORT}/3d/index.html`); await page.waitForTimeout(1500);
    if (!(await page.evaluate(() => !document.getElementById('title').hidden))) errors.push('시작 화면이 보이지 않습니다');
    await page.click('#t-start'); await page.waitForTimeout(400);
    if (await page.evaluate(() => !document.getElementById('modal').hidden)) await page.click('#mclose');
    await page.waitForTimeout(1500);
    const x0 = await page.evaluate(() => G.debug().px);
    await page.keyboard.down('d'); await page.waitForTimeout(1500); await page.keyboard.up('d');
    const moved = await page.evaluate(() => G.debug().px) - x0;
    if (!(Math.abs(moved) > 8)) errors.push(`이동하지 않았습니다(${moved.toFixed(1)} px)`);
    // 땅 파기: 발밑 오른쪽 아래 흙 칸을 꾹 누른다 → S.dug가 늘어야 한다(2D와 같은 World.stepDig)
    // 대상(자원·표지판)에서 먼 땅 위로 옮겨 서게 하고, 발밑 칸을 판다
    const spot = await page.evaluate(() => {
      const S = G.debug(), W = World;
      for (let tx = 20; tx < 110; tx++) {
        const ty = W.GY[tx], px = tx * 16 + 3, py = (ty - 2) * 16;
        if (!W.digCheck({ ...S, px, py }, tx, ty).ok) continue;
        if (W.targets(S).every(o => Math.hypot(o.x - (tx * 16 + 8), o.y - (ty * 16 + 8)) > 90)) { S.px = px; S.py = py; S.vy = 0; return [tx, ty]; }
      }
      return null;
    });
    if (!spot) errors.push('팔 수 있는 자리를 찾지 못했습니다');
    await page.waitForTimeout(1500);
    const dug0 = await page.evaluate(() => Object.keys(G.debug().dug).length);
    const [sx, sy] = await page.evaluate(([tx, ty]) => window.__chem3d.tileToScreen(tx, ty), spot || [0, 0]);
    await page.mouse.move(sx, sy); await page.mouse.down(); await page.waitForTimeout(4000); await page.mouse.up();
    const dug1 = await page.evaluate(() => Object.keys(G.debug().dug).length);
    if (!(dug1 > dug0)) errors.push(`땅이 파지지 않았습니다(${dug0} → ${dug1}) ` + JSON.stringify(await page.evaluate(() => ({ dig: World.dig, tile: window.__chem3d.mouseTile(), S: [G.debug().px, G.debug().py] }))) + ' spot ' + JSON.stringify(spot));
    // 건설: 뗏목 위로 가서 화덕 모드 → 뗏목 칸 클릭 → 장치가 늘어야 한다(Sim.act.build)
    const bpos = await page.evaluate(() => { const S = G.debug(); S.inv.stick = 20; S.inv.sand = 20; const tx = Sim.devX(S, 0), ty = Sim.RAFT.DEV_Y; S.px = (tx + 1) * 16; S.py = (ty - 1) * 16; S.vy = 0; G.startBuild('fire'); return [tx, ty]; });
    await page.waitForTimeout(800);
    const [bx, by] = await page.evaluate(([tx, ty]) => window.__chem3d.tileToScreen(tx, ty), bpos);
    await page.mouse.move(bx, by); await page.waitForTimeout(300); await page.mouse.click(bx, by); await page.waitForTimeout(400);
    const placed = await page.evaluate(() => G.debug().placed.length);
    if (placed < 1) errors.push('건설되지 않았습니다 (' + await page.evaluate(() => document.getElementById('msg').textContent) + ')');
    // 상호작용: E → 모달 또는 말풍선
    await page.keyboard.press('e'); await page.waitForTimeout(400);
    // 공용 패널: 메뉴 5개가 모두 열리고 닫힌다(건설·제작·연구 노트·기록·저장)
    for (let i = 0; i < 5; i++) {
      await page.click(`#menu3 button:nth-child(${i + 1})`); await page.waitForTimeout(200);
      if (!(await page.evaluate(() => !document.getElementById('modal').hidden))) errors.push(`메뉴 ${i + 1}번이 열리지 않았습니다`);
      await page.click('#mclose'); await page.waitForTimeout(100);
    }
    // 항해: 뗏목을 고친 상태에서 광장섬으로 → 뗏목 칸이 새 해안으로 옮겨지고 플레이어가 그 위에 선다
    const sailed = await page.evaluate(() => { const S = G.debug(); S.f.raft = true; G.sail('plaza'); return [S.raft.dock, Math.round(S.px / 16)]; });
    await page.waitForTimeout(800);
    const raftTiles = await page.evaluate(() => { let n = 0; for (let x = 0; x < World.WW; x++) if (World.MAP[Sim.RAFT.ROW * World.WW + x] === World.RAFT) n++; return [n, G.debug().raft.cells, Sim.raftXs(G.debug())[0]]; });
    if (sailed[0] !== 'plaza' || raftTiles[0] !== raftTiles[1]) errors.push('항해/뗏목 표시가 맞지 않습니다 ' + JSON.stringify([sailed, raftTiles]));
    // 보스: 광장섬 제단 앞에서 E → 골렘 모달(Raid)이 열린다
    await page.evaluate(() => { const S = G.debug(), al = World.OBJS.find(o => o.type === 'altar'); S.px = al.x * 16 + 6; S.py = (al.y - 2) * 16; S.vy = 0; }); await page.waitForTimeout(1200);
    await page.keyboard.press('e'); await page.waitForTimeout(600);
    if (!(await page.evaluate(() => !!document.getElementById('golem')))) errors.push('제단에서 골렘 화면이 열리지 않았습니다');
    await page.click('#mclose'); await page.waitForTimeout(200);
    const shot = process.env.SHOT; if (shot) await page.screenshot({ path: shot });
    // 화면이 비어 있지 않은지: 캔버스를 읽어 색 종류를 센다
    const kinds = await page.evaluate(() => { const q = window.__chem3d; q.renderer.render(q.scene, q.camera); const c = document.querySelector('#gl canvas'), t = document.createElement('canvas'); t.width = 64; t.height = 36; const x = t.getContext('2d'); x.drawImage(c, 0, 0, 64, 36); const d = x.getImageData(0, 0, 64, 36).data, s = new Set(); for (let i = 0; i < d.length; i += 4) s.add((d[i] >> 5) + ',' + (d[i + 1] >> 5) + ',' + (d[i + 2] >> 5)); return s.size; });
    if (kinds < 6) errors.push(`화면이 비어 있는 것 같습니다(색 ${kinds}종)`);
    console.log(`3D 연기 시험: 이동 ${moved.toFixed(0)} px, 화면 색 ${kinds}종`);
  } finally { await browser.close(); srv.kill(); }
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('3D 연기 시험 통과');
})();
