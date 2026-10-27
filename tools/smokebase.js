// 내 월드 시험(17-a′): 코어 캡슐 시작, 전송 패드(3초 대기·취소), 본부에 장치 금지, 월드 안 장치 건설, 같은 시드, 도구 단계, 천장, 저장 RLE 왕복, 저장 크기 상한, /bases 요약 쓰기.
// 가짜 서버(tools/fakenet.js)가 database.rules.json의 /bases와 같은 뜻을 코드로 흉내 낸다. 실제 규칙은 Firebase 콘솔 규칙 시뮬레이터로 따로 확인한다(MULTIPLAYER.md).
// 사용: node tools/smokebase.js   (Playwright가 있는 환경에서)
const path = require('path'), { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright를 찾을 수 없습니다.'); process.exit(2); }
const PORT = 9700 + Math.floor(Math.random() * 200), ROOT = path.resolve(__dirname, '..');
const { server, handle, initScript } = require('./fakenet');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const errors = [], checks = [];
  const ok = (name, cond, extra = '') => { checks.push(name + (cond ? ' ✔' : ' ✘')); if (!cond) errors.push(`점검 실패: ${name} ${extra}`); };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  async function open(uid, nick) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } }), page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`페이지 에러(${nick}): ` + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load|404/.test(m.text())) errors.push(`콘솔 에러(${nick}): ` + m.text()); });
    page.on('dialog', d => d.accept());
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    server.pages.set(page, new Set());
    await page.exposeFunction('__rpc', (m, a) => handle(page, uid, nick, m, a));
    await page.addInitScript(initScript, { uid, nick });
    await page.goto(`http://127.0.0.1:${PORT}/index.html?test`); await sleep(800);
    await page.click('#t-start'); await sleep(1200);
    if (await page.evaluate(() => !document.getElementById('modal').hidden)) await page.click('#mclose');
    return page;
  }
  const ev = (pg, f, a) => pg.evaluate(f, a);
  try {
    const A = await open('uA', '에이'), B = await open('uB', '비이');
    // 0. 회귀(2026-10-27): 플레이어 키(18 px)가 한 칸보다 커서 1칸 해치에 걸려 코어에서 못 나갔다 → 해치는 2칸 높이, 서 있는 자리에서 해치로 걸어 들어갈 수 있다
    ok('코어 해치는 2칸 높이: 서 있는 채로 지나갈 수 있음(해치 밖은 단단한 땅 → 파서 나간다)', await ev(A, () => { const S = G.debug(), y = 3 * 16 - 18, sx = S.px, sy = S.py; S.px = 0; S.py = y; const r = !World.collides(0, y) && !World.collides(5 * 16 + 3, y) && World.solidAt(-1, 1) && World.solidAt(-1, 2) && World.digCheck(S, -1, 2).ok; S.px = sx; S.py = sy; return r; }));
    // 1. 두 사람이 각자 코어 캡슐 안에서 시작한다(각자 자기 월드, 같은 시드)
    ok('A·B: 코어 (0, 0) 캡슐 안에서 시작', await ev(A, () => G.debug().base.x === 0 && World.tileAt(0, 0) === World.HULL) && await ev(B, () => G.debug().base.x === 0 && World.tileAt(0, 0) === World.HULL));
    const hash = (pg) => ev(pg, () => { let h = 0; for (const [cx, cy] of [[-1, 0], [1, 0], [0, 1], [-1, 1], [5, 3], [-40, 9], [3, 20], [-2, 11]]) { const c = World.getChunk(cx, cy); for (let i = 0; i < c.t.length; i++) h = (Math.imul(h, 31) + c.t[i]) | 0; h = (Math.imul(h, 31) + c.objs.length) | 0; } return h; });
    ok('같은 시드: 두 브라우저의 같은 덩어리가 칸·오브젝트까지 같음', (await hash(A)) === (await hash(B)));
    // 2. 전송 패드: 3초 대기, 창을 닫으면 취소
    await ev(A, () => { UI.openPad(); G.padGo('plaza'); }); await sleep(1500);
    await ev(A, () => document.getElementById('mclose').click()); await sleep(2500);
    ok('패드: 전송 중 창을 닫으면 취소(이동 없음)', await ev(A, () => Sim.dockOf(G.debug()).island === 'start' && document.getElementById('modal').hidden));
    await ev(A, () => { UI.openPad(); G.padGo('plaza'); }); await sleep(1200);
    ok('패드: 3초가 지나기 전에는 이동하지 않음', await ev(A, () => Sim.dockOf(G.debug()).island === 'start'));
    await sleep(2600);
    ok('패드: 3초 뒤 본부로 전송', await ev(A, () => Sim.dockOf(G.debug()).island === 'plaza'));
    // 3. 본부에는 장치를 지을 수 없다
    ok('본부에는 장치를 지을 수 없음', await ev(A, () => { const S = G.debug(); S.px = 30 * 16; S.py = 24 * 16 - 18; const g = World.ghostCheck(S, 'fire', 30, 22); return !g.ok && /본부/.test(g.msg); }));
    await ev(A, () => { Sim.act.teleport(G.debug(), 'start'); UI.flush(); }); await sleep(500);
    // 4. 월드 안 장치 건설: 코어 옆을 파서 방을 만들고(2칸 높이) 2×2 장치를 짓는다
    const room = await ev(A, () => { const S = G.debug(); S.inv.stick = 30; S.inv.sand = 30; S.inv.bottle = 5; for (let x = -12; x <= -1; x++) for (const y of [5, 6]) World.setTile(S, x, y, World.AIR); const f = (id, x, y) => { S.px = x * 16 + 3; S.py = (y + 2) * 16 - 18; return World.ghostCheck(S, id, x, y); }; return { fire: f('fire', -6, 5), over: f('still', -5, 5), floor: f('fire', -6, 4), far: (() => { S.px = 3 * 16; S.py = 3 * 16 - 18; return World.ghostCheck(S, 'fire', -11, 5); })(), solid: f('fire', -20, 5) }; });
    ok('방 안 빈 2×2칸 + 단단한 바닥에는 지을 수 있음', room.fire.ok === true, JSON.stringify(room.fire));
    ok('땅속(빈 칸 아님)·너무 먼 곳은 지을 수 없음', !room.solid.ok && /빈 공간/.test(room.solid.msg) && !room.far.ok && /멉니다/.test(room.far.msg), JSON.stringify([room.solid, room.far]));
    const built = await ev(A, () => { const S = G.debug(); S.px = -5 * 16; S.py = 7 * 16 - 18; Sim.act.placeFree(S, 'fire', -6, 5, 'start'); return S.placed.length; });
    const overlap = await ev(A, () => { const S = G.debug(); S.px = -5 * 16; S.py = 7 * 16 - 18; return World.ghostCheck(S, 'fire', -5, 5); });
    ok('장치는 칸 좌표와 행성(d.pl)으로 저장됨, 겹치는 칸에는 못 지음', built === 1 && !overlap.ok && /겹칩니다/.test(overlap.msg) && await ev(A, () => G.debug().placed[0].pl === 'start' && G.debug().placed[0].x === -6 && G.debug().placed[0].y === 5), JSON.stringify(overlap));
    // 5. 도구 단계와 천장
    const tiers = await ev(A, () => { const S = G.debug(); const out = {}; S.inv.pickaxe = 0; S.inv.ironpick = 0; S.px = 40 * 16 + 3; S.py = 61 * 16 - 18; S.vx = S.vy = 0;
      World.setTile(S, 38, 60, World.STONE); World.setTile(S, 39, 60, World.HARD); World.setTile(S, 41, 60, World.RARE); World.setTile(S, 42, 60, World.IRON); World.setTile(S, 40, 60, World.AIR);
      out.stone0 = World.digCheck(S, 38, 60).msg; out.iron0 = World.digCheck(S, 42, 60).msg;
      S.inv.pickaxe = 1; out.stone1 = World.digCheck(S, 38, 60).ok; out.iron1 = World.digCheck(S, 42, 60).ok; out.hard1 = World.digCheck(S, 39, 60).msg;
      S.inv.ironpick = 1; out.hard2 = World.digCheck(S, 39, 60).ok; out.rare = World.digCheck(S, 41, 60).msg;
      S.px = 3 * 16 + 3; S.py = -19 * 16; out.ceil = World.digCheck(S, 3, -21).msg; out.tier = World.toolTier(S); out.time = [World.DIG[World.DIRT].t, World.DIG[World.STONE].t, World.DIG[World.HARD].t]; return out; });
    ok('맨손: 암반·철 광맥은 곡괭이가 필요', /곡괭이/.test(tiers.stone0) && /곡괭이/.test(tiers.iron0), JSON.stringify(tiers));
    ok('곡괭이(단계 1): 암반·철 광맥은 파고 경암은 철 곡괭이가 필요', tiers.stone1 && tiers.iron1 && /철 곡괭이/.test(tiers.hard1), JSON.stringify(tiers));
    ok('철 곡괭이(단계 2)는 경암을 파고, 희귀 광물은 아직 못 팜', tiers.hard2 && /아직 이 단단함/.test(tiers.rare) && tiers.tier === 2, JSON.stringify(tiers));
    ok('천장 암반은 팔 수 없음, 파는 시간 흙 0.5·암반 2·경암 4초', /암반/.test(tiers.ceil) && tiers.time.join() === '0.5,2,4', JSON.stringify([tiers.ceil, tiers.time]));
    // 6. 저장 RLE 왕복: 파낸 칸이 S.world에 덩어리별로 압축되고, 새로 읽으면 같은 칸이 복원된다
    const rt = await ev(A, () => { const S = G.debug(); const before = []; for (let y = 5; y <= 6; y++) for (let x = -12; x <= -1; x++) before.push(World.tileAt(x, y)); const js = JSON.stringify(S.world), S2 = Sim.merge(JSON.parse(JSON.stringify(S))); World.applyDug(S2); const after = []; for (let y = 5; y <= 6; y++) for (let x = -12; x <= -1; x++) after.push(World.tileAt(x, y)); const same = before.join() === after.join(); World.applyDug(S); const dec = World.rleDecode(Object.values(S.world)[0], new Uint8Array(1024)); return { same, keys: Object.keys(S.world).length, js: js.length, ok: Object.values(S.world).every(v => /^\d+\*\d+(,\d+\*\d+)*$/.test(v)), dec: dec.length === 1024, enc: World.rleEncode(dec) === Object.values(S.world)[0] }; });
    ok('저장 RLE 왕복: 새로 읽어도 같은 칸, 인코딩·디코딩이 서로 역', rt.same && rt.ok && rt.dec && rt.enc && rt.keys > 0, JSON.stringify(rt));
    // 7. 저장 크기 상한: 잡음처럼 많이 바꿔 상한(200,000자)에 닿으면 더 파지 못한다
    const cap = await ev(A, () => { const S = G.debug(); let n = 0, s = 7; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; let reached = null;
      for (let cx = 20; cx < 400 && World.worldSize() < World.SAVE_CAP; cx++) for (let i = 0; i < 700 && World.worldSize() < World.SAVE_CAP; i++) { const x = cx * 32 + Math.floor(r() * 32), y = 200 + Math.floor(r() * 32); if (World.tileAt(x, y) !== World.AIR) World.setTile(S, x, y, World.AIR); n++; }
      S.inv.pickaxe = 1; World.setTile(S, 3, 60, World.DIRT); const px = 3 * 16 + 3; S.px = px; S.py = 59 * 16 - 18; const c = World.digCheck(S, 3, 60); return { size: World.worldSize(), cap: World.SAVE_CAP, msg: c.msg, ok: c.ok, json: JSON.stringify(S.world).length }; });
    ok('저장 크기 상한(200,000자)에서 파기 거절', cap.size >= cap.cap && cap.ok === false && /상한/.test(cap.msg), JSON.stringify(cap));
    // 8. /bases 공개 요약: 본인 id로만 쓰고, 코어 위치·칸 내용은 올리지 않는다
    await ev(A, () => UI.publishBase(true)); await sleep(300);
    const rec = server.bases.uA;
    ok('/bases/uA 요약(이름·색·팀원·단계·요약, 코어 위치 없음)', rec && /에이/.test(rec.name) && /^#[0-9a-f]{6}$/i.test(rec.color) && rec.members.uA === '에이' && rec.tech === 0 && /장치 1개/.test(rec.summary) && !('cx' in rec) && !('x' in rec) && !('world' in rec), JSON.stringify(rec));
    const deny = await ev(B, async () => { const out = {}; try { await Net.basePublish('uA', { name: '해킹', color: '#112233', members: {}, tech: 0, summary: 'x' }); out.other = 'allowed'; } catch (e) { out.other = 'denied'; }
      try { await Net.basePublish('uB', { name: '비이 월드', color: '#112233', members: { uB: '비이' }, tech: 9, summary: 'x' }); out.tech = 'allowed'; } catch (e) { out.tech = 'denied'; }
      try { await Net.basePublish('uB', { name: '비이 월드', color: '#112233', members: { uB: '비이' }, tech: 0, summary: 'y'.repeat(201) }); out.long = 'allowed'; } catch (e) { out.long = 'denied'; }
      try { await Net.basePublish('uB', { name: '비이 월드', color: '#112233', members: { uB: '비이' }, tech: 0, summary: '정상', cx: 3 }); out.pos = 'allowed'; } catch (e) { out.pos = 'denied'; }
      return out; });
    ok('남의 id·단계 범위 밖·200자 초과·코어 위치 필드는 서버가 거절', deny.other === 'denied' && deny.tech === 'denied' && deny.long === 'denied' && deny.pos === 'denied' && server.bases.uB.name === '비이 월드' && server.bases.uA.name !== '해킹', JSON.stringify([deny, server.bases.uB]));
    await ev(B, () => UI.publishBase(true)); await sleep(300);
    ok('방문 목록용 요약 2개(에이·비이)', Object.keys(server.bases).sort().join() === 'uA,uB' && (await ev(A, async () => (await Net.baseLoad(10)).length)) === 2);
  } finally { await browser.close(); srv.kill(); }
  console.log(checks.join(' · '));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('내 월드 시험 통과');
})();
