// 화학 섬 이야기 — 탑다운 2D(td/, 13단계). 1인칭 3D(fp/)와 같은 월드·상태·규칙·서버를 위에서 내려다보는 픽셀 아트 캔버스로 그린다.
// 화학 계산은 chem.js·sim.js를 그대로 쓰고, 지형·이동·팀·교류는 shared/를 fp/와 같이 쓴다. 이 파일은 "화면에 어떻게 그리고 어떻게 조작하는가"만 다룬다.
// 상태는 Store.S + S.fp(위치·시점·녹은 얼음 노드). 저장 키는 fp/와 같은 chemisle_fp_v2, 서버 경로도 같다(window.CHEM_FP).
import { N, SEA, RX0, RZ0, PAD, ISLANDS } from '../shared/gen.js';
import { stepBody, BODY } from '../shared/move.js';
import { makeCtx } from '../shared/ctl.js';
import { installTheme, GAME_TITLE, PLANET, STORY_HTML } from '../shared/theme.js';
import { Party } from '../shared/party.js';
import { HubUI, tick as hubTick, startWatch, loadPubs, hubShips } from '../shared/hub.js';
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
const { ensureFp, raftDims, groundAt, blocked, findFree, islandName, visible, devWorld, melted, wolfDev, wolfWorld } = ctx;
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
function clearKeys() { keys.up = keys.down = keys.left = keys.right = keys.jump = false; }
const KEYMAP = { w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', ' ': 'jump' };
addEventListener('keydown', e => {
  if (!$('modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  if (!$('title').hidden) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startGame(); } return; }
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;
  const k = KEYMAP[e.key.toLowerCase()]; if (k) { keys[k] = true; if (k === 'jump' || e.key.startsWith('Arrow')) e.preventDefault(); }
});
addEventListener('keyup', e => { const k = KEYMAP[e.key.toLowerCase()]; if (k) keys[k] = false; });
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
    const pine = o.type === 'tree' && (islName === 'alpine' || (islName !== 'plaza' && isl.height(o.x, o.z) > SEA + 7));
    const img = o.type === 'tree' && pine ? Art.obj.pine : Art.obj[NODE_SPR[o.type]]; if (!img) continue;
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
let lastTarget = null;   // 공용 UI의 연기 효과가 쓸 위치: 방금 누른 대상(13-d)
const fxPos = () => lastTarget ? [lastTarget.wx, lastTarget.wz] : [p.x, p.z];
function drawNight() {
  const cfg = PLANET[islName] || PLANET.start, night = nightOf(S.min / 60) * cfg.atm;
  if (night > 0.02) { g.fillStyle = `rgba(8,12,48,${(night * 0.5).toFixed(3)})`; g.fillRect(0, 0, VW, VH); }
  if (cfg.tint) { g.fillStyle = 'rgba(' + [(cfg.tint >> 16) & 255, (cfg.tint >> 8) & 255, cfg.tint & 255].join(',') + ',.07)'; g.fillRect(0, 0, VW, VH); }
}
function render(dt) {
  cam.x = Math.round(p.x * PX) / PX; cam.z = Math.round(p.z * PX) / PX;
  drawWater();
  g.drawImage(ground, sx(MAP.x0), sz(MAP.z0));
  drawRaftCells();
  drawList.length = 0; pushPlazaShips(); pushObjects(); pushDevices(); pushWolves(); pushPlayer();
  drawList.sort((a, b) => (b.bottom ? 1 : 0) - (a.bottom ? 1 : 0) || a.z - b.z);   // 바닥 그림은 먼저, 나머지는 발밑 z가 작은(뒤쪽) 것부터
  for (const e of drawList) e.draw();
  drawParts(dt); endLabels();
  drawNight();
}

// ---------- 시간·저장·시작·항해 ----------
let last = performance.now();
setInterval(() => { if (Store.paused || (window.Raid && Raid.active)) return; if (Party.canAdvance()) advance(Party.speed()); UI.tick(); refresh(); }, 500);   // 팀이면 시계 담당만 시간을 흘린다
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
  startBuild() {}, startDemolish() {},
  joinMap() { Party.start(); startWatch(); },
});

// ---------- 프레임 ----------
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; tNow += dt;
  const modalOpen = UI.isModalOpen() || !$('title').hidden || !$('auth').hidden;
  const act = !modalOpen;
  const ax = act ? (keys.right ? 1 : 0) - (keys.left ? 1 : 0) : 0, az = act ? (keys.down ? 1 : 0) - (keys.up ? 1 : 0) : 0;
  if (!Store.paused || TEST) stepPlayer(dt, ax, az, act && keys.jump); else { p.vx = p.vz = 0; }
  if (!UI.isModalOpen()) Sim.setDev(null);
  stepAcc += Math.hypot(p.vx, p.vz) * dt; render(dt);
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
      <div>WASD 또는 방향키 = 이동(대각선 가능) · Space = 점프(스프라이트가 뜨고 그림자가 땅에 남아요) · 물속에서는 헤엄 · Space로 수면에서 뛰어올라 탐사정에 오를 수 있어요.</div></div>
    <div class="warnbox">장치·자원·건설 조작은 단계별로 추가 중입니다(13-c, 13-d). 지금은 걷기, 점프, 헤엄, 땅 그림, 낮밤을 볼 수 있어요.</div>`,
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
window.__td = { S, p, ctx, cam, stepPlayer, island: () => isl, islName: () => islName, show(n) { loadIsland(n); }, view: () => ({ Z, VW, VH }), warping: () => warping };   // 시험(tools/smoketd.js)용 통로
