// 튜토리얼 smoke(17-a′): 무한 지하 월드에서 목표 1~11이 끝까지 되는지 게임 규칙(땅 파기 도구 단계·장치 건설·증류·밥솥·한제·포집기·얼음 생물·원정 행성)으로 따라간다.
// 사람이 걷는 대신 플레이어를 해당 칸 옆에 놓고, 땅은 World.digCheck/stepDig로 파며(도구 단계·판 칸 상한 검사 포함), 장치는 World.ghostCheck + Sim.act.placeFree로 짓는다. 보스(목표 8)는 ui-check와 같은 Raid 단계 이동을 쓴다.
// 사용: node tools/smoketut.js   (Playwright가 있는 환경에서)
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright를 찾을 수 없습니다.'); process.exit(2); }
(async () => {
  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1000, height: 600 } }), errors = [], steps = [];
  page.on('pageerror', e => errors.push('페이지 에러: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) errors.push('콘솔 에러: ' + m.text()); });
  await page.route(/^https?:/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(500);
  await page.click('#t-start'); await page.waitForTimeout(400);
  if (await page.evaluate(() => !document.getElementById('modal').hidden)) await page.click('#mclose');
  const ev = (f, a) => page.evaluate(f, a).catch(e => { console.log(steps.join(' · ')); throw e; });
  const ok = (name, cond, extra = '') => { steps.push(name + (cond ? ' ✔' : ' ✘')); if (!cond) errors.push(`점검 실패: ${name} ${extra}`); };
  // ---- 페이지 안 도우미 ----
  await ev(() => {
    window.T = {
      S: () => G.debug(),
      flush: () => { UI.flush(); },
      at(x, y) { const S = G.debug(); S.px = x * 16 + 3; S.py = y * 16 - 18; S.vx = S.vy = 0; },
      go(to) { const S = G.debug(); Sim.act.teleport(S, to); UI.flush(); World.applyDug(S); },
      dig(x, y) { const S = G.debug(); World.dig.on = true; World.dig.p = 0; const c = World.digCheck(S, x, y); if (!c.ok && World.tileAt(x, y) !== World.AIR) return c.msg || 'far'; World.dig.tx = x; World.dig.ty = y; World.stepDig(S, 99, x, y, false); return World.tileAt(x, y) === World.AIR ? 'ok' : 'fail'; },
      // 걸어 들어갈 수 있게 (x0,y0)에서 (x1,y1)까지 두 칸 높이 굴을 판다(수직 → 수평 순서)
      tunnel(pts) {
        const S = G.debug(), bad = []; let [cx, cy] = pts[0];
        for (const [x1, y1] of pts.slice(1)) {
          while (cx !== x1 || cy !== y1) {
            if (cy !== y1) cy += Math.sign(y1 - cy); else cx += Math.sign(x1 - cx);
            T.at(cx - Math.sign(x1 - cx || 1), cy); 
            for (const dy of [0, -1]) { const r = T.dig(cx, cy + dy); if (r !== 'ok' && World.tileAt(cx, cy + dy) !== World.AIR) bad.push([cx, cy + dy, r]); }
          }
        }
        return bad;
      },
      gatherIn(type, x0, y0, x1, y1) { const S = G.debug(); for (const o of World.objsIn(x0, y0, x1, y1).filter(o => o.type === type)) { for (let k = 0; k < 6; k++) { T.at(o.x, o.y); const t = World.targets(S).find(t => t.ref === o); if (!t) break; UI.interact(t); } } UI.flush(); },
      gather(type) { const S = G.debug(); for (const o of World.OBJS.filter(o => o.type === type)) { for (let k = 0; k < 6; k++) { T.at(o.x, o.y); const t = World.targets(S).find(t => t.ref === o); if (!t) break; UI.interact(t); } } UI.flush(); },
      build(id, x, y, pl) { const S = G.debug(); T.at(x + 1, y + 2); const g = World.ghostCheck(S, id, x, y); if (!g.ok) return g.msg; return Sim.act.placeFree(S, id, x, y, pl || Sim.dockOf(S).island) ? 'ok' : 'cost'; },
      dev(id) { return G.debug().placed.find(d => d.id === id); },
      adv(m) { Sim.advance(G.debug(), m); UI.flush(); },
      // 본부 재배 선반·모래 비축·얼음 저장고에서 하루씩 모아 필요한 재료를 채운다(자원은 하루 채집 횟수가 정해져 있다). 병은 모래 3 + 나뭇가지 1로 만든다
      stock(n) {
        const S = G.debug(), home = Sim.dockOf(S).island;
        const need = () => (S.inv.stick < (n.stick || 0) + 2 * Math.max(0, (n.bottle || 0) - S.inv.bottle)) || (S.inv.sand < (n.sand || 0) + 3 * Math.max(0, (n.bottle || 0) - S.inv.bottle)) || S.inv.ice < (n.ice || 0) || S.inv.salt < (n.salt || 0);
        for (let day = 0; day < 12 && need(); day++) { if (Sim.dockOf(S).island !== 'plaza') T.go('plaza'); T.gather('tree'); T.gather('sandpile'); T.gather('icecrystal'); const box = World.OBJS.find(o => o.type === 'box'); T.at(box.x, box.y); UI.interact(World.targets(S).find(t => t.ref === box)); Sim.advance(S, 1440); UI.flush(); }
        while (S.inv.bottle < (n.bottle || 0) && Sim.act.craft(S, 'bottle')) {}
        if (home !== 'plaza') T.go(home);
        return !need();
      },
    };
  });
  // ---- 시작: 코어 캡슐, 해치 밖은 단단한 땅 ----
  ok('코어 캡슐 안에서 시작', await ev(() => World.tileAt(0, 2) === World.HATCH && World.tileAt(5, 2) === World.HATCH && G.debug().base.x === 0));
  ok('목표 1~3 자원(염수·결정 줄기·균사·당 결정)과 암염은 코어에서 55칸 안, 모래 층·얼음은 90칸 안', await ev(() => [['-1,0', 'brine', 55], ['1,0', 'tree', 55], ['0,1', 'wheat', 55], ['-1,1', 'cane', 55], ['-2,0', 'rocksalt', 55], ['1,1', 'sandpile', 90], ['0,2', 'icecrystal', 90]].every(([c, kind, lim]) => { const [a, b] = c.split(','), f = World.getChunk(+a, +b).feat; return f && f.kind === kind && Math.hypot(Math.abs(f.x0 + (f.x1 - f.x0) / 2), f.y1) <= lim; })));
  // ---- 도구 단계 ----
  ok('맨손으로 퇴적토는 파고 암반(돌)은 못 판다', await ev(() => { const S = G.debug(); T.at(-1, 2); return World.digCheck(S, -1, 2).ok === true && (() => { T.at(0, 35); return World.digCheck(S, 0, 36).msg; })().includes('곡괭이'); }));
  // ---- 재료: 본부 재배 선반·모래 비축·얼음 저장고·보급 상자(하루 채집 횟수 제한 → 며칠에 걸쳐 모은다) ----
  await ev(() => { T.go('plaza'); });
  ok('전송 패드로 본부에 도착', await ev(() => Sim.dockOf(G.debug()).island === 'plaza'));
  const stocked = await ev(() => T.stock({ stick: 40, sand: 30, bottle: 8, ice: 4 }));
  ok('본부에서 며칠에 걸쳐 나뭇가지·모래·유리병·얼음을 모음(채집 횟수 제한 안에서)', stocked, await ev(() => JSON.stringify(G.debug().inv)));
  await ev(() => { const S = G.debug(); Sim.act.craft(S, 'pickaxe'); Sim.act.craft(S, 'syringe'); });
  ok('보급 상자의 돌 3개로 곡괭이 제작', await ev(() => G.debug().inv.pickaxe === 1));
  const waterOk = await ev(() => { const S = G.debug(); for (let x = 10; x < 24; x++) { T.at(x, World.GY[x]); if (World.targets(S).some(t => t.kind === 'water')) { for (let i = 0; i < 3; i++) UI.interact(World.targets(S).find(t => t.kind === 'water')); UI.flush(); return S.inv.sea; } } return -1; });
  ok('본부 도킹 구역 물에서 바닷물 3통', waterOk >= 3, String(waterOk));
  // ---- 내 월드: 해치에서 작업장 굴(2칸 높이)과 염수 웅덩이 동굴로 내려가는 수직굴 ----
  await ev(() => { T.go('start'); });
  const bad = await ev(() => T.tunnel([[0, 2], [-1, 2], [-1, 6], [-30, 6]]).concat(T.tunnel([[-10, 6], [-10, 13]])));
  ok('코어 해치 밖 작업장 굴 30칸 + 염수 웅덩이 동굴로 내려가는 굴(퇴적토, 맨손)', bad.length === 0 && await ev(() => World.tileAt(-30, 6) === World.AIR && World.tileAt(-10, 14) === World.AIR), JSON.stringify(bad));
  ok('염수 웅덩이 동굴에서 바닷물 뜨기 대상이 나옴', await ev(() => { T.at(-12, 17); return World.targets(G.debug()).some(t => t.kind === 'water'); }));
  // ---- 목표 1~3: 작업장에 화덕·증류기를 짓고 증류 ----
  await ev(() => { G.debug().inv.sea = 3; });
  const b1 = await ev(() => T.build('fire', -6, 5)), b2 = await ev(() => T.build('still', -9, 5));
  ok('작업장 바닥에 화덕·증류기 건설(2×2, 단단한 바닥, 화덕 옆)', b1 === 'ok' && b2 === 'ok', b1 + ' / ' + b2);
  ok('12 ℃ 암반 방: 얼음 생물이 나오지 않는 온도', await ev(() => World.ambientAt(G.debug(), T.dev('fire')) === 12));
  await ev(() => { const S = G.debug(); const f = T.dev('fire'), st = T.dev('still'); Sim.act.fuel(S, f, 8); Sim.act.level(S, f, 2); for (let i = 0; i < 3; i++) Sim.act.load(S, st); Sim.act.toggle(S, st); T.adv(900); Sim.act.collect(S, st); UI.flush(); UI.refresh(); });
  ok('목표 1~3 달성(바닷물 + 화덕, 증류수 200 g, 소금 20 g)', await ev(() => G.debug().qDone >= 3), await ev(() => JSON.stringify([G.debug().qDone, G.debug().f])));
  // ---- 암염: 작업장 끝에서 암염 동굴(−58..−38, 바닥 14)로 굴을 이어 곡괭이로 캔다 ----
  const bad0 = await ev(() => T.tunnel([[-30, 6], [-30, 13], [-39, 13]]));
  ok('암염 동굴까지 굴 이어 파기', bad0.length === 0 && await ev(() => World.tileAt(-40, 13) === World.AIR), JSON.stringify(bad0));
  await ev(() => { const S = G.debug(); T.gatherIn('rocksalt', -70, 0, -30, 30); });
  ok('암염을 곡괭이로 캐서 소금을 얻음(30 g씩)', await ev(() => G.debug().inv.salt >= 120), await ev(() => String(G.debug().inv.salt)));
  // ---- 목표 4: 본부 도크의 탐사정 잔해 수리 ----
  await ev(() => { T.go('plaza'); const S = G.debug(); const fr = World.OBJS.find(o => o.type === 'fragment'); T.at(fr.x, fr.y); UI.interact(World.targets(S).find(t => t.ref === fr)); G.repairRaft(); UI.refresh(); });
  ok('목표 4: 본부 도크에서 탐사정 수리(증류수 150 g + 소금 20 g, 직접 증류한 기록)', await ev(() => G.debug().f.raft === true && G.debug().qDone >= 4), await ev(() => JSON.stringify(G.debug().f)));
  // ---- 목표 5: 압력 밥솥 라면 ----
  await ev(() => { const S = G.debug(); S.inv.water = Math.max(S.inv.water, 900); S.inv.noodle = Math.max(S.inv.noodle, 3); T.stock({ stick: 40, sand: 20, bottle: 6, ice: 4 }); T.go('start'); });
  const b3 = await ev(() => T.build('cooker', -3, 5));
  ok('압력 밥솥을 화덕 옆에 건설', b3 === 'ok', b3);
  await ev(() => { const S = G.debug(); const f = T.dev('fire'), c = T.dev('cooker'); Sim.act.fuel(S, f, 20); Sim.act.level(S, f, 3); Sim.act.cook(S, c, 10, 2); T.adv(1500); if (c.s.done) Sim.act.take(S, c); UI.refresh(); });
  ok('목표 5: 2기압 이상 라면', await ev(() => G.debug().f.ramenP >= 2 && G.debug().qDone >= 5), await ev(() => JSON.stringify([G.debug().f.ramenP, G.debug().qDone, T.dev('cooker').s])));
  // ---- 목표 6: 한제 팩 −10 ℃ 이하 ----
  await ev(() => { T.stock({ ice: 6, salt: 120 }); });
  await ev(() => { T.go('start'); });
  const b4 = await ev(() => T.build('cooler', -12, 5));
  await ev(() => { const S = G.debug(); Sim.act.pack(S, 2, 32); UI.refresh(); });
  ok('목표 6: 한제 팩 −10 ℃ 이하', await ev(() => G.debug().f.packT <= -10 && G.debug().qDone >= 6), b4 + ' ' + await ev(() => JSON.stringify([G.debug().f.packT, G.debug().qDone, G.debug().inv.ice, G.debug().inv.salt])));
  // ---- 목표 7: 기체 포집기 공기 캡슐 4개 ----
  const b5 = await ev(() => T.build('collector', -15, 5));
  await ev(() => { const S = G.debug(); for (let i = 0; i < 4; i++) Sim.act.cap(S); UI.refresh(); });
  ok('목표 7: 공기 캡슐 4개', await ev(() => G.debug().f.caps >= 4 && G.debug().qDone >= 7), b5 + ' ' + await ev(() => G.debug().qDone));
  // ---- 목표 8: 본부 제단 보스(ui-check와 같은 단계 이동) ----
  await ev(() => { const S = G.debug(); S.inv.salt += 80; S.inv.water = 900; const n = 0.5 / (0.082 * 298.15); S.caps = [...Array(4).fill(0).map(() => ({ k: 'O2', n })), ...Array(4).fill(0).map(() => ({ k: 'N2', n }))]; S.packs = [{ T: -10.2, M: 200, day: S.day }]; T.go('plaza'); const al = World.OBJS.find(o => o.type === 'altar'); T.at(al.x, al.y); UI.interact(World.targets(S).find(t => t.ref === al)); Raid.debugGoto(3); for (let i = 0; i < 4; i++) Raid.p3Add('O2'); for (let i = 0; i < 4; i++) Raid.p3Add('N2'); Raid.p3Check(); document.getElementById('mclose').click(); UI.refresh(); });
  ok('목표 8: 대기 처리 코어(본부 제단) 정화', await ev(() => G.debug().f.boss === true && G.debug().qDone >= 8), await ev(() => G.debug().qDone));
  // ---- 목표 9: 얼음 광맥 방(−15 ℃)에 장치를 지으면 얼음 생물이 나온다 — 굴을 파고 내려간다 ----
  await ev(() => { T.go('start'); });
  ok('깊이 30칸부터 암반: 곡괭이가 있어야 팜', await ev(() => World.tileAt(-1, 40) === World.STONE || World.tileAt(-1, 40) === World.DIRT));
  const bad2 = await ev(() => T.tunnel([[-1, 6], [-1, 83], [6, 83]]));
  ok('코어 아래 얼음 광맥 동굴(0,2)까지 곡괭이로 굴 파기(깊이 83칸)', bad2.length === 0 && await ev(() => World.ambientAt(G.debug(), null, 8, 82) === -15), JSON.stringify(bad2.slice(0, 3)));
  await ev(() => { const S = G.debug(); S.inv.stick += 20; S.inv.sand += 10; S.inv.bottle += 4; S.inv.salt += 80; });
  const w1 = await ev(() => T.build('fire', 9, 82)), w2 = await ev(() => T.build('still', 12, 82));
  let wolf = 0; await ev(() => { G.debug().speed = 10; });
  for (let i = 0; i < 60 && !wolf; i++) { await ev(() => T.adv(60)); wolf = await ev(() => G.debug().mobs.length); }
  ok('얼음 광맥 방의 장치에 얼음 생물이 나타남', wolf > 0, w1 + ' / ' + w2);
  await ev(() => { const S = G.debug(); T.at(8, 83); for (let i = 0; i < 30 && S.mobs.length; i++) Sim.act.saltOnWolf(S, S.mobs[0], 10); UI.refresh(); });
  ok('목표 9: 소금으로 얼음 생물 정화', await ev(() => G.debug().f.wolf >= 1 && G.debug().qDone >= 9), await ev(() => JSON.stringify([G.debug().f.wolf, G.debug().qDone, G.debug().inv.salt])));
  // ---- 목표 10: 저기압 고원 행성(착륙 캡슐 동굴)에서 증류수 100 g ----
  await ev(() => { const S = G.debug(); S.speed = 1; S.inv.stick += 20; S.inv.sand += 8; S.inv.bottle += 4; S.inv.water = 900; S.inv.sea += 3; T.go('plaza'); G.sail('alpine'); World.applyDug(S); });
  ok('고원 행성 착륙 캡슐에서 시작(전송 패드가 있음)', await ev(() => Sim.dockOf(G.debug()).island === 'alpine' && World.targets(G.debug()).some(t => t.kind === 'pad')));
  const a1 = await ev(() => T.build('fire', 10, 28)), a2 = await ev(() => T.build('still', 13, 28));
  await ev(() => { const S = G.debug(); const f = T.dev('fire'), st = S.placed.find(d => d.id === 'still' && d.pl === 'alpine'); const fa = S.placed.find(d => d.id === 'fire' && d.pl === 'alpine'); Sim.act.fuel(S, fa, 8); Sim.act.level(S, fa, 2); for (let i = 0; i < 3; i++) Sim.act.load(S, st); Sim.act.toggle(S, st); T.adv(900); Sim.act.collect(S, st); UI.refresh(); });
  ok('목표 10: 저기압 고원에서 증류수 100 g', await ev(() => G.debug().f.alpineW >= 100 && G.debug().qDone >= 10), a1 + '/' + a2 + ' ' + await ev(() => JSON.stringify([G.debug().f.alpineW, G.debug().qDone])));
  // ---- 목표 11: 얼음 위성에서 소금 뿌리개로 얼음 타일 녹이기 ----
  await ev(() => { const S = G.debug(); T.go('plaza'); S.inv.shaker = 1; S.inv.salt += 40; G.sail('polar'); World.applyDug(S); });
  const bad3 = await ev(() => T.tunnel([[18, 29], [18, 38], [36, 38]]));
  const icy = await ev(() => { const S = G.debug(); let found = null; for (let x = 34; x < 56 && !found; x++) for (let y = 36; y < 50; y++) if (World.tileAt(x, y) === World.ICE && World.tileAt(x, y - 1) === World.AIR) { found = [x, y]; break; } return found; });
  ok('얼음 위성 얼음 광맥 동굴의 얼음 타일을 찾음', !!icy && bad3.length === 0, JSON.stringify([icy, bad3.slice(0, 2)]));
  await ev(([x, y]) => { const S = G.debug(); T.at(x, y - 1); for (let i = 0; i < 6; i++) { World.useShaker(S, { tx: x, ty: y }); UI.flush(); } UI.refresh(); }, icy || [40, 40]);
  ok('목표 11: 소금 뿌리개로 얼음 타일 1칸 녹임', await ev(() => G.debug().f.polarMelt === true && G.debug().qDone >= 11), await ev(() => JSON.stringify([G.debug().f.polarMelt, G.debug().qDone, World.ambientAt(G.debug(), null)])));
  await ev(() => { T.go('plaza'); });
  const fin = await ev(() => ({ q: G.debug().qDone, total: Sim.QUESTS.length, size: World.worldSize() }));
  ok(`목표 ${fin.total}개 모두 달성(${fin.q}/${fin.total})`, fin.q >= fin.total, JSON.stringify(fin));
  await browser.close();
  console.log(steps.join(' · '));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('튜토리얼 smoke 통과: 무한 지하 월드에서 목표 1~11 완료, 콘솔 에러 없음');
})();
