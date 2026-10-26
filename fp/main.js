// 화학 섬 이야기 — 1인칭 3D(fp/, 7단계: 부드러운 지형). 마우스로 둘러보며 걷는다. 블록 채굴은 없고 자원은 노드를 채집한다.
// 화학 계산은 chem.js와 sim.js를 그대로 쓰고(여기서 식을 만들지 않는다), 이 파일은 "어디에 있는가"(위치·충돌·그리기)만 다룬다.
// 상태는 Store.S(= Sim 상태) + S.fp(위치·시점·녹은 얼음 노드). 2D 전용 S.px·S.py는 쓰지 않는다. 저장 키는 chemisle_fp_v2(2D·옛 복셀 버전과 따로).
import * as THREE from 'three';
import { N, SEA, SEABED, RX0, RZ0, ISLANDS, OFFSET, Island } from './gen.js';
import { buildIslandGeometry, STEP_NEAR, STEP_FAR } from './terrain.js';

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
}
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
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, VIEW + 40);
const ambient = new THREE.AmbientLight(0xffffff, 0.7), sunL = new THREE.DirectionalLight(0xffffff, 0.7);
sunL.position.set(-30, 60, 20); scene.add(ambient, sunL);
function fit() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', fit); fit();
const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const texCache = new Map();
const tex = (cv) => { let t = texCache.get(cv); if (!t) { t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; texCache.set(cv, t); } return t; };
// 2D 그림을 세운 두 장의 판(X자)으로 세운다: 밑면 가운데가 (0,0,0)
function cross(cv, scale = 1) {
  const g = new THREE.Group(), w = cv.width / 16 * scale, h = cv.height / 16 * scale;
  const mat = new THREE.MeshLambertMaterial({ map: tex(cv), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  for (const r of [0, Math.PI / 2]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.y = h / 2; m.rotation.y = r; g.add(m); }
  g.userData.h = h; return g;
}

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
const OBJ_ART = { cane: 'cane', wheat: 'wheat', sandpile: 'sandpile', icecrystal: 'icecrystal', rocksalt: 'rocksalt', harbor: 'harbor', box: 'box', board: 'board', fragment: 'fragment' };
const OBJ_R = { tree: 1.5, altar: 1.6, harbor: 1.0, board: 1.0, box: 1.0, fragment: 1.0, rock: 1.3, iceblock: 1.2 };
// 바위·얼음 덩어리 임시 그림(7-c에서 입체 모양으로 바꾼다)
function blob(fill, edge) { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.fillStyle = edge; g.beginPath(); g.ellipse(16, 20, 14, 11, 0, 0, 7); g.fill(); g.fillStyle = fill; g.beginPath(); g.ellipse(15, 18, 11, 8, 0, 0, 7); g.fill(); return c; }
const ART_ROCK = blob('#9aa0aa', '#5f646d'), ART_ICEBLOCK = blob('#cdeefb', '#6fb4d6');
const objMeshes = new Map(), devMeshes = new Map(), wolfMeshes = new Map();
function buildObjects() {
  objGroup.clear(); objMeshes.clear();
  for (const o of isl.objs) {
    const cv = o.type === 'tree' ? (islName === 'alpine' || (islName !== 'plaza' && isl.height(o.x, o.z) > SEA + 7) ? Art.obj.pine : Art.obj.tree) : o.type === 'altar' ? Art.dev.altar : o.type === 'rock' ? ART_ROCK : o.type === 'iceblock' ? ART_ICEBLOCK : Art.obj[OBJ_ART[o.type]];
    if (!cv) continue;
    const g = cross(cv, o.type === 'rock' || o.type === 'iceblock' ? 1.2 : 1); g.position.set(o.x, o.y, o.z); objGroup.add(g); objMeshes.set(o, g);
  }
}
const melted = o => S.fp.melted[o.id] === S.day;   // 소금에 녹은 얼음 노드는 그날 하루 사라진다(다음 날 다시 자란다)
function updateObjects() {
  for (const [o, g] of objMeshes) {
    const n = NODE[o.type], spent = n && (S.nodes[o.id] || 0) >= n[2];
    g.visible = o.type === 'fragment' ? !S.f.raft : !melted(o);
    g.children.forEach(mm => { mm.material.opacity = spent ? 0.4 : 1; });
  }
}
const devWorld = (d) => [RX0 + d.x + 1, SEA, RZ0 + d.y + 1];   // 장치(2×2)의 가운데 바닥
const wolfWorld = (m) => { const d = S.placed.find(x => x.x === m.dx && x.y === m.dy); const [x, y, z] = d ? devWorld(d) : [RX0, SEA, RZ0]; return [x + (m.id % 2 ? 2.2 : -2.2), y, z]; };
const topMat = new THREE.MeshLambertMaterial({ color: 0x6b6f78 });
function devModel(id) {   // 장치 모형: 2D 그림을 옆면에 입힌 상자(화덕은 불꽃 캔버스를 더한다)
  const side = new THREE.MeshLambertMaterial({ map: tex(Art.dev[id]), transparent: true, alphaTest: 0.4 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 1.8, 2), [side, side, topMat, topMat, side, side]);
  box.position.y = 0.9;
  const root = new THREE.Group(); root.add(box);
  const bad = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xff5a4a })); bad.position.set(0, 2.1, 0); bad.visible = false; root.add(bad);
  const g = { root, bad };
  if (id === 'fire') { const cv = document.createElement('canvas'); cv.width = cv.height = 32; g.flameCv = cv; const fl = cross(cv, 1); fl.position.y = 0.3; g.flame = fl; root.add(fl); }
  return g;
}
function syncDevices(t) {
  const live = new Set(S.placed);
  for (const [d, g] of devMeshes) if (!live.has(d)) { scene.remove(g.root); devMeshes.delete(d); }
  for (const d of S.placed) {
    let g = devMeshes.get(d);
    if (!g) { g = devModel(d.id); scene.add(g.root); devMeshes.set(d, g); }
    const [x, y, z] = devWorld(d); g.root.position.set(x, y, z);
    g.bad.visible = !!d.s.broken;
    if (g.flame) { const c2 = g.flameCv.getContext('2d'); c2.clearRect(0, 0, 32, 32); Art.flame(c2, 0, 0, d.s.level, t); tex(g.flameCv).needsUpdate = true; }
    if ((d.id === 'still' || d.id === 'cooker') && d.s.run && Math.random() < 0.25) puff(x, y + 1.9, z, '#ebf5ff', 1);
    if (d.id === 'fire' && d.s.level > 0 && Math.random() < 0.1 * d.s.level) puff(x, y + 1, z, '#ffb347', 1);
  }
}
function syncWolves(t) {
  const live = new Set(S.mobs);
  for (const [m, g] of wolfMeshes) if (!live.has(m)) { scene.remove(g); wolfMeshes.delete(m); }
  for (const m of S.mobs) {
    let g = wolfMeshes.get(m); if (!g) { g = cross(Art.wolf[0], 1); scene.add(g); wolfMeshes.set(m, g); }
    const [x, y, z] = wolfWorld(m), a = 0.45 + 0.55 * Math.max(0, m.M / m.M0);
    g.position.set(x, y, z); g.rotation.y = Math.atan2(p.x - x, p.z - z);
    g.children.forEach(c => { c.material.opacity = a; });
  }
}
// 뗏목 바닥: 격자 크기가 바뀌면 다시 만든다. 윗면이 바다면(SEA)에 맞는다
function syncRaft() {
  const { cx, cz } = raftDims(), sig = cx + 'x' + cz + islName; if (sig === raftSig) return; raftSig = sig;
  if (raftMesh) { scene.remove(raftMesh); raftMesh.dispose(); }
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ map: tex(Art.tiles.raft[0]) }), cx * cz), dm = new THREE.Object3D();
  let i = 0; for (let z = 0; z < cz; z++) for (let x = 0; x < cx; x++) { dm.position.set(RX0 + x + 0.5, SEA - 0.5, RZ0 + z + 0.5); dm.updateMatrix(); m.setMatrixAt(i++, dm.matrix); }
  m.frustumCulled = false; scene.add(m); raftMesh = m;
}

function loadIsland(name) {
  islName = name; isl = new Island(name);
  setTerrain(); setFar(); buildObjects(); raftSig = ''; syncRaft();
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
    if (!g) { const label = document.createElement('div'); label.className = 'nick3'; document.body.appendChild(label); const mm = cross(Art.playerFrames[0], 1.1); scene.add(mm); g = peerMeshes[id] = { m: mm, label, x: q.x, y: q.y, z: q.z }; }
    g.x += (q.x - g.x) * a; g.y += (q.y - g.y) * a; g.z += (q.z - g.z) * a;
    g.m.position.set(g.x, g.y, g.z); g.m.rotation.y = Math.atan2(p.x - g.x, p.z - g.z); g.label.textContent = q.nick || '';
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
  const rafts = islName === 'plaza' ? UI.plazaRafts().slice(0, 3) : [], sig = islName + JSON.stringify(rafts.map(r => [r.nick, r.cells, (r.devs || []).length]));
  if (sig === plazaSig) return; plazaSig = sig;
  scene.remove(plazaGroup); plazaGroup = new THREE.Group();
  rafts.forEach((r, i) => {
    const cx = Math.max(2, Math.min(12, r.cells | 0)), cz = rcz(cx), z0 = RZ0 - 10 * (i + 1);
    const fl = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ map: tex(Art.tiles.raft[0]) }), cx * cz), dm = new THREE.Object3D();
    let k = 0; for (let z = 0; z < cz; z++) for (let x = 0; x < cx; x++) { dm.position.set(RX0 + x + 0.5, SEA - 0.5, z0 + z + 0.5); dm.updateMatrix(); fl.setMatrixAt(k++, dm.matrix); }
    fl.frustumCulled = false; plazaGroup.add(fl);
    for (const d of (r.devs || [])) if (d && Art.dev[d.id] && d.u >= 0 && d.u + 2 <= cx) { const g = devModel(d.id); g.root.position.set(RX0 + d.u + 1, SEA, z0 + (d.z | 0) + 1); g.bad.visible = !!d.broken; plazaGroup.add(g.root); }
    const label = document.createElement('div'); label.className = 'nick3'; label.textContent = r.nick || ''; label.dataset.plaza = '1'; document.body.appendChild(label);
    plazaGroup.userData.labels = (plazaGroup.userData.labels || []).concat([[label, RX0 + cx / 2, SEA + 3, z0 + cz / 2]]);
  });
  scene.add(plazaGroup);
  document.querySelectorAll('.nick3[data-plaza]').forEach(el => { if (!(plazaGroup.userData.labels || []).some(l => l[0] === el)) el.remove(); });
}
function placePlazaLabels() {
  for (const [el, x, y, z] of (plazaGroup.userData.labels || [])) { lv.set(x, y, z).project(camera); el.style.left = ((lv.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - lv.y) / 2 * innerHeight) + 'px'; el.style.display = lv.z < 1 ? '' : 'none'; }
}

// ---------- 하늘·바다·낮밤 ----------
const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshLambertMaterial({ color: 0x2c7cc0, transparent: true, opacity: 0.72, depthWrite: false }));
sea.rotation.x = -Math.PI / 2; scene.add(sea);
const stars = (() => { const n = 260, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = ((i * 97.31) % 1000) / 1000 * Math.PI * 2, e = 0.15 + ((i * 53.77) % 1000) / 1000 * 1.2; pos[i * 3] = Math.cos(a) * Math.cos(e) * 400; pos[i * 3 + 1] = Math.sin(e) * 400; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 400; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const s = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false })); s.frustumCulled = false; scene.add(s); return s; })();
const mkDisc = (cv) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: tex(cv), transparent: true, alphaTest: 0.4, fog: false, depthWrite: false })); scene.add(m); return m; };
const sunM = mkDisc(Art.sun), moonM = mkDisc(Art.moon);
function sky() {
  const hour = S.min / 60, night = nightOf(hour), bands = Art.sky(hour, 18);
  scene.background = new THREE.Color(bands[6]); scene.fog = new THREE.Fog(new THREE.Color(bands[12]), 50, VIEW);
  ambient.intensity = 0.7 - night * 0.38; sunL.intensity = 0.7 - night * 0.5;
  stars.material.opacity = night; stars.position.copy(camera.position);
  const place = (m, t) => { m.visible = t >= 0 && t <= 1; const a = t * Math.PI; m.position.set(camera.position.x - Math.cos(a) * 300, camera.position.y + Math.sin(a) * 260 - 10, camera.position.z - 120); m.lookAt(camera.position); };
  place(sunM, (hour - 6) / 12); place(moonM, ((hour + 6) % 24) / 12);
  sea.position.set(camera.position.x, SEA - 0.1, camera.position.z);
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
  for (const d of S.placed) { const [wx, , wz] = devWorld(d); if (Math.abs(x - wx) < 1 + HALF && Math.abs(z - wz) < 1 + HALF && y < SEA + 1.8) return true; }
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
  { const lo = -12, hi = N + 24; if (p.x < lo || p.x > hi || p.z < -12 || p.z > N + 12) { p.x = Math.max(lo, Math.min(hi, p.x)); p.z = Math.max(-12, Math.min(N + 12, p.z)); const t = performance.now(); if (t - seaHintAt > 5000) { seaHintAt = t; say('바다가 거칠어서 더 멀리 헤엄칠 수 없어요. 뗏목으로 항해하세요 (항구 표지판).'); } } }
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
function collectTargets() {
  const out = [], add = (kind, ref, wx, wy, wz, label, r) => out.push({ kind, ref, wx, wy, wz, label, r, x: wx, y: wy });
  for (const o of isl.objs) {
    if ((o.type === 'fragment' && S.f.raft) || melted(o)) continue;
    const n = NODE[o.type], label = { box: '광장 보급 상자', altar: '솥 골렘 제단', harbor: '항구 표지판 (항해)', board: '유리병 편지 게시판', fragment: '뗏목 파편 (수리)' }[o.type];
    add(o.type, o, o.x, o.y + (o.type === 'rock' || o.type === 'iceblock' ? 0.7 : n ? Math.min(2.2, n[4] / 4) : 1), o.z, n ? `${n[3]} (${n[2] - (S.nodes[o.id] || 0)}/${n[2]})` : label, OBJ_R[o.type] || 1.1);
  }
  for (const d of S.placed) { const [x, y, z] = devWorld(d); add('dev', d, x, y + 0.9, z, DEV[d.id].name + (d.s.broken ? ' (파손)' : ''), 1.4); }
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
function ghostCell() {
  const [o, d] = lookRay(); if (d.y > -0.02) return null;
  const tt = (SEA - o.y) / d.y; if (tt <= 0 || tt > 12) return null;
  const hx = o.x + d.x * tt, hz = o.z + d.z * tt, { cx, cz } = raftDims();
  return { gx: Math.floor(hx - RX0 - 0.5), gz: Math.floor(hz - RZ0 - 0.5), cx, cz, hx, hz };
}
function ghostCheck(id, c) {
  const def = DEV[id];
  if (!c) return { ok: false, msg: '뗏목 바닥을 바라보세요.' };
  if (c.gx < 0 || c.gz < 0 || c.gx + 2 > c.cx || c.gz + 2 > c.cz) return { ok: false, msg: '뗏목 위에 지어야 합니다. (뗏목이 모자라면 건설 메뉴에서 넓히세요)' };
  if (S.placed.some(d => Math.abs(d.x - c.gx) < 2 && Math.abs(d.y - c.gz) < 2)) return { ok: false, msg: '다른 장치와 겹칩니다.' };
  if (def.needFire && !Sim.fireNear(S, { x: c.gx, y: c.gz }).length) return { ok: false, msg: `${def.name}은(는) 화덕 바로 옆에 지어야 합니다. (열 전달)` };
  return { ok: true };
}
function placeAtLook() {
  if (mode.startsWith('build:')) {
    const id = mode.slice(6), c = ghostCell(), g = ghostCheck(id, c);
    if (!g.ok) return say(g.msg);
    if (Sim.act.place(S, id, c.gx, c.gz, undefined, `뗏목 격자 (${c.gx}, ${c.gz})`)) mode = null;
    flush(); refresh(); return;
  }
  if (mode === 'demolish') {
    const t = aimedTarget();
    if (!t || t.kind !== 'dev') return say('철거할 장치를 바라보세요.');
    Sim.act.demolish(S, t.ref); flush(); mode = null; refresh();
  }
}
function useAction() {   // 우클릭: 건설·철거 모드 > 선택한 도구
  if (UI.isModalOpen()) return;
  if (mode) return placeAtLook();
  if (!sel) return;
  if (TOOL[sel] === 'salt') useShaker(); else if (TOOL[sel] === 'thermo') useThermo();
  flush();
}
function doInteract() { const t = aimedTarget(); if (!t) return; lastTarget = t; interact(t); }

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
  else if (k === 'q' || k === 'escape') { if (mode || sel) { mode = null; sel = null; say('취소'); } }
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
function selectItem(k) { sel = sel === k ? null : k; mode = null; say(sel ? `${ITEM[sel][1]}: 바라보고 우클릭 (Q 취소)` : '취소'); }
[['hammer', '건설', () => openBuild()], ['gear', '제작', () => openCraft()], ['book', '연구 노트', () => window.Notes && Notes.open(api)], ['scroll', '기록', () => openLog()], ['disk', '저장/계정', () => openSave()]].forEach(([icon, label, fn]) => {
  const b = document.createElement('button'); b.title = label; b.innerHTML = `<i style="background-image:url(${Art.iconURL[icon]})"></i>`; b.onclick = fn; menu3.appendChild(b);
});
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
  spd.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.sp === S.speed));
  const t = !UI.isModalOpen() && canAct() ? aimedTarget() : null;
  $('target').textContent = mode && mode.startsWith('build:') ? `${DEV[mode.slice(6)].name} 짓기 — 뗏목 바닥을 보고 우클릭, Q 취소`
    : mode === 'demolish' ? '철거 — 장치를 보고 우클릭, Q 취소'
    : sel ? `${ITEM[sel][1]} — 바라보고 우클릭, Q 취소`
    : t ? `[E] ${t.label}` : (dig.on && dig.need ? `캐는 중 ${Math.round(dig.p / dig.need * 100)} %` : 'WASD 이동 · Space 점프 · 마우스 시점 · E 또는 좌클릭 열기·채집(바위·얼음은 꾹) · 우클릭 도구 사용');
}
// 시선 아래 칸 표시(파기 대상) + 건설 미리보기
const marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 5), new THREE.MeshBasicMaterial({ color: 0xffd84a })); marker.rotation.x = Math.PI; marker.visible = false; scene.add(marker);   // 조준한 대상 위에 떠 있는 표시(7-c에서 윤곽 강조로 다듬는다)
function updateAim() {
  const open = UI.isModalOpen() || !canAct();
  ghost.visible = !!(mode && mode.startsWith('build:')) && !open;
  if (ghost.visible) { const c = ghostCell(), g = ghostCheck(mode.slice(6), c); ghost.material.color.set(g.ok ? 0x66ff88 : 0xff6666); if (c) ghost.position.set(RX0 + c.gx + 1, SEA + 0.9, RZ0 + c.gz + 1); else ghost.visible = false; }
  const t = open || mode ? null : aimedTarget();
  marker.visible = !!t && t.kind !== 'water'; if (t) marker.position.set(t.wx, t.wy + (t.r || 1) + 0.5 + Math.sin(tNow * 5) * 0.08, t.wz);
}

// ---------- 시간·저장·시작·항해 ----------
let tNow = 0, last = performance.now();
setInterval(() => { if (Store.paused || (window.Raid && Raid.active)) return; advance(S.speed); UI.tick(); refresh(); }, 500);
function savePos() { S.fp.x = p.x; S.fp.y = p.y; S.fp.z = p.z; S.fp.yaw = yaw; S.fp.pitch = pitch; }
setInterval(() => { savePos(); save(); }, 5000);
addEventListener('pagehide', () => { savePos(); save(true); });
// 항해: 'moved' 이벤트(Sim.act.sail) → 화면이 어두워졌다 밝아지는 동안 새 섬을 불러오고 뗏목 위에 선다
let fpRef = S.fp;
function resetFromState() {
  p.x = S.fp.x; p.y = S.fp.y; p.z = S.fp.z; p.vx = p.vy = p.vz = 0; yaw = S.fp.yaw; pitch = S.fp.pitch;
  loadIsland(islandName()); if (blocked(p.x, p.y, p.z)) { const f = findFree(); if (f) { p.x = f[0]; p.z = f[1]; p.y = SEA; } }
  loadPlaza(); joinPresence();
}
function onMoved() {
  const f = $('fade'); f.style.opacity = 1;
  setTimeout(() => { arrive(); setTimeout(() => { f.style.opacity = 0; }, 150); }, TEST ? 50 : 500);
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
  startBuild(id) { mode = 'build:' + id; sel = null; $('modal').hidden = true; say(`${DEV[id].name}을(를) 지을 곳을 바라보고 우클릭하세요. (Q 취소)`); },
  startDemolish() { mode = 'demolish'; sel = null; $('modal').hidden = true; say('철거할 장치를 바라보고 우클릭하세요. (Q 취소)'); },
  joinMap() { joinPresence(); },
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
  camera.position.set(p.x, p.y + EYE, p.z); camera.rotation.set(pitch, yaw, 0, 'YXZ');
  syncRaft(); updateObjects(); syncDevices(tNow); syncWolves(tNow); sky(); updateAim(); drawHUD(); placeLabels(); syncPlaza(); placePlazaLabels();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

ensureFp(); loadIsland(islandName());
{ const free = blocked(p.x, p.y, p.z) ? findFree() : null; if (free) { p.x = free[0]; p.z = free[1]; p.y = SEA; } }
refresh(); requestAnimationFrame(frame);
Store.paused = true;
$('t-info').textContent = S.day > 1 || S.qDone > 0 ? `저장된 진행: ${S.day}일차 · 목표 ${S.qDone}/${QUESTS.length}` : '새 게임';
function startGame() {
  if ($('title').hidden) return;
  $('title').hidden = true; Store.paused = false; loadPlaza();
  if (!TEST) cv.requestPointerLock();
  boot().then(() => { let seen = false; try { seen = !!localStorage.getItem(HELP_KEY); } catch { /* 무시 */ } if (!seen && $('auth').hidden) openHelp(); });
}
$('t-start').onclick = startGame;
$('t-help').onclick = () => openHelp();
window.__fp = { targets: collectTargets, scene, camera, S, p, groundAt, terrainHit, aimedTarget, getMode: () => mode, setLook(y, pt) { yaw = y; pitch = pt; }, island: () => isl, islName: () => islName, dig, ghostCell, stepPlayer, setSel(k) { sel = k; } };   // 시험(tools/smokefp.js)용 통로
