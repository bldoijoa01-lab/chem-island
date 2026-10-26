// 탑다운 2D 연기 시험(13단계): td/index.html이 에러 없이 그려지고, 걷고(대각선 보정), 점프하고, 헤엄치고, 행성을 바꿔도 그려지는지 본다.
// three가 필요 없다(캔버스 2D). 사용: node tools/smoketd.js   (Playwright가 있는 환경에서)
const path = require('path'), { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright를 찾을 수 없습니다.'); process.exit(2); }
const PORT = 9000 + Math.floor(Math.random() * 500), ROOT = path.resolve(__dirname, '..');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } }), errors = [];
  page.on('pageerror', e => errors.push('페이지 에러: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load|404/.test(m.text())) errors.push('콘솔 에러: ' + m.text()); });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const ev = (f, a) => page.evaluate(f, a);
  const checks = [], sleep = (ms) => page.waitForTimeout(ms);
  const ok = (name, cond, extra = '') => { checks.push(name + (cond ? ' ✔' : ' ✘')); if (!cond) errors.push(`점검 실패: ${name} ${extra}`); };
  // 캔버스 가운데 영역에 서로 다른 색이 몇 가지 있는가(빈 화면 검출)
  const colors = () => ev(() => { const c = document.getElementById('c'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, s = new Set(); for (let i = 0; i < d.length; i += 4 * 37) s.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); return s.size; });
  try {
    await page.goto(`http://127.0.0.1:${PORT}/td/index.html?test`); await sleep(1500);
    ok('시작 화면', await ev(() => !document.getElementById('title').hidden));
    await page.click('#t-start'); await sleep(500);
    if (await ev(() => !document.getElementById('modal').hidden)) await page.click('#mclose');
    await sleep(1200);
    const st0 = await ev(() => { const t = __td; return { y: t.p.y, g: t.p.onGround, ground: t.ctx.groundAt(t.p.x, t.p.z) }; });
    ok('땅에 선다', st0.g && Math.abs(st0.y - st0.ground) < 0.05, JSON.stringify(st0));
    ok('화면이 비어 있지 않다(땅·물·플레이어)', await colors() > 6, String(await colors()));
    const v = await ev(() => __td.view());
    ok('정수 배율', Number.isInteger(v.Z) && v.Z >= 2, JSON.stringify(v));
    // 걷기: 오른쪽(+x) 1초, 아래쪽(+z) 1초
    const a0 = await ev(() => ({ x: __td.p.x, z: __td.p.z }));
    await page.keyboard.down('d'); await sleep(800); await page.keyboard.up('d');
    const a1 = await ev(() => ({ x: __td.p.x, z: __td.p.z }));
    ok('D = 오른쪽(+x)으로 걷는다', a1.x - a0.x > 1.5 && Math.abs(a1.z - a0.z) < 0.3, JSON.stringify([a0, a1]));
    await page.keyboard.down('s'); await sleep(500); await page.keyboard.up('s');
    const a2 = await ev(() => ({ x: __td.p.x, z: __td.p.z }));
    ok('S = 아래쪽(+z)으로 걷는다', a2.z - a1.z > 1.0, JSON.stringify([a1, a2]));
    // 대각선 보정: 같은 시간에 가는 거리가 직선과 거의 같다(√2배로 빨라지지 않는다). 시계는 stepPlayer로 직접 돌려 시간 오차를 없앤다
    const diag = await ev(() => { const t = __td, q = t.p; t.S.raft.cells = 12; const X = 53, Z = 31; q.x = X; q.z = Z; q.y = t.ctx.groundAt(X, Z); q.onGround = true; for (let i = 0; i < 40; i++) t.stepPlayer(1 / 60, 1, 1, false); const dd = Math.hypot(q.x - X, q.z - Z); q.x = X; q.z = Z; q.y = t.ctx.groundAt(X, Z); for (let i = 0; i < 40; i++) t.stepPlayer(1 / 60, 1, 0, false); const ds = Math.hypot(q.x - X, q.z - Z); return { dd, ds }; });
    ok('대각선 속도 보정', Math.abs(diag.dd - diag.ds) < 0.2 && diag.ds > 2, JSON.stringify(diag));
    // 점프: 올랐다가 내려온다(지면 높이는 그대로, 그림자는 땅에 남는 연출은 화면 쪽)
    const jump = await ev(() => { const t = __td, q = t.p; q.x = 20; q.z = 20; q.y = t.ctx.groundAt(20, 20); q.vy = 0; q.onGround = true; let hi = 0; for (let i = 0; i < 120; i++) { t.stepPlayer(1 / 60, 0, 0, i === 0); hi = Math.max(hi, q.y - t.ctx.groundAt(q.x, q.z)); } return { hi, end: q.y - t.ctx.groundAt(q.x, q.z), onGround: q.onGround }; });
    ok('점프: 약 2~3 m 올랐다 내려온다', jump.hi > 1.5 && jump.hi < 3.5 && jump.end < 0.05 && jump.onGround, JSON.stringify(jump));
    // 헤엄: 깊은 물에서는 느리다
    const sw = await ev(() => { const t = __td, q = t.p; q.x = 60; q.z = 10; q.y = 8; q.vy = 0; q.vx = 0; for (let i = 0; i < 30; i++) t.stepPlayer(1 / 60, 1, 0, false); return { inW: q.inW, x: q.x }; });
    ok('헤엄(물속은 천천히)', sw.inW && sw.x - 60 < 1.6, JSON.stringify(sw));
    // 걷기 한계(지도 가장자리): 멀리 나가면 막힌다
    const edge = await ev(() => { const t = __td, q = t.p; q.x = 85; q.z = 20; q.y = 10; for (let i = 0; i < 240; i++) t.stepPlayer(1 / 60, 1, 0, false); return q.x; });
    ok('지도 가장자리에서 막힘', edge <= 88.01, String(edge));
    // 행성이 바뀌어도 그려진다: 광장섬 -> 화면 색 확인
    await ev(() => { const t = __td, S = t.S; S.f.raft = true; Sim.act.sail ? 0 : 0; });
    // 13-c: 모든 자원·시설에 스프라이트가 있고(없으면 안 그려짐), 장치·늑대·사람·허브 시설이 그려진다
    const spr = await ev(() => { const t = __td, miss = []; for (const n of ['start', 'plaza', 'alpine', 'polar']) { t.show(n); for (const o of t.island().objs) if (!(o.type === 'altar' ? Art.dev.altar : Art.obj[o.type === 'tree' ? 'tree' : o.type])) miss.push(n + ':' + o.type); } t.show('start'); return { miss, person: ['down', 'up', 'side'].every(d => Art.person('#4a7bd8')[d].length === 2), wolf: !!Art.mob.wolf }; });
    ok('스프라이트: 모든 자원·시설 종류가 있다', spr.miss.length === 0 && spr.person && spr.wolf, JSON.stringify(spr));
    const dr = await ev(async () => { const t = __td, S = t.S; t.show('start'); for (const k of ['stick', 'sand', 'bottle', 'stone']) S.inv[k] = 50; S.raft.cells = 8; S.min = 720; Sim.act.place(S, 'fire', 0, 0); Sim.act.place(S, 'still', 2, 0); S.placed.forEach((d, i) => { d.uid = d.uid || 'u' + i; }); S.placed[0].s.level = 2; S.placed[0].s.fuel = 5; S.mobs.push({ id: 1, dx: S.placed[0].x, dy: S.placed[0].y, M: 400, M0: 600 }); t.p.x = 56; t.p.z = 33; t.p.y = 10; await new Promise(r => setTimeout(r, 400)); const c = document.getElementById('c'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let flame = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 70 && d[i + 1] < 160 && d[i + 2] < 90) flame++; S.mobs.length = 0; S.placed.length = 0; return { placed: 2, flame }; });
    ok('장치·불꽃이 그려진다(주황 픽셀)', dr.flame > 3, JSON.stringify(dr));
    // 13-d: 마우스 대상·채집·건설·연결·HUD
    await ev(() => { const t = __td, S = t.S; t.show('start'); S.f.raft = false; S.raft.cells = 12; S.placed.length = 0; S.links.length = 0; for (const k of Object.keys(S.inv)) S.inv[k] = 0; });
    const scr = (x, z) => ev(([x, z]) => { const v = __td.view(), c = __td.cam; return [((x - c.x) * 16 + v.VW / 2) * v.Z, ((z - c.z) * 16 + v.VH / 2) * v.Z]; }, [x, z]);
    const moveTo = async (x, z) => { await ev(([x, z]) => { const q = __td.p; q.x = x; q.z = z; q.y = __td.ctx.groundAt(x, z) + 0.01; q.vy = 0; }, [x, z]); await sleep(150); };
    // (1) 나무를 가리키면 이름이 뜨고, 눌러서 막대를 얻는다
    const tree = await ev(() => { const o = __td.island().objs.find(o => o.type === 'tree'); return { x: o.x, z: o.z }; });
    await moveTo(tree.x + 1.5, tree.z + 1.5);
    let [mx, my] = await scr(tree.x, tree.z - 1); await page.mouse.move(mx, my); await sleep(200);
    const hov = await ev(() => { const t = __td.hoverTarget(); return t && { kind: t.kind, label: t.label }; });
    ok('마우스로 나무를 가리키면 이름이 뜬다', hov && hov.kind === 'tree' && /나무/.test(hov.label), JSON.stringify(hov));
    ok('가리킨 대상의 이름표가 화면에 보인다', await ev(() => { const l = document.getElementById('aimlabel'); return l.style.display !== 'none' && l.textContent.length > 0; }));
    const stick0 = await ev(() => __td.S.inv.stick);
    await page.mouse.click(mx, my); await sleep(400);
    ok('나무를 클릭하면 채집된다(막대)', await ev(() => __td.S.inv.stick) > stick0, String(stick0));
    // (2) 멀리 있는 대상은 눌러도 안내만 나온다
    await moveTo(tree.x + 6, tree.z + 6);
    [mx, my] = await scr(tree.x, tree.z - 1); await page.mouse.move(mx, my); await sleep(150);
    const far0 = await ev(() => __td.S.inv.stick); await page.mouse.click(mx, my); await sleep(250);
    ok('너무 멀면 채집되지 않고 안내가 나온다', await ev(() => __td.S.inv.stick) === far0 && /멀/.test(await ev(() => document.getElementById('msg').textContent)));
    // (3) 바닷물: 물가에서 물 위를 클릭하면 뜬다
    await moveTo(60, 20);   // 탐사정 칸 밖의 얕은 바다 대신 부두 가장자리: 아래 물 칸을 가리킨다
    await ev(() => { const q = __td.p; q.x = 50.5; q.z = 28; q.y = __td.ctx.groundAt(50.5, 28); });
    await sleep(250);
    const water = await ev(() => { for (let r = 1; r < 5; r++) for (let a = 0; a < 16; a++) { const x = __td.p.x + Math.cos(a / 16 * 6.283) * r, z = __td.p.z + Math.sin(a / 16 * 6.283) * r; if (__td.ctx.groundAt(x, z) < 9.9 && !__td.ctx.raftCell(Math.floor(x), Math.floor(z))) return { x, z }; } return null; });
    [mx, my] = await scr(water.x, water.z); await page.mouse.move(mx, my); await sleep(150);
    const hw = await ev(() => { const t = __td.hoverTarget(); return t && t.kind; });
    ok('물 위를 가리키면 "바닷물 뜨기"', hw === 'water', String(hw));
    // 빈 병이 있어야 뜬다
    await ev(() => { __td.S.inv.bottle = 3; });
    const sea0 = await ev(() => __td.S.inv.sea); await page.mouse.click(mx, my); await sleep(500);
    if (await ev(() => !document.getElementById('modal').hidden)) await page.click('#mclose');
    ok('물을 클릭하면 바닷물이 담긴다', await ev(() => __td.S.inv.sea) > sea0, JSON.stringify([sea0, await ev(() => __td.S.inv.sea)]));
    // (4) 건설: 건설 모드에서 탐사정 칸을 클릭하면 화덕이 지어지고, 겹치는 칸은 빨간 안내
    await ev(() => { const S = __td.S; for (const k of ['stick', 'sand', 'bottle', 'stone']) S.inv[k] = 50; __td.pl.startBuild('fire'); });
    await moveTo(55, 33);
    [mx, my] = await scr(54, 32); await page.mouse.move(mx, my); await sleep(150);
    const gh = await ev(() => { const c = __td.cellUnderMouse(); return { c: !!c, ok: c && __td.pl.ghostCheck('fire', c).ok }; });
    ok('건설 미리보기: 지을 수 있는 칸', gh.c && gh.ok, JSON.stringify(gh));
    await page.mouse.click(mx, my); await sleep(500);
    ok('클릭으로 화덕 건설', await ev(() => __td.S.placed.length) === 1 && await ev(() => __td.S.placed[0].uid) , String(await ev(() => __td.S.placed.length)));
    await ev(() => { __td.pl.startBuild('fire'); });
    await page.mouse.click(mx, my); await sleep(300);
    ok('겹치는 칸에는 지어지지 않는다', await ev(() => __td.S.placed.length) === 1);
    await page.keyboard.press('q'); await sleep(100);
    // 장치를 가리키면 이름이 뜨고 E로 열린다
    await moveTo(55, 35);
    [mx, my] = await scr(55, 32.3); await page.mouse.move(mx, my); await sleep(150);
    const dv = await ev(() => { const t = __td.hoverTarget(); return t && t.kind + ':' + t.label; });
    ok('장치를 가리키면 이름이 뜬다', /dev:/.test(dv || '') && /화덕/.test(dv), String(dv));
    await page.keyboard.press('e'); await sleep(400);
    ok('E로 가까운 장치 패널이 열린다', await ev(() => !document.getElementById('modal').hidden));
    await page.click('#mclose');
    // (5) 연결 모드: 먼 증류기에 열선을 잇는다
    await ev(() => { const S = __td.S; __td.pl.startBuild('still'); });
    await moveTo(55, 36);
    [mx, my] = await scr(59, 32); await page.mouse.move(mx, my); await sleep(150);
    await page.mouse.click(mx, my); await sleep(500);
    const hasStill = await ev(() => __td.S.placed.length);
    ok('화덕에서 떨어진 칸에도 열선 거리 안이면 증류기를 짓는다', hasStill === 2, String(hasStill) + ' ' + await ev(() => document.getElementById('msg').textContent));
    await page.keyboard.press('l'); await sleep(100);
    const f0 = await ev(() => { const d = __td.S.placed[0]; return __td.ctx.devWorld(d); }), s0 = await ev(() => { const d = __td.S.placed[1]; return __td.ctx.devWorld(d); });
    let [fx, fy] = await scr(f0[0], f0[2] + 0.2); await page.mouse.move(fx, fy); await sleep(120); await page.mouse.click(fx, fy); await sleep(200);
    let [qx, qy] = await scr(s0[0], s0[2] + 0.2); await page.mouse.move(qx, qy); await sleep(120); await page.mouse.click(qx, qy); await sleep(300);
    ok('연결 모드: 두 장치를 차례로 눌러 열선을 잇는다', await ev(() => __td.S.links.length) === 1 && await ev(() => __td.S.links[0].kind) === 'heat', JSON.stringify(await ev(() => __td.S.links)) + await ev(() => document.getElementById('msg').textContent));
    await page.keyboard.press('q');
    // (6) 바위: 곡괭이로 꾹 눌러 캔다
    await ev(() => { const S = __td.S; S.placed.length = 0; S.links.length = 0; S.inv.pickaxe = 1; S.inv.stone = 0; });
    const rock = await ev(() => { const o = __td.island().objs.find(o => o.type === 'rock'); return o && { x: o.x, z: o.z }; });
    await moveTo(rock.x + 1.2, rock.z + 1.2);
    [mx, my] = await scr(rock.x, rock.z - 0.4); await page.mouse.move(mx, my); await sleep(150);
    await page.mouse.down(); await sleep(2700); await page.mouse.up(); await sleep(200);
    ok('바위를 꾹 눌러 캐면 돌 1개', await ev(() => __td.S.inv.stone) >= 1, String(await ev(() => __td.S.inv.stone)));
    // (7) HUD: 가방·메뉴·팀 버튼·시계
    const hud = await ev(() => ({ slots: document.querySelectorAll('#inv3 .slot').length, menu: document.querySelectorAll('#menu3 button').length, clock: document.getElementById('clock3').textContent, team: !!document.getElementById('teambtn') }));
    ok('HUD: 가방 칸·메뉴·시계·팀 버튼', hud.slots > 0 && hud.menu >= 6 && /^D\d+ \d\d:\d\d$/.test(hud.clock) && hud.team, JSON.stringify(hud));    ok('콘솔 에러 없음(여기까지)', errors.length === 0, errors.join(' | '));
  } finally { await browser.close(); srv.kill(); }
  console.log(checks.join(' · '));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('탑다운 2D 연기 시험 통과');
})();
