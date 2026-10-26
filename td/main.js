// 화학 섬 이야기 — 탑다운 2D(td/, 13단계). 1인칭 3D(fp/)와 같은 월드·상태·규칙·서버를 위에서 내려다보는 픽셀 아트 캔버스로 그린다.
// 화학 계산은 chem.js·sim.js를 그대로 쓰고, 지형·이동·팀·교류는 shared/를 fp/와 같이 쓴다. 이 파일은 "화면에 어떻게 그리고 어떻게 조작하는가"만 다룬다.
// 상태는 Store.S + S.fp(위치·시점·녹은 얼음 노드). 저장 키는 fp/와 같은 chemisle_fp_v2, 서버 경로도 같다(window.CHEM_FP).
import { N, SEA, RX0, RZ0, PAD, ISLANDS } from '../shared/gen.js';
import { stepBody, BODY } from '../shared/move.js';
import { makeCtx } from '../shared/ctl.js';
import { installTheme, GAME_TITLE, PLANET, STORY_HTML } from '../shared/theme.js';
import { Party } from '../shared/party.js';
import { HubUI, tick as hubTick, startWatch, loadPubs, hubShips } from '../shared/hub.js';
import { makePlay, collectTargets, HOLD, REACH } from '../shared/play.js';
import { initHud, TeamUI, wrapActions } from '../shared/hud.js';
import { bakeGround, PX, MAP } from './ground.js';

const Art = window.Art, S = Store.S;
const { QUESTS, DEV } = Sim;
const { NODE } = World;
const { $, say, advance, refresh, closeModal, boot, loadPlaza, HELP_KEY } = UI;
const save = Store.save;
const TEST = /[?&]test\b/.test(location.search);   // 시험(tools/smoketd.js)에서는 입력을 바로 받는다
const nightOf = h => h >= 21 || h < 5 ? 1 : h >= 18 ? (h - 18) / 3 : h < 7 ? (7 - h) / 2 : 0;

// ---------- 상태 ----------
const ctx = makeCtx(S);
const { ensureFp, raftDims, raftCell, groundAt, blocked, findFree, islandName, visible, devWorld, melted, wolfDev, wolfWorld } = ctx;
ensureFp();
const p = { x: S.fp.x, y: S.fp.y, z: S.fp.z, vx: 0, vy: 0, vz: 0, onGround: false, inW: false };
let yaw = S.fp.yaw;   // 바라보는 방향: fp/와 같은 정의(yaw 0 = 화면 위쪽(-z), 앞 방향 = (-sin yaw, -cos yaw))
let face = [-Math.sin(yaw), -Math.cos(yaw)];
const cam = { x: p.x, z: p.z };

// ---------- 화면: 게임 픽셀 크기로 그리고 정수 배율로 키운다 ----------
const cvs = $('c'), g = cvs.getContext('2d');
let Z = 2, VW = 0, VH = 0;   // 정수 배율, 보이는 게임 픽셀 크기
function fit() {
  Z = Math.max(2, Math.round(innerWidth / (PX * 34)));   // 가정(임의값): 화면 가로로 약 34 m가 보이도록 정수 배율(2~)
  VW = Math.ceil(innerWidth / Z); VH = Math.ceil(innerHeight / Z);
  cvs.width = VW; cvs.height = VH; cvs.style.width = VW * Z + 'px'; cvs.style.height = VH * Z + 'px';
  g.imageSmoothingEnabled = false;
}
addEventListener('resize', fit); fit();
const sx = (x) => Math.round((x - cam.x) * PX + VW / 2), sz = (z) => Math.round((z - cam.z) * PX + VH / 2);

// ---------- 행성(땅 굽기) ----------
let isl = null, islName = '', ground = null, tNow = 0;
function loadIsland(name) {
  islName = name; isl = ctx.load(name); ground = bakeGround(isl, name, Art);
}
const hash = (x, z) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0); };

// ---------- 이동 입력 ----------
let seaHintAt = 0;
const moveWorld = { groundAt, blocked, onEdge() { const t = performance.now(); if (t - seaHintAt > 5000) { seaHintAt = t; say('더 멀리 갈 수 없어요. 탐사정으로 궤도 이동하세요 (궤도 이동 단말).'); } } };
const keys = { up: false, down: false, left: false, right: false, jump: false };
function clearKeys() { keys.up = keys.down = keys.left = keys.right = keys.jump = false; pl.dig.on = false; }
const KEYMAP = { w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', ' ': 'jump' };
addEventListener('keydown', e => {
  if (!$('modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  if (!$('title').hidden) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startGame(); } return; }
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;
  const key = e.key.toLowerCase(), k = KEYMAP[key];
  if (k) { keys[k] = true; if (k === 'jump' || e.key.startsWith('Arrow')) e.preventDefault(); }
  else if (key === 'e') interactNear();
  else if (key === 'l') pl.cycleLink();
  else if (key === 'q' || key === 'escape') { if (pl.anyMode()) { pl.cancel(); say('취소'); } }
  else if (/^[1-9]$/.test(key)) { const u = pl.usable()[+key - 1]; if (u) pl.selectItem(u.k); }
});
addEventListener('keyup', e => { const k = KEYMAP[e.key.toLowerCase()]; if (k) keys[k] = false; });

// ---------- 마우스: 가리키는 칸·대상(보이는 스프라이트 상자 안), 건설 칸, 바닷물 ----------
const mouse = { x: -1, z: -1, in: false };   // 월드 좌표(m)
function setMouseFromEvent(e) { const r = cvs.getBoundingClientRect(); mouse.x = cam.x + ((e.clientX - r.left) / Z - VW / 2) / PX; mouse.z = cam.z + ((e.clientY - r.top) / Z - VH / 2) / PX; mouse.in = true; }
cvs.addEventListener('mousemove', setMouseFromEvent);
cvs.addEventListener('mouseleave', () => { mouse.in = false; });
// 대상마다 스프라이트가 차지하는 상자(월드 m): 발밑(wx, foot)에서 위로 높이 h
const treeIsPine = (o) => o.type === 'tree' && (islName === 'alpine' || (islName !== 'plaza' && isl.height(o.x, o.z) > SEA + 7));
function boxOf(tg) {
  const img = tg.kind === 'dev' ? Art.dev[tg.ref.id] : tg.kind === 'wolf' ? Art.mob.wolf : tg.kind === 'altar' ? Art.dev.altar : Art.obj[tg.kind === 'tree' && treeIsPine(tg.ref) ? 'pine' : tg.kind];
  const w = (img ? img.width : 24) / PX, h = (img ? img.height : 24) / PX;
  const foot = tg.kind === 'dev' || tg.kind === 'altar' ? tg.wz + 1 : tg.kind === 'wolf' ? tg.wz : tg.wz;
  return { x0: tg.wx - w / 2, x1: tg.wx + w / 2, z0: foot - h, z1: foot + 0.15, foot };
}
const dist = (tg) => Math.hypot(tg.wx - p.x, tg.wz - p.z);
const inReach = (tg) => dist(tg) <= REACH + (tg.r || 1);
const isWaterAt = (x, z) => groundAt(x, z) < SEA - 0.1 && !raftCell(Math.floor(x), Math.floor(z));
function waterTarget(x, z) { return { kind: 'water', ref: null, wx: x, wy: SEA, wz: z, label: '바닷물 뜨기', r: 0.6 }; }
// 가리키는 대상: 마우스가 상자 안에 있는 것 중 가장 앞(발밑 z가 큰)의 것. 없으면 마우스가 물 위일 때 바닷물
function hoverTarget() {
  if (!mouse.in) return null;
  let best = null;
  for (const tg of collectTargets(ctx)) { const b = boxOf(tg); if (mouse.x >= b.x0 && mouse.x <= b.x1 && mouse.z >= b.z0 && mouse.z <= b.z1 && (!best || b.foot > best.f)) best = { tg, f: b.foot }; }
  if (best) return best.tg;
  if (isWaterAt(mouse.x, mouse.z)) return waterTarget(mouse.x, mouse.z);
  return null;
}
// E: 가리키는 대상이 닿으면 그것, 아니면 가장 가까운 대상, 아니면 가까운 물
function nearTarget() {
  const h = hoverTarget(); if (h && inReach(h)) return h;
  let best = null, bd = 1e9;
  for (const tg of collectTargets(ctx)) { const d = dist(tg); if (d <= REACH + (tg.r || 1) && d < bd) { best = tg; bd = d; } }
  if (best) return best;
  for (let r = 1; r <= 3; r++) for (let a = 0; a < 16; a++) { const x = p.x + Math.cos(a / 16 * 6.283) * r, z = p.z + Math.sin(a / 16 * 6.283) * r; if (isWaterAt(x, z)) return waterTarget(x, z); }
  return null;
}
// 대상을 눌렀을 때: 너무 멀면 안내
function reachOr(tg) { if (!tg) return null; if (tg.kind !== 'water' && !inReach(tg) || tg.kind === 'water' && Math.hypot(tg.wx - p.x, tg.wz - p.z) > REACH) { say('너무 멀어요. 가까이 가서 눌러 보세요.'); return null; } return tg; }
function interactNear() { const tg = nearTarget(); if (tg) pl.doInteract(tg); else say('가까이에 열 수 있는 것이 없어요.'); }
// 건설 칸: 마우스 아래의 기지 부지 칸 또는 탐사정 칸(2×2 장치의 가운데가 마우스 쪽)
function cellUnderMouse() {
  if (!mouse.in) return null;
  const x = mouse.x, z = mouse.z;
  if (x >= PAD.x0 && x < PAD.x0 + PAD.cx && z >= PAD.z0 && z < PAD.z0 + PAD.cz) return { plot: islName, gx: Math.floor(x - PAD.x0 - 0.5), gz: Math.floor(z - PAD.z0 - 0.5), cx: PAD.cx, cz: PAD.cz, hx: x, hz: z };
  const { cx, cz } = raftDims();
  if (x >= RX0 - 1 && x < RX0 + cx + 1 && z >= RZ0 - 1 && z < RZ0 + cz + 1) return { plot: null, gx: Math.floor(x - RX0 - 0.5), gz: Math.floor(z - RZ0 - 0.5), cx, cz, hx: x, hz: z };
  return null;
}
const pl = makePlay(ctx, { aimed: () => hoverTarget(), cell: cellUnderMouse, puff: (x, y, z, col, n) => puff(x, z, col, n), pickA: '클릭', pickB: '클릭', buildWhere: '탐사정 바닥이나 기지 부지 칸을 클릭' });
// 좌클릭: 모드(건설·철거·연결·도구)가 있으면 그 동작, 없으면 열기·채집(바위·얼음은 꾹 눌러 캔다). 우클릭은 모드 동작만
cvs.addEventListener('mousedown', e => {
  if (!$('modal').hidden || !$('title').hidden || Store.paused && !TEST) return;
  setMouseFromEvent(e);
  if (e.button === 2) { pl.useAction(); return; }
  if (e.button !== 0) return;
  if (pl.anyMode()) { pl.useAction(); return; }
  const tg = hoverTarget();
  if (tg && HOLD[tg.kind]) { if (reachOr(tg)) pl.dig.on = true; } else if (reachOr(tg)) pl.doInteract(tg);
});
addEventListener('mouseup', e => { if (e.button === 0) pl.dig.on = false; });
cvs.addEventListener('contextmenu', e => e.preventDefault());
cvs.addEventListener('wheel', e => { const u = pl.usable().map(x => x.k).concat([null]), i = u.indexOf(pl.sel); const n = u[(i + (e.deltaY > 0 ? 1 : -1) + u.length) % u.length]; if (n !== pl.sel) pl.selectItem(n === null ? pl.sel : n); }, { passive: true });
// 한 틱: 화면 오른쪽 = +x, 아래쪽 = +z. 대각선은 stepBody가 길이 1로 보정한다
function stepPlayer(dt, ax, az, jump) {
  stepBody(p, dt, ax, az, jump, moveWorld);
  if (ax || az) { const l = Math.hypot(ax, az); face = [ax / l, az / l]; yaw = Math.atan2(-face[0], -face[1]); }
}

// ---------- 그리기 ----------
function drawWater() {
  const cfg = PLANET[islName] || PLANET.start, c = '#' + cfg.sea.toString(16).padStart(6, '0');
  g.fillStyle = c; g.fillRect(0, 0, VW, VH);
  if (cfg.atm === 0) {   // 허브 정거장 둘레는 우주: 별
    g.fillStyle = '#cfd8ff';
    const x0 = Math.floor(cam.x - VW / 2 / PX) - 1, z0 = Math.floor(cam.z - VH / 2 / PX) - 1;
    for (let z = z0; z < z0 + VH / PX + 3; z++) for (let x = x0; x < x0 + VW / PX + 3; x++) { const h = hash(x, z); if (h % 5 === 0) { const t = Math.sin(tNow * 1.5 + h) > 0.6 ? 2 : 1; g.fillRect(sx(x + (h >> 8 & 15) / 16), sz(z + (h >> 12 & 15) / 16), t, t); } }
    return;
  }
  // 물결: 칸마다 정해진 자리에서 밝은 짧은 줄이 천천히 움직인다
  const amp = cfg.wave, x0 = Math.floor(cam.x - VW / 2 / PX) - 1, z0 = Math.floor(cam.z - VH / 2 / PX) - 1;
  g.fillStyle = 'rgba(255,255,255,0.22)';
  for (let z = z0; z < z0 + VH / PX + 3; z++) for (let x = x0; x < x0 + VW / PX + 3; x++) {
    const h = hash(x, z); if (h % 4 !== 0) continue;
    const off = Math.round(Math.sin(tNow * (0.6 + amp * 0.5) + h) * 2 * Math.max(0.3, amp));
    g.fillRect(sx(x) + (h >> 6 & 7) + off, sz(z) + (h >> 10 & 15), 4 + (h >> 4 & 3), 1);
  }
}
function drawRaftCells() {
  const { cx, cz } = raftDims(), tiles = Art.tiles.raft;
  for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) {
    const x = RX0 + i, z = RZ0 + j; g.drawImage(tiles[hash(x, z) % tiles.length], sx(x), sz(z), PX, PX);
  }
  g.fillStyle = 'rgba(15,10,5,.55)';   // 가장자리 그림자
  g.fillRect(sx(RX0), sz(RZ0 + cz), cx * PX, 1); g.fillRect(sx(RX0 + cx), sz(RZ0), 1, cz * PX);
}
// 스프라이트 그리기: 발밑(월드 좌표)을 기준으로 아래 가운데를 맞춘다. 윤곽선(pad 1 px)을 감안한다
function spr(img, x, z, lift, flip, alpha) {
  const w = img.width, h = img.height, X = sx(x), Y = sz(z) + 2 - (lift || 0);
  if (alpha !== undefined) g.globalAlpha = alpha;
  if (flip) { g.save(); g.translate(X, 0); g.scale(-1, 1); g.drawImage(img, -Math.round(w / 2), Y - h); g.restore(); } else g.drawImage(img, X - Math.round(w / 2), Y - h);
  if (alpha !== undefined) g.globalAlpha = 1;
}
function shadow(x, z, rx, ry) { g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(sx(x), sz(z) + 1, rx, ry, 0, 0, 7); g.fill(); }
const SPR_SHADOW = { tree: [9, 3], rock: [10, 3], iceblock: [10, 3], icecrystal: [6, 2], rocksalt: [7, 2], box: [8, 3], altar: [14, 4], project: [12, 3], default: [7, 2.5] };
// 남은 사람·장치·배 그리기 목록(y 정렬용)
const drawList = [];
const NODE_SPR = { tree: 'tree', cane: 'cane', wheat: 'wheat', sandpile: 'sandpile', icecrystal: 'icecrystal', rock: 'rock', iceblock: 'iceblock', rocksalt: 'rocksalt', box: 'box', board: 'board', harbor: 'harbor', fragment: 'fragment', trade: 'trade', reports: 'reports', boards: 'boards', signs: 'signs', project: 'project' };
function pushObjects() {
  for (const o of isl.objs) {
    if ((o.type === 'fragment' && S.f.raft) || melted(o)) continue;
    if (Math.abs(o.x - cam.x) > VW / PX / 2 + 4 || Math.abs(o.z - cam.z) > VH / PX / 2 + 5) continue;
    const n = NODE[o.type], spent = n && (S.nodes[o.id] || 0) >= n[2];
    if (o.type === 'altar') { const img = Art.dev.altar; drawList.push({ z: o.z + 1, draw() { shadow(o.x, o.z + 1, 14, 4); spr(img, o.x, o.z + 1, 0, false, S.f.boss ? undefined : 1); if (!S.f.boss) return; g.fillStyle = `rgba(255,179,71,${0.35 + 0.3 * Math.sin(tNow * 3)})`; g.fillRect(sx(o.x) - 9, sz(o.z + 1) - 22, 4, 4); g.fillRect(sx(o.x) + 5, sz(o.z + 1) - 22, 4, 4); } }); continue; }   // 골렘이 남아 있으면 제단 눈이 깜빡인다(2D와 같음)
    const img = treeIsPine(o) ? Art.obj.pine : Art.obj[NODE_SPR[o.type]]; if (!img) continue;
    const sh = SPR_SHADOW[o.type] || SPR_SHADOW.default;
    drawList.push({ z: o.z, draw() { shadow(o.x, o.z, sh[0], sh[1]); spr(img, o.x, o.z, 0, false, spent ? 0.45 : undefined); } });
  }
}
function pushDevices() {
  for (const d of S.placed) {
    if (!visible(d)) continue;
    const [wx, , wz] = devWorld(d), img = Art.dev[d.id]; if (!img) continue;
    drawList.push({ z: wz + 1, draw() {
      shadow(wx, wz + 0.9, 15, 4); spr(img, wx, wz + 1, 0, false, d.s.broken ? 0.7 : undefined);
      const X = sx(wx), Y = sz(wz + 1) - 34;   // 상태 표시: 불꽃·완성·파손(보이기만)
      if (d.id === 'fire' && d.s.level > 0 && d.s.fuel > 0) { const k = 3 + d.s.level * 2 + ((tNow * 14) | 0) % 2; g.fillStyle = '#ff7a2e'; g.fillRect(X - 3, sz(wz + 1) - 18 - k, 6, k); g.fillStyle = '#ffd84a'; g.fillRect(X - 1, sz(wz + 1) - 18 - k + 2, 3, k - 2); }
      if (d.s.done) { g.fillStyle = '#ffd84a'; g.fillRect(X - 2, Y + ((Math.sin(tNow * 6) * 2) | 0), 5, 5); }
      if (d.s.broken) { g.fillStyle = '#d24a3a'; g.fillRect(X - 5, Y + 6, 10, 2); g.fillRect(X - 1, Y + 2, 2, 10); }
      if ((d.id === 'still' || d.id === 'cooker') && d.s.run && Math.random() < 0.2) puff(wx, wz, '#ebf5ff', 1, 1.6);
    } });
  }
}
function pushWolves() {
  for (const mb of S.mobs) {
    const d = wolfDev(mb); if (d && !visible(d)) continue;
    const [x, y, z] = wolfWorld(mb), a = 0.45 + 0.55 * Math.max(0, mb.M / mb.M0);
    drawList.push({ z, draw() { shadow(x, z, 11, 3); spr(Art.mob.wolf, x, z, Math.abs(Math.sin(tNow * 6 + mb.id)) * 2, p.x < x, a); } });
  }
}
// 사람: 걸음 수에 따라 두 걸음을 번갈아 그린다. 옆모습은 오른쪽 그림을 뒤집어 왼쪽을 본다
const playerSprites = {};
const sprPlayer = (col) => playerSprites[col] || (playerSprites[col] = Art.person(col));
let stepAcc = 0;
function drawPerson(S_, x, z, lift, fx, fz, moving, flipAcc) {
  const dir = Math.abs(fx) > Math.abs(fz) ? 'side' : fz < 0 ? 'up' : 'down', fr = moving ? ((flipAcc * 1.6) | 0) % 2 : 0;
  shadow(x, z, 5, 2.2); spr(S_[dir][fr], x, z, lift, dir === 'side' && fx < 0);
}
function pushPlayer() {
  const base = Math.max(groundAt(p.x, p.z), SEA), lift = Math.max(0, Math.min(3, p.y - base)) * PX * 0.9;
  drawList.push({ z: p.z, draw() { drawPerson(sprPlayer('#4a7bd8'), p.x, p.z, lift - (p.inW ? -2 : 0), face[0], face[1], Math.hypot(p.vx, p.vz) > 0.1, stepAcc); } });
}
// 허브에 도킹한 다른 팀·플레이어의 탐사정(읽기 전용): 내 탐사정 북쪽으로 10칸 간격
const rcz = cells => Math.min(8, 4 + Math.floor((cells - 4) / 2));
function pushPlazaShips() {
  if (islName !== 'plaza') return;
  hubShips().concat(UI.plazaRafts()).slice(0, 3).forEach((r, i) => {
    const cx = Math.max(2, Math.min(12, r.cells | 0)), cz = rcz(cx), z0 = RZ0 - 10 * (i + 1), tiles = Art.tiles.raft;
    drawList.push({ z: z0 - 1, draw() {   // 바닥은 가장 뒤에 먼저 그린다
      for (let j = 0; j < cz; j++) for (let k = 0; k < cx; k++) g.drawImage(tiles[hash(RX0 + k, z0 + j) % tiles.length], sx(RX0 + k), sz(z0 + j), PX, PX);
    }, bottom: true });
    for (const d of (r.devs || [])) if (d && Art.dev[d.id] && ['fire', 'still', 'cooker', 'cooler', 'collector'].includes(d.id) && d.u >= 0 && d.u + 2 <= cx) {
      const wx = RX0 + d.u + 1, wz = z0 + (d.z | 0) + 1; drawList.push({ z: wz + 1, draw() { shadow(wx, wz + 0.9, 15, 4); spr(Art.dev[d.id], wx, wz + 1, 0, false, d.broken ? 0.7 : undefined); } });
    }
    labelAt('ship' + i, r.nick || '', RX0 + cx / 2, z0 - 0.5, r.color);
  });
}
// 이름표(DOM): 게임 픽셀 좌표를 화면 좌표로 바꿔 놓는다. 한 프레임에 쓰인 것만 남긴다
const labels = new Map(); let labelSeen = new Set();
function labelAt(key, text, x, z, color) {
  let el = labels.get(key); if (!el) { el = document.createElement('div'); el.className = 'nick3'; document.body.appendChild(el); labels.set(key, el); }
  if (el.textContent !== text) el.textContent = text; el.style.color = color || ''; el.style.left = sx(x) * Z + 'px'; el.style.top = (sz(z) - 30) * Z + 'px'; el.style.display = ''; labelSeen.add(key);
}
function endLabels() { for (const [k, el] of labels) if (!labelSeen.has(k)) { el.remove(); labels.delete(k); } labelSeen = new Set(); }
// 먼지·김(보이기만)
const parts = [];
function puff(x, z, col, n, rise) { for (let i = 0; i < n; i++) parts.push({ x: x + (Math.random() - 0.5) * 0.8, z, h: 20 + Math.random() * 6, vh: (rise || 1) * (8 + Math.random() * 6), vx: (Math.random() - 0.5) * 0.6, life: 0.7 + Math.random() * 0.6, col }); if (parts.length > 200) parts.splice(0, parts.length - 200); }
function drawParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.life -= dt; if (q.life <= 0) { parts.splice(i, 1); continue; } q.h += q.vh * dt; q.x += q.vx * dt; g.globalAlpha = Math.min(1, q.life * 1.6); g.fillStyle = q.col; g.fillRect(sx(q.x), sz(q.z) - q.h, 2, 2); }
  g.globalAlpha = 1;
}
const fxPos = () => pl.lastTarget ? [pl.lastTarget.wx, pl.lastTarget.wz] : [p.x, p.z];   // 공용 UI의 연기 효과가 쓸 위치: 방금 누른 대상
function drawNight() {
  const cfg = PLANET[islName] || PLANET.start, night = nightOf(S.min / 60) * cfg.atm;
  if (night > 0.02) { g.fillStyle = `rgba(8,12,48,${(night * 0.5).toFixed(3)})`; g.fillRect(0, 0, VW, VH); }
  if (cfg.tint) { g.fillStyle = 'rgba(' + [(cfg.tint >> 16) & 255, (cfg.tint >> 8) & 255, cfg.tint & 255].join(',') + ',.07)'; g.fillRect(0, 0, VW, VH); }
}
// ---------- 가리킴·건설 미리보기·연결선 ----------
function ring(x, z, rx, ry, col) { g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.ellipse(sx(x), sz(z) + 1, rx, ry, 0, 0, 7); g.stroke(); }
function drawLinks() {
  for (const l of S.links) {
    const a = S.placed.find(x => x.uid === l.a), b = S.placed.find(x => x.uid === l.b);
    if (!a || !b || !visible(a) || !visible(b)) continue;
    const pa = devWorld(a), pb = devWorld(b), on = l.kind === 'heat' ? (a.s.level > 0 && a.s.fuel > 0) : ((a.s.outW || 0) >= 1 || a.s.run);
    const x1 = sx(pa[0]), y1 = sz(pa[2] + 1) - 12, x2 = sx(pb[0]), y2 = sz(pb[2] + 1) - 12;
    g.strokeStyle = l.kind === 'heat' ? (on ? '#ff8a2e' : '#8a5a3a') : (on ? '#4aa3ff' : '#3a5a8a'); g.lineWidth = 2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    if (on) { g.fillStyle = l.kind === 'heat' ? '#ffe27a' : '#bfe3ff'; for (let i = 0; i < 4; i++) { const f = ((tNow * 0.5 + i / 4) % 1); g.fillRect(Math.round(x1 + (x2 - x1) * f) - 1, Math.round(y1 + (y2 - y1) * f) - 1, 3, 3); } }
  }
}
function drawAim() {
  const open = UI.isModalOpen() || !$('title').hidden, label = $('aimlabel');
  const build = pl.mode && pl.mode.startsWith('build:');
  if (build && !open) {   // 건설 미리보기: 2×2 칸 위에 반투명 장치와 초록(지을 수 있음)/빨강 틀
    const c = cellUnderMouse(), id = pl.mode.slice(6);
    if (c) {
      const gc = pl.ghostCheck(id, c), [wx, , wz] = pl.cellWorld(c), x0 = c.plot ? PAD.x0 + c.gx : RX0 + c.gx, z0 = c.plot ? PAD.z0 + c.gz : RZ0 + c.gz;
      g.fillStyle = gc.ok ? 'rgba(102,255,136,.35)' : 'rgba(255,102,102,.4)'; g.fillRect(sx(x0), sz(z0), 2 * PX, 2 * PX);
      g.strokeStyle = gc.ok ? '#66ff88' : '#ff6666'; g.lineWidth = 1; g.strokeRect(sx(x0) + 0.5, sz(z0) + 0.5, 2 * PX - 1, 2 * PX - 1);
      spr(Art.dev[id], wx, wz + 1, 0, false, 0.6);
      label.textContent = gc.ok ? `${DEV[id].name} 짓기 (클릭)` : gc.msg; label.style.display = ''; label.style.left = sx(wx) * Z + 'px'; label.style.top = (sz(z0) - 4) * Z + 'px';
    } else label.style.display = 'none';
    return;
  }
  if (pl.linkFrom && visible(pl.linkFrom)) { const pw = devWorld(pl.linkFrom); ring(pw[0], pw[2] + 1, 17, 6, '#4aa3ff'); }
  const t = open || pl.mode === 'demolish' && !mouse.in ? null : hoverTarget();
  if (t) {
    const b = t.kind === 'water' ? null : boxOf(t), near = t.kind === 'water' ? Math.hypot(t.wx - p.x, t.wz - p.z) <= REACH : inReach(t);
    if (b) ring(t.wx, b.foot, Math.max(8, (b.x1 - b.x0) * PX / 2 + 2), 4, near ? '#ffd84a' : '#8a7a3a');
    else { g.strokeStyle = near ? '#ffd84a' : '#8a7a3a'; g.strokeRect(sx(Math.floor(t.wx)) + 0.5, sz(Math.floor(t.wz)) + 0.5, PX - 1, PX - 1); }
    label.textContent = t.label + (near ? '' : ' (멀어요)'); label.style.display = ''; label.style.left = sx(t.wx) * Z + 'px'; label.style.top = ((b ? sz(b.z0) : sz(t.wz)) - 4) * Z + 'px';
  } else label.style.display = 'none';
}
function render(dt) {
  cam.x = Math.round(p.x * PX) / PX; cam.z = Math.round(p.z * PX) / PX;
  drawWater();
  g.drawImage(ground, sx(MAP.x0), sz(MAP.z0));
  drawRaftCells();
  drawList.length = 0; pushPlazaShips(); pushObjects(); pushDevices(); pushWolves(); pushPlayer();
  drawList.sort((a, b) => (b.bottom ? 1 : 0) - (a.bottom ? 1 : 0) || a.z - b.z);   // 바닥 그림은 먼저, 나머지는 발밑 z가 작은(뒤쪽) 것부터
  for (const e of drawList) e.draw();
  drawLinks(); drawParts(dt); drawAim(); endLabels();
  drawNight();
}

// ---------- 시간·저장·시작·항해 ----------
let last = performance.now();
setInterval(() => { if (Store.paused || (window.Raid && Raid.active)) return; if (Party.canAdvance()) { advance(Party.speed()); pl.pipeStep(); } UI.tick(); refresh(); }, 500);   // 팀이면 시계 담당만 시간을 흘린다
setInterval(() => { Party.tick(); hubTick(); }, 1000);
setInterval(() => { if (islName === 'plaza') loadPubs(); }, 60000);   // 허브에 도킹한 다른 팀의 탐사정 목록
function savePos() { S.fp.x = p.x; S.fp.y = p.y; S.fp.z = p.z; S.fp.yaw = yaw; S.fp.pitch = 0; }
setInterval(() => { savePos(); save(); }, 5000);
addEventListener('pagehide', () => { savePos(); save(true); });
let fpRef = S.fp;
function resetFromState() {
  p.x = S.fp.x; p.y = S.fp.y; p.z = S.fp.z; p.vx = p.vy = p.vz = 0; yaw = S.fp.yaw; face = [-Math.sin(yaw), -Math.cos(yaw)];
  loadIsland(islandName()); if (blocked(p.x, p.y, p.z)) { const f = findFree(); if (f) { p.x = f[0]; p.z = f[1]; p.y = SEA; } }
  loadPlaza(); if (islName === 'plaza') loadPubs();
}
let warping = false;
function onMoved() {
  const f = $('fade'), w = $('warp'); warping = true; w.classList.add('on'); f.style.opacity = 0.85;
  setTimeout(() => { arrive(); f.style.opacity = 1; setTimeout(() => { f.style.opacity = 0; w.classList.remove('on'); warping = false; }, TEST ? 80 : 450); }, TEST ? 50 : 900);
}
function arrive() {   // 새 행성에 도착: 탐사정 위에 선다
  loadIsland(islandName()); const { cx, cz } = raftDims();
  p.x = RX0 + cx / 2; p.z = RZ0 + cz / 2 + (S.placed.length ? cz / 2 - 0.5 : 0); p.y = SEA; p.vx = p.vy = p.vz = 0; face = [0, 1]; yaw = 0;
  const free = findFree(); if (free) { p.x = free[0]; p.z = free[1]; }
  loadPlaza(); if (islName === 'plaza') loadPubs();
}
Party.init({ say, isModalOpen: () => UI.isModalOpen(), onApplied() { ctx.ensureUids(); if (islName && islandName() !== islName) onMoved(); refresh(); } });
UI.init({
  puff(x, y, col, n) { const [wx, wz] = fxPos(); puff(wx, wz, col.startsWith('rgba') ? '#ebf5ff' : col, n); },
  burst(d) { const [x, , z] = devWorld(d); puff(x, z, '#ff7a3d', 14); puff(x, z, '#4a4f56', 10); },
  clearKeys,
  applyWorld() {
    ensureFp();
    if (S.fp !== fpRef) { fpRef = S.fp; resetFromState(); }   // 서버 세이브·처음부터: 위치까지 상태에서 다시 읽는다
    else if (islandName() !== islName) onMoved();              // 궤도 이동
  },
  startBuild: (id) => pl.startBuild(id), startDemolish: () => pl.startDemolish(),
  joinMap() { Party.start(); startWatch(); },
});

// ---------- HUD ----------
const { drawHud } = initHud(pl);
wrapActions();
const hintEl = $('target');
function hint() { const t = !UI.isModalOpen() && mouse.in ? hoverTarget() : null; hintEl.textContent = pl.hintText(t, 'WASD 이동 · Space 점프 · 마우스로 가리켜 클릭 = 열기·채집(바위·얼음은 꾹) · E 가까운 것 열기 · 1~9 도구 · L 연결'); }

// ---------- 프레임 ----------
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; tNow += dt;
  const modalOpen = UI.isModalOpen() || !$('title').hidden || !$('auth').hidden;
  const act = !modalOpen;
  const ax = act ? (keys.right ? 1 : 0) - (keys.left ? 1 : 0) : 0, az = act ? (keys.down ? 1 : 0) - (keys.up ? 1 : 0) : 0;
  if (!Store.paused || TEST) stepPlayer(dt, ax, az, act && keys.jump); else { p.vx = p.vz = 0; }
  if (!UI.isModalOpen()) Sim.setDev(null);
  pl.stepGather(dt);
  stepAcc += Math.hypot(p.vx, p.vz) * dt; render(dt); drawHud(); hint();
  requestAnimationFrame(frame);
}

ensureFp(); loadIsland(islandName());
{ const free = blocked(p.x, p.y, p.z) ? findFree() : null; if (free) { p.x = free[0]; p.z = free[1]; p.y = SEA; } }
refresh(); requestAnimationFrame(frame);
Store.paused = true;
$('t-info').textContent = S.day > 1 || S.qDone > 0 ? `저장된 진행: ${S.day}일차 · 목표 ${S.qDone}/${QUESTS.length}` : '새 게임';
function tdHelp() {
  UI.openModal('도움말', `
    <div class="box"><h4>조작</h4>
      <div>WASD 또는 방향키 = 이동(대각선 가능) · Space = 점프(스프라이트가 뜨고 그림자가 땅에 남아요) · 물속에서는 헤엄 · Space로 수면에서 뛰어올라 탐사정에 오를 수 있어요.</div>
      <div>마우스로 가리키면 이름이 뜨고, <b>클릭</b> = 열기·채집(바위·얼음 덩어리는 꾹 누르기, 바위는 곡괭이 필요) · <b>E</b> = 가까운 장치·자원 열기 · 숫자 키 또는 가방의 도구 선택 후 대상 클릭 = 사용 · Q = 취소 · L = 연결 모드(열선·배관).</div>
      <div>오른쪽 위 아이콘: 건설 · 제작 · 연구 노트 · 기록 · 저장 · 팀. 건설은 장치를 고른 뒤 탐사정 바닥이나 기지 부지의 칸을 클릭하면 놓입니다(초록 = 가능, 빨강 = 불가).</div></div>
    <div class="box"><h4>처음 해 볼 것</h4>
      <div>1. 해안에 불시착한 탐사정 위에서 물 위를 클릭해 바닷물을 뜨고, 건설에서 화덕을 탐사정 바닥에 지으세요.</div>
      <div>2. 나무·모래 더미에서 재료를 모아 증류기를 화덕 옆에 짓고 바닷물을 증류하세요.</div>
      <div>3. 해안의 탐사정 잔해를 고치면 궤도 이동 단말에서 허브 정거장으로 갈 수 있어요. 목표를 달성하면 다른 행성도 열립니다.</div></div>
    <div class="warnbox">모든 장치는 수업에서 배운 식(라울의 법칙, 끓는점 오름·어는점 내림, 이상 기체, 돌턴 분압)을 실제로 계산합니다. 행성마다 대기 압력과 기온이 달라 같은 장치도 다르게 동작합니다. 밤에는 영하로 내려가 얼음 생물이 장치를 부수러 오니 소금을 준비하세요.</div>`,
    null, () => { try { localStorage.setItem(HELP_KEY, '1'); } catch { /* 저장 불가 */ } });
}
window.G.help = tdHelp;
const STORY_KEY = 'chemisle_fp_story_v1';   // fp/와 같은 키: 한 번 본 이야기는 어느 화면에서든 다시 안 나온다
function maybeStory() {
  let seen = false; try { seen = !!localStorage.getItem(STORY_KEY); } catch { /* 무시 */ }
  if (seen || S.day > 1 || S.qDone > 0 || !$('auth').hidden) return false;
  UI.openModal('불시착', STORY_HTML, null, () => { try { localStorage.setItem(STORY_KEY, '1'); } catch { /* 저장 불가 */ } });
  return true;
}
function startGame() {
  if ($('title').hidden) return;
  $('title').hidden = true; Store.paused = false; loadPlaza();
  boot().then(() => { let seen = false; try { seen = !!localStorage.getItem(HELP_KEY); } catch { /* 무시 */ } if ($('auth').hidden && !TEST && maybeStory()) return; if (!seen && $('auth').hidden) tdHelp(); });
}
$('t-start').onclick = startGame;
$('t-help').onclick = () => tdHelp();
installTheme(document.body);   // 우주 테마: 화면의 이름·문구를 치환표(shared/theme.js)로 덮어쓴다
window.__td = { S, p, ctx, cam, pl, stepPlayer, mouse, hoverTarget, nearTarget, cellUnderMouse, setMouseWorld(x, z) { mouse.x = x; mouse.z = z; mouse.in = true; },  island: () => isl, islName: () => islName, show(n) { loadIsland(n); }, view: () => ({ Z, VW, VH }), warping: () => warping };   // 시험(tools/smoketd.js)용 통로
