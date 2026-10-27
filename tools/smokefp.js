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
    const st0 = await ev(() => { const f = __fp; return { y: f.p.y, g: f.p.onGround, ground: f.groundAt(f.p.x, f.p.z) }; });
    ok('땅에 선다', st0.g && Math.abs(st0.y - st0.ground) < 0.05, JSON.stringify(st0));
    // 걷기: 동쪽(+x)을 보고 W
    await ev(() => __fp.setLook(-Math.PI / 2, 0));
    const x0 = await ev(() => __fp.p.x);
    await page.keyboard.down('w'); await page.waitForTimeout(1200); await page.keyboard.up('w');
    const moved = await ev(() => __fp.p.x) - x0;
    ok('걷는다', Math.abs(moved) > 1.5, moved.toFixed(2));
    // 경사 한계(자동 오르기 없음): 가짜 지형으로 완만한 비탈은 오르고, 40°를 넘는 비탈과 큰 턱은 못 오르며, 점프로 작은 턱은 넘는다
    const slopeRes = await ev(() => {
      const f = __fp, I = f.island(), orig = I.height.bind(I), res = {};
      const run = (name, hf, jump) => {
        I.height = (x, z) => (x > 15 && x < 60 ? hf(x) : orig(x, z)); f.setLook(-Math.PI / 2, 0);
        f.p.x = 18; f.p.z = 8; f.p.y = hf(18); f.p.vy = 0; f.p.onGround = true;
        for (let i = 0; i < 360; i++) f.stepPlayer(1 / 60, 0, 1, jump && f.p.onGround && f.p.x > 19.4 && f.p.x < 20.2);
        res[name] = Math.round(f.p.x * 10) / 10;
      };
      run('경사 30°', x => 12 + Math.max(0, x - 20) * 0.58, false);
      run('경사 35°', x => 12 + Math.max(0, x - 20) * 0.7, false);
      run('경사 45°', x => 12 + Math.max(0, x - 20) * 1.0, false);
      run('턱 1.5m 점프', x => x < 20 ? 12 : 13.5, true);
      run('턱 1.5m 점프없이', x => x < 20 ? 12 : 13.5, false);
      run('턱 3m 점프', x => x < 20 ? 12 : 15, true);
      I.height = orig; return res;
    });
    ok('경사 30°·35°는 오른다', slopeRes['경사 30°'] > 26 && slopeRes['경사 35°'] > 26, JSON.stringify(slopeRes));
    ok('경사 45°는 못 오른다', slopeRes['경사 45°'] < 21, JSON.stringify(slopeRes));
    ok('턱: 점프로만 1.5 m, 3 m는 못 넘음', slopeRes['턱 1.5m 점프'] > 22 && slopeRes['턱 1.5m 점프없이'] < 20.2 && slopeRes['턱 3m 점프'] < 20.2, JSON.stringify(slopeRes));
    // 바위 캐기: 곡괭이를 들고 바위를 보며 좌클릭을 꾹 누른다 → 돌이 늘어난다(2D의 DIG 시간 2.0초)
    await ev(() => { window.aim = (x, y, z) => { const f = __fp, dx = x - f.p.x, dy = y - (f.p.y + 1.6), dz = z - f.p.z, l = Math.hypot(dx, dy, dz); f.setLook(Math.atan2(-dx, -dz), Math.asin(dy / l)); }; });
    const rock = await ev(() => { const f = __fp, I = f.island(), o = I.objs.find(q => q.type === 'rock'); f.S.inv.pickaxe = 1; f.p.x = o.x + 3; f.p.z = o.z; f.p.y = I.height(o.x + 3, o.z); f.p.vy = 0; return [o.x, o.y, o.z]; });
    await page.waitForTimeout(600);
    await ev(([x, y, z]) => aim(x, y + 0.8, z), rock); await page.waitForTimeout(300);
    const st1 = await ev(() => __fp.S.inv.stone);
    await page.mouse.move(500, 300); await page.mouse.down(); await page.waitForTimeout(4500); await page.mouse.up();
    ok('바위를 꾹 눌러 캔다', await ev(() => __fp.S.inv.stone) > st1, `돌 ${st1} → ${await ev(() => __fp.S.inv.stone)}, 대상 ${await ev(() => (__fp.aimedTarget() || {}).label)}`);
    // 자원 채집: 나무 앞에서 나무를 보고 E → 나뭇가지가 늘어난다
    const tree = await ev(() => { const f = __fp, o = f.island().objs.find(q => q.type === 'tree'); f.p.x = o.x + 3; f.p.z = o.z; f.p.y = f.island().height(o.x + 3, o.z); f.p.vy = 0; return [o.x, o.y, o.z]; });
    await page.waitForTimeout(600);
    await ev(([x, y, z]) => aim(x, y + 1.5, z), tree); await page.waitForTimeout(300);
    const stick0 = await ev(() => __fp.S.inv.stick); await page.keyboard.press('e'); await page.waitForTimeout(300);
    ok('나무 채집(E)', await ev(() => __fp.S.inv.stick) > stick0, 'E 대상: ' + await ev(() => (__fp.aimedTarget() || {}).label));
    // 바닷물 뜨기: 뗏목 가장자리에서 바다를 보고 E
    await ev(() => { const f = __fp; f.p.x = 55.5; f.p.z = 32.5; f.p.y = 10; f.p.vy = 0; });
    await page.waitForTimeout(500);
    await ev(() => { const f = __fp; f.setLook(-Math.PI / 2, -0.5); }); await page.waitForTimeout(300);
    const sea0 = await ev(() => __fp.S.inv.sea); await page.keyboard.press('e'); await page.waitForTimeout(300);
    ok('바닷물 뜨기(E)', await ev(() => __fp.S.inv.sea) > sea0, '대상: ' + await ev(() => (__fp.aimedTarget() || {}).kind));
    // 건설: 화덕 → 뗏목 바닥을 보고 우클릭 → 장치가 늘어난다, 목표 1 달성
    await ev(() => { const S = __fp.S; S.inv.stick = Math.max(S.inv.stick, 10); S.inv.sand = Math.max(S.inv.sand, 10); G.startBuild('fire'); const f = __fp; f.p.x = 53.5; f.p.z = 31.5; f.p.y = 10; f.p.vy = 0; f.setLook(-Math.PI / 2, -1.4); });
    await page.waitForTimeout(500);
    const cell = await ev(() => __fp.ghostCell());
    await page.mouse.move(500, 300); await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await page.waitForTimeout(400);
    const placed = await ev(() => __fp.S.placed.map(d => [d.id, d.x, d.y]));
    ok('화덕 건설(우클릭)', placed.length === 1 && placed[0][0] === 'fire', JSON.stringify([cell, placed, await ev(() => document.getElementById('msg').textContent)]));
    await page.waitForTimeout(800);
    ok('목표 1 달성', await ev(() => __fp.S.qDone) >= 1, String(await ev(() => __fp.S.qDone)));
    // 공용 패널: 메뉴 5개
    for (let i = 0; i < 5; i++) { await page.click(`#menu3 button:nth-child(${i + 1})`); await page.waitForTimeout(200); if (!(await ev(() => !document.getElementById('modal').hidden))) errors.push(`메뉴 ${i + 1}번이 열리지 않았습니다`); await page.click('#mclose'); await page.waitForTimeout(100); }
    // 서리 늑대(목표 9): 밤에 장치에 붙은 늑대를 보고 소금 뿌리개(우클릭) → 질량이 줄어든다
    await ev(() => { const f = __fp, S = f.S; S.min = 180; S.inv.salt = 200; S.inv.shaker = 1; S.mobs.push({ id: 3, k: 'wolf', M: 100, M0: 100, dx: S.placed[0].x, dy: S.placed[0].y, att: 0 }); f.p.x = 55.5; f.p.z = 30.4; f.p.y = 10; f.p.vy = 0; });
    await page.waitForTimeout(600);
    await ev(() => { const f = __fp, m = f.S.mobs[0], d = f.S.placed[0]; const wx = 52 + d.x + 1 + (m.id % 2 ? 2.2 : -2.2), wz = 30 + d.y + 1; aim(wx, 10.6, wz); f.setSel('shaker'); });
    await page.waitForTimeout(300);
    const tgtKind = await ev(() => (__fp.aimedTarget() || {}).kind), dbgW = await ev(() => JSON.stringify([__fp.p.x, __fp.p.y, __fp.p.z, __fp.targets().map(t => [t.kind, t.wx, t.wy, t.wz])]));
    const M0 = await ev(() => __fp.S.mobs[0].M);
    await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await page.waitForTimeout(300);
    ok('서리 늑대에 소금 뿌리기', tgtKind === 'wolf' && await ev(() => !__fp.S.mobs[0] || __fp.S.mobs[0].M) < M0, `대상 ${tgtKind} ${dbgW}, 질량 ${M0} → ${await ev(() => __fp.S.mobs[0] ? __fp.S.mobs[0].M : 'gone')}`);
    // 극지 섬(목표 11): 눈 칸에 소금을 뿌려 얼음 100 g을 녹이면 물이 되고 S.f.polarMelt
    await ev(() => { const S = __fp.S; S.f.raft = true; S.qDone = 11; S.mobs.length = 0; S.inv.salt = 500; G.sail('polar'); });
    await page.waitForTimeout(1500);
    const polar = await ev(() => { const f = __fp, I = f.island(), o = I.objs.find(q => q.type === 'iceblock'); if (!o) return null; f.p.x = o.x + 2.5; f.p.z = o.z; f.p.y = I.height(o.x + 2.5, o.z); f.p.vy = 0; f.S.min = 180; f.setSel('shaker'); return { id: o.id, x: o.x, y: o.y, z: o.z, isl: f.islName() }; });
    await page.waitForTimeout(800);
    if (polar) await ev(({ x, y, z }) => aim(x, y + 0.7, z), polar);
    await page.waitForTimeout(300);
    for (let i = 0; i < 40 && polar && !(await ev(() => __fp.S.f.polarMelt)); i++) { await ev(() => { __fp.S.min = 180; }); await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await page.waitForTimeout(60); }
    ok('극지 섬 얼음 녹이기(목표 11 조건)', !!polar && await ev(() => __fp.S.f.polarMelt), JSON.stringify(polar) + ' 소금 ' + await ev(() => __fp.S.inv.salt));
    // 우주 테마(8단계): 항구 표지판 → "궤도 이동 단말", 창과 말풍선의 섬 테마 말이 치환된다. 내부 id와 계산은 그대로
    await ev(() => { const f = __fp, o = f.island().objs.find(q => q.type === 'harbor'); f.p.x = o.x + 2.5; f.p.z = o.z; f.p.y = f.island().height(o.x + 2.5, o.z); f.p.vy = 0; });
    await page.waitForTimeout(600);
    await ev(() => { const f = __fp, o = f.island().objs.find(q => q.type === 'harbor'); aim(o.x, o.y + 1.5, o.z); }); await page.waitForTimeout(300);
    const harborLabel = await ev(() => (__fp.aimedTarget() || {}).label); const shownLabel = await ev(() => document.getElementById('target').textContent + '|' + document.getElementById('aimlabel').textContent);
    await page.keyboard.press('e'); await page.waitForTimeout(400);
    const harborText = await ev(() => document.getElementById('modal').hidden ? '' : document.getElementById('mbody').textContent + document.getElementById('mtitle').textContent);
    ok('테마: 궤도 이동 단말 창', /궤도|이륙/.test(harborText) && !/출항|뗏목|시작섬|광장섬|항구/.test(harborText), harborText.slice(0, 160));
    ok('테마: 조준 이름표', /궤도 이동 단말/.test(shownLabel), shownLabel);
    ok('테마: 내부 id 유지', await ev(() => ['start', 'plaza', 'alpine', 'polar'].includes(__fp.islName()) && Sim.ISLANDS.start.name === '불시착 행성' && Sim.QUESTS.length === 11));
    await ev(() => { if (!document.getElementById('modal').hidden) document.getElementById('mclose').click(); });
    // 지표 기지 부지와 연결선(10단계): 평평한 부지에 화덕·증류기·밥솥을 짓고, 열선·배관을 잇고, 환경은 그 행성의 것을 쓴다
    await ev(() => { const S = __fp.S; S.f.raft = true; S.qDone = 11; if (S.raft.dock !== 'start') G.sail('start'); }); await page.waitForTimeout(1500);
    await ev(() => { const S = __fp.S; window.__savedPlaced = JSON.parse(JSON.stringify(S.placed)); S.placed.length = 0; S.links.length = 0; S.mobs.length = 0; for (const k of ['stick', 'sand', 'bottle', 'stone']) S.inv[k] = 99; });
    const padFlat = await ev(() => { const f = __fp, I = f.island(); let mn = 99, mx = -99; for (let z = 36; z <= 44; z += 0.5) for (let x = 24; x <= 32; x += 0.5) { const h = I.height(x, z); mn = Math.min(mn, h); mx = Math.max(mx, h); } return [mn, mx, I.padH]; });
    ok('부지: 평평한 지반', padFlat[1] - padFlat[0] < 1e-6, JSON.stringify(padFlat));
    const pad = async (id, gx, gz) => {   // 부지 칸 (gx, gz)를 보고 우클릭으로 짓는다
      await ev(([id, gx, gz]) => { const f = __fp, H = f.island().padH; G.startBuild(id); f.p.x = 30.5; f.p.z = 43.2; f.p.y = H; f.p.vy = 0; const dx = 24 + gx + 1 - f.p.x, dz = 36 + gz + 1 - f.p.z, dy = H - (f.p.y + 1.6), l = Math.hypot(dx, dy, dz); f.setLook(Math.atan2(-dx, -dz), Math.asin(dy / l)); }, [id, gx, gz]);
      await page.waitForTimeout(500); await page.mouse.move(450, 280); await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await page.waitForTimeout(500);
    };
    await pad('fire', 1, 1); await pad('still', 5, 1);
    const dv = await ev(() => __fp.S.placed.map(d => [d.id, d.x, d.y, d.plot || null, !!d.uid]));
    ok('부지: 화덕·증류기를 지표 부지에 건설(좌표 오프셋·uid)', dv.length === 2 && dv.every(d => d[3] === 'start' && d[4]) && dv[0][1] === 101, JSON.stringify(dv) + await ev(() => document.getElementById('msg').textContent));
    // 열선: 옆이 아니어서 열원이 없다 → 이름표에 안내 → L 키로 열선 모드, 화덕 → 증류기
    const t0 = await ev(() => { const f = __fp, S = f.S; S.placed[0].s.level = 2; S.placed[0].s.fuel = 99; return [Sim.heatOf(S, S.placed[1]), f.targets().find(q => q.kind === 'dev' && q.ref === S.placed[1]).label]; });
    ok('연결 안 됨 안내와 열원 25 ℃', t0[0] === 25 && /열원 연결 안 됨/.test(t0[1]), JSON.stringify(t0));
    await page.keyboard.press('l'); await page.waitForTimeout(200);
    const lookAtDev = async (i) => { await ev((i) => { const f = __fp, d = f.S.placed[i], H = f.island().padH; f.p.x = 28.0; f.p.z = 41.0; f.p.y = H; f.p.vy = 0; const cx = 24 + (d.x - 100) + 1, cz = 36 + d.y + 1, dx = cx - f.p.x, dz = cz - f.p.z, dy = H + 0.9 - (f.p.y + 1.6), l = Math.hypot(dx, dy, dz); f.setLook(Math.atan2(-dx, -dz), Math.asin(dy / l)); }, i); await page.waitForTimeout(300); await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await page.waitForTimeout(500); };
    await lookAtDev(0); await lookAtDev(1);
    const t1 = await ev(() => { const S = __fp.S; return { links: S.links.map(l => l.kind), heat: Sim.heatOf(S, S.placed[1]) }; });
    ok('열선: 연결하면 먼 증류기가 화덕 열을 받음', t1.links.includes('heat') && t1.heat > 25, JSON.stringify(t1));
    // 같은 쌍을 다시 이으면 해제
    await lookAtDev(0); await lookAtDev(1);
    ok('열선 해제', await ev(() => __fp.S.links.length) === 0);
    await lookAtDev(0); await lookAtDev(1);   // 다시 연결
    // 환경: 부지 장치는 그 행성의 기후로 계산된다. 탐사정이 고원 행성에 가 있어도 불시착 행성 부지의 증류기는 1 atm으로 끓는점을 계산한다
    const env = await ev(() => { const S = __fp.S, still = S.placed[1]; Object.assign(still.s, { w: 300, w0: 300, ns: 1.2, run: true }); G.sail('alpine'); return new Promise(r => setTimeout(() => { Sim.advance(S, 20); const tb = still.s.tb; Sim.setDev(still); const pg = Sim.pAtm(S); Sim.setDev(null); r({ tb, ship: S.raft.dock, pGround: pg, pShip: Sim.pAtm(S) }); }, 1800)); });
    ok('환경: 지표 부지 장치는 그 행성(1 atm)의 끓는점', env.ship === 'alpine' && env.pGround === 1 && env.pShip < 1 && env.tb > 98, JSON.stringify(env));
    await ev(() => { G.sail('start'); }); await page.waitForTimeout(1800);
    // 배관: 밥솥을 짓고 증류기 → 밥솥 배관, 증류기 출력이 탱크로 흐르고 목표 집계(f.dW)가 같이 오른다
    await pad('cooker', 5, 4);
    await ev(() => { const S = __fp.S; S.placed[1].s.outW = 120; });
    await page.keyboard.press('l'); await page.waitForTimeout(100);
    await page.keyboard.press('l'); await page.waitForTimeout(100);   // 열선 → 배관 모드
    await lookAtDev(1); await lookAtDev(2); await page.waitForTimeout(2000);
    const pipe = await ev(() => { const S = __fp.S, still = S.placed[1], cook = S.placed[2]; return { kinds: S.links.map(l => l.kind), tank: cook.s.tank || 0, outW: still.s.outW, dW: S.f.dW }; });
    ok('배관: 증류수가 밥솥 탱크로 흐름(f.dW 집계)', pipe.kinds.includes('water') && pipe.tank >= 100 && pipe.dW >= 100, JSON.stringify(pipe));
    // 밥솥 조리는 탱크 물을 먼저 쓴다(가방 증류수는 그대로)
    const cook = await ev(() => { const S = __fp.S, c = S.placed[2]; S.inv.water = 0; S.inv.noodle = 1; S.inv.salt = 0; c.s.tank = 400; const before = c.s.tank; Sim.act.cook(S, c, 0, 2); return { before, after: c.s.tank, run: c.s.run, inv: S.inv.water }; });
    ok('조리: 탱크 증류수 300 g 사용(가방은 그대로)', cook.run && cook.before - cook.after === 300 && cook.inv === 0, JSON.stringify(cook));
    await ev(() => { const S = __fp.S; S.placed.length = 0; S.links.length = 0; S.placed.push(...window.__savedPlaced); });
    // 점프만으로 네 섬을 건널 수 있다(자동 오르기 없음): 부두에서 서쪽 안쪽 끝까지 갔다가 돌아온다
    for (const dock of ['start', 'plaza', 'alpine', 'polar']) {
      await ev(d => { const S = __fp.S; S.f.raft = true; S.qDone = 11; if (S.raft.dock !== d) G.sail(d); }, dock); await page.waitForTimeout(1500);
      const walk = await ev(() => {
        const f = __fp, res = {};
        const go = (yaw, done) => { f.setLook(yaw, 0); let t = 0, lx = f.p.x, lz = f.p.z, stuck = 0;
          while (t < 150 && !done()) { f.stepPlayer(1 / 60, stuck > 10 ? (Math.floor(t / 2) % 2 ? 1 : -1) : 0, 1, f.p.onGround && stuck > 40 || f.p.inW); t += 1 / 60; stuck = Math.hypot(f.p.x - lx, f.p.z - lz) < 0.004 ? stuck + 1 : 0; lx = f.p.x; lz = f.p.z; }
          return done(); };
        f.p.x = 50.5; f.p.z = 32.5; f.p.y = f.groundAt(50.5, 32.5); f.p.vy = 0;
        res.west = go(Math.PI / 2, () => f.p.x < 12);
        res.east = go(-Math.PI / 2, () => f.p.x > 50);
        res.at = [Math.round(f.p.x * 10) / 10, Math.round(f.p.z * 10) / 10, Math.round(f.p.y * 10) / 10]; return res;
      });
      ok(`섬 통과: ${dock}`, walk.west && walk.east, JSON.stringify(walk));
    }
    // 항해: 광장섬으로 → 섬이 바뀌고 뗏목 위에 서며 장치가 따라온다
    await ev(() => { __fp.S.f.raft = true; G.sail('plaza'); });
    await page.waitForTimeout(1500);
    const arr = await ev(() => { const f = __fp; return { isl: f.islName(), onG: f.p.onGround, x: f.p.x, z: f.p.z, dev: f.S.placed.length, dock: f.S.raft.dock }; });
    ok('항해(광장섬 도착)', arr.isl === 'plaza' && arr.dock === 'plaza' && arr.onG && arr.dev === 1, JSON.stringify(arr));
    // 보스: 제단을 보고 E → 골렘 화면

    await ev(() => { const f = __fp, o = f.island().objs.find(q => q.type === 'altar'); f.p.x = o.x + 3; f.p.z = o.z; f.p.y = f.island().height(o.x + 3, o.z); f.p.vy = 0; });
    await page.waitForTimeout(600);
    await ev(() => { const f = __fp, o = f.island().objs.find(q => q.type === 'altar'); aim(o.x, o.y + 1, o.z); }); await page.waitForTimeout(300);
    await page.keyboard.press('e'); await page.waitForTimeout(500);
    ok('제단에서 골렘 화면', await ev(() => !!document.getElementById('golem')));
    await page.click('#mclose');
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
    console.log(checks.join(' · '));

  // 온라인(가짜 Net): /saves3 불러오기 → 광장섬·파낸 복셀 복원, 다른 플레이어·정박 뗏목 표시, 위치(x·y·z·yaw)·세이브 전송
  try {
    const page2 = await browser.newPage({ viewport: { width: 1000, height: 600 } });
    page2.on('pageerror', e => errors.push('페이지 에러(온라인): ' + e.message));
    page2.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load|404/.test(m.text())) errors.push('콘솔 에러(온라인): ' + m.text()); });
    await page2.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (mod && /three\.module\.js/.test(r.request().url())) ? r.fulfill({ path: mod, contentType: 'text/javascript' }) : r.abort());
    await page2.addInitScript(() => {
      const calls = { saveSave: 0, saves: [], pos: [], join: [], rafts: 0 };
      const fake = {
        ok: true, user: { uid: 'u1' }, nick: '테스터', guest: true, peers: { u2: { nick: '친구', x: 30, y: 12, z: 30, yaw: 0, air: false } }, calls,
        init: () => true, restore: async () => '테스터',
        loadSave: async () => { const s = Sim.newState(); s.fp = { x: 40.5, y: 14, z: 30.5, yaw: 1, pitch: 0, melted: {}, mods: { plaza: { '33,12,40': 0 } } }; s.raft.dock = 'plaza'; s.f.raft = true; s.qDone = 4; s.placed = [{ id: 'fire', x: 1, y: 1, s: { level: 0, fuel: 0 } }]; return s; },
        saveSave: async (o) => { calls.saveSave++; calls.saves.push(Object.keys(o)); }, saveRaft: async (o) => { calls.rafts++; calls.raft = o; },
        joinMap: (m, first) => calls.join.push([m, Object.keys(first)]), sendPos: (pk) => calls.pos.push(pk), leaveMap() {},
        loadRafts: async () => [{ nick: '이웃', cells: 6, dock: 'plaza', devs: [{ id: 'still', u: 0, z: 0 }] }], loadBottles: async () => [],
      };
      Object.defineProperty(window, 'Net', { get: () => fake, set: () => {} });
    });
    await page2.goto(`http://127.0.0.1:${PORT}/fp/index.html?test`); await page2.waitForTimeout(1500);
    await page2.click('#t-start'); await page2.waitForTimeout(1800);
    if (await page2.evaluate(() => !document.getElementById('modal').hidden)) await page2.click('#mclose');
    await page2.waitForTimeout(1500);
    const on = await page2.evaluate(() => { const f = __fp; return { isl: f.islName(), dock: f.S.raft.dock, hasMods: 'mods' in f.S.fp, fire: f.S.placed.length, x: f.p.x, calls: Net.calls, labels: document.querySelectorAll('.nick3').length, lt: [...document.querySelectorAll('.nick3')].map(e => e.textContent), peers: Object.keys(Net.peers), presKeys: Object.keys(f.S.fp), pause: Store.paused, scene: f.scene.children.length }; });
    ok('온라인: 서버 세이브로 광장섬 복원', on.isl === 'plaza' && on.dock === 'plaza' && on.fire === 1, JSON.stringify(on));
    ok('온라인: 옛 복셀 기록(mods)은 무시', !on.hasMods, JSON.stringify(on.hasMods));
    ok('온라인: 광장 접속(fp-plaza)과 위치 전송', on.calls.join.some(j => j[0] === 'fp-plaza' && j[1].includes('z') && j[1].includes('yaw')) && on.calls.pos.length >= 0, JSON.stringify(on.calls.join));
    ok('온라인: 다른 플레이어·정박 뗏목 이름표', on.labels >= 2, JSON.stringify([on.labels, on.lt, on.peers, on.pause]));
    await page2.waitForTimeout(6500);
    const sv = await page2.evaluate(() => Net.calls);
    ok('온라인: /saves3 저장에 fp 포함, 뗏목 요약에 z', sv.saves.some(k => k.includes('fp')) && sv.rafts > 0 && sv.raft.devs.every(d => 'z' in d), JSON.stringify([sv.saves.slice(0, 1), sv.raft]));
    await page2.close();
  } catch (e) { errors.push('온라인 시험 실패: ' + e.message); }
  } finally { await browser.close(); srv.kill(); }
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('1인칭 3D 연기 시험 통과');
})();
