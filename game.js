// 화학 우주 이야기 — 횡스크롤(단면 2D) 픽셀 월드, 시간, 장치 로직, UI
// 보스는 raid.js, 연구 노트는 notes.js, 그림은 sprites.js, 화학 식은 chem.js(Chem)만 사용한다.
(() => {
'use strict';
const C = Chem, Art = window.Art;
let VW = 384, VH = 224, K = 3;   // 창 크기에 맞춰 fit()이 정한다
const S = Store.S;               // 상태는 store.js, 지형·땅 규칙은 world.js, 계산은 sim.js (2D와 3D가 같이 쓴다)
const { T, dim, PW, PH, REACH, ITEM, AIR, GRASS, DIRT, STONE, SAND, SNOWTOP, ICE, WATER, RAFT, HULL, HATCH, GY, OBJS, NODE, tileAt, solidAt, isOpen, BLOCK, TOOL, dig } = World;
const { FIRE_T, FIRE_BURN, FIRE_NAME, DEV, RECIPES, QUESTS, VALVE_NAME, SEA_BUCKET } = Sim;
const save = Store.save;
// 공용 UI(ui.js): 말풍선·모달·패널·메뉴·접속. 화면마다 다른 것은 맨 아래 UI.init(host)로 넘긴다
const { $, fmt, pix, ic, say, flush, advance, refresh, set, setw, openModal, closeModal, interact, openBuild, openCraft, openLog, openHelp, openSave, boot, loadPlaza, api, capText, heatOf, has, pAtm, HELP_KEY } = UI;
const airTemp = () => Sim.airTemp(S);   // ℃: chem.js의 시각별 기온 + 행성별 보정(sim.js ENV)
const targets = () => World.targets(S);
const { wolfPos } = World;
const applyDug = () => World.applyDug(S);
applyDug();
// 궤도 이동 연출(16-c, 보이기만): 도착한 행성 맵을 불러온 직후 검은 화면에서 별 줄무늬가 퍼지며 밝아지고 행성 이름이 뜬다
let lastPlanet = Sim.dockOf(S).island, warp = null;
const applyWorld = () => { applyDug(); const h = Sim.dockOf(S).island; if (h !== lastPlanet) { lastPlanet = h; warp = { at: performance.now(), name: Sim.ISLANDS[h].name }; } };

// ---------- 땅 파기 · 블록 놓기 · 도구 (규칙은 world.js, 여기는 마우스 → 칸/대상 변환) ----------
const mouseTile = () => [Math.floor((cam.x + mouse.x) / T), Math.floor((cam.y + mouse.y) / T)];
const digCheck = (tx, ty) => World.digCheck(S, tx, ty);
function stepDig(dt) { const [tx, ty] = mouseTile(); World.stepDig(S, dt, tx, ty, !$('modal').hidden || !!mode); flush(); }
function placeBlock() { const [tx, ty] = mouseTile(); if (World.placeBlock(S, mode.slice(6), tx, ty)) mode = null; flush(); }
function pickAt(kind) { const wx = cam.x + mouse.x, wy = cam.y + mouse.y; return World.targets(S).find(o => o.kind === kind && Math.hypot(o.x - wx, o.y - wy) < 26); }
function useThermo() { const t = pickAt('dev'), [tx, ty] = mouseTile(); World.useThermo(S, t ? { dev: t.ref } : { tx, ty }); flush(); }
function useShaker() { const w = pickAt('wolf'), [tx, ty] = mouseTile(); World.useShaker(S, w ? { wolf: w.ref } : { tx, ty }); flush(); }

// ---------- 허브: 도킹한 다른 사람의 탐사정 그리기(데이터는 UI.loadPlaza가 읽어 온다) ----------
function drawPlazaRafts(t) {
  ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
  UI.plazaRafts().slice(0, 3).forEach((r, i) => {
    const x0 = 47 + i * 13,   // 허브 도킹 구역(옛 월드 x 153 − 오프셋 106)
       cells = Math.max(2, Math.min(10, r.cells | 0));
    for (let c = 0; c < cells; c++) ctx.drawImage(Art.tiles.raft[c % 3], (x0 + c) * T - cam.x, Sim.RAFT.ROW * T - cam.y);
    for (const d of (r.devs || [])) if (d && Art.dev[d.id] && d.u >= 0 && d.u + 2 <= cells) {
      const sx = (x0 + d.u) * T - cam.x, sy = Sim.RAFT.DEV_Y * T - cam.y;
      blit(Art.dev[d.id], sx, sy);
      if (d.broken) { ctx.fillStyle = '#ff5a4a'; ctx.fillRect(sx + 12, sy + 12, 8, 2); ctx.fillRect(sx + 15, sy + 9, 2, 8); }
    }
    const nx = Math.round((x0 + cells / 2) * T - cam.x), ny = Sim.RAFT.DEV_Y * T - cam.y - 6;
    ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.strokeText(pix(r.nick || ''), nx, ny); ctx.fillStyle = '#9fe8ff'; ctx.fillText(pix(r.nick || ''), nx, ny);
  });
  ctx.textAlign = 'left';
}

// ---------- 건설 (평평한 땅에 2x2 장치) ----------
let mode = null;   // 'build:<id>' | 'demolish' | 'block:<item>' | 'tool:<id>' | 'core'(기지 코어 설치, 17-a)
// 기지 코어 미리보기: 가로는 걷고 있는 칸을 따라가고, 깊이(지표 기준 0..50칸 아래)는 ↑ ↓ 키·마우스 휠로 정한다
let coreDepth = 0;
function coreGhost() {
  const cx = Math.floor((S.px + PW / 2) / T), x = cx - 2, gy = GY[Math.max(0, Math.min(dim.W - 1, cx))], y = gy - World.CORE.CH + coreDepth;
  return Object.assign({ x, y }, World.coreCheck(S, x, y, UI.otherBases()));
}
function enterCore() { if (S.base || Sim.dockOf(S).island !== 'start') return; mode = 'core'; coreDepth = 0; say('기지 코어를 놓을 자리를 고르세요: A/D로 걷고 ↑↓로 깊이를 정한 뒤 클릭(Enter). ESC로 잠시 멈춰요. (B)'); }
const mouse = { x: 0, y: 0 };
const cam = { x: 0, y: 0 };
const ghostCheck = id => World.ghostCheck(S, id, Math.floor((cam.x + mouse.x) / T - 1 + 0.5));
function placeAtMouse() {
  if (mode === 'core') { const g = coreGhost(); return UI.installBase(g.x, g.y).then(ok => { if (ok && mode === 'core') mode = null; }); }
  if (mode.startsWith('block:')) return placeBlock();
  if (mode.startsWith('tool:')) return mode === 'tool:salt' ? useShaker() : useThermo();
  if (mode === 'demolish') {
    const wx = cam.x + mouse.x, wy = cam.y + mouse.y;
    const d = World.deviceAt(S, wx, wy);
    if (!d) return say('철거할 장치를 클릭하세요.');
    Sim.act.demolish(S, d); flush();
    mode = null; return refresh();
  }
  const id = mode.slice(6), g = ghostCheck(id);
  if (!g.ok) return say(g.msg);
  if (Sim.act.build(S, id, g.u)) mode = null;
  flush(); refresh();
}

// ---------- 입력 ----------
const keys = { left: false, right: false, jump: false };
function clearKeys() { keys.left = keys.right = keys.jump = false; }
const KEYMAP = { a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', w: 'jump', arrowup: 'jump', ' ': 'jump' };
window.addEventListener('keydown', e => {
  if (!$('modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  if (!$('title').hidden) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startGame(); } return; }
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (KEYMAP[k] && !(mode === 'core' && (k === 'arrowup' || k === 'arrowdown'))) { keys[KEYMAP[k]] = true; e.preventDefault(); }
  else if (mode === 'core' && (k === 'arrowup' || k === 'arrowdown')) { coreDepth = Math.max(0, Math.min(World.CORE.DEPTH, coreDepth + (k === 'arrowdown' ? 1 : -1))); e.preventDefault(); }
  else if (mode === 'core' && k === 'enter') placeAtMouse();
  else if (k === 'e') interact(targets()[0]);
  else if (k === 'b') { if (mode === 'core') { mode = null; say('설치 모드를 멈췄습니다. (B로 다시)'); } else UI.openBase(); }
  else if (k === 'escape' && mode) { mode = null; say(S.base ? '취소' : '설치 모드를 멈췄습니다. (B로 다시)'); }
});
window.addEventListener('keyup', e => { const k = KEYMAP[e.key.toLowerCase()]; if (k) keys[k] = false; });
const cv = $('cv'), ctx = cv.getContext('2d');
function canvasPos(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * VW, y: (e.clientY - r.top) / r.height * VH }; }
cv.addEventListener('mousemove', e => Object.assign(mouse, canvasPos(e)));
cv.addEventListener('wheel', e => { if (mode === 'core') { coreDepth = Math.max(0, Math.min(World.CORE.DEPTH, coreDepth + (e.deltaY > 0 ? 1 : -1))); e.preventDefault(); } }, { passive: false });
// 마우스를 꾹 누르면 그 자리의 땅을 판다(클릭할 대상·HUD·건설 모드가 아닐 때)
cv.addEventListener('pointerdown', e => {
  Object.assign(mouse, canvasPos(e));
  if (e.button > 0 || !$('modal').hidden || mode) return;
  if (HUD.hits.some(h => mouse.x >= h.x && mouse.x < h.x + h.w && mouse.y >= h.y && mouse.y < h.y + h.h) || mouse.y < HUD.bottom) return;
  const wx = cam.x + mouse.x, wy = cam.y + mouse.y;
  if (targets().some(o => Math.hypot(o.x - wx, o.y - wy) < 26)) return;
  dig.on = true; dig.p = 0; dig.tx = dig.ty = -1;
});
cv.addEventListener('pointermove', e => { Object.assign(mouse, canvasPos(e)); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) cv.addEventListener(ev, () => { dig.on = false; dig.p = 0; });
cv.addEventListener('click', e => {
  Object.assign(mouse, canvasPos(e));
  if (!$('modal').hidden) return;
  const hit = HUD.hits.find(h => mouse.x >= h.x && mouse.x < h.x + h.w && mouse.y >= h.y && mouse.y < h.y + h.h);
  if (hit) return hit.fn();
  if (mode) return placeAtMouse();
  const wx = cam.x + mouse.x, wy = cam.y + mouse.y;
  const t = targets().filter(o => Math.hypot(o.x - wx, o.y - wy) < 26).sort((a, b) => Math.hypot(a.x - wx, a.y - wy) - Math.hypot(b.x - wx, b.y - wy))[0];
  if (t) interact(t);
});
// 화면 터치 패드
document.querySelectorAll('#pad button').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); if (k === 'e') interact(targets()[0]); else keys[k] = true; };
  const off = e => { e.preventDefault(); if (k !== 'e') keys[k] = false; };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});

// ---------- 물리 ----------
const pst = { onGround: false, bound: false };   // 이동 상태(world.js stepPlayer가 갱신)
let seaHintAt = 0;
function hintSea() { const n = performance.now(); if (n - seaHintAt > 5000) { seaHintAt = n; say('바다가 거칠어서 헤엄쳐 건널 수 없어요. 탐사정으로 궤도 이동하세요 (궤도 이동 단말).'); } }
const collides = World.collides;
function physics(dt) {
  const modalOpen = !$('modal').hidden;
  const ax = modalOpen ? 0 : (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  World.stepPlayer(S, dt, { ax, jump: !modalOpen && keys.jump }, pst);
  if (pst.bound) hintSea();
}

// ---------- 파티클·환경 ----------
const parts = [];
function puff(x, y, col, n) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 14, life: 0.6 + Math.random() * 0.5, col, s: 2 }); }
function burst(d) { puff(d.x * T + 16, d.y * T + 8, '#ff7a3d', 14); puff(d.x * T + 16, d.y * T + 8, '#4a4f56', 10); }
const birds = Array.from({ length: 6 }, (_, i) => ({ x: i * 210 + Math.random() * 90, y: 24 * T - 150 - Math.random() * 70, vx: 16 + Math.random() * 12, ph: Math.random() * 6 }));
const flies = Array.from({ length: 22 }, (_, i) => ({ x: 30 * T + i * 52 + Math.random() * 30, y: 24 * T - 14 - Math.random() * 44, ph: Math.random() * 6 }));
function stepParts(dt) {
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
  if (parts.length > 200) parts.splice(0, 50);
  for (const b of birds) { b.x += b.vx * dt; b.ph += dt * 9; if (b.x > cam.x + VW + 60) b.x = cam.x - 40; else if (b.x < cam.x - 120) b.x = cam.x + VW * Math.random(); }   // 800칸 맵: 화면 둘레에서 되돌린다
}

// ---------- 그리기 ----------
const nightOf = h => h >= 21 || h < 5 ? 1 : h >= 18 ? (h - 18) / 3 : h < 7 ? (7 - h) / 2 : 0;
let stars = [];
const makeStars = () => { stars = Array.from({ length: Math.max(30, Math.floor(VW * VH / 1500)) }, (_, i) => [((i * 97.31) % 1000) / 1000, ((i * 53.77) % 1000) / 1000]); };
let last = performance.now(), tt = 0;
// ---------- 다른 플레이어(presence) ----------
const MAPID = 'main';
const posPacket = () => ({ x: Math.round(S.px * 10) / 10, y: Math.round(S.py * 10) / 10, vx: Math.round(S.vx), face: S.face < 0 ? -1 : 1, air: !pst.onGround });
let lastPos = '', lastPosAt = 0;
const ghosts = {};   // uid -> { x, y, face, vx, air, nick, seen } (보간되는 화면 위치)
function netStep(dt, now) {
  if (!(window.Net && Net.user) || Store.paused) return;
  if (now - lastPosAt >= 100) {           // 10 Hz, 변화가 없으면 생략(5초마다 생존 신호)
    const p = posPacket(), k = JSON.stringify(p);
    if (k !== lastPos || now - lastPosAt > 5000) { lastPos = k; lastPosAt = now; Net.sendPos(p); }
  }
  const a = 1 - Math.exp(-dt * 14);
  for (const id in Net.peers) {
    const p = Net.peers[id], g = ghosts[id] || (ghosts[id] = { x: p.x, y: p.y });
    g.x += (p.x - g.x) * a; g.y += (p.y - g.y) * a;
    g.nick = p.nick; g.face = p.face; g.vx = p.vx; g.air = p.air;
  }
  for (const id in ghosts) if (!Net.peers[id]) delete ghosts[id];
}
function drawPeers(t) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = '8px sans-serif';
  for (const id in ghosts) {
    const g = ghosts[id], sx = g.x - cam.x, sy = g.y - cam.y;
    if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
    const fr = g.air ? 3 : Math.abs(g.vx) > 1 ? 1 + (Math.floor(t * 8) % 2) : 0, px = sx - 3, py = sy + PH - 22;
    ctx.save(); ctx.globalAlpha = 0.9;
    if (g.face < 0) { ctx.translate(Math.round(px) + 16, 0); ctx.scale(-1, 1); blit(Art.playerFrames[fr], 0, py); } else blit(Art.playerFrames[fr], px, py);
    ctx.restore();
    const nx = Math.round(sx + PW / 2), ny = Math.round(py - 2);
    ctx.lineWidth = 2; ctx.strokeStyle = '#000000'; ctx.strokeText(g.nick || '', nx, ny);
    ctx.fillStyle = '#9fe8ff'; ctx.fillText(g.nick || '', nx, ny);
  }
  ctx.textAlign = 'left';
}
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; tt += dt;   // 첫 프레임은 rAF 시각이 last보다 이를 수 있어 dt 음수 방지
  physics(dt); stepDig(dt); stepParts(dt); netStep(dt, now);
  draw(tt);
  requestAnimationFrame(frame);
}
// 행성별 배경·색 표현(보이기만, 가정(임의값)): atm = 대기 두께(0이면 진공: 우주색 하늘·구름 없음), tint = 행성 색조 RGB, disc = 하늘의 먼 행성 [종류, 반지름, 가로 위치(화면 비율), 세로 위치, ], water = 물 색 3단계, hub = 정거장 바닥판
// shared/theme.js의 PLANET(fp·td용)과 같은 값을 쓰되 이 화면(옆면 2D)에 맞게 따로 둔다
const PLANET_VIEW = {
  start: { atm: 1, tint: null, disc: ['gas', 22, 0.78, 0.2, 0.9], discA: 0.9, water: ['#3f9be0', '#2c7cc0', '#1f66a4'], nebula: null },
  plaza: { atm: 0, tint: null, hub: true, disc: ['ocean', 48, 0.3, 0.72, 1], discA: 1, water: ['#0b1432', '#070d24', '#04081a'], nebula: [[0.65, 0.3, 120, 26, 'rgba(120,80,200,.10)'], [0.2, 0.55, 150, 20, 'rgba(60,160,200,.08)']] },
  alpine: { atm: 0.6, tint: [122, 95, 176], disc: ['violet', 16, 0.2, 0.18, 0.9], discA: 0.9, water: ['#5a4b92', '#493c7a', '#3a2f64'], nebula: [[0.7, 0.2, 90, 14, 'rgba(160,120,220,.10)']] },
  polar: { atm: 0.45, tint: [159, 208, 232], disc: ['gas', 52, 0.74, 0.3, 0.95], discA: 0.95, water: ['#9fd5ea', '#86c3dc', '#6eaec8'], nebula: null },
};
const blit = (img, x, y) => { const p = img.pad || 0; ctx.drawImage(img, Math.round(x - p), Math.round(y - p)); };
const hash = (x, y) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
function draw(t) {
  const hour = S.min / 60, night = nightOf(hour);
  cam.x = Math.max(0, Math.min(dim.W * T - VW, Math.round(S.px + PW / 2 - VW / 2)));
  cam.y = Math.max(0, Math.min(dim.H * T - VH, Math.round(S.py + PH / 2 - VH * 0.6)));
  const cg = mode === 'core' ? coreGhost() : null;
  if (cg) cam.y = Math.max(0, Math.min(dim.H * T - VH, Math.round((cg.y + 2) * T - VH * 0.5)));   // 코어 설치 모드: 카메라가 미리보기를 따라간다
  // 행성 배경(16-c, 보이기만): 대기 두께 atm이 얇을수록 우주색에 가깝고 별이 낮에도 보인다. 시각별 하늘색(Art.sky)은 그대로 쓰고 우주색·행성 색조를 섞는다
  const here = Sim.dockOf(S).island, V = PLANET_VIEW[here], space = night > 0 || V.atm < 1;
  const bands = Art.sky(hour, 18).map(s => { const c = s.match(/\d+/g).map(Number), m = (a, b2, k) => a + (b2 - a) * k, sp = [3, 6, 16]; let r = [m(sp[0], c[0], V.atm), m(sp[1], c[1], V.atm), m(sp[2], c[2], V.atm)]; if (V.tint) r = r.map((x, i) => m(x, V.tint[i], 0.3 * V.atm)); return `rgb(${r.map(Math.round)})`; });
  for (let i = 0; i < bands.length; i++) { ctx.fillStyle = bands[i]; ctx.fillRect(0, Math.floor(i * VH / bands.length), VW, Math.ceil(VH / bands.length) + 1); }
  const starA = Math.max(night, 1 - V.atm * 0.9), starH = V.atm === 0 ? VH : VH * 0.6;
  if (starA > 0) for (let i = 0; i < stars.length; i++) { ctx.fillStyle = `rgba(255,255,255,${starA * (0.45 + 0.55 * Math.abs(Math.sin(t * 1.5 + i)))})`; ctx.fillRect(Math.floor(((stars[i][0] * VW - cam.x * 0.02) % VW + VW) % VW), Math.floor(stars[i][1] * starH), 1 + (i % 7 === 0 ? 1 : 0), 1); }
  if (V.nebula) for (const [fx, fy, rx, ry, col] of V.nebula) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(((fx * VW - cam.x * 0.03) % (VW + 200) + VW + 200) % (VW + 200) - 100, fy * VH, rx, ry, 0.4, 0, 7); ctx.fill(); }   // 성운 띠(옅은 반투명 타원)
  { const d = Art.bgDisc(V.disc[0], V.disc[1]), dx = Math.round(V.disc[2] * VW - cam.x * 0.03), dy = Math.round(V.disc[3] * VH - cam.y * 0.02); ctx.globalAlpha = V.discA * (0.55 + 0.45 * Math.max(night, 1 - V.atm)); ctx.drawImage(d, dx - d.width / 2, dy - d.height / 2); ctx.globalAlpha = 1; }   // 하늘의 먼 행성
  const sunT = (hour - 6) / 12, moonT = ((hour + 6) % 24) / 12, arcY = Math.max(50, VH * 0.28);
  const sunX = Math.round(sunT * (VW - 18)), sunY = Math.round(arcY + 14 - Math.sin(sunT * Math.PI) * (arcY - 6));
  if (V.atm > 0 && sunT >= 0 && sunT <= 1) {
    for (const [r, a] of [[30, 0.08], [22, 0.12], [15, 0.18]]) { ctx.fillStyle = `rgba(255,240,160,${a})`; ctx.beginPath(); ctx.arc(sunX + 9, sunY + 9, r, 0, 7); ctx.fill(); }
    ctx.drawImage(Art.sun, sunX, sunY);
  }
  if (V.atm === 0) { ctx.fillStyle = 'rgba(255,240,170,.9)'; ctx.fillRect(Math.round(VW * 0.12), Math.round(VH * 0.1), 2, 2); ctx.fillStyle = 'rgba(255,240,170,.25)'; ctx.beginPath(); ctx.arc(VW * 0.12 + 1, VH * 0.1 + 1, 7, 0, 7); ctx.fill(); }   // 허브: 먼 항성 하나(해·달 호는 없다)
  else if (moonT >= 0 && moonT <= 1) ctx.drawImage(Art.moon, Math.round(moonT * (VW - 16)), Math.round(arcY + 14 - Math.sin(moonT * Math.PI) * (arcY - 6)));
  for (let i = 0; i < Math.round(5 * V.atm * V.atm); i++) {   // 구름은 대기가 두꺼울수록 많다
    const w = VW + 80, cx = ((i * 170 - t * 3 * (1 + i % 3 * 0.4) - cam.x * 0.08) % w + w) % w - 50;
    ctx.globalAlpha = (1 - night * 0.75) * 0.9; ctx.drawImage(Art.clouds[i % 3], Math.round(cx), 14 + (i * 23) % Math.max(30, VH * 0.35)); ctx.globalAlpha = 1;
  }
  // 시차 배경: 먼 산 → 언덕 → 숲(허브 정거장은 진공이라 없다)
  const horizon = 24 * T - cam.y;
  if (V.atm > 0) for (const [img, f, base, sink] of [[Art.farHills, 0.12, 100, 8], [Art.midHills, 0.28, 74, 6], [Art.forest, 0.5, 54, 4]]) {
    const off = -Math.floor((cam.x * f) % 512);
    for (let x = off; x < VW; x += 512) ctx.drawImage(img, x, Math.round(horizon - base + sink));
  }
  if (V.tint && V.atm > 0) { ctx.fillStyle = `rgba(${V.tint},.16)`; ctx.fillRect(0, 0, VW, Math.max(0, horizon + 8)); }   // 행성 색조(산·숲 위에 옅게)
  if (night > 0 && V.atm > 0) { ctx.fillStyle = `rgba(6,10,40,${night * 0.55})`; ctx.fillRect(0, 0, VW, Math.max(0, horizon + 8)); }
  // 타일
  const x0 = Math.floor(cam.x / T), y0 = Math.floor(cam.y / T), drawW = [];
  for (let ty = y0; ty <= y0 + Math.ceil(VH / T) + 1; ty++) for (let tx = x0; tx <= x0 + Math.ceil(VW / T) + 1; tx++) {
    const id = tileAt(tx, ty), sx = tx * T - cam.x, sy = ty * T - cam.y, v = (tx * 7 + ty * 13) % 3;
    if (id === AIR) { if (tx >= 0 && tx < dim.W && ty > GY[tx]) { ctx.drawImage(Art.tiles.wall[v], sx, sy); ctx.fillStyle = `rgba(0,0,0,${Math.max(0.2, Math.min(0.55, (ty - 28) * 0.04))})`; ctx.fillRect(sx, sy, T, T); if (World.inCore(S, tx, ty)) { ctx.fillStyle = 'rgba(150,200,230,.22)'; ctx.fillRect(sx, sy, T, T); } } continue; }
    if (id === WATER) {
      ctx.fillStyle = V.water[Math.min(2, Math.floor((ty - 25) / 2))]; ctx.fillRect(sx, sy, T, T);
      drawW.push([sx, sy, tileAt(tx, ty - 1) !== WATER, tx]); continue;
    }
    const hub = V.hub && (id === GRASS || id === SAND || id === DIRT);   // 허브 정거장: 풀·모래·흙 자리에 금속 바닥판과 선체
    const tset = hub ? (id === DIRT ? Art.tiles.hubhull : Art.tiles.hubtop) : id === GRASS ? Art.tiles.grass : id === DIRT ? Art.tiles.dirt : id === STONE ? Art.tiles.stone : id === SAND ? Art.tiles.sand : id === SNOWTOP ? Art.tiles.snowtop : id === RAFT ? Art.tiles.raft : id === HULL ? Art.tiles.hull : id === HATCH ? Art.tiles.hatch : Art.tiles.ice;
    ctx.drawImage(tset[v % tset.length], sx, sy);
    if (V.tint && !hub && id !== RAFT && id !== HULL && id !== HATCH) { ctx.fillStyle = `rgba(${V.tint},.2)`; ctx.fillRect(sx, sy, T, T); }   // 행성 지형 색조
    if (ty > 26) { ctx.fillStyle = `rgba(0,0,0,${Math.min(0.6, (ty - 26) * 0.03)})`; ctx.fillRect(sx, sy, T, T); }
    if (isOpen(tx, ty - 1) && id !== GRASS && id !== SNOWTOP) { ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(sx, sy, T, 1); }
    if (isOpen(tx - 1, ty)) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(sx, sy, 1, T); }
    if (isOpen(tx + 1, ty)) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(sx + T - 1, sy, 1, T); }
    if (isOpen(tx, ty + 1)) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(sx, sy + T - 1, T, 1); }
    if (id === GRASS && !V.hub && tileAt(tx, ty - 1) === AIR) {   // 풀 다발·꽃·돌
      const h = hash(tx, ty);
      if (h % 2 === 0) ctx.drawImage(Art.tuft[h % 3], sx, sy - 5);
      if (h % 9 === 0) ctx.drawImage(Art.flower[(h >>> 3) % 3], sx + (h % 9), sy - 6);
      else if (h % 23 === 1) ctx.drawImage(Art.rock, sx + 4, sy - 4);
    }
  }
  // 오브젝트
  // 하늘 경계 줄: 이 줄 위는 행성의 외기(압력·조성·기온)가 그대로 있는 "하늘"이다. 칸 시뮬(18단계)에서 이 줄이 외기 저수조가 된다. 줄 위치는 가정(임의값)
  { const ly = World.SKY_ROW * T - cam.y;
    if (ly > -2 && ly < VH + 2) {
      ctx.fillStyle = 'rgba(130,225,255,.38)'; for (let x = -(cam.x % 10); x < VW; x += 10) ctx.fillRect(Math.round(x), Math.round(ly), 6, 1);
      ctx.font = '8px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(160,235,255,.55)'; ctx.fillText('외기 경계 (가정) — 이 줄 위는 행성의 외기', 4, Math.round(ly) - 3);
    } }
  for (const o of OBJS) {
    const sx = o.x * T - cam.x, sy = o.y * T - cam.y, n = NODE[o.type], spent = n && (S.nodes[o.id] || 0) >= n[2];
    if (sx < -48 || sx > VW + 48) continue;
    ctx.globalAlpha = spent ? 0.4 : 1;
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    if (o.type === 'tree') { ctx.fillRect(sx - 4, sy - 1, 24, 2); blit(o.pine ? Art.obj.pine : Art.obj.tree, sx - 8, sy - 48); }
    else if (o.type === 'cane') blit(Art.obj.cane, sx, sy - 32);
    else if (o.type === 'wheat') blit(Art.obj.wheat, sx, sy - 20);
    else if (o.type === 'sandpile') blit(Art.obj.sandpile, sx, sy - 8);
    else if (o.type === 'icecrystal') blit(Art.obj.icecrystal, sx, sy - 24);
    else if (o.type === 'rocksalt') blit(Art.obj.rocksalt, sx, sy - 14);
    else if (o.type === 'harbor') blit(Art.obj.harbor, sx, sy - 32);
    else if (o.type === 'board') blit(Art.obj.board, sx, sy - 28);
    else if (o.type === 'fragment') { if (!S.f.raft) blit(Art.obj.fragment, sx - 4, sy - 12); }
    else if (o.type === 'box') { ctx.fillRect(sx, sy - 1, 16, 2); blit(Art.obj.box, sx, sy - 16); }
    else if (o.type === 'altar') { ctx.fillRect(sx, sy - 1, 32, 2); blit(Art.dev.altar, sx, sy - 32); if (!S.f.boss) { ctx.fillStyle = `rgba(255,200,120,${0.25 + 0.2 * Math.sin(t * 3)})`; ctx.fillRect(sx + 9, sy - 21, 6, 6); ctx.fillRect(sx + 19, sy - 21, 6, 6); } }
    ctx.globalAlpha = 1;
  }
  // 장치
  const tg = targets()[0];
  for (const d of S.placed) {
    const sx = d.x * T - cam.x, sy = d.y * T - cam.y;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(sx, sy + 31, 32, 2);
    blit(Art.dev[d.id], sx, sy);
    if (d.id === 'fire') Art.flame(ctx, sx, sy, d.s.level, t);
    if (d.id === 'collector') { ctx.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) ctx.fillRect(sx + 8 + i * 4, sy + 26 - ((t * 10 + i * 7) % 16), 2, 2); }
    if ((d.id === 'still' || d.id === 'cooker') && d.s.run && Math.random() < 0.25) puff(d.x * T + (d.id === 'still' ? 11 : 16), d.y * T + 2, 'rgba(235,245,255,.85)', 1);
    if (d.s.broken) { ctx.fillStyle = '#ff5a4a'; ctx.fillRect(sx + 12, sy + 12, 8, 2); ctx.fillRect(sx + 15, sy + 9, 2, 8); }
    if (d.id === 'cooker' && d.s.done) { ctx.fillStyle = '#ffe066'; ctx.fillRect(sx + 14, sy - 6 - Math.round(Math.sin(t * 6) * 2), 4, 4); }
    if (d.id === 'fire' && d.s.level > 0 && Math.random() < 0.1 * d.s.level) puff(d.x * T + 16, d.y * T + 10, '#ffb347', 1);
  }
  // 얼음 생물
  for (const m of S.mobs) {
    const [wx, wy] = wolfPos(m), face = (m.id % 2 ? -1 : 1), sx = Math.round(wx - 11 - cam.x), sy = Math.round(wy - 12 - cam.y), fr = Math.floor(t * 3 + m.id) % 2;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(sx + 2, sy + 12, 18, 2);
    ctx.globalAlpha = 0.45 + 0.55 * Math.max(0, m.M / m.M0);
    ctx.save();
    if (face < 0) { ctx.translate(sx + 22, 0); ctx.scale(-1, 1); blit(Art.wolf[fr], 0, sy); } else blit(Art.wolf[fr], sx, sy);
    ctx.restore(); ctx.globalAlpha = 1;
    if (Math.random() < 0.05) puff(wx, wy - 4, '#d8f3ff', 1);
  }
  // 플레이어
  const moving = Math.abs(S.vx) > 1, fr = !pst.onGround ? 3 : moving ? 1 + (Math.floor(t * 8) % 2) : 0;
  const px = S.px - 3, py = S.py + PH - 22 - cam.y;
  ctx.fillStyle = 'rgba(0,0,0,.2)'; if (pst.onGround) ctx.fillRect(Math.round(S.px - cam.x - 1), Math.round(S.py + PH - cam.y), PW + 2, 1);
  ctx.save();
  if (S.face < 0) { ctx.translate(Math.round(px - cam.x) + 16, 0); ctx.scale(-1, 1); blit(Art.playerFrames[fr], 0, py); } else blit(Art.playerFrames[fr], px - cam.x, py);
  ctx.restore();
  drawPeers(t);
  // 새·파티클
  if (hour > 7 && hour < 18) for (const b of birds) ctx.drawImage(Art.bird[Math.floor(b.ph) % 2], Math.round(b.x - cam.x), Math.round(b.y - cam.y + Math.sin(b.ph * 0.4) * 5));
  for (const p of parts) { ctx.fillStyle = p.col; ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), p.s, p.s); }
  ctx.globalAlpha = 1;
  // 물 (반투명 + 물결·거품)
  for (const [sx, sy, surf, tx] of drawW) {
    ctx.fillStyle = 'rgba(60,150,225,.42)'; ctx.fillRect(sx, sy, T, T);
    if (surf) {
      const w = Math.round(Math.sin(t * 2 + tx * 0.8) * 2);
      ctx.fillStyle = 'rgba(210,238,255,.95)'; ctx.fillRect(sx, sy, T, 2); ctx.fillRect(sx + 3 + w, sy + 2, 5, 1); ctx.fillRect(sx + 10 - w, sy + 4, 3, 1);
    } else if ((tx * 5 + Math.floor(t)) % 7 === 0) { ctx.fillStyle = 'rgba(210,238,255,.18)'; ctx.fillRect(sx + 5, sy + 6, 1, 4); }
  }
  if (Sim.dockOf(S).island === 'plaza') drawPlazaRafts(t);   // 물 위에 떠 있으니 물 색칠 뒤에 그린다
  // 밤 어둠 + 불빛 + 반딧불
  if (night > 0) {
    ctx.fillStyle = `rgba(8,12,40,${night * 0.5})`; ctx.fillRect(0, 0, VW, VH);
    for (const d of S.placed) if (d.id === 'fire' && d.s.level > 0) {
      const cx = d.x * T + 16 - cam.x, cy = d.y * T + 14 - cam.y;
      for (const [r, a] of [[52, 0.07], [38, 0.09], [24, 0.12]]) { ctx.fillStyle = `rgba(255,170,70,${a * night})`; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); }
    }
    for (const f of flies) {
      const fx = (((f.x - cam.x) % (VW + 60)) + VW + 60) % (VW + 60) - 30 + Math.sin(t * 0.8 + f.ph) * 14, fy = f.y - cam.y + Math.cos(t * 0.6 + f.ph * 2) * 8, a = night * (0.4 + 0.6 * Math.abs(Math.sin(t * 2 + f.ph)));
      ctx.fillStyle = `rgba(220,255,120,${a * 0.25})`; ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 4, 4); ctx.fillStyle = `rgba(240,255,170,${a})`; ctx.fillRect(Math.round(fx), Math.round(fy), 2, 2);
    }
  }
  // 가장자리 어둡게(비네트)
  const vg = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.45, VW / 2, VH / 2, Math.max(VW, VH) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.32)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
  // 파기 표시: 팔 수 있는 타일에 테두리, 파는 중에는 진행 막대
  if ($('modal').hidden && !mode) {
    const [hx, hy] = mouseTile(), c = digCheck(hx, hy);
    if (c.ok) {
      const sx = hx * T - cam.x, sy = hy * T - cam.y;
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.strokeRect(sx + 0.5, sy + 0.5, T - 1, T - 1);
      if (dig.on && dig.p > 0) { ctx.fillStyle = '#000'; ctx.fillRect(sx, sy - 4, T, 3); ctx.fillStyle = '#ffd84a'; ctx.fillRect(sx + 1, sy - 3, Math.round((T - 2) * Math.min(1, dig.p / dig.need)), 1); }
    }
  }
  drawBases(cg);
  drawHUD(t);
  // 상호작용 표시(픽셀 화살표)
  if (tg && $('modal').hidden) {
    const ax = Math.round(tg.x - cam.x), ay = Math.round(tg.y - cam.y) - 24 + Math.round(Math.sin(t * 6) * 2);
    ctx.fillStyle = '#000'; ctx.fillRect(ax - 4, ay - 1, 9, 3); ctx.fillRect(ax - 3, ay + 2, 7, 2); ctx.fillRect(ax - 1, ay + 4, 3, 2);
    ctx.fillStyle = '#ffd84a'; ctx.fillRect(ax - 3, ay, 7, 1); ctx.fillRect(ax - 2, ay + 2, 5, 1); ctx.fillRect(ax, ay + 4, 1, 1);
  }
  const lbl = $('target'); const want = HUD.tip ? HUD.tip : mode === 'core' ? (cg.ok ? `기지 코어 설치 가능 — 깊이 ${cg.depth}칸 · 클릭/Enter 설치 · ↑↓ 깊이 · ESC 멈춤` : `설치 불가: ${cg.msg} (↑↓ 깊이, A/D 걷기)`) : mode && mode.startsWith('block:') ? `${ITEM[mode.slice(6)][1]} 놓기 — 빈 칸을 클릭, ESC 취소` : mode && mode.startsWith('tool:') ? `${mode === 'tool:salt' ? '소금 뿌리개' : '온도계'} — 대상을 클릭, ESC 취소` : mode ? '건설/철거 모드 — 클릭해서 실행, ESC 취소' : tg ? `[E] ${tg.label}` : '이동: A/D · 점프: W/스페이스 · 상호작용: E 또는 클릭';
  if (lbl.textContent !== want) lbl.textContent = want;
  if (warp) {   // 궤도 이동 연출 1.4초
    const k = (performance.now() - warp.at) / 1400;
    if (k >= 1) warp = null;
    else {
      const a = 1 - k; ctx.fillStyle = `rgba(2,4,12,${Math.min(1, a * 1.3)})`; ctx.fillRect(0, 0, VW, VH);
      ctx.strokeStyle = `rgba(190,215,255,${a * 0.8})`; ctx.lineWidth = 1;
      for (let i = 0; i < 48; i++) { const ang = i * 2.399, r0 = 8 + k * 60 + (i % 5) * 6, r1 = r0 + 20 + a * 90 + (i % 7) * 4; ctx.beginPath(); ctx.moveTo(VW / 2 + Math.cos(ang) * r0, VH / 2 + Math.sin(ang) * r0 * 0.7); ctx.lineTo(VW / 2 + Math.cos(ang) * r1, VH / 2 + Math.sin(ang) * r1 * 0.7); ctx.stroke(); }
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = `rgba(230,240,255,${Math.min(1, a * 2)})`; ctx.fillText(`궤도 이동 — ${warp.name}`, VW / 2, VH / 2 + 4); ctx.textAlign = 'left';
    }
  }
  // 건설 고스트
  if (mode && mode.startsWith('build:')) {
    const id = mode.slice(6), g = ghostCheck(id);
    const gx = g.tx * T - cam.x, gy = Sim.RAFT.DEV_Y * T - cam.y;
    ctx.globalAlpha = 0.65; blit(Art.dev[id], gx, gy); ctx.globalAlpha = 1;
    ctx.strokeStyle = g.ok ? '#4cff7a' : '#ff5a4a'; ctx.lineWidth = 1; ctx.strokeRect(gx + 0.5, gy + 0.5, 31, 31);
  }
}

// ---------- 기지 표시 (17-a): 다른 기지(서버 요약)·내 기지 영역·코어 설치 미리보기 ----------
function outlined(txt, x, y, col) { ctx.font = '8px sans-serif'; ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y); }
function drawBases(cg) {
  if (Sim.dockOf(S).island !== 'start') return;
  const K = World.CORE, me = UI.myBaseId();
  ctx.textAlign = 'left';
  for (const [id, b] of Object.entries(UI.bases())) {
    if (id === me || !b) continue;
    const sx = b.x * T - cam.x, sy = b.y * T - cam.y;
    if (sx > VW || sy > VH || sx + b.w * T < 0 || sy + b.h * T < 0) continue;
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = b.color || '#ffffff'; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.strokeRect(Math.round(sx) + 0.5, Math.round(sy) + 0.5, b.w * T, b.h * T); ctx.restore();
    const cx = b.cx * T - cam.x, cy = b.cy * T - cam.y;   // 코어: 팀 색 캡슐(칸 내용은 서버에 올라오지 않는다)
    ctx.fillStyle = b.color || '#ffffff'; ctx.fillRect(cx, cy, K.CW * T, K.CH * T); ctx.fillStyle = 'rgba(8,14,34,.75)'; ctx.fillRect(cx + T, cy + T, (K.CW - 2) * T, (K.CH - 2) * T);
    outlined(`${b.name || '기지'} (${Object.keys(b.members || {}).length}명)`, Math.round(cx), Math.round(cy) - 3, '#ffffff');
  }
  if (S.base) {
    const a = World.areaOf(S.base), sx = a.x0 * T - cam.x, sy = a.y0 * T - cam.y;
    ctx.save(); ctx.setLineDash([3, 5]); ctx.strokeStyle = 'rgba(120,255,160,.45)'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(sx) + 0.5, Math.round(sy) + 0.5, a.w * T, a.h * T); ctx.restore();
    if (sx > -a.w * T && sx < VW && sy > -a.h * T && sy < VH) outlined(`내 기지 영역 ${a.w}x${a.h} (가정) — 밖은 보기만`, Math.round(Math.max(2, sx + 2)), Math.round(Math.max(10, sy + 9)), 'rgba(160,255,190,.8)');
  }
  if (cg) {
    const sx = cg.x * T - cam.x, sy = cg.y * T - cam.y, a = World.areaOf(cg);
    ctx.save(); ctx.setLineDash([3, 5]); ctx.strokeStyle = cg.ok ? 'rgba(120,255,160,.45)' : 'rgba(255,120,100,.4)'; ctx.strokeRect(Math.round(a.x0 * T - cam.x) + 0.5, Math.round(a.y0 * T - cam.y) + 0.5, a.w * T, a.h * T); ctx.restore();
    ctx.fillStyle = cg.ok ? 'rgba(76,255,122,.28)' : 'rgba(255,90,74,.32)'; ctx.fillRect(sx, sy, K.CW * T, K.CH * T);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(sx + T, sy + T, (K.CW - 2) * T, (K.CH - 2) * T);
    ctx.strokeStyle = cg.ok ? '#4cff7a' : '#ff5a4a'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(sx) + 0.5, Math.round(sy) + 0.5, K.CW * T - 1, K.CH * T - 1);
    outlined(`코어 ${K.CW}x${K.CH} · 깊이 ${cg.depth !== undefined ? cg.depth : coreDepth}칸`, Math.round(sx), Math.round(sy) - 3, cg.ok ? '#b8ffcb' : '#ffb0a6');
  }
}

// ---------- 인게임 HUD (게임 화면 안에 그린다) ----------
const GLYPH = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111',
  ':': '000010000010000', x: '000101010101000', D: '110101101101110', '.': '000000000000010', '-': '000000111000000', C: '111100100100111', ' ': '000000000000000',
};
const textW = s => s.length * 4 - 1;
function drawText(s, x, y, col = '#ffffff') {
  for (const [pass, c] of [[1, '#000000'], [0, col]]) {
    ctx.fillStyle = c; let cx = x;
    for (const ch of s) {
      const g = GLYPH[ch];
      if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(cx + (i % 3) + pass, y + Math.floor(i / 3) + pass, 1, 1);
      cx += 4;
    }
  }
}
function hudBox(x, y, w, h, on) {
  ctx.fillStyle = '#0a0f1d'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = on ? '#6a5a18' : 'rgba(22,34,66,.88)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = on ? '#ffd84a' : '#4a68b4'; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
}
const HUD = { hits: [], tip: '', bottom: 0, quest: -1 };
const hudMenu = [
  ['core', '기지 코어 (B)', () => UI.openBase()], ['hammer', '건설', () => openBuild()], ['gear', '제작', () => openCraft()], ['book', '연구 노트', () => window.Notes && Notes.open(api)],
  ['scroll', '기록', () => openLog()], ['disk', '저장/계정', () => openSave()],
];
function drawHUD(t) {
  HUD.hits = []; HUD.tip = '';
  const over = (x, y, w, h) => mouse.x >= x && mouse.x < x + w && mouse.y >= y && mouse.y < y + h;
  // 가방: 칸마다 아이콘 + 개수
  const items = Object.entries(S.inv).filter(([, v]) => v >= 1).map(([k, v]) => ({ k, icon: ITEM[k][0], name: ITEM[k][1], n: Math.floor(v) }));
  if (S.caps.length) items.push({ icon: 'cap', name: '기체 캡슐 (' + capText() + ')', n: S.caps.length });
  if (S.packs.length) items.push({ icon: 'pack', name: '한제 팩', n: S.packs.length });
  const SL = 17, per = Math.max(4, Math.floor((VW - 118) / SL)), rows = Math.max(1, Math.ceil(items.length / per));
  items.forEach((it, i) => {
    const x = 4 + (i % per) * SL, y = 4 + Math.floor(i / per) * SL, hov = over(x, y, 16, 16);
    hudBox(x, y, 16, 16, hov); ctx.drawImage(Art.icon[it.icon], x + 3, y + 2);
    const s = String(it.n); drawText(s, x + 15 - textW(s), y + 10);
    if (BLOCK[it.k]) HUD.hits.push({ x, y, w: 16, h: 16, fn: () => { mode = mode === 'block:' + it.k ? null : 'block:' + it.k; say(mode ? `${it.name}을(를) 놓을 곳을 클릭하세요. (ESC 취소)` : '취소'); } });
    if (TOOL[it.k]) HUD.hits.push({ x, y, w: 16, h: 16, fn: () => { const m = 'tool:' + TOOL[it.k]; mode = mode === m ? null : m; say(mode ? `${it.name}: 쓸 대상을 클릭하세요. (ESC 취소)` : '취소'); } });
    if (hov) HUD.tip = `${it.name} ${it.n}` + (BLOCK[it.k] ? ' (클릭: 놓기)' : TOOL[it.k] ? ' (클릭: 사용)' : it.k === 'pickaxe' ? ' (돌을 팔 때 자동 사용)' : '');
  });
  HUD.bottom = 4 + rows * SL;
  // 시계(해/달 아이콘 + 일차 + 시각)
  const hh = String(Math.floor(S.min / 60)).padStart(2, '0'), mm = String(Math.floor(S.min % 60)).padStart(2, '0');
  const ts = `D${S.day} ${hh}:${mm}`, pw = textW(ts) + 20, px = VW - 4 - pw;
  hudBox(px, 4, pw, 14); ctx.drawImage(S.min >= 360 && S.min < 1080 ? Art.sun : Art.moon, px + 3, 6, 9, 9); drawText(ts, px + 16, 9);
  const tempS = Math.round(airTemp()) + 'C';
  if (over(px, 4, pw, 14)) HUD.tip = `${S.day}일차 ${hh}:${mm} · ${Sim.ISLANDS[Sim.dockOf(S).island].name} 외기 ${Math.round(airTemp())}℃ · ${fmt(pAtm(), 2)} atm`;
  // 메뉴 버튼
  hudMenu.forEach(([icon, label, fn], i) => {
    const x = VW - 4 - (hudMenu.length - i) * 17 + 1, y = 22, hov = over(x, y, 16, 16);
    hudBox(x, y, 16, 16, hov); ctx.drawImage(Art.icon[icon], x + 3, y + 3);
    HUD.hits.push({ x, y, w: 16, h: 16, fn }); if (hov) HUD.tip = label;
  });
  // 시간 배속
  let sx = VW - 4;
  for (const sp of [10, 3, 1]) {
    const s = 'x' + sp, w = textW(s) + 6; sx -= w; const on = S.speed === sp;
    hudBox(sx, 40, w, 11, on); drawText(s, sx + 3, 43, on ? '#ffd84a' : '#ffffff'); sx -= 2;
    HUD.hits.push({ x: sx + 2, y: 40, w, h: 11, fn: () => { S.speed = sp; } }); if (over(sx + 2, 40, w, 11)) HUD.tip = `시간 속도 x${sp}`;
  }
  // 목표 텍스트는 화면 왼쪽 위(가방 아래)에 겹쳐 놓는다
  const qk = HUD.bottom * 1000 + S.qDone;
  if (HUD.quest !== qk) { HUD.quest = qk; const q = $('quest'); q.style.top = (HUD.bottom * K + 8) + 'px'; q.style.left = (4 * K) + 'px'; }
}

// 시계: 1초 = 게임 2분 (x1)
setInterval(() => { if (Store.paused || (window.Raid && Raid.active)) return; advance(S.speed); UI.tick(); refresh(); }, 500);
setInterval(() => save(), 5000);
window.addEventListener('pagehide', () => save(true));
function fit() {   // 게임 화면이 창 전체를 채운다: 픽셀 배율(정수)은 고정하고 보이는 월드 범위를 창에 맞춘다
  const W = window.innerWidth, H = window.innerHeight;
  const k = Math.max(2, Math.round(Math.min(W / 560, H / 315)));
  K = k; VW = Math.ceil(W / k); VH = Math.ceil(H / k);
  cv.width = VW; cv.height = VH; ctx.imageSmoothingEnabled = false;
  cv.style.width = VW * k + 'px'; cv.style.height = VH * k + 'px';
  makeStars();
}
window.addEventListener('resize', fit);
UI.init({
  puff, burst, clearKeys, applyWorld,
  startBuild(id) { mode = 'build:' + id; $('modal').hidden = true; say(`${DEV[id].name}을(를) 지을 곳을 클릭하세요. (ESC 취소)`); },
  startDemolish() { mode = 'demolish'; $('modal').hidden = true; say('철거할 장치를 클릭하세요. (ESC 취소)'); },
  startCore() { enterCore(); },
  joinMap() { Net.joinMap(MAPID, posPacket()); },
});
refresh(); fit(); requestAnimationFrame(frame);
// 메인화면: 접속할 때마다 먼저 보이고, 시작하기를 누를 때까지 시간이 흐르지 않는다. 그다음 접속(로그인) 화면 → 첫 접속 도움말
Store.paused = true;
$('t-info').textContent = S.day > 1 || S.qDone > 0 ? `저장된 진행: ${S.day}일차 · 목표 ${S.qDone}/${QUESTS.length}` : '새 게임';
function startGame() {
  if ($('title').hidden) return;
  $('title').hidden = true; Store.paused = false; loadPlaza();
  boot().then(() => UI.syncBase()).then(() => { if (!S.base) enterCore(); let seen = false; try { seen = !!localStorage.getItem(HELP_KEY); } catch { /* 무시 */ } if (!seen && $('auth').hidden) openHelp(); });
}
$('t-start').onclick = startGame;
$('t-help').onclick = () => openHelp();
})();
