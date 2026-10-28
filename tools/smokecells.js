// 칸 시뮬 연결 시험(19단계, DESIGN.md §4-29): 끈 상태 = 옛 결과, 켜면 방이 데워지고 압력이 균일해지는지, 땅 파기·블록·문이 기체 몰수·에너지를 보존하는지(장부와 일치),
// 환기구·문, 장치(Sim.airTemp·pAtm·기체 포집기)가 칸 값을 읽는지, 팀 비담당은 계산하지 않는지, 지도 모드 전환·색 눈금자·밀도층 문구, 마우스 위 칸 값이 cells.js 값과 같은지,
// 재료 도감의 값이 chem.js 표와 같은지, 콘솔 에러 0. 사용: node tools/smokecells.js   (Playwright, file://)
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
  const ev = (f, a) => page.evaluate(f, a).catch(e => { console.log(steps.join('\n')); throw e; });
  const sleep = (ms) => page.waitForTimeout(ms);
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await sleep(600);
  await page.click('#t-continue'); await sleep(800);
  if (await ev(() => !document.getElementById('modal').hidden)) await page.click('#mclose');
  await sleep(500);

  // ---- 1. 끈 상태 = 옛 결과 ----
  const scenario = () => ev(() => {   // 코어 안에 화덕 + 증류기를 짓고 증류하는 같은 시나리오(새 상태)
    const S = Sim.newState(); Object.assign(S.inv, { stick: 30, sand: 30, bottle: 4, sea: 3, water: 400 });
    Sim.act.placeFree(S, 'fire', 1, 1, 'start'); Sim.act.placeFree(S, 'still', 3, 1, 'start');
    const f = S.placed.find(d => d.id === 'fire'), st = S.placed.find(d => d.id === 'still');
    Sim.act.fuel(S, f, 8); Sim.act.level(S, f, 2); for (let i = 0; i < 3; i++) Sim.act.load(S, st); Sim.act.toggle(S, st); Sim.advance(S, 900); Sim.act.collect(S, st);
    return JSON.stringify({ s: st.s, f: f.s, inv: S.inv, p: Sim.pAtm(S), t: Sim.airTemp(S) });
  });
  const off0 = await scenario();
  ok('꺼진 상태: 고리가 모두 비어 있다(World.cellHooks·Sim.geo.pressure·airMix)', await ev(() => !CellSim.active() && World.cellHooks.temp === null && !Sim.geo.pressure && !Sim.geo.airMix));
  ok('꺼진 상태: 외기 압력·기온은 옛 값(ENV.P, 구역 온도 12 ℃)', await ev(() => { const S = G.debug(); return Sim.pAtm(S) === Sim.ENV.start.P && Sim.airTemp(S) === 12; }));

  // ---- 2. 켜기: 지도 모드 단추·눈금자·문구 ----
  await ev(() => CellSim.setOn(true)); await sleep(700);
  ok('켜면 모드 단추 줄이 보이고 시간 배율 ×60(게임 설정, 가정)이 적혀 있다', await ev(() => !document.getElementById('cells-modes').hidden && /×60/.test(document.getElementById('cells-modes').innerText) && /가정/.test(document.getElementById('cells-modes').innerText)));
  ok('일반 모드에서는 눈금자가 없다', await ev(() => document.getElementById('cells-legend').hidden));
  const legend = () => ev(() => ({ hidden: document.getElementById('cells-legend').hidden, text: document.getElementById('cells-legend').innerText, mode: CellSim.st.mode, bar: document.getElementById('cells-modes').innerText }));
  await page.click('#cells-modes button[data-m="temp"]'); await sleep(300);
  let L = await legend();
  ok('온도 모드: 눈금자에 −20 ~ 100 ℃ 범위와 "게임 설정(가정)"', L.mode === 'temp' && !L.hidden && /온도 \(℃\)/.test(L.text) && /-20/.test(L.text) && /100/.test(L.text) && /게임 설정\(가정\)/.test(L.text), L.text.slice(0, 120));
  ok('지도 모드에는 밀도층 문구(Cells.NOTES.layer)가 같이 나온다', await ev(() => document.getElementById('cells-legend').innerText.includes(Cells.NOTES.layer.slice(0, 30)) && /영구히 나뉘지 않는다/.test(document.getElementById('cells-legend').innerText)));
  await page.click('#cells-modes button[data-m="press"]'); await sleep(300); L = await legend();
  ok('압력 모드: 눈금자 0 ~ 3 atm', L.mode === 'press' && /총압 \(atm\)/.test(L.text) && /3\.0 atm/.test(L.text) && /0\.0 atm/.test(L.text), L.text.slice(0, 100));
  await page.click('#cells-modes button[data-m="gas"]'); await sleep(300); L = await legend();
  ok('기체(분압) 모드: 기체 단추 4개와 분압 눈금자 0 ~ 1.5 atm', L.mode === 'gas' && /분압 \(atm\)/.test(L.text) && /1\.5 atm/.test(L.text) && (await ev(() => document.querySelectorAll('#cells-modes button[data-g]').length)) === 4, L.bar);
  await page.click('#cells-modes button[data-g="He"]'); await sleep(200);
  ok('기체 단추로 바꾸면 눈금자 제목이 He 분압', /He 분압/.test((await legend()).text));
  await page.click('#cells-modes button[data-m="normal"]'); await sleep(200);
  ok('일반으로 돌아오면 눈금자가 사라진다', (await legend()).hidden);

  // ---- 3. 마우스 위 칸 값이 cells.js 값과 같다 ----
  const view = () => ev(() => { const c = SideGame.cam(), k = SideGame.scale(), r = document.getElementById('cv').getBoundingClientRect(); return { cx: c.x, cy: c.y, k, left: r.left, top: r.top }; });
  const hoverTile = async (tx, ty) => { const v = await view(); await page.mouse.move(v.left + (tx * 16 + 8 - v.cx) * v.k, v.top + (ty * 16 + 8 - v.cy) * v.k); await page.mouse.move(v.left + (tx * 16 + 8 - v.cx) * v.k + 1, v.top + (ty * 16 + 8 - v.cy) * v.k + 1); await sleep(200); };
  await hoverTile(3, 1);
  const tipAir = await ev(() => { const t = document.getElementById('cells-tip'), [tx, ty] = SideGame.mouseTile(), p = CellSim.grid().probe(tx - CellSim.win().ox, ty - CellSim.win().oy); return { hidden: t.hidden, text: t.innerText, p, tile: [tx, ty] }; });
  const fx = (n, d) => n.toFixed(d);
  ok('코어 안 빈 칸에 마우스를 올리면 말풍선: 열린 칸, 온도(℃), 총압(atm), 기체별 분압·몰분율', !tipAir.hidden && /열린 칸/.test(tipAir.text) && tipAir.text.includes(`온도 ${fx(tipAir.p.T, 1)} ℃`) && tipAir.text.includes(`총압 ${fx(tipAir.p.P, 3)} atm`) && ['N₂', 'O₂', 'He', '수증기'].every(g => tipAir.text.includes(g)), tipAir.text);
  ok('말풍선의 분압·몰분율이 cells.js 값(Grid.probe)과 같다', ['N2', 'O2'].every(g => tipAir.text.includes(`${({ N2: 'N₂', O2: 'O₂' })[g]} ${fx(tipAir.p.partial[g], 3)} atm (${fx(tipAir.p.frac[g] * 100, 1)} %)`)), tipAir.text);
  ok('분압의 합 = 총압, 몰분율의 합 = 1(돌려주는 값 자체가 계산 한 곳)', Math.abs(Object.values(tipAir.p.partial).reduce((a, b) => a + b, 0) - tipAir.p.P) < 1e-9 && Math.abs(Object.values(tipAir.p.frac).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  await hoverTile(2, 0);   // 코어 선체(철판)
  const tipSolid = await ev(() => ({ text: document.getElementById('cells-tip').innerText, m: Chem.matProps('METAL') }));
  ok('고체 칸(선체): 재료 이름, 닫힌 칸, 밀도·비열·열전도율이 chem.js 재료 표 값', /철판/.test(tipSolid.text) && /닫힌 칸/.test(tipSolid.text) && tipSolid.text.includes(`밀도 ${tipSolid.m.rho} g/cm³`) && tipSolid.text.includes(`비열 ${tipSolid.m.c.toFixed(2)} J/(g·K)`) && tipSolid.text.includes(`열전도율 ${tipSolid.m.k} W/(m·K)`), tipSolid.text);
  ok('말풍선은 화면에서 새로 계산하지 않는다(cellsim.js 안에 기체 상수·몰수 계산식이 없다)', !/C\.R\b|R_J|C\.moles|C\.partial|C\.gasDensity/.test(require('fs').readFileSync(path.resolve(__dirname, '..', 'cellsim.js'), 'utf8').replace(/\/\/.*$/gm, '')));

  // ---- 4. 방: 화덕을 켜면 데워지고 압력이 오르며 균일해진다(밀폐) ----
  const room = await ev(() => { const g = CellSim.grid(), { ox, oy } = CellSim.win(), cells = []; for (let y = 1; y <= 2; y++) for (let x = 0; x <= 5; x++) cells.push([x, y]); const sealed = cells.every(([x, y]) => [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].every(([a, b]) => cells.some(([c, d]) => c === a && d === b) || !g.probe(a - ox, b - oy).open)); return { sealed, n: cells.length, P: g.probe(2 - ox, 1 - oy).P, T: g.probe(2 - ox, 1 - oy).T }; });
  ok('코어(선체 + 해치 6×2칸)는 밀폐된 방이다(열린 이웃이 없음)', room.sealed, JSON.stringify(room));
  ok('처음 방: 1 atm, 12 ℃(구역 온도)', Math.abs(room.P - 1) < 0.01 && Math.abs(room.T - 12) < 0.01, JSON.stringify(room));
  await ev(() => { const S = G.debug(); Object.assign(S.inv, { stick: 40, sand: 30, bottle: 4 }); Sim.act.placeFree(S, 'fire', 1, 1, 'start'); const f = S.placed.find(d => d.id === 'fire'); Sim.act.fuel(S, f, 12); Sim.act.level(S, f, 3); });
  const spread = () => ev(() => { const g = CellSim.grid(), { ox, oy } = CellSim.win(), P = [], T = []; for (let y = 1; y <= 2; y++) for (let x = 0; x <= 5; x++) { const p = g.probe(x - ox, y - oy); P.push(p.P); T.push(p.T); } return { P: [Math.min(...P), Math.max(...P)], T: [Math.min(...T), Math.max(...T)] }; });
  const e0 = await ev(() => CellSim.grid().heaterJ), m0 = await ev(() => CellSim.grid().moles());
  for (let i = 0; i < 10; i++) { await ev(() => { Sim.advance(G.debug(), 12); CellSim.tick(); }); }
  await sleep(300);
  const sp1 = await spread();
  ok('화덕을 켜고 약 2게임 시간: 방 온도가 올라간다(밀폐라 압력도 오른다, 가열 기체 PV = nRT)', sp1.T[1] > 40 && sp1.P[1] > 1.1, JSON.stringify(sp1));
  ok('열원 입력 장부가 쌓인다(고정 온도 칸이 받아 간 열) 그리고 기체 몰수는 그대로(밀폐)', (await ev(() => CellSim.grid().heaterJ)) > e0 + 1000 && Math.abs((await ev(() => CellSim.grid().moles())) - m0) < 1e-6 * m0, String(await ev(() => CellSim.grid().heaterJ)));
  for (let i = 0; i < 30; i++) await ev(() => { Sim.advance(G.debug(), 20); CellSim.tick(); });
  const sp2 = await spread();
  ok('시간이 지나면 같은 방의 압력이 균일해진다(최대 − 최소 < 0.02 atm)', sp2.P[1] - sp2.P[0] < 0.02, JSON.stringify(sp2));
  // 장치가 칸 값을 읽는다
  const rd = await ev(() => { const S = G.debug(), g = CellSim.grid(), w = CellSim.win(), px = Math.floor((S.px + World.PW / 2) / 16), py = Math.floor((S.py + World.PH / 2) / 16), p = g.probe(px - w.ox, py - w.oy); return { airT: Sim.airTemp(S), pAtm: Sim.pAtm(S), T: p.T, P: p.P, pt: [px, py], amb: World.ambientAt(S, null, px, py) }; });
  ok('장치·온도계가 읽는 값: Sim.airTemp·Sim.pAtm·World.ambientAt이 칸 온도·압력과 같다', rd.airT === rd.T && rd.pAtm === rd.P && rd.amb === rd.T && rd.T > 40, JSON.stringify(rd));
  const cap = await ev(() => { const S = G.debug(), g = CellSim.grid(), w = CellSim.win(); Object.assign(S.inv, { stick: 40, sand: 40, bottle: 4 }); Sim.act.placeFree(S, 'collector', 3, 1, 'start'); const n0 = S.caps.length; Sim.act.cap(S); const c = S.caps[S.caps.length - 1], px = Math.floor((S.px + World.PW / 2) / 16), py = Math.floor((S.py + World.PH / 2) / 16), p = g.probe(px - w.ox, py - w.oy); return { added: S.caps.length - n0, c, want: Chem.moles(p.P, 0.5, p.T), frac: p.frac }; });
  ok('기체 포집기 캡슐: n = P·V/(R·T)(칸 값), mix = 방의 몰분율', cap.added === 1 && Math.abs(cap.c.n - cap.want) < 1e-12 && cap.c.mix && ['N2', 'O2', 'He', 'H2O'].every(g => Math.abs(cap.c.mix[g] - cap.frac[g]) < 1e-12), JSON.stringify(cap));
  ok('끈 뒤 시나리오 비교를 위해 화덕·포집기를 철거한다', await ev(() => { const S = G.debug(); S.placed = S.placed.filter(d => d.id !== 'fire' && d.id !== 'collector'); return true; }));

  // ---- 5. 편집 보존: 블록 놓기(이웃 분배)·갇힌 칸(방출 장부)·파기(진공) ----
  await ev(() => { Sim.advance(G.debug(), 1); CellSim.tick(); });
  await ev(() => { window.__says = []; const o = Sim.say; Sim.say = (t) => { window.__says.push(String(t)); return o(t); }; });
  const edit = (x, y, id) => ev(([x, y, id]) => { const g = CellSim.grid(), w = CellSim.win(), m0 = g.moles(), e0 = g.energy(), n = g.ledger.length; World.setTile(G.debug(), x, y, id); const rec = g.ledger[g.ledger.length - 1]; return { rec: g.ledger.length > n ? rec : null, dm: g.moles() - m0, de: g.energy() - e0, rel: g.released.moles, p: g.probe(x - w.ox, y - w.oy) }; }, [x, y, id]);
  const blk = await edit(3, 1, 3);   // 코어 안 칸(3, 1)을 돌로 막는다
  ok('블록 놓기: 기체가 열린 이웃에 나눠 옮겨져 총 몰수 불변, 에너지 변화 = 장부(Δ기체 + Δ고체)', blk.rec && blk.rec.type === 'solidify' && blk.rec.receivers > 0 && Math.abs(blk.dm) < 1e-9 && Math.abs(blk.de - (blk.rec.dGasE + blk.rec.dSolidE)) < 1e-3 * Math.max(1, Math.abs(blk.rec.dSolidE)), JSON.stringify(blk));
  const exc = await edit(3, 1, 0);   // 다시 판다
  ok('땅 파기: 진공(몰수 불변), 압력 하락 문구가 나오고, 에너지 변화 = 고체 에너지 장부', exc.rec && exc.rec.type === 'excavate' && Math.abs(exc.dm) < 1e-9 && exc.p.n === 0 && Math.abs(exc.de - exc.rec.dSolidE) < 1e-3 * Math.max(1, Math.abs(exc.rec.dSolidE)), JSON.stringify(exc));
  ok('파낸 뒤 화면 문구에 "압력이 내려갑니다"(보일 법칙)가 나온다', await ev(() => window.__says.some(t => /압력이 내려갑니다/.test(t))), JSON.stringify(await ev(() => window.__says)));
  // 갇힌 한 칸: 이웃 셋을 막고 자기 자신을 막는다 → 외기 방출 장부
  await ev(() => { for (const [x, y] of [[1, 2], [2, 1], [0, 1]]) World.setTile(G.debug(), x, y, 3); });
  const trap = await edit(1, 1, 3);
  ok('갇힌 한 칸을 막으면 기체가 외기로 방출(장부), 몰수가 그만큼 줄고 "갇힌 기체 … 빠져나갔어요" 문구와 자동 기록이 나온다', trap.rec && trap.rec.lostMoles > 0 && Math.abs(trap.dm + trap.rec.lostMoles) < 1e-9 && trap.rel >= trap.rec.lostMoles && await ev(() => window.__says.some(t => /갇힌 기체 .* mol이 빠져나갔어요/.test(t)) && G.debug().log.some(l => l.type === '칸 시뮬')), JSON.stringify([trap, await ev(() => window.__says)]));
  await ev(() => { for (const [x, y] of [[1, 2], [2, 1], [0, 1], [1, 1]]) World.setTile(G.debug(), x, y, 0); });

  // ---- 6. 환기구·문(바위 속 두 방, 한 칸 문) ----
  const spot = await ev(() => { const w = CellSim.win(); for (let y = 8; y < w.oy + 50; y++) for (let x = w.ox + 10; x < w.ox + 80; x++) { let good = true; for (let yy = y - 1; yy <= y + 1 && good; yy++) for (let xx = x - 1; xx <= x + 9 && good; xx++) { const t = World.tileAt(xx, yy); if (!(t === World.DIRT || t === World.STONE)) good = false; } if (good) return [x, y]; } return null; });
  ok('바위 속 빈 자리(벽 포함 11×3)를 찾았다', !!spot, JSON.stringify(spot));
  const flow = (k) => ev(async ([x0, y0, k]) => {
    const S = G.debug(), g = CellSim.grid(), w = CellSim.win(), lx = (x) => x - w.ox, ly = (y) => y - w.oy;
    for (let x = x0; x <= x0 + 8; x++) World.setTile(S, x, y0, 0);                       // 가로 9칸 굴(진공)
    World.setTile(S, x0 + 4, y0, k === 'vent' ? World.VENT : World.DOOR);                // 가운데: 환기구 또는 닫힌 문
    for (let x = x0; x <= x0 + 3; x++) g.set(lx(x), ly(y0), 'AIR', 20, Cells.airMoles(2, 20));   // 왼쪽 방 2 atm
    const pa = () => g.probe(lx(x0 + 1), ly(y0)).P, pb = () => g.probe(lx(x0 + 7), ly(y0)).P, a0 = pa();
    g.run(1800, 60); const closed = [pa(), pb()];
    if (k === 'door') World.setTile(S, x0 + 4, y0, World.DOOR_OPEN);                     // 문을 연다 → 진공 칸(기체 불변)
    g.run(1800, 400); return { a0, closed, open: [pa(), pb()] };
  }, [spot[0], spot[1], k]);
  const fd = await flow('door');
  ok('닫힌 문: 두 방 압력이 섞이지 않는다(오른쪽 방 0 atm)', fd.closed[1] < 1e-6 && fd.closed[0] > 0.5, JSON.stringify(fd));
  ok('문을 열면(진공 칸이 되고) 기체가 퍼져 압력이 내려가며 두 방이 같아진다', Math.abs(fd.open[0] - fd.open[1]) < 0.03 * fd.open[0] && fd.open[0] < fd.a0 * 0.8, JSON.stringify(fd));
  const fv = await flow('vent');
  ok('환기구: 처음부터 기체가 지나 두 방 압력이 같아진다(항상 통함)', fv.closed[1] > 0.1 && Math.abs(fv.open[0] - fv.open[1]) < 0.03 * fv.open[0], JSON.stringify(fv));
  ok('문·환기구 타일은 판 칸 저장에 들어간다(S.world에 타일 번호가 RLE로)', await ev(() => Object.keys(G.debug().world).length > 0));
  ok('문 놓기·열고 닫기 규칙이 있다(재료: 환기구 철 1 + 돌 1, 문 철 2 + 돌 1)', await ev(() => typeof World.toggleDoor === 'function' && World.SPECIAL.vent.cost.iron === 1 && World.SPECIAL.vent.cost.stone === 1 && World.SPECIAL.door.cost.iron === 2 && World.SPECIAL.door.cost.stone === 1));

  // ---- 7. 시간 배율 ----
  const dtOf = (v) => ev((v) => { CellSim.setScale(v); const g = CellSim.grid(); CellSim.tick(); const t0 = g.time; Sim.advance(G.debug(), 10); CellSim.tick(); return g.time - t0; }, v);
  const d60 = await dtOf(60), d300 = await dtOf(300);
  ok('시간 배율: ×60에서 게임 10분 = 시뮬레이션 36,000초, ×300이면 5배', Math.abs(d60 - 36000) < 1 && Math.abs(d300 / d60 - 5) < 0.01, JSON.stringify([d60, d300]));
  await ev(() => CellSim.setScale(60));

  // ---- 8. 팀 비담당은 계산하지 않고 안내만 ----
  const team = await ev(() => { const g = CellSim.grid(); window.Team = { inParty: () => true, canAdvance: () => false }; const s0 = g.steps; Sim.advance(G.debug(), 10); CellSim.tick(); const r = { steps: g.steps - s0, msg: document.getElementById('cells-modes').innerText }; CellSim.tick(); return r; });
  await sleep(1100);
  const msg2 = await ev(() => document.getElementById('cells-modes').innerText);
  ok('팀에서 시계 담당이 아니면 계산하지 않는다(걸음 수 불변) + "시계 담당 팀원이 계산해요"', team.steps === 0 && /시계 담당 팀원이 계산해요/.test(msg2), JSON.stringify([team, msg2]));
  await ev(() => { delete window.Team; });

  // ---- 9. 칸 지도 창 문구 ----
  await ev(() => CellSim.open());
  const modal = await ev(() => document.getElementById('mbody').innerText);
  ok('칸 지도 창: 시간 배율 ×60·밀도층·열 전도·확산·에너지·편집 문구와 가정 표시', /×60/.test(modal) && /영구히 나뉘지 않는다/.test(modal) && /열 전도/.test(modal) && /그레이엄/.test(modal) && /내부 에너지/.test(modal) && /진공/.test(modal) && /게임 설정, 가정/.test(modal));
  await ev(() => document.getElementById('mclose').click());

  // ---- 10. 재료 도감(연구 노트 탭)이 chem.js 표와 같다 ----
  const hud = await ev(() => G.hudRect('연구 노트')), cvr = await ev(() => document.getElementById('cv').getBoundingClientRect().toJSON());
  await page.mouse.click(cvr.left + (hud.x + hud.w / 2) / hud.vw * cvr.width, cvr.top + (hud.y + hud.h / 2) / hud.vh * cvr.height); await sleep(300);
  await page.click('.tabs button:has-text("재료 도감")'); await sleep(300);
  const book = await ev(() => {
    const rows = {}, gas = {};
    document.querySelectorAll('#n-body tr[data-k]').forEach(tr => { rows[tr.dataset.k] = Object.fromEntries([...tr.querySelectorAll('td[data-f]')].map(td => [td.dataset.f, td.textContent])); });
    document.querySelectorAll('#n-body tr[data-g]').forEach(tr => { gas[tr.dataset.g] = Object.fromEntries([...tr.querySelectorAll('td[data-f]')].map(td => [td.dataset.f, td.textContent])); });
    const want = {}; for (const k of Object.keys(Chem.MATERIALS)) { const p = Chem.matProps(k); want[k] = { rho: String(p.rho), c: (+p.c).toFixed(2), k: String(p.k), t: p.t === null ? '못 팜' : String(p.t), tier: p.tier === null ? '—' : Chem.TIER_NAME[p.tier] }; }
    const wantG = {}; for (const g of Chem.GASES) wantG[g] = { M: String(Chem.GAS_TABLE[g].M), cv: (Chem.GAS_TABLE[g].cv * Chem.R_J).toFixed(2), rho: Chem.gasDensity(1, Chem.GAS_TABLE[g].M, 20).toFixed(3) };
    return { rows, gas, want, wantG, text: document.getElementById('n-body').innerText, n: Object.keys(Chem.MATERIALS).length };
  });
  ok(`재료 도감: 표의 ${book.n}개 재료 행이 chem.js 값(밀도·비열·열전도율·파는 시간·도구 단계)과 같다`, JSON.stringify(book.rows) === JSON.stringify(book.want), JSON.stringify(book.rows).slice(0, 200));
  ok('재료 도감: 기체 4종의 몰 질량·몰 열용량·밀도가 chem.js 값과 같다', JSON.stringify(book.gas) === JSON.stringify(book.wantG), JSON.stringify(book.gas));
  ok('재료 도감: 단위와 가정 표시가 있다', /g\/cm³/.test(book.text) && /J\/\(g·K\)/.test(book.text) && /W\/\(m·K\)/.test(book.text) && /g\/mol/.test(book.text) && /게임 설정\(가정\)/.test(book.text));
  ok('한 곳에서 나온다: 땅 파기 시간·도구 단계(World.DIG)와 칸 시뮬 열전도율(Cells.PROP)이 같은 표 값', await ev(() => { const m = Chem.MATERIALS; return World.DIG[World.STONE].t === m.STONE.t && World.DIG[World.GOLD].tier === m.GOLD.tier && World.DIG[World.HARD].t === m.HARD.t && Cells.PROP[Cells.KIND.METAL].k === Chem.matProps('METAL').k && Cells.PROP[Cells.KIND.ROCK].k === Chem.matProps('STONE').k && Chem.MOLAR_MASS.He === Chem.GAS_TABLE.He.M; }));
  await ev(() => document.getElementById('mclose').click());

  // ---- 11. 끄면 옛 결과 그대로 + 성능 ----
  await ev(() => CellSim.setOn(false)); await sleep(300);
  const off1 = await scenario();
  ok('끈 뒤: 같은 시나리오(화덕 + 증류기)의 결과가 켜기 전과 같다(옛 계산 그대로)', off0 === off1, off0.slice(0, 120) + ' / ' + off1.slice(0, 120));
  ok('끄면 고리가 다시 비고 모드 단추·눈금자·말풍선이 사라진다', await ev(() => World.cellHooks.temp === null && !Sim.geo.pressure && document.getElementById('cells-modes').hidden && document.getElementById('cells-legend').hidden && document.getElementById('cells-tip').hidden));
  await ev(() => { CellSim.setOn(true); CellSim.setMode('temp'); }); await sleep(600);
  const perf = await ev(async () => { const g = CellSim.grid(); const t0 = performance.now(); for (let i = 0; i < 20; i++) g.step(1800); const step = (performance.now() - t0) / 20; const c = document.createElement('canvas'); c.width = 1100; c.height = 650; const x = c.getContext('2d'), cam = SideGame.cam(); const t1 = performance.now(); for (let i = 0; i < 20; i++) CellSim.draw(x, cam, 1100, 650, 0); return { step, draw: (performance.now() - t1) / 20 }; });
  console.log(`[측정] 한 걸음(96×64칸) ${perf.step.toFixed(2)} ms, 지도 덧칠(보이는 칸, 온도 모드) ${perf.draw.toFixed(2)} ms`);
  ok('성능: 한 걸음 < 40 ms(4 Hz면 프레임 예산의 일부), 지도 덧칠 < 8 ms', perf.step < 40 && perf.draw < 8, JSON.stringify(perf));
  await browser.close();
  console.log(steps.join('\n'));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('칸 시뮬 연결 시험 통과, 콘솔 에러 없음');
})();
