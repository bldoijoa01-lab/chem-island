// 화학 섬 이야기 — 1인칭 3D(fp/, 7단계: 부드러운 지형). 마우스로 둘러보며 걷는다. 블록 채굴은 없고 자원은 노드를 채집한다.
// 화학 계산은 chem.js와 sim.js를 그대로 쓰고(여기서 식을 만들지 않는다), 이 파일은 "어디에 있는가"(위치·충돌·그리기)만 다룬다.
// 상태는 Store.S(= Sim 상태) + S.fp(위치·시점·녹은 얼음 노드). 2D 전용 S.px·S.py는 쓰지 않는다. 저장 키는 chemisle_fp_v2(2D·옛 복셀 버전과 따로).
import * as THREE from 'three';
import { N, SEA, SEABED, RX0, RZ0, PAD, ISLANDS, OFFSET, Island } from './gen.js';
import { buildIslandGeometry, STEP_NEAR, STEP_FAR } from './terrain.js';
import { makeObject, makeDevice, makeWolf, makePlayerModel, makeRaft } from './models.js';
import { installTheme, themed, GAME_TITLE } from './theme.js';
import { Party } from './party.js';
import { HubUI, tick as hubTick, startWatch, loadPubs, hubShips } from './hub.js';

const C = Chem, Art = window.Art, S = Store.S;
const { ITEM, NODE, DIG, TOOL, STONE, ICE, ICE_TILE_G, SHAKE_G } = World;
const { DEV, QUESTS, FIRE_T, FIRE_NAME } = Sim;
const { $, fmt, say, flush, advance, refresh, closeModal, interact, openBuild, openCraft, openLog, openHelp, openSave, boot, loadPlaza, api, capText, pAtm, HELP_KEY } = UI;
const save = Store.save;
const TEST = /[?&]test\b/.test(location.search);   // 시험(tools/smokefp.js)에서는 포인터 잠금 없이 조작을 받는다

// 블록 채굴을 없앤 대신 새로 생긴 자원 노드(fp에서만): 2D의 DIG 값(돌: 곡괭이 필요·2.0초, 얼음: 1.0초)을 채집 조건으로 읽는다. [아이템, 1회 양, 하루 상한, 이름, 높이]
Object.assign(NODE, { rock: ['stone', 1, 4, '바위 (곡괭이 필요)', 8], iceblock: ['ice', 1, 3, '얼음 덩어리', 8] });
const HOLD = { rock: DIG[STONE], iceblock: DIG[ICE] };   // 꾹 눌러 캐는 노드와 걸리는 시간 {item, t, tool}
// 땅 파기를 전제한 문구는 fp에서 보이는 것만 채집으로 바꾼다(2D 문구는 그대로)
Sim.QUESTS[10].t = '극지 섬에서 소금 뿌리개로 얼음 덩어리 1개를 녹이세요';
Sim.RECIPES.find(r => r.id === 'pickaxe').note = '바위·암염을 캘 수 있다 (광장 보급 상자에서 처음 돌을 얻는다)';
Sim.RECIPES.find(r => r.id === 'thermo').note = '장치와 공기의 온도를 읽는다';

// ---------- 1인칭 전용 상수: 모두 "가정(임의값)" (DESIGN.md §4-15) ----------
const WALK = 72 / 16, SWIM = 42 / 16, JUMP = 270 / 16, GRAV = 900 / 16, GRAV_W = 300 / 16, FALL_MAX = 400 / 16, FALL_W = 70 / 16;   // 2D의 px/s를 16 px = 1 m로 바꾼 값
const SURF_JUMP = 16.5;         // 수면에서 뛰어오르는 속도(m/s) → 약 2.4 m: 수면에 떠서 뗏목 바닥(수면과 같은 높이)에 오를 수 있게(2D는 15 m/s)
const SLOPE_TAN = Math.tan(40 * Math.PI / 180);   // 걸어서 오를 수 있는 기울기 한계 40°(가정). 지형은 26.6° 이하로 만들어 어디든 오르고, 더 가파른 턱은 점프로만 넘는다
const SNAP_DOWN = 0.5;          // 내리막에서 발이 땅을 따라가는 최대 높이 차(m, 가정). 더 큰 낭떠러지는 떨어진다
const HALF = 0.3, BODY = 1.8, EYE = 1.6;   // 몸 폭 0.6 m, 키 1.8 m, 눈높이 1.6 m
const REACH = 5;                // 손이 닿는 거리(m)
const SENS = 0.0022;            // 마우스 감도(rad/px)
const FOV = 70, VIEW = 220;     // 시야각(°), 안개가 끝나는 거리(m)
const COLL = { tree: 0.45, rock: 0.9, iceblock: 0.8, rocksalt: 0.6, icecrystal: 0.45, box: 0.6, board: 0.5, harbor: 0.4, altar: 1.0 };   // 가정(임의값) 자원·시설 충돌 반지름(m). 높이 2.2 m 넘게 뛰면 위로 지나간다
const COLL_H = 2.2;
const nightOf = h => h >= 21 || h < 5 ? 1 : h >= 18 ? (h - 18) / 3 : h < 7 ? (7 - h) / 2 : 0;

// ---------- 상태 ----------
function ensureFp() {
  if (!S.fp) S.fp = { x: RX0 - 3.5, y: SEA + 2, z: RZ0 + 2.5, yaw: -Math.PI / 2, pitch: 0, melted: {} };
  if (!S.fp.melted) S.fp.melted = {};
  delete S.fp.mods;   // 예전 복셀 버전의 파낸 칸 기록은 쓰지 않는다
  Sim.geo.adjacent = (a, b) => Math.abs(a.x - b.x) <= 3 && Math.abs(a.y - b.y) <= 3;   // 격자 바닥: 2x2 장치 사이가 한 칸 이내(장치의 x, y = 격자 칸 x, z)
  // 10단계 고리: 지표 부지 장치는 그 행성의 환경을, 열선으로 연결된 화덕은 열원이 된다(계산식은 그대로, 기본값은 sim.js가 가진 2D 동작)
  Sim.geo.island = (S_, d) => d && d.plot ? d.plot : Sim.dockOf(S_).island;
  Sim.geo.heatSources = (S_, d) => {
    const out = S_.placed.filter(f => f !== d && f.id === 'fire' && Sim.geo.adjacent(f, d));
    for (const l of (S_.links || [])) if (l.kind === 'heat' && l.b === d.uid) { const f = S_.placed.find(x => x.uid === l.a); if (f && f.id === 'fire' && !out.includes(f)) out.push(f); }
    return out;
  };
  if (!Array.isArray(S.links)) S.links = [];
  ensureUids();
}
// 장치 uid(연결선이 가리킨다): 건설 때 팀 번호표(S.team.seq)로 부여한다. 예전 세이브의 장치에도 채운다
function nextUid() { if (!S.team) S.team = {}; S.team.seq = (S.team.seq || 0) + 1; return 'd' + S.team.seq; }
function ensureUids() { for (const d of S.placed) if (!d.uid) d.uid = nextUid(); }
ensureFp();
const p = { x: S.fp.x, y: S.fp.y, z: S.fp.z, vx: 0, vy: 0, vz: 0, onGround: false, inW: false };
let yaw = S.fp.yaw, pitch = S.fp.pitch;
const raftDims = () => { const cx = S.raft.cells; return { cx, cz: Math.min(8, 4 + Math.floor((cx - 4) / 2)) }; };   // 가정(임의값) 뗏목 격자 = cells × (4 + (cells−4)/2): 4×4 → 12×8
const islandName = () => Sim.dockOf(S).island;

// ---------- 장면 ----------
const host = $('gl');
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 1000);
const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x6b5a3a, 0.7), sunL = new THREE.DirectionalLight(0xffffff, 0.7);   // 반구 조명(하늘색 위, 땅색 아래) + 해/달 방향광
scene.add(hemi, sunL, sunL.target);
function fit() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', fit); fit();
const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const texCache = new Map();
const tex = (cv) => { let t = texCache.get(cv); if (!t) { t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; texCache.set(cv, t); } return t; };
// ---------- 섬(매끈한 높이 지형) ----------
let isl = null, islName = '', terrainMesh = null, farGroup = new THREE.Group(), objGroup = new THREE.Group(), raftMesh = null, raftSig = '';
scene.add(farGroup, objGroup);
const raftCell = (x, z) => { const { cx, cz } = raftDims(); return x >= RX0 && x < RX0 + cx && z >= RZ0 && z < RZ0 + cz; };
// 발 아래 높이: 지형 높이장(쌍선형)과 뗏목 바닥(칸마다 SEA 높이의 평면) 중 높은 것
const groundAt = (x, z) => { const t = isl.height(x, z); return raftCell(Math.floor(x), Math.floor(z)) ? Math.max(t, SEA) : t; };
function setTerrain() {
  if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); }
  terrainMesh = new THREE.Mesh(buildIslandGeometry(THREE, isl, STEP_NEAR), terrainMat); terrainMesh.frustumCulled = false; scene.add(terrainMesh);
}
// 멀리 보이는 다른 섬: 같은 height()를 성긴 격자(STEP_FAR)로 그린 매끈한 실루엣. 한 번 만들어 두고 위치만 활성 섬 기준으로 옮긴다
const farCache = {};
function farIsland(name) {
  if (!farCache[name]) farCache[name] = new THREE.Mesh(buildIslandGeometry(THREE, new Island(name), STEP_FAR), terrainMat);
  return farCache[name];
}
function setFar() {
  farGroup.clear();
  for (const n of ISLANDS) if (n !== islName) { const mm = farIsland(n).clone(), o = new THREE.Group(); mm.frustumCulled = false; o.add(mm); o.position.set(OFFSET[n][0] - OFFSET[islName][0], 0, OFFSET[n][1] - OFFSET[islName][1]); farGroup.add(o); }
}

// ---------- 자원·시설·장치·늑대 모형 ----------
const OBJ_R = { trade: 1.2, reports: 1.2, boards: 1.2, signs: 1.2, project: 1.2, tree: 1.5, altar: 1.6, harbor: 1.0, board: 1.0, box: 1.0, fragment: 1.0, rock: 1.3, iceblock: 1.2 };   // 조준 반지름(m)
const objMeshes = new Map(), devMeshes = new Map(), wolfMeshes = new Map();
// 뗏목·장치·뗏목 위의 늑대는 파도에 출렁이는 것처럼 보이게 같은 값만큼 오르내린다(보이기만: 위치·충돌·계산에는 쓰지 않는다).
// 뗏목 위에 서 있으면 카메라도 같은 값만큼 움직여 어지럽지 않게 한다. 가정(임의값): 진폭 약 0.07 m
const raftBob = (t) => 0.045 * Math.sin(t * 1.3) + 0.025 * Math.sin(t * 2.1 + 1);
let bobNow = 0;
function buildObjects() {
  objGroup.clear(); objMeshes.clear();
  for (const o of isl.objs) {
    const pine = o.type === 'tree' && (islName === 'alpine' || (islName !== 'plaza' && isl.height(o.x, o.z) > SEA + 7));
    const g = makeObject(o.type, { pine }); g.position.set(o.x, o.y, o.z); g.rotation.y = (o.x * 12.9898 + o.z * 78.233) % 6.28;
    objGroup.add(g); objMeshes.set(o, g);
  }
}
const melted = o => S.fp.melted[o.id] === S.day;   // 소금에 녹은 얼음 노드는 그날 하루 사라진다(다음 날 다시 자란다)
function updateObjects(t) {
  for (const [o, g] of objMeshes) {
    const n = NODE[o.type], spent = n && (S.nodes[o.id] || 0) >= n[2];
    g.visible = o.type === 'fragment' ? !S.f.raft : !melted(o);
    g.scale.setScalar(spent ? 0.65 : 1);   // 오늘 다 캔 노드는 작아 보인다
    if (g.userData.glow) { g.userData.glow.visible = !S.f.boss; g.userData.glow.material.opacity = 0.55 + 0.35 * Math.sin(t * 3); }   // 골렘이 남아 있으면 제단이 깜빡인다(2D와 같음)
  }
}
// 지표 부지 장치(d.plot = 행성 id)는 전역 좌표 x = 100 + 20 × 행성 번호 + 칸으로 저장해 탐사정 장치·다른 행성 장치와 겹치지 않는다(DESIGN §4-18)
const PLOT_OFF = (plot) => 100 + ISLANDS.indexOf(plot) * 20;
const visible = (d) => !d.plot || d.plot === islName;   // 지표 부지 장치는 그 행성에 있을 때만 보이고 조작할 수 있다(시간은 계속 흐른다)
function devWorld(d) { if (d.plot) return [PAD.x0 + (d.x - PLOT_OFF(d.plot)) + 1, isl.padH, PAD.z0 + d.y + 1]; return [RX0 + d.x + 1, SEA, RZ0 + d.y + 1]; }   // 장치(2×2)의 가운데 바닥
const devBob = (d) => d.plot ? 0 : bobNow;   // 탐사정 위 장치만 출렁인다
const wolfDev = (m) => S.placed.find(x => x.x === m.dx && x.y === m.dy);
const wolfWorld = (m) => { const d = wolfDev(m); const [x, y, z] = d && visible(d) ? devWorld(d) : [RX0, SEA, RZ0]; return [x + (m.id % 2 ? 2.2 : -2.2), y, z]; };
const topMat = new THREE.MeshLambertMaterial({ color: 0x6b6f78 });
function devModel(id) { const root = makeDevice(id); return { root, parts: root.userData.parts }; }
function animDevice(g, d, t) {   // 장치 상태를 모양에 반영(보이기만)
  const P = g.parts, s = d.s;
  P.bad.visible = !!s.broken;
  if (P.flame) { const on = s.level > 0 && s.fuel > 0, k = on ? 0.55 + s.level * 0.3 + 0.12 * Math.sin(t * 14 + s.level) : 0; P.flame.visible = P.core.visible = on; P.flame.scale.set(k, k * (1 + 0.15 * Math.sin(t * 11)), k); P.core.scale.set(k, k, k); }
  if (P.liquid) { const f = Math.max(0.12, Math.min(1, (s.w || 0) / 300)); P.liquid.visible = (s.w || 0) > 0; P.liquid.scale.set(1, 0.55 * f, 1); }
  if (P.weight) P.weight.position.y = 1.65 + (s.run ? 0.06 * Math.abs(Math.sin(t * 9)) : 0);
  if (P.done) P.done.visible = !!s.done, P.done.position.y = 2.1 + Math.sin(t * 6) * 0.08;
}
function syncDevices(t) {
  const vis = S.placed.filter(visible), live = new Set(vis);
  for (const [d, g] of devMeshes) if (!live.has(d)) { scene.remove(g.root); devMeshes.delete(d); }
  for (const d of vis) {
    let g = devMeshes.get(d);
    if (!g) { g = devModel(d.id); scene.add(g.root); devMeshes.set(d, g); }
    const [x, y, z] = devWorld(d); g.root.position.set(x, y + devBob(d), z);
    animDevice(g, d, t);
    if ((d.id === 'still' || d.id === 'cooker') && d.s.run && Math.random() < 0.25) puff(x, y + 1.9, z, '#ebf5ff', 1);
    if (d.id === 'fire' && d.s.level > 0 && Math.random() < 0.1 * d.s.level) puff(x, y + 1, z, '#ffb347', 1);
  }
}
function syncWolves(t) {
  const live = new Set(S.mobs.filter(mb => { const d = wolfDev(mb); return !d || visible(d); }));
  for (const [mb, g] of wolfMeshes) if (!live.has(mb)) { scene.remove(g); wolfMeshes.delete(mb); }
  for (const mb of live) {
    let g = wolfMeshes.get(mb); if (!g) { g = makeWolf(); scene.add(g); wolfMeshes.set(mb, g); }
    const [x, y, z] = wolfWorld(mb), a = 0.45 + 0.55 * Math.max(0, mb.M / mb.M0);
    g.position.set(x, y + (wolfDev(mb) && wolfDev(mb).plot ? 0 : bobNow), z); g.rotation.y = Math.atan2(p.x - x, p.z - z) - Math.PI / 2;   // 모델은 +x를 향한다 → 플레이어 쪽으로
    g.userData.mats.forEach(mm => { mm.opacity = a; });
    g.userData.legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 6 + i * 1.6) * 0.18; });
  }
}
// 뗏목 바닥(나무판 + 통나무 부표): 격자 크기가 바뀌면 다시 만든다. 윗면이 SEA에 맞는다(충돌은 groundAt이 SEA 평면으로 처리)
function syncRaft() {
  const { cx, cz } = raftDims(), sig = cx + 'x' + cz + islName; if (sig === raftSig) return; raftSig = sig;
  if (raftMesh) scene.remove(raftMesh);
  raftMesh = makeRaft(cx, cz, SEA, RX0, RZ0); scene.add(raftMesh);
}

// 행성 지표 기지 부지: 평평한 지반 8 × 8 m에 회색 바닥판과 1 m 격자선을 얹는다(보이기만)
let padMesh = null;
function setPad() {
  if (padMesh) scene.remove(padMesh);
  padMesh = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(PAD.cx, PAD.cz), new THREE.MeshLambertMaterial({ color: 0x8d949e })); slab.rotation.x = -Math.PI / 2; slab.position.set(PAD.x0 + PAD.cx / 2, isl.padH + 0.03, PAD.z0 + PAD.cz / 2);
  const grid = new THREE.GridHelper(PAD.cx, PAD.cx, 0x5b6573, 0x5b6573); grid.position.set(PAD.x0 + PAD.cx / 2, isl.padH + 0.05, PAD.z0 + PAD.cz / 2);
  padMesh.add(slab, grid); scene.add(padMesh);
}
function loadIsland(name) {
  islName = name; isl = new Island(name);
  setTerrain(); setPad(); setFar(); buildObjects(); raftSig = ''; syncRaft();
}

// ---------- 광장: 다른 플레이어(presence)와 정박한 남의 뗏목(읽기 전용) ----------
const PRES_HZ = 100;   // 위치를 서버에 보내는 간격(ms) = 10 Hz
let presMap = null, lastPos = '', lastPosAt = 0;
const peerMeshes = {};
const posPacket = () => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, z: Math.round(p.z * 100) / 100, yaw: Math.round(yaw * 100) / 100, air: !p.onGround });
function joinPresence() {   // 광장섬에서만 서로 보인다(시작섬은 내 섬)
  if (!(window.Net && Net.user)) return;
  const want = islName === 'plaza' ? 'fp-plaza' : null;
  if (want === presMap) return;
  presMap = want; for (const id in peerMeshes) dropPeer(id);
  if (want) Net.joinMap(want, posPacket()); else Net.leaveMap();
}
function dropPeer(id) { scene.remove(peerMeshes[id].m); peerMeshes[id].label.remove(); delete peerMeshes[id]; }
function netStep(dt, now) {
  if (!(window.Net && Net.user) || !presMap || Store.paused) return;
  if (now - lastPosAt >= PRES_HZ) { const pk = posPacket(), k = JSON.stringify(pk); if (k !== lastPos || now - lastPosAt > 5000) { lastPos = k; lastPosAt = now; Net.sendPos(pk); } }
  const a = 1 - Math.exp(-dt * 14);
  for (const id in Net.peers) {
    const q = Net.peers[id]; if (typeof q.x !== 'number' || typeof q.z !== 'number') continue;
    let g = peerMeshes[id];
    if (!g) { const label = document.createElement('div'); label.className = 'nick3'; document.body.appendChild(label); let hue = 0; for (const ch of id) hue = (hue * 31 + ch.charCodeAt(0)) % 360; const mm = makePlayerModel(hue / 360); scene.add(mm); g = peerMeshes[id] = { m: mm, label, x: q.x, y: q.y, z: q.z }; }
    g.x += (q.x - g.x) * a; g.y += (q.y - g.y) * a; g.z += (q.z - g.z) * a;
    g.m.position.set(g.x, g.y, g.z); g.m.rotation.y = q.yaw !== undefined ? q.yaw : 0; g.label.textContent = q.nick || '';
  }
  for (const id in peerMeshes) if (!Net.peers[id]) dropPeer(id);
}
const lv = new THREE.Vector3();
function placeLabels() {
  for (const id in peerMeshes) { const g = peerMeshes[id]; lv.set(g.x, g.y + 2.1, g.z).project(camera); g.label.style.left = ((lv.x + 1) / 2 * innerWidth) + 'px'; g.label.style.top = ((1 - lv.y) / 2 * innerHeight) + 'px'; g.label.style.display = lv.z < 1 ? '' : 'none'; }
}
// 정박한 남의 뗏목: 광장섬 앞바다에 내 뗏목 북쪽으로 10칸 간격으로 세 척까지(2D의 drawPlazaRafts와 같은 읽기 전용 표시)
let plazaGroup = new THREE.Group(), plazaSig = '';
scene.add(plazaGroup);
const rcz = cells => Math.min(8, 4 + Math.floor((cells - 4) / 2));
function syncPlaza() {
  const rafts = islName === 'plaza' ? hubShips().concat(UI.plazaRafts()).slice(0, 3) : [], sig = islName + JSON.stringify(rafts.map(r => [r.nick, r.cells, (r.devs || []).length]));
  if (sig === plazaSig) return; plazaSig = sig;
  scene.remove(plazaGroup); plazaGroup = new THREE.Group();
  rafts.forEach((r, i) => {
    const cx = Math.max(2, Math.min(12, r.cells | 0)), cz = rcz(cx), z0 = RZ0 - 10 * (i + 1);
    plazaGroup.add(makeRaft(cx, cz, SEA, RX0, z0));
    for (const d of (r.devs || [])) if (d && ['fire', 'still', 'cooker', 'cooler', 'collector'].includes(d.id) && d.u >= 0 && d.u + 2 <= cx) { const g = makeDevice(d.id); g.position.set(RX0 + d.u + 1, SEA, z0 + (d.z | 0) + 1); g.userData.parts.bad.visible = !!d.broken; plazaGroup.add(g); }
    const label = document.createElement('div'); label.className = 'nick3'; label.textContent = r.nick || ''; if (r.color) label.style.color = r.color; label.dataset.plaza = '1'; document.body.appendChild(label);
    plazaGroup.userData.labels = (plazaGroup.userData.labels || []).concat([[label, RX0 + cx / 2, SEA + 3, z0 + cz / 2]]);
  });
  scene.add(plazaGroup);
  document.querySelectorAll('.nick3[data-plaza]').forEach(el => { if (!(plazaGroup.userData.labels || []).some(l => l[0] === el)) el.remove(); });
}
function placePlazaLabels() {
  for (const [el, x, y, z] of (plazaGroup.userData.labels || [])) { lv.set(x, y, z).project(camera); el.style.left = ((lv.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - lv.y) / 2 * innerHeight) + 'px'; el.style.display = lv.z < 1 ? '' : 'none'; }
}

// ---------- 하늘·바다·낮밤 ----------
// 바다: 카메라를 따라다니는 격자(SEA_STEP 간격). 정점을 세계 좌표의 사인파 합으로 출렁이게 하고 법선도 기울인다. 보이기만 한다(헤엄·충돌은 평평한 SEA 기준)
const SEA_STEP = 3, SEA_N = 150, WAVE = 0.28;   // 가정(임의값) 격자 간격 3 m × 150칸(±225 m), 파도 높이 약 ±0.3 m
const seaUniforms = { uT: { value: 0 }, uAmp: { value: 1 } };
const seaGeo = new THREE.PlaneGeometry(SEA_STEP * SEA_N, SEA_STEP * SEA_N, SEA_N, SEA_N); seaGeo.rotateX(-Math.PI / 2);
const seaMat = new THREE.MeshLambertMaterial({ color: 0x2f86c8, transparent: true, opacity: 0.8, depthWrite: false });
seaMat.onBeforeCompile = (sh) => {
  sh.uniforms.uT = seaUniforms.uT; sh.uniforms.uAmp = seaUniforms.uAmp;
  const wave = 'float wv(vec2 p){ return 0.5*sin(p.x*0.55+uT*1.2)+0.35*sin(p.y*0.8-uT*0.9)+0.25*sin((p.x+p.y)*1.3+uT*1.9); }';
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;\nuniform float uAmp;\n' + wave)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      vec4 wp0 = modelMatrix * vec4(position, 1.0); float e = 0.5;
      float dx = (wv(wp0.xz + vec2(e, 0.0)) - wv(wp0.xz - vec2(e, 0.0))) / (2.0 * e), dz = (wv(wp0.xz + vec2(0.0, e)) - wv(wp0.xz - vec2(0.0, e))) / (2.0 * e);
      objectNormal = normalize(vec3(-dx * ${WAVE.toFixed(2)} * uAmp, 1.0, -dz * ${WAVE.toFixed(2)} * uAmp));`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.y += wv((modelMatrix * vec4(position, 1.0)).xz) * ${WAVE.toFixed(2)} * uAmp;`);
};
const sea = new THREE.Mesh(seaGeo, seaMat); sea.frustumCulled = false; scene.add(sea);
// 하늘 돔: 꼭대기 색에서 수평선 색으로(Art.sky의 시각별 색을 그대로 쓴다). 안개 색은 수평선 색
const skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() } };
const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 12), new THREE.ShaderMaterial({ uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying float vY; void main(){ gl_FragColor = vec4(mix(hor, top, pow(clamp(vY, 0.0, 1.0), 0.55)), 1.0); }' }));
dome.frustumCulled = false; scene.add(dome);
const stars = (() => { const n = 260, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = ((i * 97.31) % 1000) / 1000 * Math.PI * 2, e = 0.15 + ((i * 53.77) % 1000) / 1000 * 1.2; pos[i * 3] = Math.cos(a) * Math.cos(e) * 400; pos[i * 3 + 1] = Math.sin(e) * 400; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 400; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const s = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false })); s.frustumCulled = false; scene.add(s); return s; })();
const mkDisc = (cv) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: tex(cv), transparent: true, alphaTest: 0.4, fog: false, depthWrite: false })); scene.add(m); return m; };
const sunM = mkDisc(Art.sun), moonM = mkDisc(Art.moon);
// 행성별 하늘·바다 표현(우주 테마, 보이기만): atm = 대기 두께(0이면 진공: 검은 하늘과 별, 안개 없음), 바다 색·불투명도·파도 크기 배율. 모두 가정(임의값)
const PLANET = {
  start: { atm: 1, sea: 0x2f86c8, seaOp: 0.8, wave: 1, tint: 0 },         // 불시착 행성: 바다가 있는 지구형
  plaza: { atm: 0, sea: 0x070b1c, seaOp: 0.96, wave: 0, tint: 0 },        // 허브 정거장: 진공, 발밑 너머는 어두운 공간
  alpine: { atm: 0.6, sea: 0x6b5a9c, seaOp: 0.88, wave: 0.5, tint: 0x7a5fb0 },   // 저기압 고원 행성: 옅은 보랏빛 대기
  polar: { atm: 0.45, sea: 0xa8dcec, seaOp: 0.97, wave: 0.15, tint: 0x9fd0e8 },  // 얼음 위성: 얼어붙은 바다
};
const SPACE_TOP = new THREE.Color(0x02040c), SPACE_BOT = new THREE.Color(0x05070f);
const sunDirV = new THREE.Vector3();
function sky(dt) {
  const hour = S.min / 60, night = nightOf(hour), [top0, hor0] = Art.sky(hour, 2), cfg = PLANET[islName] || PLANET.start;
  const topC = new THREE.Color(top0), horC = new THREE.Color(hor0);
  if (cfg.tint) { topC.lerp(new THREE.Color(cfg.tint), 0.35); horC.lerp(new THREE.Color(cfg.tint), 0.35); }
  const top = SPACE_TOP.clone().lerp(topC, cfg.atm), hor = SPACE_BOT.clone().lerp(horC, cfg.atm);   // 대기가 얇을수록 우주색
  skyU.top.value.copy(top); skyU.hor.value.copy(hor); dome.position.copy(camera.position);
  scene.fog = new THREE.Fog(hor.clone(), 60, cfg.atm > 0 ? VIEW : 900);
  // 해와 달: 낮 12시간 / 밤 12시간에 반원을 그린다. 방향광은 떠 있는 쪽(해가 지면 달)에서 비춘다
  const sunT = (hour - 6) / 12, moonT = ((hour + 6) % 24) / 12, up = sunT >= 0 && sunT <= 1 ? Math.sin(sunT * Math.PI) : 0;
  const disc = (mm, t) => { mm.visible = t >= 0 && t <= 1; const a = t * Math.PI; mm.position.set(camera.position.x - Math.cos(a) * 420, camera.position.y + Math.sin(a) * 380 - 20, camera.position.z - 160); mm.lookAt(camera.position); return mm.position; };
  const sp = disc(sunM, sunT), mp = disc(moonM, moonT);
  const lightFrom = up > 0.02 ? sp : mp;
  sunDirV.copy(lightFrom).sub(camera.position).normalize(); sunL.position.copy(camera.position).addScaledVector(sunDirV, 100); sunL.target.position.copy(camera.position);
  sunL.color.set(up > 0.02 ? (up < 0.25 ? 0xffc08a : 0xffffff) : 0x9fb4ff);
  sunL.intensity = up > 0.02 ? 0.35 + 0.55 * Math.sqrt(up) : 0.22;
  hemi.intensity = (0.72 - night * 0.42) * (0.45 + 0.55 * cfg.atm); hemi.color.copy(hor).lerp(new THREE.Color(0xffffff), 0.45);
  stars.material.opacity = Math.max(night, 1 - cfg.atm * 0.9); stars.position.copy(camera.position);   // 대기가 얇을수록 낮에도 별이 보인다
  // 바다는 카메라를 따라다니되 격자 간격 단위로만 움직여 파도가 미끄러지지 않게 한다. 평균 수면은 SEA보다 0.35 m 낮게 두어 파도 마루(+0.31)가 뗏목 바닥(SEA)을 덮지 않게 한다
  sea.position.set(Math.round(camera.position.x / SEA_STEP) * SEA_STEP, SEA - 0.35, Math.round(camera.position.z / SEA_STEP) * SEA_STEP);
  seaUniforms.uT.value = tNow;
  seaMat.color.set(cfg.sea).multiplyScalar(0.45 + 0.55 * (1 - night * 0.7)); seaMat.opacity = cfg.seaOp; seaUniforms.uAmp.value = cfg.wave;
  $('uw').style.opacity = camera.position.y < SEA - 0.1 ? 1 : 0;   // 물속 색조
}

// ---------- 파티클 ----------
const PMAX = 300, pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), parts = [];
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3)); pGeo.setDrawRange(0, 0);
const pPts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, transparent: true, fog: false })); pPts.frustumCulled = false; scene.add(pPts);
function puff(x, y, z, col, n) { const c = new THREE.Color(col); for (let i = 0; i < n; i++) parts.push({ x, y, z, vx: (Math.random() - 0.5) * 1.5, vy: 0.8 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 1.5, life: 0.6 + Math.random() * 0.5, c }); if (parts.length > PMAX) parts.splice(0, parts.length - PMAX); }
function stepParts(dt) {
  for (const q of parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.life -= dt; }
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
  parts.forEach((q, i) => { pPos.set([q.x, q.y, q.z], i * 3); pCol.set([q.c.r, q.c.g, q.c.b], i * 3); });
  pGeo.setDrawRange(0, parts.length); pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}
let lastTarget = null;   // 공용 UI의 연기 효과(H.puff)가 쓸 위치: 방금 누른 대상
const fxPos = () => lastTarget ? [lastTarget.wx, lastTarget.wy, lastTarget.wz] : [p.x, p.y + 1, p.z];

// ---------- 충돌·이동 ----------
// 몸(반지름 HALF)이 자원·시설·장치에 막히는가. 자원은 원기둥(COLL), 장치는 2×2 상자. 높이를 넘으면 위로 지나간다
function blocked(x, y, z) {
  for (const o of isl.objs) { const r = COLL[o.type]; if (r && !(o.type === 'fragment') && !(melted(o)) && Math.hypot(x - o.x, z - o.z) < r + HALF && y < o.y + COLL_H) return true; }
  for (const d of S.placed) { if (!visible(d)) continue; const [wx, wy, wz] = devWorld(d); if (Math.abs(x - wx) < 1 + HALF && Math.abs(z - wz) < 1 + HALF && y < wy + 1.8) return true; }
  return false;
}
let seaHintAt = 0;
// 한 걸음: 발 아래 높이가 낮아지면 따라가고(SNAP_DOWN까지), 높아지면 기울기가 SLOPE_TAN 이하일 때만 오른다. 자동 오르기(계단)는 없다
function tryMove(nx, nz) {
  if (blocked(nx, p.y, nz) && !blocked(p.x, p.y, p.z)) return false;
  const g = groundAt(nx, nz);
  if (g <= p.y + 1e-4) { if (p.onGround && p.y - g <= SNAP_DOWN) p.y = g; p.x = nx; p.z = nz; return true; }
  if (p.onGround) { const d = Math.hypot(nx - p.x, nz - p.z); if (g - p.y <= SLOPE_TAN * d + 1e-4) { p.y = g; p.x = nx; p.z = nz; return true; } }
  return false;
}
function stepPlayer(dt, ax, az, jump) {
  p.inW = p.y + BODY / 2 < SEA - 0.05;
  const sp = p.inW ? SWIM : WALK, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  let mx = fx * az + rx * ax, mz = fz * az + rz * ax; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  p.vx = mx * sp; p.vz = mz * sp;
  if (jump) {
    if (p.onGround) { p.vy = JUMP; p.onGround = false; }   // 바닥을 딛고 있으면 물속에서도 뛴다(2D와 같은 규칙)
    else if (p.inW) { const surface = p.y + BODY >= SEA - 0.05; p.vy = surface ? SURF_JUMP : Math.min(p.vy + 700 / 16 * dt, 60 / 16); }
  }
  p.vy = Math.max(p.vy - (p.inW ? GRAV_W : GRAV) * dt, -(p.inW ? FALL_W : FALL_MAX));
  if (!tryMove(p.x + p.vx * dt, p.z)) { /* x 막힘 */ }
  if (!tryMove(p.x, p.z + p.vz * dt)) { /* z 막힘 */ }
  { const lo = -12, hi = N + 24; if (p.x < lo || p.x > hi || p.z < -12 || p.z > N + 12) { p.x = Math.max(lo, Math.min(hi, p.x)); p.z = Math.max(-12, Math.min(N + 12, p.z)); const t = performance.now(); if (t - seaHintAt > 5000) { seaHintAt = t; say('더 멀리 갈 수 없어요. 탐사정으로 궤도 이동하세요 (궤도 이동 단말).'); } } }
  const g = groundAt(p.x, p.z), ny = p.y + p.vy * dt;
  if (ny <= g && p.vy <= 0) { p.y = g; p.vy = 0; p.onGround = true; }
  else { p.y = Math.max(ny, g); if (ny < g) p.vy = 0; p.onGround = p.y <= g + 1e-4 && p.vy <= 0; }
}

// ---------- 시선: 지형 가림 + 대상 ----------
const dirV = new THREE.Vector3(), eyeV = new THREE.Vector3();
function lookRay() { camera.getWorldDirection(dirV); eyeV.copy(camera.position); return [eyeV, dirV]; }
// 시선이 지형(뗏목 바닥 포함)에 닿는 거리. 닿지 않으면 null. 지형 자체는 집지 않고, 대상이 가려졌는지만 본다
function terrainHit(o, d, maxD) { for (let t = 0; t <= maxD; t += 0.25) { if (o.y + d.y * t < groundAt(o.x + d.x * t, o.z + d.z * t)) return t; } return null; }

// ---------- 상호작용 대상(공용 ui.js의 interact가 받는 모양 { kind, ref, label }) ----------
// 설정 오류 안내: 열이 필요한데 열원이 없거나(옆 화덕도 열선도 없음), 밥솥 탱크에 증류수가 들어와 있는 것을 이름표에 보여 준다
function deviceNote(d) {
  let s = '';
  if (DEV[d.id].needFire && !Sim.fireNear(S, d).length) s += ' (열원 연결 안 됨)';
  if (d.id === 'cooker' && (d.s.tank || 0) > 0) s += ` (탱크 ${fmt(d.s.tank, 0)} g)`;
  return s;
}
function collectTargets() {
  const out = [], add = (kind, ref, wx, wy, wz, label, r) => out.push({ kind, ref, wx, wy, wz, label, r, x: wx, y: wy });
  for (const o of isl.objs) {
    if ((o.type === 'fragment' && S.f.raft) || melted(o)) continue;
    const n = NODE[o.type], label = { box: '광장 보급 상자', altar: '솥 골렘 제단', harbor: '항구 표지판 (항해)', board: '유리병 편지 게시판', fragment: '뗏목 파편 (수리)', trade: '교역소', reports: '연구 보고서 게시판', boards: '리더보드', signs: '팀 간판', project: '공동 프로젝트 (대기 처리 코어)' }[o.type];
    add(o.type, o, o.x, o.y + (o.type === 'rock' || o.type === 'iceblock' ? 0.7 : n ? Math.min(2.2, n[4] / 4) : 1), o.z, n ? `${n[3]} (${n[2] - (S.nodes[o.id] || 0)}/${n[2]})` : label, OBJ_R[o.type] || 1.1);
  }
  for (const d of S.placed) {
    if (!visible(d)) continue;
    const [x, y, z] = devWorld(d);
    add('dev', d, x, y + 0.9, z, DEV[d.id].name + (d.s.broken ? ' (파손)' : '') + deviceNote(d), 1.4); out[out.length - 1].gy = y;
  }
  for (const mb of S.mobs) { const [x, y, z] = wolfWorld(mb); add('wolf', mb, x, y + 0.6, z, `서리 늑대 ${fmt(mb.M, 0)} g`, 1.0); }
  return out;
}
// 보고 있는 대상: 시선과의 거리가 반지름 안이고 손이 닿으며 앞을 가린 지형이 없는 것 중 가장 가까운 것
function aimedTarget() {
  const [o, d] = lookRay(), wall = terrainHit(o, d, REACH + 1), best = { t: null, s: 1e9 };
  for (const t of collectTargets()) {
    const vx = t.wx - o.x, vy = t.wy - o.y, vz = t.wz - o.z, along = vx * d.x + vy * d.y + vz * d.z;
    if (along < 0.2 || along > REACH + t.r) continue;
    const px = vx - d.x * along, py = vy - d.y * along, pz = vz - d.z * along;
    if (Math.hypot(px, py, pz) > t.r) continue;
    if (wall !== null && wall < along - t.r) continue;
    if (along < best.s) { best.s = along; best.t = t; }
  }
  if (best.t) return best.t;
  // 바다: 아래를 보고 있고 수면이 손이 닿는 거리에 있으면 바닷물 뜨기
  if (d.y < -0.05) { const tt = (SEA - 0.1 - o.y) / d.y; if (tt > 0 && tt <= REACH && !(wall !== null && wall < tt)) return { kind: 'water', ref: null, wx: o.x + d.x * tt, wy: SEA, wz: o.z + d.z * tt, label: '바닷물 뜨기' }; }
  return null;
}

// ---------- 노드 채집(꾹 누르기) · 도구 ----------
// 바위·얼음 덩어리는 좌클릭을 꾹 눌러 캔다(걸리는 시간과 곡괭이 필요 여부는 2D의 DIG 값). 나머지 자원은 E로 바로 채집한다(2D와 같음)
const dig = { on: false, key: '', p: 0, need: 0 };   // 이름은 이전 버전과 같게 두었다: 꾹 누르기 진행
let digMsg = false;
function stepGather(dt) {
  if (!dig.on || mode || UI.isModalOpen() || sel) { dig.p = 0; return; }
  const t = aimedTarget();
  if (!t || !HOLD[t.kind]) { dig.p = 0; dig.need = 0; return; }
  const def = HOLD[t.kind], key = t.ref.id;
  if (key !== dig.key) { dig.key = key; dig.p = 0; digMsg = false; }
  if (def.tool && !(S.inv[def.tool] > 0)) { dig.p = 0; if (!digMsg) { digMsg = true; say('바위는 곡괭이가 있어야 캘 수 있어요.'); } return; }
  if ((S.nodes[key] || 0) >= NODE[t.kind][2]) { dig.p = 0; if (!digMsg) { digMsg = true; say('오늘은 더 캘 수 없어요. 내일 다시 자랍니다.'); } return; }
  dig.need = def.t; dig.p += dt;
  if (dig.p < def.t) return;
  dig.p = 0; lastTarget = t; interact(t);
}
// 온도계·소금 뿌리개: 2D(world.js)와 같은 식(Chem)과 상수(ICE_TILE_G, SHAKE_G)를 쓴다
function useThermo() {
  const t = aimedTarget(), airTemp = () => Sim.airTemp(S);
  let name, val, note;
  if (t && t.kind === 'dev') {
    const d = t.ref; name = DEV[d.id].name;
    if (d.id === 'fire') { const on = d.s.level > 0 && d.s.fuel > 0; val = on ? FIRE_T[d.s.level] : airTemp(); note = on ? `열원 (${FIRE_NAME[d.s.level]})` : '꺼져 있어 외기와 같음'; }
    else if (d.id === 'still' || d.id === 'cooker') { val = Sim.heatOf(S, d); note = '옆 화덕이 주는 열원 온도'; }
    else if (d.id === 'cooler') { const has = S.packs.length > 0; val = has ? Math.min(...S.packs.map(q => q.T)) : airTemp(); note = has ? '가장 찬 한제 팩' : '팩이 없어 외기와 같음'; }
    else { val = airTemp(); note = '외기와 같음'; }
  } else { val = airTemp(); name = '외기'; note = '시각에 따라 변하는 외기 온도'; }
  say(`온도계: ${name} ${fmt(val, 1)} ℃ — ${note}`);
  Sim.logEv(S, '온도 측정', `${name} ${fmt(val, 1)}℃ (${note})`);
}
function useShaker() {
  if (S.inv.salt < 1) return say('소금이 없습니다.');
  const T0 = Sim.airTemp(S), s = Math.min(SHAKE_G, S.inv.salt), t = aimedTarget();
  if (t && t.kind === 'wolf') { Sim.act.saltOnWolf(S, t.ref, s); return; }
  if (!t || (t.kind !== 'iceblock' && t.kind !== 'icecrystal')) return say('얼음 덩어리·얼음 결정이나 서리 늑대에게 뿌리세요.');
  const k = t.ref.id, had = S.melt[k] || 0, left = ICE_TILE_G - had, melt = C.iceMeltBySalt(T0, s);
  if (melt <= 0) return say('기온이 0 ℃ 이상이라 소금이 필요 없어요.');
  const used = melt >= left ? Math.min(s, C.saltForIce(T0, left)) : s, done = Math.min(melt, left);
  S.inv.salt -= used; S.melt[k] = had + done;
  Sim.logEv(S, '소금 뿌림(얼음 덩어리)', `기온 ${fmt(T0, 1)}℃ (m_eq=${fmt(-T0 / (2 * C.KF), 2)} mol/kg), 소금 ${fmt(used, 1)} g → 얼음 ${fmt(done, 0)} g 융해 (덩어리 ${fmt(had + done, 0)}/${ICE_TILE_G} g)`);
  puff(t.wx, t.wy, t.wz, '#d8f3ff', 8);
  if (had + done >= ICE_TILE_G - 1e-6) { delete S.melt[k]; S.fp.melted[k] = S.day; say('얼음이 모두 녹아 물이 되었습니다.'); if (islName === 'polar') S.f.polarMelt = true; }
  else say(`얼음 ${fmt(done, 0)} g 융해 (덩어리 ${fmt(had + done, 0)}/${ICE_TILE_G} g). 소금 ${fmt(used, 1)} g 사용`);
}

// ---------- 건설(뗏목 격자 위의 2×2) ----------
let mode = null, sel = null;   // mode: 'build:<id>' | 'demolish' · sel: 가방에서 고른 도구 아이템
const ghost = new THREE.Mesh(new THREE.BoxGeometry(2, 1.8, 2), new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.4 })); ghost.visible = false; scene.add(ghost);
const LINK_MAX = 8;   // 가정(임의값) 연결선 최대 거리(m): DESIGN §4-18
function ghostCell() {
  const [o, d] = lookRay(); if (d.y > -0.02) return null;
  const hitAt = (y) => { const tt = (y - o.y) / d.y; return tt > 0 && tt <= 12 ? [o.x + d.x * tt, o.z + d.z * tt] : null; };
  const pad = hitAt(isl.padH);   // 행성 지표 부지(평평한 지반 8 × 8 m)
  if (pad && pad[0] >= PAD.x0 && pad[0] < PAD.x0 + PAD.cx && pad[1] >= PAD.z0 && pad[1] < PAD.z0 + PAD.cz) return { plot: islName, gx: Math.floor(pad[0] - PAD.x0 - 0.5), gz: Math.floor(pad[1] - PAD.z0 - 0.5), cx: PAD.cx, cz: PAD.cz, hx: pad[0], hz: pad[1] };
  const sh = hitAt(SEA), { cx, cz } = raftDims();   // 탐사정 칸 격자
  if (!sh) return null;
  return { plot: null, gx: Math.floor(sh[0] - RX0 - 0.5), gz: Math.floor(sh[1] - RZ0 - 0.5), cx, cz, hx: sh[0], hz: sh[1] };
}
const cellWorld = (c) => c.plot ? [PAD.x0 + c.gx + 1, isl.padH + 0.9, PAD.z0 + c.gz + 1] : [RX0 + c.gx + 1, SEA + 0.9 + bobNow, RZ0 + c.gz + 1];
function ghostCheck(id, c) {
  const def = DEV[id];
  if (!c) return { ok: false, msg: '탐사정 바닥이나 기지 부지를 바라보세요.' };
  if (c.gx < 0 || c.gz < 0 || c.gx + 2 > c.cx || c.gz + 2 > c.cz) return { ok: false, msg: c.plot ? '기지 부지 안에 지어야 합니다.' : '탐사정 위에 지어야 합니다. (탐사정이 모자라면 건설 메뉴에서 넓히세요)' };
  const off = c.plot ? PLOT_OFF(c.plot) : 0, same = d => (d.plot || null) === c.plot;
  if (S.placed.some(d => same(d) && Math.abs(d.x - off - c.gx) < 2 && Math.abs(d.y - c.gz) < 2)) return { ok: false, msg: '다른 장치와 겹칩니다.' };
  if (def.needFire && !Sim.fireNear(S, { x: off + c.gx, y: c.gz }).length) {
    // 옆에 화덕이 없어도, 같은 부지의 화덕이 연결 거리 안에 있으면 지을 수 있다(지은 뒤 열선을 이어야 한다)
    const [wx, , wz] = cellWorld(c), far = S.placed.some(f => f.id === 'fire' && same(f) && visible(f) && Math.hypot(devWorld(f)[0] - wx, devWorld(f)[2] - wz) <= LINK_MAX);
    if (!far) return { ok: false, msg: `${def.name}은(는) 화덕 바로 옆이나 열선이 닿는 거리(${LINK_MAX} m) 안에 지어야 합니다.` };
    return { ok: true, warn: `${def.name}을(를) 지었습니다. 화덕과 열선을 이으세요 (L 키 → 화덕 → ${def.name}).` };
  }
  return { ok: true };
}
function placeAtLook() {
  if (mode.startsWith('build:')) {
    const id = mode.slice(6), c = ghostCell(), g = ghostCheck(id, c);
    if (!g.ok) return say(g.msg);
    const off = c.plot ? PLOT_OFF(c.plot) : 0, where = c.plot ? `기지 부지 (${c.gx}, ${c.gz})` : `뗏목 격자 (${c.gx}, ${c.gz})`;
    if (Sim.act.place(S, id, off + c.gx, c.gz, undefined, where)) {
      const dev = S.placed[S.placed.length - 1]; if (c.plot) dev.plot = c.plot; dev.uid = nextUid();
      mode = null; Party.note('build', `${DEV[id].name} 건설 (${where})`); if (g.warn) say(g.warn);
    }
    flush(); refresh(); return;
  }
  if (mode === 'demolish') {
    const t = aimedTarget();
    if (!t || t.kind !== 'dev') return say('철거할 장치를 바라보세요.');
    const dn = DEV[t.ref.id].name, uid = t.ref.uid; Sim.act.demolish(S, t.ref);
    S.links = S.links.filter(l => l.a !== uid && l.b !== uid);   // 그 장치의 연결선도 지운다
    Party.note('demolish', `${dn} 철거(재료 환불)`); flush(); mode = null; refresh();
  }
}

// ---------- 연결선(열선·배관, 10단계) ----------
let linkKind = null, linkFrom = null;   // 연결 모드: null | 'heat' | 'water', 출발 장치
const LINK_NAME = { heat: '열선(화덕 → 열이 필요한 장치)', water: '배관(증류기 → 밥솥, 증류수)' };
function cycleLink() {
  mode = null; sel = null; linkFrom = null;
  linkKind = linkKind === null ? 'heat' : linkKind === 'heat' ? 'water' : null;
  say(linkKind ? `연결 모드: ${LINK_NAME[linkKind]} — 출발 장치를 보고 우클릭 (L: 다음, Q: 취소)` : '연결 모드 끔');
}
function linkPick() {
  const t = aimedTarget();
  if (!t || t.kind !== 'dev') return say('연결할 장치를 바라보고 우클릭하세요.');
  const d = t.ref;
  if (!linkFrom) {
    if (linkKind === 'heat' && d.id !== 'fire') return say('열선은 화덕에서 시작합니다.');
    if (linkKind === 'water' && d.id !== 'still') return say('배관은 증류기에서 시작합니다.');
    linkFrom = d; return say(`${DEV[d.id].name}에서 시작합니다. 도착 장치를 보고 우클릭하세요.`);
  }
  const a = linkFrom; linkFrom = null;
  if (a === d) return say('같은 장치에는 이을 수 없습니다.');
  if ((a.plot || null) !== (d.plot || null)) return say('다른 부지의 장치와는 이을 수 없습니다.');
  if (linkKind === 'heat' && !DEV[d.id].needFire) return say(`${DEV[d.id].name}은(는) 열이 필요하지 않습니다.`);
  if (linkKind === 'water' && d.id !== 'cooker') return say('배관은 밥솥으로 이어집니다.');
  const wa = devWorld(a), wd = devWorld(d), dist = Math.hypot(wa[0] - wd[0], wa[2] - wd[2]);
  if (dist > LINK_MAX) return say(`너무 멉니다. 연결선은 ${LINK_MAX} m 안에서만 닿습니다. (지금 ${fmt(dist, 1)} m)`);
  const i = S.links.findIndex(l => l.a === a.uid && l.b === d.uid && l.kind === linkKind);
  if (i >= 0) { S.links.splice(i, 1); say(`${DEV[a.id].name} → ${DEV[d.id].name} 연결을 풀었습니다.`); Party.note('device', `연결 해제: ${linkKind}`); }
  else { S.links.push({ a: a.uid, b: d.uid, kind: linkKind, t: 0 }); say(`${DEV[a.id].name} → ${DEV[d.id].name} ${linkKind === 'heat' ? '열선' : '배관'}을(를) 이었습니다.`); Party.note('device', `연결: ${linkKind}`); }
  refresh();
}
// 배관: 증류기가 낸 증류수를 밥솥 탱크로 흘린다(Sim.act.pipe: 손으로 수거해 넣는 것과 같은 증류수·같은 기록). 게임 시간 10분마다, 증류기 출력 50 g 이상일 때(가정)
const PIPE_MIN = 10, PIPE_G = 50;
function pipeStep() {
  const now = S.day * 1440 + S.min;
  for (const l of S.links) {
    if (l.kind !== 'water' || now - (l.t || 0) < PIPE_MIN) continue;
    const a = S.placed.find(x => x.uid === l.a), b = S.placed.find(x => x.uid === l.b);
    if (!a || !b || a.s.outW < PIPE_G) continue;
    l.t = now; Sim.act.pipe(S, a, b);
  }
}
// 연결선 모양: 열선은 주황(화덕이 켜져 있으면 밝게), 배관은 파랑(흐르면 알갱이)
const linkGroup = new THREE.Group(); scene.add(linkGroup);
const linkMeshes = new Map();
const upV = new THREE.Vector3(0, 1, 0), dirL = new THREE.Vector3();
function syncLinks(t) {
  const live = new Set();
  for (const l of S.links) {
    const a = S.placed.find(x => x.uid === l.a), b = S.placed.find(x => x.uid === l.b);
    if (!a || !b || !visible(a) || !visible(b)) continue;
    const key = l.a + '|' + l.b + '|' + l.kind; live.add(key);
    let g = linkMeshes.get(key);
    if (!g) {
      const root = new THREE.Group(), tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), new THREE.MeshBasicMaterial({ color: l.kind === 'heat' ? 0xff8a2e : 0x4aa3ff, transparent: true, opacity: 0.85 }));
      root.add(tube); const dots = []; for (let i = 0; i < 4; i++) { const dm = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), new THREE.MeshBasicMaterial({ color: l.kind === 'heat' ? 0xffe27a : 0xbfe3ff })); root.add(dm); dots.push(dm); }
      linkGroup.add(root); g = { root, tube, dots }; linkMeshes.set(key, g);
    }
    const pa = devWorld(a), pb = devWorld(b), by = a.plot ? 0 : bobNow;
    const A = new THREE.Vector3(pa[0], pa[1] + 1.05 + by, pa[2]), B = new THREE.Vector3(pb[0], pb[1] + 1.05 + by, pb[2]);
    dirL.copy(B).sub(A); const len = dirL.length(); dirL.normalize();
    g.tube.position.copy(A).addScaledVector(dirL, len / 2); g.tube.scale.set(1, len, 1); g.tube.quaternion.setFromUnitVectors(upV, dirL);
    // 흐름: 열선은 화덕이 켜져 있을 때, 배관은 증류기에 출력이 있거나 밥솥 탱크에 물이 있을 때 알갱이가 A → B로 움직인다
    const on = l.kind === 'heat' ? (a.s.level > 0 && a.s.fuel > 0) : ((a.s.outW || 0) >= 1 || a.s.run);
    g.tube.material.opacity = on ? 0.95 : 0.4;
    g.dots.forEach((dm, i) => { dm.visible = !!on; const f = ((t * 0.5 + i / g.dots.length) % 1); dm.position.copy(A).addScaledVector(dirL, len * f); });
  }
  for (const [k, g] of linkMeshes) if (!live.has(k)) { linkGroup.remove(g.root); linkMeshes.delete(k); }
}
function useAction() {   // 우클릭: 건설·철거 모드 > 선택한 도구
  if (UI.isModalOpen()) return;
  if (linkKind) return Party.inParty() ? Party.guard(linkPick) : linkPick();
  if (mode) return Party.inParty() ? Party.guard(placeAtLook) : placeAtLook();   // 팀이면 팀 쓰기 권한(임대)을 먼저 얻는다
  if (!sel) return;
  if (TOOL[sel] === 'salt') { if (Party.inParty()) Party.guard(() => { useShaker(); flush(); }); else { useShaker(); flush(); } return; }
  useThermo(); flush();
}
async function doInteract() {
  const t = aimedTarget(); if (!t) return;
  if (['trade', 'reports', 'boards', 'signs', 'project'].includes(t.kind)) return HubUI.open(t.kind);   // 팀 간 교류 시설(11단계): 각 창이 필요할 때 팀 쓰기 권한을 얻는다
  if (Party.needsLease(t.kind) && !(await Party.ensureActive())) return say('동료가 조작 중이에요. 잠시 뒤에 다시 시도하세요.');   // 장치·늑대·바닷물·제단·항구는 팀 필드를 바꾼다
  lastTarget = t; if (t.kind === 'dev') Sim.setDev(t.ref); interact(t);   // 지표 부지 장치의 패널은 그 행성의 환경으로 그린다
}

// ---------- 입력 ----------
const keys = { w: false, a: false, s: false, d: false, jump: false };
let locked = false;
const canAct = () => TEST || locked;
const cv = renderer.domElement;
function clearKeys() { keys.w = keys.a = keys.s = keys.d = keys.jump = false; dig.on = false; }
addEventListener('keydown', e => {
  if (!$('modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  if (!$('title').hidden) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startGame(); } return; }
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'w') keys.w = true; else if (k === 'a') keys.a = true; else if (k === 's') keys.s = true; else if (k === 'd') keys.d = true; else if (k === ' ') { keys.jump = true; e.preventDefault(); }
  else if (k === 'e') doInteract();
  else if (k === 'l') cycleLink();
  else if (k === 'q' || k === 'escape') { if (mode || sel || linkKind) { mode = null; sel = null; linkKind = null; linkFrom = null; say('취소'); } }
  else if (/^[1-9]$/.test(k)) { const u = usable()[+k - 1]; if (u) selectItem(u.k); }
});
addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (k === 'w') keys.w = false; else if (k === 'a') keys.a = false; else if (k === 's') keys.s = false; else if (k === 'd') keys.d = false; else if (k === ' ') keys.jump = false; });
cv.addEventListener('click', () => { if (!locked && !TEST && $('modal').hidden && $('title').hidden && $('auth').hidden) cv.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === cv; $('lockhint').hidden = locked || TEST || !$('title').hidden; if (!locked) dig.on = false; });
addEventListener('mousemove', e => { if (!locked) return; yaw -= e.movementX * SENS; pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * SENS)); });
cv.addEventListener('mousedown', e => { if (!canAct() || !$('modal').hidden) return; if (e.button === 0) { const t = aimedTarget(); if (t && !HOLD[t.kind] && !mode && !sel) doInteract(); else dig.on = true; } else if (e.button === 2) useAction(); });
addEventListener('mouseup', e => { if (e.button === 0) dig.on = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { const u = usable().map(x => x.k).concat([null]), i = u.indexOf(sel); const n = u[(i + (e.deltaY > 0 ? 1 : -1) + u.length) % u.length]; if (n !== sel) selectItem(n === null ? sel : n); }, { passive: true });   // 휠: 블록·도구 바꾸기

// ---------- HUD(HTML) ----------
const inv3 = $('inv3'), menu3 = $('menu3'), spd = $('spd3');
const usable = () => Object.entries(S.inv).filter(([k, v]) => v >= 1 && TOOL[k]).map(([k, v]) => ({ k, n: Math.floor(v) }));
function selectItem(k) { sel = sel === k ? null : k; mode = null; linkKind = null; linkFrom = null; say(sel ? `${ITEM[sel][1]}: 바라보고 우클릭 (Q 취소)` : '취소'); }
[['hammer', '건설', () => openBuild()], ['gear', '제작', () => openCraft()], ['book', '연구 노트', () => window.Notes && Notes.open(api)], ['scroll', '기록', () => openLog()], ['disk', '저장/계정', () => openSave()]].forEach(([icon, label, fn]) => {
  const b = document.createElement('button'); b.title = label; b.innerHTML = `<i style="background-image:url(${Art.iconURL[icon]})"></i>`; b.onclick = fn; menu3.appendChild(b);
});
{ const b = document.createElement('button'); b.id = 'teambtn'; b.title = '팀'; b.textContent = '팀'; b.onclick = () => TeamUI.open(); menu3.appendChild(b); }
[10, 3, 1].forEach(sp => { const b = document.createElement('button'); b.textContent = 'x' + sp; b.dataset.sp = sp; b.title = `시간 속도 x${sp}`; b.onclick = () => { S.speed = sp; }; spd.appendChild(b); });
let invSig = '';
function drawHUD() {
  const items = Object.entries(S.inv).filter(([, v]) => v >= 1).map(([k, v]) => ({ k, icon: ITEM[k][0], name: ITEM[k][1], n: Math.floor(v) }));
  if (S.caps.length) items.push({ icon: 'cap', name: '기체 캡슐 (' + capText() + ')', n: S.caps.length });
  if (S.packs.length) items.push({ icon: 'pack', name: '한제 팩', n: S.packs.length });
  const sig = JSON.stringify(items) + sel + mode;
  if (sig !== invSig) {
    invSig = sig; inv3.innerHTML = '';
    let hot = 0;
    for (const it of items) {
      const b = document.createElement('button'), usableItem = TOOL[it.k]; b.className = 'slot';
      b.title = `${it.name} ${it.n}` + (TOOL[it.k] ? ' (선택 후 우클릭: 사용)' : it.k === 'pickaxe' ? ' (돌을 팔 때 자동 사용)' : '');
      b.innerHTML = `<i style="background-image:url(${Art.iconURL[it.icon]})"></i><b>${it.n}</b>` + (usableItem ? `<u>${++hot}</u>` : '');
      if (usableItem) { b.classList.toggle('on', sel === it.k); b.onclick = () => selectItem(it.k); }
      inv3.appendChild(b);
    }
    const q = $('quest'); q.style.top = (inv3.offsetHeight + 16) + 'px'; q.style.left = '8px';
  }
  const hh = String(Math.floor(S.min / 60)).padStart(2, '0'), mm = String(Math.floor(S.min % 60)).padStart(2, '0');
  $('clock3').textContent = `D${S.day} ${hh}:${mm}`;
  $('clock3').title = `${S.day}일차 ${hh}:${mm} · ${Sim.ISLANDS[Sim.dockOf(S).island].name} 외기 ${Math.round(Sim.airTemp(S))}℃ · ${fmt(pAtm(), 2)} atm`;
  $('temp3').textContent = `${Math.round(Sim.airTemp(S))}℃ · ${fmt(pAtm(), 2)} atm`;
  const sp1 = Party.speed(); spd.querySelectorAll('button').forEach(b => { b.classList.toggle('on', +b.dataset.sp === sp1); b.disabled = Party.inParty() && Party.online() > 1; });
  { const tb = $('teambtn'); if (Party.inParty() && Party.meta) { tb.style.borderColor = Party.meta.color; tb.title = `팀 ${Party.meta.name}`; } else { tb.style.borderColor = ''; tb.title = '팀'; } }
  const t = !UI.isModalOpen() && canAct() ? aimedTarget() : null;
  $('target').textContent = mode && mode.startsWith('build:') ? `${DEV[mode.slice(6)].name} 짓기 — 탐사정 바닥이나 기지 부지를 보고 우클릭, Q 취소`
    : linkKind ? `연결 모드(${linkKind === 'heat' ? '열선' : '배관'}) — ${linkFrom ? '도착' : '출발'} 장치를 보고 우클릭, L 다음, Q 취소`
    : mode === 'demolish' ? '철거 — 장치를 보고 우클릭, Q 취소'
    : sel ? `${ITEM[sel][1]} — 바라보고 우클릭, Q 취소`
    : t ? `[E] ${t.label}` : (dig.on && dig.need ? `캐는 중 ${Math.round(dig.p / dig.need * 100)} %` : 'WASD 이동 · Space 점프 · 마우스 시점 · E 또는 좌클릭 열기·채집(바위·얼음은 꾹) · 우클릭 도구 사용 · L 연결');
}
// 시선 아래 칸 표시(파기 대상) + 건설 미리보기
// 조준 강조: 대상 발밑의 노란 고리 + 대상 위의 이름표(조준하면 이름이 보인다)
const ringGeo = new THREE.RingGeometry(0.86, 1, 32); ringGeo.rotateX(-Math.PI / 2);
const marker = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.85, depthTest: false })); marker.visible = false; marker.renderOrder = 5; scene.add(marker);
const aimLabel = $('aimlabel'), av = new THREE.Vector3();
function updateAim() {
  const open = UI.isModalOpen() || !canAct();
  ghost.visible = !!(mode && mode.startsWith('build:')) && !open;
  if (ghost.visible) { const c = ghostCell(), g = ghostCheck(mode.slice(6), c); ghost.material.color.set(g.ok ? 0x66ff88 : 0xff6666); if (c) ghost.position.set(...cellWorld(c)); else ghost.visible = false; }
  const t = open || mode ? null : aimedTarget();
  marker.visible = !!t && t.kind !== 'water';
  if (t) { const gy = t.gy !== undefined ? t.gy + (t.kind === 'dev' ? bobNow * (t.ref.plot ? 0 : 1) : 0) : t.kind === 'wolf' ? SEA + bobNow : groundAt(t.wx, t.wz); marker.position.set(t.wx, gy + 0.06, t.wz); marker.scale.setScalar((t.r || 1) * (0.95 + 0.05 * Math.sin(tNow * 5))); }
  if (t) { av.set(t.wx, t.wy + (t.r || 1) * 0.9 + 0.5, t.wz).project(camera); aimLabel.style.left = ((av.x + 1) / 2 * innerWidth) + 'px'; aimLabel.style.top = ((1 - av.y) / 2 * innerHeight) + 'px'; aimLabel.textContent = t.label; }
  aimLabel.style.display = t && av.z < 1 ? '' : 'none';
}

// ---------- 시간·저장·시작·항해 ----------
let tNow = 0, last = performance.now();
setInterval(() => { if (Store.paused || (window.Raid && Raid.active)) return; if (Party.canAdvance()) { advance(Party.speed()); pipeStep(); } UI.tick(); refresh(); }, 500);   // 팀이면 시계 담당만 시간을 흘린다
setInterval(() => { Party.tick(); hubTick(); }, 1000);
setInterval(() => { if (islName === 'plaza') loadPubs(); }, 60000);   // 허브에 도킹한 다른 팀의 탐사정 목록
function savePos() { S.fp.x = p.x; S.fp.y = p.y; S.fp.z = p.z; S.fp.yaw = yaw; S.fp.pitch = pitch; }
setInterval(() => { savePos(); save(); }, 5000);
addEventListener('pagehide', () => { savePos(); save(true); });
// 항해: 'moved' 이벤트(Sim.act.sail) → 화면이 어두워졌다 밝아지는 동안 새 섬을 불러오고 뗏목 위에 선다
let fpRef = S.fp;
function resetFromState() {
  p.x = S.fp.x; p.y = S.fp.y; p.z = S.fp.z; p.vx = p.vy = p.vz = 0; yaw = S.fp.yaw; pitch = S.fp.pitch;
  loadIsland(islandName()); if (blocked(p.x, p.y, p.z)) { const f = findFree(); if (f) { p.x = f[0]; p.z = f[1]; p.y = SEA; } }
  loadPlaza(); joinPresence(); if (islName === 'plaza') loadPubs();
}
let warpK = 0, warping = false;   // 궤도 이동(워프) 연출: 별 줄무늬 오버레이와 시야각 확장(보이기만)
function onMoved() {
  const f = $('fade'), w = $('warp'); warping = true; w.classList.add('on'); f.style.opacity = 0.85;
  setTimeout(() => { arrive(); f.style.opacity = 1; setTimeout(() => { f.style.opacity = 0; w.classList.remove('on'); warping = false; }, TEST ? 80 : 450); }, TEST ? 50 : 900);
}
function arrive() {
  loadIsland(islandName()); const { cx, cz } = raftDims();
  p.x = RX0 + cx / 2; p.z = RZ0 + cz / 2 + (S.placed.length ? cz / 2 - 0.5 : 0); p.y = SEA; p.vx = p.vy = p.vz = 0; yaw = -Math.PI / 2; pitch = 0;
  const free = findFree(); if (free) { p.x = free[0]; p.z = free[1]; }
  loadPlaza(); joinPresence();
}
function findFree() {   // 뗏목 위에서 장치와 겹치지 않는 자리
  const { cx, cz } = raftDims();
  for (let r = 0; r < Math.max(cx, cz); r++) for (let gx = 0; gx < cx; gx++) for (let gz = 0; gz < cz; gz++) { const x = RX0 + gx + 0.5, z = RZ0 + gz + 0.5; if (!blocked(x, SEA, z)) return [x, z]; }
  return null;
}
const MAPID = 'main';
// 팀 창(공용 openModal에 HTML을 넣는다). 버튼은 인라인 onclick으로 TeamUI를 부른다
const TeamUI = window.TeamUI = {
  open() { if (Party.inParty()) UI.openModal('팀', Party.panelHtml(), () => { if (UI.isModalOpen() && document.getElementById('mtitle').textContent === '팀') document.getElementById('mbody').innerHTML = Party.panelHtml(); }); else UI.openModal('팀', Party.noPartyHtml()); },
  err(e) { const el = document.getElementById('tm-err'); if (el) el.textContent = e.message || String(e); else say(e.message || String(e)); },
  async create() { try { await Party.create(document.getElementById('tm-name').value, document.getElementById('tm-color').value); say('팀을 만들었습니다. 초대 코드를 친구에게 알려 주세요.'); TeamUI.open(); } catch (e) { TeamUI.err(e); } },
  async join() { if (S.placed.length && !confirm('지금 가진 장치는 철거되어 재료로 돌려받고, 팀의 탐사정과 진행도를 이어받습니다. 들어갈까요?')) return; try { await Party.join(document.getElementById('tm-code').value); say('팀에 들어왔습니다.'); TeamUI.open(); } catch (e) { TeamUI.err(e); } },
  async leave() { if (!confirm('팀을 나갈까요? 팀의 장치는 두고 가고, 나는 새 탐사정으로 처음부터 시작합니다. 인벤토리는 가져갑니다.')) return; await Party.leave(); say('팀에서 나왔습니다.'); TeamUI.open(); },
  warehouse() { UI.openModal('공용 창고', Party.warehouseHtml(ITEM), () => { if (document.getElementById('mtitle').textContent === '공용 창고') document.getElementById('mbody').innerHTML = Party.warehouseHtml(ITEM); }); },
  async xfer(item, n) { await Party.transfer(item, n); },
};
Party.init({ say, isModalOpen: () => UI.isModalOpen(), onApplied() { ensureUids(); if (islName && islandName() !== islName) onMoved(); else { raftSig = ''; syncRaft(); } refresh(); } });
// 장치 패널의 행동(공용 ui.js의 window.act)과 뗏목 넓히기는 팀 기록에 남긴다. 장치는 doInteract에서 이미 팀 쓰기 권한을 얻은 뒤에 열린다
{ const act0 = window.act; window.act = (name, arg) => { act0(name, arg); Party.note('device', `장치 조작: ${name}`); };
  const exp0 = G.expandRaft; G.expandRaft = () => { if (Party.inParty()) Party.guard(() => { exp0(); Party.note('device', '탐사정 확장'); }); else exp0(); }; }
UI.init({
  puff(x, y, col, n) { const [wx, wy, wz] = fxPos(); puff(wx, wy, wz, col.startsWith('rgba') ? '#ebf5ff' : col, n); },
  burst(d) { const [x, y, z] = devWorld(d); puff(x, y + 1, z, '#ff7a3d', 14); puff(x, y + 1, z, '#4a4f56', 10); },
  clearKeys,
  applyWorld() {
    ensureFp();
    if (S.fp !== fpRef) { fpRef = S.fp; resetFromState(); }   // 서버 세이브·처음부터: 위치·파낸 복셀까지 상태에서 다시 읽는다
    else if (islandName() !== islName) onMoved();              // 항해
    else { raftSig = ''; syncRaft(); }                         // 뗏목 넓히기
  },
  startBuild(id) { mode = 'build:' + id; sel = null; linkKind = null; linkFrom = null; $('modal').hidden = true; say(`${DEV[id].name}을(를) 지을 곳을 바라보고 우클릭하세요. (Q 취소)`); },
  startDemolish() { mode = 'demolish'; sel = null; $('modal').hidden = true; say('철거할 장치를 바라보고 우클릭하세요. (Q 취소)'); },
  joinMap() { joinPresence(); Party.start(); startWatch(); },
});

// ---------- 프레임 ----------
const lookT = new THREE.Vector3();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; tNow += dt;
  const modalOpen = UI.isModalOpen() || !$('title').hidden || !$('auth').hidden;
  if (modalOpen && document.pointerLockElement) document.exitPointerLock();
  const act = !modalOpen && canAct();
  const ax = act ? (keys.d ? 1 : 0) - (keys.a ? 1 : 0) : 0, az = act ? (keys.w ? 1 : 0) - (keys.s ? 1 : 0) : 0;
  if (!Store.paused || TEST) stepPlayer(dt, ax, az, act && keys.jump); else { p.vx = p.vz = 0; }
  stepGather(dt); stepParts(dt); netStep(dt, now);
  const onRaft = raftCell(Math.floor(p.x), Math.floor(p.z)) && p.y <= SEA + 0.02;
  bobNow = raftBob(tNow); if (raftMesh) raftMesh.position.y = bobNow;
  warpK += ((warping ? 1 : 0) - warpK) * Math.min(1, dt * 5); const fovNow = FOV + warpK * 45; if (Math.abs(camera.fov - fovNow) > 0.01) { camera.fov = fovNow; camera.updateProjectionMatrix(); }
  camera.position.set(p.x, p.y + EYE + (onRaft ? bobNow : 0), p.z); camera.rotation.set(pitch, yaw, 0, 'YXZ');   // 뗏목 위에서는 카메라도 같이 출렁인다
  if (!UI.isModalOpen()) Sim.setDev(null);
  syncRaft(); updateObjects(tNow); syncDevices(tNow); syncLinks(tNow); syncWolves(tNow); sky(dt); updateAim(); drawHUD(); placeLabels(); syncPlaza(); placePlazaLabels();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

ensureFp(); loadIsland(islandName());
{ const free = blocked(p.x, p.y, p.z) ? findFree() : null; if (free) { p.x = free[0]; p.z = free[1]; p.y = SEA; } }
refresh(); requestAnimationFrame(frame);
Store.paused = true;
$('t-info').textContent = S.day > 1 || S.qDone > 0 ? `저장된 진행: ${S.day}일차 · 목표 ${S.qDone}/${QUESTS.length}` : '새 게임';
// 우주 테마 도움말·이야기(문구는 theme.js가 이름을 맞춘다). 규칙·수치 설명은 공용 ui.js와 같다
function fpHelp() {
  UI.openModal('도움말', `
    <div class="box"><h4>조작</h4>
      <div>화면 클릭 = 마우스 시점 · WASD 이동 · Space 점프 · <b>E</b> 또는 좌클릭 = 열기·채집 · 우클릭 = 도구 사용/건설 · Q 취소</div>
      <div>바위·얼음 덩어리는 좌클릭을 꾹 눌러 캡니다(바위는 곡괭이 필요). 오른쪽 위 아이콘: 건설 · 제작 · 연구 노트 · 기록 · 저장</div></div>
    <div class="box"><h4>처음 해 볼 것</h4>
      <div>1. 해안에 불시착한 탐사정 위에서 바다를 보고 E로 바닷물을 뜨고, 건설에서 화덕을 탐사정 바닥에 지으세요.</div>
      <div>2. 나무·모래 더미에서 재료를 모아 증류기를 화덕 옆에 짓고 바닷물을 증류하세요.</div>
      <div>3. 해안의 탐사정 잔해를 고치면 궤도 이동 단말에서 허브 정거장으로 갈 수 있어요. 목표를 달성하면 다른 행성도 열립니다.</div></div>
    <div class="warnbox">모든 장치는 수업에서 배운 식(라울의 법칙, 끓는점 오름·어는점 내림, 이상 기체, 돌턴 분압)을 실제로 계산합니다. 행성마다 대기 압력과 기온이 달라 같은 장치도 다르게 동작합니다. 밤에는 영하로 내려가 얼음 생물이 장치를 부수러 오니 소금을 준비하세요.</div>`,
    null, () => { try { localStorage.setItem(HELP_KEY, '1'); } catch { /* 저장 불가 */ } });
}
window.G.help = fpHelp;
const STORY_KEY = 'chemisle_fp_story_v1';
function maybeStory() {
  let seen = false; try { seen = !!localStorage.getItem(STORY_KEY); } catch { /* 무시 */ }
  if (seen || S.day > 1 || S.qDone > 0 || !$('auth').hidden) return false;
  UI.openModal('불시착', `
    <div class="box"><h4>연구선 신호 두절</h4>
      <div>항성 사이를 도약하던 연구선이 사고로 부서졌다. 살아남은 것은 탐사정 한 척과 실험 장비 몇 개뿐이다.</div>
      <div>탐사정은 푸른 바다가 있는 낯선 행성의 해안에 불시착했다. 잔해를 고치면 궤도 이동으로 다른 행성과 허브 정거장에 갈 수 있다.</div>
      <div>이곳 대기와 바닷물로 살아남아야 한다. 먼저 바닷물을 증류해 마실 물과 소금을 얻자.</div></div>`,
    null, () => { try { localStorage.setItem(STORY_KEY, '1'); } catch { /* 저장 불가 */ } });
  return true;
}
function startGame() {
  if ($('title').hidden) return;
  $('title').hidden = true; Store.paused = false; loadPlaza();
  if (!TEST) cv.requestPointerLock();
  boot().then(() => { let seen = false; try { seen = !!localStorage.getItem(HELP_KEY); } catch { /* 무시 */ } if ($('auth').hidden && !TEST && maybeStory()) return; if (!seen && $('auth').hidden) fpHelp(); });
}
$('t-start').onclick = startGame;
$('t-help').onclick = () => fpHelp();
installTheme(document.body);   // 우주 테마: 화면의 이름·문구를 치환표(theme.js)로 덮어쓴다
window.__fp = { party: Party, targets: collectTargets, scene, camera, S, p, groundAt, terrainHit, aimedTarget, getMode: () => mode, setLook(y, pt) { yaw = y; pitch = pt; }, island: () => isl, islName: () => islName, dig, ghostCell, stepPlayer, setSel(k) { sel = k; } };   // 시험(tools/smokefp.js)용 통로
