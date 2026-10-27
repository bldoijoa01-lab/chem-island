// 브라우저 UI 점검 15개: 시작 화면·세이브 호환·증류·밥솥·한제·캡슐·골렘·땅 파기·도구·서리 늑대·콘솔 에러.
// 사용: node tools/ui-check.js   (Playwright가 있는 환경에서. 2D 화면을 고칠 때 전후로 같은 결과여야 한다)
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const { chromium } = require('playwright');
let pass = 0, fail = 0; const chk = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  [' + x + ']' : '')); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1000, height: 600 } }); const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type()==='error' && !/ERR_|Failed to load/.test(m.text())) errs.push(m.text()); });
  await pg.route(/^https?:/, r => r.abort());
  const ev = (f, a) => pg.evaluate(f, a);
  const near = async t => { await ev(([t]) => { const s = G.debug(); s.px = t * 16; s.py = 24 * 16 - 18; s.vy = 0; }, [t]); await pg.waitForTimeout(350); };
  // 17-a′ 시험 방: 무한 지하 월드 안에 옛 좌표(x 30..110, 바닥 y 24)의 평평한 방을 판다(저장되는 칸 변경). 옛 시험 좌표를 그대로 쓰기 위한 것이다
  const arena = () => ev(() => { const s = G.debug(); s.raft.dock = 'start'; World.applyDug(s); for (let y = 14; y < 24; y++) for (let x = 30; x <= 110; x++) World.setTile(s, x, y, World.AIR); for (let x = 30; x <= 110; x++) World.setTile(s, x, 24, World.DIRT); });
  const E = async () => { await pg.keyboard.press('e'); await pg.waitForTimeout(200); };
  // 1) 새 세이브: 첫 접속 도움말
  await pg.goto(URL); await pg.waitForTimeout(700);
  chk('첫 접속: 메인화면 표시', await ev(() => !document.getElementById('title').hidden));
  await pg.click('#t-start'); await pg.waitForTimeout(300);
  chk('시작 후 도움말 표시', await ev(() => !document.getElementById('modal').hidden && document.getElementById('mtitle').textContent === '도움말'));
  await pg.click('#mclose');
  chk('새 게임: 코어 캡슐 안에서 시작(코어 (0,0), 본부 패드로 전송 가능)', await ev(() => { const s = G.debug(); return s.base && s.base.x === 0 && s.base.y === 0 && s.ver === 5 && World.targets(s).some(t => t.kind === 'pad'); }));
  // 2) 구 세이브 호환(새 필드 없는 세이브)
  await ev(() => { const s = JSON.parse(JSON.stringify(G.debug())); delete s.dug; delete s.melt; delete s.stoneGift; delete s.mobs; for (const k of ['dirt','stone','pickaxe','shaker','thermo']) delete s.inv[k]; delete s.f.wolf; localStorage.setItem('chemisle_side_v1', JSON.stringify(s)); });
  await pg.reload(); await pg.waitForTimeout(700); await pg.click('#t-start'); await pg.waitForTimeout(300); await pg.click('#mclose').catch(() => {});
  chk('구 세이브(새 필드 없음): 코어·월드 기본값으로 이어짐', await ev(() => { const s = G.debug(); return s.base && s.base.x === 0 && s.ver === 5 && s.world && typeof s.world === 'object'; }));
  chk('구 세이브 로드(새 필드 기본값)', await ev(() => { const s = G.debug(); return s.dug && s.melt && s.stoneGift === false && s.inv.pickaxe === 0 && Array.isArray(s.mobs) && s.f.wolf === 0; }));
  // 3) 증류 목표 1~3
  await arena();
  await ev(() => { const s = G.debug(); s.inv.sea = 3; s.inv.stick = 12; s.placed = [{ id: 'fire', x: 47, y: 22, s: { level: 0, fuel: 0 } }, { id: 'still', x: 50, y: 22, s: { w: 0, ns: 0, outW: 0, outS: 0, run: false, T: 25 } }]; s.f.sea = s.f.fire = true; s.min = 360; });
  await near(48.5); await E(); await ev(() => { act('fuel', 5); act('level', 2); document.getElementById('mclose').click(); });
  await near(51); await E(); await ev(() => { act('load'); act('load'); act('load'); act('toggle'); G.debug().speed = 10; });
  for (let i = 0; i < 60; i++) { await pg.waitForTimeout(400); if (!(await ev(() => G.debug().placed[1].s.run))) break; }
  await ev(() => { G.debug().speed = 1; act('collect'); document.getElementById('mclose').click(); });
  const r3 = await ev(() => [G.debug().qDone, Math.round(G.debug().f.dW), Math.round(G.debug().f.dS)]);
  await ev(() => { G.debug().f.raft = true; G.debug().inv.stick = 40; });
  chk('증류 → 목표 3 달성(증류수≥200, 소금≥20)', r3[0] >= 3 && r3[1] >= 200 && r3[2] >= 20, r3.join('/'));
  // 4) 밥솥·냉각·포집기
  await ev(() => { const s = G.debug(); s.inv = Object.assign(s.inv, { salt: 90, water: 900, noodle: 3, stick: 20, sand: 12, ice: 6, bottle: 2, syringe: 1 }); s.placed = [{ id: 'fire', x: 47, y: 22, s: { level: 3, fuel: 20 } }, { id: 'cooker', x: 50, y: 22, s: { run: false, prog: 0, valve: 2, saltG: 0, water: 300, T: 25 } }, { id: 'cooler', x: 56, y: 22, s: {} }, { id: 'collector', x: 59, y: 22, s: {} }]; });
  await near(51); await E(); await ev(() => { document.getElementById('c-salt').value = 10; document.getElementById('c-valve').value = 2; act('cook'); G.debug().speed = 3; });
  for (let i = 0; i < 40; i++) { await pg.waitForTimeout(300); if (await ev(() => G.debug().placed[1].s.done)) break; }
  await ev(() => { G.debug().speed = 1; act('take'); document.getElementById('mclose').click(); });
  chk('밥솥 2 atm 라면(목표 4)', await ev(() => G.debug().f.ramenP >= 2 && G.debug().qDone >= 5));
  await near(57); await E(); await ev(() => { document.getElementById('k-ice').value = 2; document.getElementById('k-salt').value = 32; act('pack'); document.getElementById('mclose').click(); });
  chk('한제 −10 ℃ 이하(목표 5)', await ev(() => G.debug().f.packT <= -10 && G.debug().qDone >= 6), await ev(() => G.debug().f.packT.toFixed(2)));
  await near(60); await E(); await ev(() => { for (let i = 0; i < 4; i++) act('cap'); document.getElementById('mclose').click(); });
  chk('공기 캡슐 4개(목표 6)', await ev(() => G.debug().f.caps >= 4 && G.debug().qDone >= 7));
  // 5) 골렘 1~3
  await ev(() => { const s = G.debug(); s.inv.salt = 80; s.inv.water = 900; s.min = 600; s.packs = [{ T: -10.2, M: 200, day: s.day }]; const n = 0.5 / (0.082 * 298.15);
    s.caps = [...Array(4).fill(0).map(() => ({ k: 'O2', n })), ...Array(4).fill(0).map(() => ({ k: 'N2', n }))]; s.raft.dock = 'plaza'; World.applyDug(s); s.px = 34 * 16 + 8; s.py = 24 * 16 - 18; s.vy = 0; });
  await pg.waitForTimeout(400); await E();
  await ev(() => { document.getElementById('r-salt').value = 43; Raid.p1Update(); Raid.p1Add(); });
  chk('골렘 P1 소금 43 g → 2단계', await ev(() => /2단계/.test(document.getElementById('mtitle').textContent)));
  await ev(() => Raid.debugGoto(3));
  await ev(() => { for (let i = 0; i < 4; i++) Raid.p3Add('O2'); for (let i = 0; i < 4; i++) Raid.p3Add('N2'); Raid.p3Check(); });
  chk('골렘 P3 O₂4+N₂4 → 정화', await ev(() => G.debug().f.boss === true));
  await pg.click('#mclose');
  // 6) 파기·블록·도구
  await ev(() => { const s = G.debug(); s.raft.dock = 'start'; World.applyDug(s); s.px = 48 * 16; s.py = 24 * 16 - 18; s.vy = 0; s.placed = []; s.min = 180; s.inv.salt = 100; s.inv.shaker = 1; s.inv.thermo = 1; s.inv.stone = 2; s.inv.stick = 5; }); await arena(); await pg.waitForTimeout(400);
  const cam = await ev(() => { const s = G.debug(); return [Math.round(s.px + 5 - 250), Math.round(s.py + 9 - 150)]; });
  const sc = (tx, ty) => [(tx * 16 + 8 - cam[0]) * 2, (ty * 16 + 8 - cam[1]) * 2];
  await pg.mouse.move(...sc(49, 24)); await pg.mouse.down(); await pg.waitForTimeout(150); await pg.mouse.up();
  chk('파기: 짧게 누르면 안 파짐', await ev(() => G.debug().inv.dirt === 0));
  await pg.mouse.move(...sc(49, 24)); await pg.mouse.down(); await pg.waitForTimeout(800); await pg.mouse.up();
  chk('파기: 0.5초 이상 누르면 흙 +1, 저장은 덩어리별 RLE', await ev(() => { const s = G.debug(); return s.inv.dirt === 1 && Object.keys(s.world).length > 0 && Object.values(s.world).every(v => /^\d+\*\d+(,\d+\*\d+)*$/.test(v)); }));
  await ev(() => { G.craft('pickaxe'); document.getElementById('mclose').click(); });
  chk('곡괭이 제작', await ev(() => G.debug().inv.pickaxe === 1 && G.debug().inv.stone === 0));
  // 소금 뿌리개 → 얼음 광맥 방(구역 온도 −15 ℃, 시작 특징 덩어리 (0, 2))의 얼음 타일 (14, 84)
  await ev(() => { const s = G.debug(); s.raft.dock = 'start'; World.applyDug(s); s.px = 14 * 16; s.py = 84 * 16 - 18; s.vy = 0; s.inv.salt = 100; }); await pg.waitForTimeout(500);
  chk('얼음 광맥 방은 −15 ℃, 얼음 타일이 있음', await ev(() => World.ambientAt(G.debug(), null) === -15 && World.tileAt(14, 84) === World.ICE), await ev(() => World.ambientAt(G.debug(), null) + ' / ' + World.tileAt(14, 84)));
  const c2 = await ev(() => { const s = G.debug(); return [Math.round(s.px + 5 - 250), Math.round(s.py + 9 - 150)]; });
  const i = await ev(() => Object.entries(G.debug().inv).filter(([, v]) => v >= 1).map(([k]) => k).indexOf('shaker')); await pg.mouse.click((4 + i * 17 + 8) * 2, 24);
  for (let k = 0; k < 3; k++) { await pg.mouse.click((14 * 16 + 8 - c2[0]) * 2, (84 * 16 + 8 - c2[1]) * 2); await pg.waitForTimeout(80); }
  chk('소금 뿌리개: 얼음 타일 3번에 물로', await ev(() => World.tileAt(14, 84) === World.WATER), await ev(() => Math.round(G.debug().inv.salt * 10) / 10 + ' g left'));
  // 7) 얼음 생물(그 장치 자리 온도가 0 ℃ 미만일 때 출현)
  await ev(() => { const s = G.debug(); s.speed = 10; s.f.raft = true; s.placed = [{ id: 'fire', x: 8, y: 82, s: { level: 0, fuel: 0 } }, { id: 'still', x: 11, y: 82, s: { w: 0, ns: 0, outW: 0, outS: 0, run: false, T: 25 } }]; s.px = 10 * 16; s.py = 84 * 16 - 18; s.vy = 0; s.mobs = []; });
  let m = null; for (let k = 0; k < 40 && !m; k++) { await pg.waitForTimeout(300); m = await ev(() => G.debug().mobs[0] || null); }
  await ev(() => { G.debug().speed = 1; });
  chk('얼음 광맥 방(−15 ℃)의 장치에 얼음 생물 출현', !!m, m ? m.M + ' g' : '');
  await ev(() => { const s = G.debug(); s.mobs = []; s.placed = [{ id: 'fire', x: 60, y: 22, s: { level: 0, fuel: 0 } }]; s.speed = 10; });
  await arena(); await ev(() => { const s = G.debug(); s.placed = [{ id: 'fire', x: 60, y: 22, s: { level: 0, fuel: 0 } }]; s.px = 59 * 16; s.py = 24 * 16 - 18; s.vy = 0; });
  await pg.waitForTimeout(2500); const warm = await ev(() => G.debug().mobs.length);
  await ev(() => { G.debug().speed = 1; });
  chk('12 ℃ 암반 방의 장치에는 얼음 생물이 안 나옴', warm === 0, 'mobs=' + warm);
  // 8) 메뉴·섬 모달이 열린다(공용 UI를 옮겨도 같아야 한다)
  const title = () => ev(() => (document.getElementById('modal').hidden ? '' : document.getElementById('mtitle').textContent));
  const closeM = () => ev(() => { if (!document.getElementById('modal').hidden) document.getElementById('mclose').click(); });
  await closeM(); await ev(() => { const s = G.debug(); s.raft.dock = 'plaza'; World.applyDug(s); s.f.raft = false; s.placed = []; s.mobs = []; s.px = 20 * 16; s.py = 24 * 16 - 18; s.vy = 0; s.min = 600; }); await pg.waitForTimeout(1500);
  const names = []; const vw = await ev(() => Math.ceil(window.innerWidth / 2));
  for (let k = 0; k < 5; k++) { await pg.mouse.click((vw - 4 - (5 - k) * 17 + 1 + 8) * 2, (22 + 8) * 2); await pg.waitForTimeout(150); names.push(await title()); await closeM(); }
  chk('메뉴 5개(건설·제작·연구 노트·기록·저장)가 열림', ['건설', '제작', '연구 노트', '기록', '저장/계정'].every((n, k) => names[k].includes(n)), names.join(' / '));
  await ev(() => { const s = G.debug(); s.px = 20 * 16; s.py = 24 * 16 - 18; s.vy = 0; }); await pg.waitForTimeout(500); await E();
  chk('탐사정 잔해 모달(본부 도킹 구역)', (await title()).includes('탐사정 잔해'), await title()); await closeM();
  await ev(() => { const s = G.debug(); s.px = 23 * 16; s.py = 24 * 16 - 18; s.vy = 0; }); await pg.waitForTimeout(500); await E();
  chk('궤도 관문 모달', (await title()).includes('궤도 관문'), await title()); await closeM();
  await ev(() => { const s = G.debug(); s.f.raft = true; s.raft.dock = 'plaza'; World.applyDug(s); s.px = 31 * 16; s.py = 24 * 16 - 18; s.vy = 0; }); await pg.waitForTimeout(500); await E();
  chk('표류 통신 게시판 모달', (await title()).includes('표류 통신'), await title()); await closeM();
  // 늑대: 짝수 번호는 장치 왼쪽에 서므로 장치보다 늑대가 가장 가깝게 서 본다(얼음 광맥 방)
  await ev(() => { const s = G.debug(); s.raft.dock = 'start'; World.applyDug(s); s.placed = [{ id: 'fire', x: 14, y: 82, s: { level: 0, fuel: 0 } }]; s.mobs = [{ id: 2, k: 'wolf', M: 100, M0: 100, dx: 14, dy: 82, att: 0 }]; s.mobId = 2; s.px = 14 * 16 - 12 - 4; s.py = 84 * 16 - 18; s.vy = 0; }); await pg.waitForTimeout(1500); await E();
  const tw = await title(); chk('얼음 생물 모달이 열림', tw.includes('얼음 생물'), tw); await closeM();
  await b.close();
  chk('콘솔 에러 없음', errs.length === 0, errs.join(' | '));
  console.log(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(fail ? 1 : 0);
})();
