// 화학 섬 이야기 — 탑다운 2D(td/, 13단계). 1인칭 3D(fp/)와 같은 월드·상태·규칙·서버를 위에서 내려다보는 픽셀 아트 캔버스로 그린다.
// 화학 계산은 chem.js·sim.js를 그대로 쓰고, 지형·이동·팀·교류는 shared/를 fp/와 같이 쓴다. 이 파일은 "화면에 어떻게 그리고 어떻게 조작하는가"만 다룬다.
// 상태는 Store.S + S.fp(위치·시점·녹은 얼음 노드). 저장 키는 fp/와 같은 chemisle_fp_v2, 서버 경로도 같다(window.CHEM_FP).
import { N, SEA, RX0, RZ0, PAD, ISLANDS } from '../shared/gen.js';
import { stepBody, BODY } from '../shared/move.js';
import { makeCtx } from '../shared/ctl.js';
import { installTheme, GAME_TITLE, PLANET, STORY_HTML } from '../shared/theme.js';
import { Party } from '../shared/party.js';
import { bakeGround, PX, MAP } from './ground.js';

const Art = window.Art, S = Store.S;
const { QUESTS } = Sim;
const { $, say, advance, refresh, closeModal, boot, loadPlaza, HELP_KEY } = UI;
const save = Store.save;
const TEST = /[?&]test\b/.test(location.search);   // 시험(tools/smoketd.js)에서는 입력을 바로 받는다
const nightOf = h => h >= 21 || h < 5 ? 1 : h >= 18 ? (h - 18) / 3 : h < 7 ? (7 - h) / 2 : 0;

// ---------- 상태 ----------
const ctx = makeCtx(S);
const { ensureFp, raftDims, groundAt, blocked, findFree, islandName } = ctx;
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
function drawPlayer() {
  const base = Math.max(groundAt(p.x, p.z), SEA), lift = Math.max(0, Math.min(3, p.y - base)) * PX * 0.9, X = sx(p.x), Z0 = sz(p.z);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(X, Z0, 5, 2.5, 0, 0, 7); g.fill();   // 그림자는 땅에 남는다
  const y = Z0 - lift - (p.inW ? -2 : 0);
  g.fillStyle = '#16131f'; g.fillRect(X - 5, y - 15, 10, 15);
  g.fillStyle = '#ffd7a8'; g.fillRect(X - 4, y - 14, 8, 5);   // 얼굴(자리표시자: 13-c에서 스프라이트로 바꾼다)
  g.fillStyle = '#4a7bd8'; g.fillRect(X - 4, y - 9, 8, 8);
}
function drawNight() {
  const cfg = PLANET[islName] || PLANET.start, night = nightOf(S.min / 60) * cfg.atm;
  if (night > 0.02) { g.fillStyle = `rgba(8,12,48,${(night * 0.5).toFixed(3)})`; g.fillRect(0, 0, VW, VH); }
  if (cfg.tint) { g.fillStyle = 'rgba(' + [(cfg.tint >> 16) & 255, (cfg.tint >> 8) & 255, cfg.tint & 255].join(',') + ',.07)'; g.fillRect(0, 0, VW, VH); }
}
function render() {
  cam.x = Math.round(p.x * PX) / PX; cam.z = Math.round(p.z * PX) / PX;
  drawWater();
  g.drawImage(ground, sx(MAP.x0), sz(MAP.z0));
  drawRaftCells();
  drawPlayer();
  drawNight();
}

// ---------- 시간·저장·시작·항해 ----------
let last = performance.now();
setInterval(() => { if (Store.paused || (window.Raid && Raid.active)) return; if (Party.canAdvance()) advance(Party.speed()); UI.tick(); refresh(); }, 500);   // 팀이면 시계 담당만 시간을 흘린다
setInterval(() => { Party.tick(); }, 1000);
function savePos() { S.fp.x = p.x; S.fp.y = p.y; S.fp.z = p.z; S.fp.yaw = yaw; S.fp.pitch = 0; }
setInterval(() => { savePos(); save(); }, 5000);
addEventListener('pagehide', () => { savePos(); save(true); });
let fpRef = S.fp;
function resetFromState() {
  p.x = S.fp.x; p.y = S.fp.y; p.z = S.fp.z; p.vx = p.vy = p.vz = 0; yaw = S.fp.yaw; face = [-Math.sin(yaw), -Math.cos(yaw)];
  loadIsland(islandName()); if (blocked(p.x, p.y, p.z)) { const f = findFree(); if (f) { p.x = f[0]; p.z = f[1]; p.y = SEA; } }
  loadPlaza();
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
  loadPlaza();
}
Party.init({ say, isModalOpen: () => UI.isModalOpen(), onApplied() { ctx.ensureUids(); if (islName && islandName() !== islName) onMoved(); refresh(); } });
UI.init({
  puff() {}, burst() {}, clearKeys,
  applyWorld() {
    ensureFp();
    if (S.fp !== fpRef) { fpRef = S.fp; resetFromState(); }   // 서버 세이브·처음부터: 위치까지 상태에서 다시 읽는다
    else if (islandName() !== islName) onMoved();              // 궤도 이동
  },
  startBuild() {}, startDemolish() {},
  joinMap() { Party.start(); },
});

// ---------- 프레임 ----------
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; tNow += dt;
  const modalOpen = UI.isModalOpen() || !$('title').hidden || !$('auth').hidden;
  const act = !modalOpen;
  const ax = act ? (keys.right ? 1 : 0) - (keys.left ? 1 : 0) : 0, az = act ? (keys.down ? 1 : 0) - (keys.up ? 1 : 0) : 0;
  if (!Store.paused || TEST) stepPlayer(dt, ax, az, act && keys.jump); else { p.vx = p.vz = 0; }
  if (!UI.isModalOpen()) Sim.setDev(null);
  render();
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
