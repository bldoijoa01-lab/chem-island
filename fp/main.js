// 화학 섬 이야기 — 1인칭 3D(fp/). 복셀 월드를 마우스로 둘러보며 걷는다.
// 화학 계산은 chem.js와 sim.js를 그대로 쓰고(여기서 식을 만들지 않는다), 이 파일은 "어디에 있는가"(위치·충돌·복셀)만 다룬다.
// 상태는 Store.S(= Sim 상태) + S.fp(위치·시점·파낸 복셀). 2D 전용 S.px·S.py는 쓰지 않는다. 저장 키는 chemisle_fp_v1(2D와 따로).
import * as THREE from 'three';
import { N, HGT, SEA, SEABED, RX0, RZ0, ISLANDS, OFFSET, Island } from './gen.js';
import { buildAtlas, chunkData } from './mesh.js';

const C = Chem, Art = window.Art, S = Store.S;
const { ITEM, NODE, DIG, BLOCK, TOOL, AIR, GRASS, DIRT, STONE, SAND, SNOWTOP, ICE, WATER, RAFT, ICE_TILE_G, SHAKE_G, UNDER_T } = World;
const { DEV, QUESTS, FIRE_T, FIRE_NAME } = Sim;
const { $, fmt, say, flush, advance, refresh, closeModal, interact, openBuild, openCraft, openLog, openHelp, openSave, boot, loadPlaza, api, capText, pAtm, HELP_KEY } = UI;
const save = Store.save;
const TEST = /[?&]test\b/.test(location.search);   // 시험(tools/smokefp.js)에서는 포인터 잠금 없이 조작을 받는다

// ---------- 1인칭 전용 상수: 모두 "가정(임의값)" (DESIGN.md §4-15) ----------
const WALK = 72 / 16, SWIM = 42 / 16, JUMP = 270 / 16, GRAV = 900 / 16, GRAV_W = 300 / 16, FALL_MAX = 400 / 16, FALL_W = 70 / 16;   // 2D의 px/s를 16 px = 1칸으로 바꾼 값
const SURF_JUMP = 240 / 16;     // 수면에서 뛰어오르는 속도(2D world.js의 SURF_JUMP와 같은 값)
const HALF = 0.3, BODY = 1.8, EYE = 1.6;   // 몸 폭 0.6칸, 키 1.8칸, 눈높이 1.6칸
const REACH = 5;                // 손이 닿는 거리(칸)
const SENS = 0.0022;            // 마우스 감도(rad/px)
const FOV = 70, VIEW = 220;     // 시야각(°), 안개가 끝나는 거리(칸)
const CH = 16;                  // 청크 크기(열)
const nightOf = h => h >= 21 || h < 5 ? 1 : h >= 18 ? (h - 18) / 3 : h < 7 ? (7 - h) / 2 : 0;

// ---------- 상태 ----------
function ensureFp() {
  if (!S.fp) S.fp = { x: RX0 - 3.5, y: SEA + 2, z: RZ0 + 2.5, yaw: -Math.PI / 2, pitch: 0, mods: {} };
  if (!S.fp.mods) S.fp.mods = {};
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
const atlas = buildAtlas(THREE);
const terrainMat = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true });
const texCache = new Map();
const tex = (cv) => { let t = texCache.get(cv); if (!t) { t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; texCache.set(cv, t); } return t; };
// 2D 그림을 세운 두 장의 판(X자)으로 세운다: 밑면 가운데가 (0,0,0)
function cross(cv, scale = 1) {
  const g = new THREE.Group(), w = cv.width / 16 * scale, h = cv.height / 16 * scale;
  const mat = new THREE.MeshLambertMaterial({ map: tex(cv), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  for (const r of [0, Math.PI / 2]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.y = h / 2; m.rotation.y = r; g.add(m); }
  g.userData.h = h; return g;
}

// ---------- 섬(복셀) ----------
let isl = null, islName = '', chunks = new Map(), farGroup = new THREE.Group(), objGroup = new THREE.Group(), raftMesh = null, raftSig = '';
scene.add(farGroup, objGroup);
const modsOf = () => (S.fp.mods[islName] || (S.fp.mods[islName] = {}));
const raftCell = (x, z) => { const { cx, cz } = raftDims(); return x >= RX0 && x < RX0 + cx && z >= RZ0 && z < RZ0 + cz; };
// 단단한 칸인가(충돌·시선): 뗏목 바닥(y = SEA − 1)은 섬 복셀이 아니라 겹쳐 그린 덮개다
function voxel(x, y, z) { if (y === SEA - 1 && raftCell(x, z)) return RAFT; return isl.get(x, y, z); }
const solid = (x, y, z) => { const id = voxel(x, y, z); return id !== AIR && id !== WATER; };

function buildChunk(cx, cz) {
  const k = cx + ',' + cz, old = chunks.get(k);
  if (old) { scene.remove(old); old.geometry.dispose(); chunks.delete(k); }
  const d = chunkData({ get: voxel }, cx, cz, CH);
  if (!d.idx.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
  g.setIndex(d.idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, terrainMat); m.frustumCulled = false; scene.add(m); chunks.set(k, m);
}
const dirty = new Set();
function markDirty(x, z) { for (const [dx, dz] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) { const cx = Math.floor((x + dx) / CH), cz = Math.floor((z + dz) / CH); if (cx >= 0 && cz >= 0 && cx < N / CH && cz < N / CH) dirty.add(cx + ',' + cz); } }
function rebuildAll() { for (const m of chunks.values()) { scene.remove(m); m.geometry.dispose(); } chunks.clear(); for (let cx = 0; cx < N / CH; cx++) for (let cz = 0; cz < N / CH; cz++) buildChunk(cx, cz); }

// 멀리 보이는 다른 섬: 4×4칸 묶음의 기둥 하나씩(낮은 해상도). 한 번 만들어 두고 위치만 활성 섬 기준으로 옮긴다
const farCache = {};
const FAR_COL = { [GRASS]: 0x5a9e3a, [SAND]: 0xe0c677, [STONE]: 0x888d96, [SNOWTOP]: 0xeef6fb, [DIRT]: 0x8a5a35, [ICE]: 0x9fd8f0 };
function farIsland(name) {
  if (farCache[name]) return farCache[name];
  const I = new Island(name), cells = [], K = 4;
  for (let z = 0; z < N; z += K) for (let x = 0; x < N; x += K) {
    let h = 0; for (let dz = 0; dz < K; dz++) for (let dx = 0; dx < K; dx++) h += I.topY(x + dx, z + dz); h /= K * K;
    if (h <= SEA) continue;
    cells.push([x + K / 2, h, z + K / 2, FAR_COL[I.get(x, Math.floor(h) - 1, z)] || 0x5a9e3a]);
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(K, 1, K), new THREE.MeshLambertMaterial(), cells.length), dm = new THREE.Object3D(), col = new THREE.Color();
  cells.forEach(([x, h, z, c], i) => { dm.position.set(x, h / 2, z); dm.scale.set(1, h, 1); dm.updateMatrix(); mesh.setMatrixAt(i, dm.matrix); mesh.setColorAt(i, col.set(c)); });
  mesh.frustumCulled = false; return (farCache[name] = mesh);
}
function setFar() {
  farGroup.clear();
  for (const n of ISLANDS) if (n !== islName) { const m = farIsland(n), o = new THREE.Group(); o.add(m); o.position.set(OFFSET[n][0] - OFFSET[islName][0], 0, OFFSET[n][1] - OFFSET[islName][1]); farGroup.add(o); }
}

// ---------- 자원·시설·장치·늑대 모형 ----------
const OBJ_ART = { cane: 'cane', wheat: 'wheat', sandpile: 'sandpile', icecrystal: 'icecrystal', rocksalt: 'rocksalt', harbor: 'harbor', box: 'box', board: 'board', fragment: 'fragment' };
const OBJ_R = { tree: 1.5, altar: 1.6, harbor: 1.0, board: 1.0, box: 1.0, fragment: 1.0 };
const objMeshes = new Map(), devMeshes = new Map(), wolfMeshes = new Map();
function buildObjects() {
  objGroup.clear(); objMeshes.clear();
  for (const o of isl.objs) {
    let cv = o.type === 'tree' ? (islName === 'alpine' || isl.get(Math.floor(o.x), Math.floor(o.y) - 1, Math.floor(o.z)) === SNOWTOP ? Art.obj.pine : Art.obj.tree) : o.type === 'altar' ? Art.dev.altar : Art.obj[OBJ_ART[o.type]];
    if (!cv) continue;
    const g = cross(cv, o.type === 'tree' ? 1 : 1); g.position.set(o.x, o.y, o.z); objGroup.add(g); objMeshes.set(o, g);
  }
}
function updateObjects() {
  for (const [o, g] of objMeshes) {
    const n = NODE[o.type], spent = n && (S.nodes[o.id] || 0) >= n[2];
    g.visible = o.type === 'fragment' ? !S.f.raft : true;
    g.children.forEach(m => { m.material.opacity = spent ? 0.4 : 1; });
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
  islName = name; isl = new Island(name); isl.applyMods(S.fp.mods[name]);
  rebuildAll(); setFar(); buildObjects(); raftSig = ''; syncRaft();
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
function hitsBody(x, y, z) {
  const x0 = Math.floor(x - HALF), x1 = Math.floor(x + HALF - 1e-4), z0 = Math.floor(z - HALF), z1 = Math.floor(z + HALF - 1e-4), y0 = Math.floor(y), y1 = Math.floor(y + BODY - 1e-4);
  for (let vx = x0; vx <= x1; vx++) for (let vy = y0; vy <= y1; vy++) for (let vz = z0; vz <= z1; vz++) if (solid(vx, vy, vz)) return true;
  for (const d of S.placed) { const [wx, , wz] = devWorld(d); if (x + HALF > wx - 1 && x - HALF < wx + 1 && z + HALF > wz - 1 && z - HALF < wz + 1 && y < SEA + 1.8 && y + BODY > SEA) return true; }   // 장치도 막는다
  return false;
}
let seaHintAt = 0;
function stepPlayer(dt, ax, az, jump) {
  if (hitsBody(p.x, p.y, p.z)) { for (let i = 0; i < 60 && hitsBody(p.x, p.y, p.z); i++) p.y += 0.1; p.vy = 0; }   // 단단한 칸 안에 끼었으면(순간 이동·블록 변경) 위로 빠져나온다
  p.inW = voxel(Math.floor(p.x), Math.floor(p.y + 0.9), Math.floor(p.z)) === WATER;
  const sp = p.inW ? SWIM : WALK, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  let mx = fx * az + rx * ax, mz = fz * az + rz * ax; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  p.vx = mx * sp; p.vz = mz * sp;
  if (jump) {
    if (p.onGround) { p.vy = JUMP; p.onGround = false; }   // 바닥을 딛고 있으면 물속에서도 뛴다(2D와 같은 규칙)
    else if (p.inW) { const surface = voxel(Math.floor(p.x), Math.floor(p.y + BODY + 0.1), Math.floor(p.z)) !== WATER; p.vy = surface ? SURF_JUMP : Math.min(p.vy + 700 / 16 * dt, 60 / 16); }
  }
  p.vy = Math.max(p.vy - (p.inW ? GRAV_W : GRAV) * dt, -(p.inW ? FALL_W : FALL_MAX));
  const nx = p.x + p.vx * dt; if (!hitsBody(nx, p.y, p.z)) p.x = nx;   // 자동 오르기 없음: 막히면 멈춘다(점프로만 넘는다)
  const nz = p.z + p.vz * dt; if (!hitsBody(p.x, p.y, nz)) p.z = nz;
  { const lo = -12, hi = N + 24; if (p.x < lo || p.x > hi || p.z < -12 || p.z > N + 12) { p.x = Math.max(lo, Math.min(hi, p.x)); p.z = Math.max(-12, Math.min(N + 12, p.z)); const t = performance.now(); if (t - seaHintAt > 5000) { seaHintAt = t; say('바다가 거칠어서 더 멀리 헤엄칠 수 없어요. 뗏목으로 항해하세요 (항구 표지판).'); } } }
  const ny = p.y + p.vy * dt;
  if (!hitsBody(p.x, ny, p.z)) { p.y = ny; p.onGround = false; }
  else { if (p.vy < 0) { p.y = Math.ceil(ny - 1e-6); if (hitsBody(p.x, p.y, p.z)) p.y = ny + 0.001; } p.vy = 0; }
  p.onGround = hitsBody(p.x, p.y - 0.02, p.z) && p.vy <= 0;
  if (p.y < -5) { p.x = RX0 - 3.5; p.y = SEA + 2; p.z = RZ0 + 2.5; p.vy = 0; }   // 구멍 밖으로 떨어졌을 때
}

// ---------- 시선: 복셀 레이캐스트(DDA) ----------
const dirV = new THREE.Vector3(), eyeV = new THREE.Vector3();
function lookRay() { camera.getWorldDirection(dirV); eyeV.copy(camera.position); return [eyeV, dirV]; }
// 첫 단단한 칸을 찾는다. 반환: { x, y, z, nx, ny, nz(바깥쪽 이웃), id, dist }
function raycast(o, d, maxD) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = d.x ? Math.abs(1 / d.x) : Infinity, tdy = d.y ? Math.abs(1 / d.y) : Infinity, tdz = d.z ? Math.abs(1 / d.z) : Infinity;
  let tx = d.x ? ((sx > 0 ? x + 1 - o.x : o.x - x)) * tdx : Infinity, ty = d.y ? ((sy > 0 ? y + 1 - o.y : o.y - y)) * tdy : Infinity, tz = d.z ? ((sz > 0 ? z + 1 - o.z : o.z - z)) * tdz : Infinity;
  let px = x, py = y, pz = z, t = 0;
  for (let i = 0; i < 64 && t <= maxD; i++) {
    const id = voxel(x, y, z);
    if (id !== AIR && id !== WATER) return { x, y, z, nx: px, ny: py, nz: pz, id, dist: t };
    px = x; py = y; pz = z;
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; } else if (ty < tz) { y += sy; t = ty; ty += tdy; } else { z += sz; t = tz; tz += tdz; }
  }
  return null;
}

// ---------- 상호작용 대상(공용 ui.js의 interact가 받는 모양 { kind, ref, label }) ----------
function collectTargets() {
  const out = [], add = (kind, ref, wx, wy, wz, label, r) => out.push({ kind, ref, wx, wy, wz, label, r, x: wx, y: wy });
  for (const o of isl.objs) {
    if (o.type === 'fragment' && S.f.raft) continue;
    const n = NODE[o.type], label = { box: '광장 보급 상자', altar: '솥 골렘 제단', harbor: '항구 표지판 (항해)', board: '유리병 편지 게시판', fragment: '뗏목 파편 (수리)' }[o.type];
    add(o.type, o, o.x, o.y + (n ? Math.min(2.2, n[4] / 4) : 1), o.z, n ? `${n[3]} (${n[2] - (S.nodes[o.id] || 0)}/${n[2]})` : label, OBJ_R[o.type] || 1.1);
  }
  for (const d of S.placed) { const [x, y, z] = devWorld(d); add('dev', d, x, y + 0.9, z, DEV[d.id].name + (d.s.broken ? ' (파손)' : ''), 1.4); }
  for (const m of S.mobs) { const [x, y, z] = wolfWorld(m); add('wolf', m, x, y + 0.6, z, `서리 늑대 ${fmt(m.M, 0)} g`, 1.0); }
  return out;
}
// 보고 있는 대상: 시선과의 거리가 반지름 안이고 손이 닿으며 앞을 가린 복셀이 없는 것 중 가장 가까운 것
function aimedTarget() {
  const [o, d] = lookRay(), wall = raycast(o, d, REACH + 1), best = { t: null, s: 1e9 };
  for (const t of collectTargets()) {
    const vx = t.wx - o.x, vy = t.wy - o.y, vz = t.wz - o.z, along = vx * d.x + vy * d.y + vz * d.z;
    if (along < 0.2 || along > REACH + t.r) continue;
    const px = vx - d.x * along, py = vy - d.y * along, pz = vz - d.z * along;
    if (Math.hypot(px, py, pz) > t.r) continue;
    if (wall && wall.dist < along - t.r) continue;
    if (along < best.s) { best.s = along; best.t = t; }
  }
  if (best.t) return best.t;
  // 바다: 아래를 보고 있고 수면이 손이 닿는 거리에 있으면 바닷물 뜨기
  if (d.y < -0.05) { const tt = (SEA - 0.1 - o.y) / d.y; if (tt > 0 && tt <= REACH && !(wall && wall.dist < tt)) return { kind: 'water', ref: null, wx: o.x + d.x * tt, wy: SEA, wz: o.z + d.z * tt, label: '바닷물 뜨기' }; }
  return null;
}

// ---------- 땅 파기 · 블록 놓기 · 도구 (규칙 데이터는 world.js의 DIG·BLOCK·TOOL, 위치만 복셀) ----------
const dig = { on: false, key: '', p: 0, need: 0 };
function holdsThing(x, y, z) {   // 장치·자원이 서 있는 바로 아래 땅은 파지 못한다(2D와 같은 규칙)
  return isl.objs.some(o => Math.floor(o.x) === x && Math.floor(o.z) === z && Math.floor(o.y) === y + 1);
}
function digCheck(h) {
  const id = h.id;
  if (id === RAFT) return { ok: false, msg: '뗏목은 팔 수 없습니다.' };
  if (!DIG[id]) return { ok: false, msg: '' };
  if (h.y <= 0) return { ok: false, msg: '맨 아래는 팔 수 없습니다.' };
  if (holdsThing(h.x, h.y, h.z)) return { ok: false, msg: '장치나 자원 바로 아래 땅은 팔 수 없습니다.' };
  const def = DIG[id];
  if (def.tool && !(S.inv[def.tool] > 0)) return { ok: false, msg: '돌은 곡괭이가 있어야 팔 수 있어요.' };
  return { ok: true, def };
}
function setVoxel(x, y, z, id) {
  const k = x + ',' + y + ',' + z, m = modsOf();
  isl.set(x, y, z, id); m[k] = id; isl.refreshTop(); markDirty(x, z);
}
let digMsg = false;
function stepDig(dt) {
  if (!dig.on || mode || UI.isModalOpen() || sel) { dig.p = 0; return; }
  const [o, d] = lookRay(), h = raycast(o, d, REACH);
  if (!h) { dig.p = 0; return; }
  const key = h.x + ',' + h.y + ',' + h.z;
  if (key !== dig.key) { dig.key = key; dig.p = 0; digMsg = false; }
  const c = digCheck(h);
  if (!c.ok) { dig.p = 0; if (c.msg && !digMsg) { digMsg = true; say(c.msg); } return; }
  dig.need = c.def.t; dig.p += dt;
  if (dig.p < c.def.t) return;
  setVoxel(h.x, h.y, h.z, AIR); S.inv[c.def.item] = (S.inv[c.def.item] || 0) + 1; dig.p = 0;
  puff(h.x + 0.5, h.y + 0.5, h.z + 0.5, h.id === STONE ? '#8b919c' : h.id === SAND ? '#f6e7b0' : h.id === ICE || h.id === SNOWTOP ? '#d8f3ff' : '#8a5a35', 8);
  say(`${ITEM[c.def.item][1]} +1`);
}
function placeBlock(item) {
  if (!(S.inv[item] >= 1)) return say(`${ITEM[item][1]}이(가) 없습니다.`);
  const [o, d] = lookRay(), h = raycast(o, d, REACH);
  if (!h) return say('놓을 곳을 바라보세요.');
  const { nx: x, ny: y, nz: z } = h;
  if (y < 0 || y >= HGT || voxel(x, y, z) !== AIR && voxel(x, y, z) !== WATER) return say('빈 공간에만 놓을 수 있습니다.');
  if (x + 1 > p.x - HALF && x < p.x + HALF && z + 1 > p.z - HALF && z < p.z + HALF && y + 1 > p.y && y < p.y + BODY) return say('내가 서 있는 자리에는 놓을 수 없습니다.');
  if (isl.objs.some(q => Math.abs(q.x - (x + 0.5)) < 1.2 && Math.abs(q.z - (z + 0.5)) < 1.2 && y >= q.y - 1 && y < q.y + 3) || S.placed.some(q => { const [wx, , wz] = devWorld(q); return Math.abs(wx - (x + 0.5)) < 1.5 && Math.abs(wz - (z + 0.5)) < 1.5 && y >= SEA && y < SEA + 2; })) return say('장치나 자원 자리에는 놓을 수 없습니다.');
  S.inv[item]--; setVoxel(x, y, z, BLOCK[item]);
  if (S.inv[item] < 1) sel = null;
}
// 온도계·소금 뿌리개: 2D(world.js)와 같은 식(Chem)과 상수(ICE_TILE_G, SHAKE_G, UNDER_T)를 쓴다
function useThermo() {
  const t = aimedTarget(), airTemp = () => Sim.airTemp(S);
  let name, val, note;
  if (t && t.kind === 'dev') {
    const d = t.ref; name = DEV[d.id].name;
    if (d.id === 'fire') { const on = d.s.level > 0 && d.s.fuel > 0; val = on ? FIRE_T[d.s.level] : airTemp(); note = on ? `열원 (${FIRE_NAME[d.s.level]})` : '꺼져 있어 외기와 같음'; }
    else if (d.id === 'still' || d.id === 'cooker') { val = Sim.heatOf(S, d); note = '옆 화덕이 주는 열원 온도'; }
    else if (d.id === 'cooler') { const has = S.packs.length > 0; val = has ? Math.min(...S.packs.map(q => q.T)) : airTemp(); note = has ? '가장 찬 한제 팩' : '팩이 없어 외기와 같음'; }
    else { val = airTemp(); note = '외기와 같음'; }
  } else {
    const [o, d] = lookRay(), h = raycast(o, d, REACH);
    if (!h) return say('온도를 잴 곳을 바라보세요.');
    const under = h.id !== RAFT && h.y < isl.topY(h.x, h.z) - 1;
    val = under ? UNDER_T : airTemp(); name = under ? `지하 (${h.x}, ${h.y}, ${h.z})` : `외기 (${h.x}, ${h.y}, ${h.z})`;
    note = under ? `가정: 지하는 깊이와 상관없이 ${UNDER_T} ℃로 일정` : '시각에 따라 변하는 외기 온도';
  }
  say(`온도계: ${name} ${fmt(val, 1)} ℃ — ${note}`);
  Sim.logEv(S, '온도 측정', `${name} ${fmt(val, 1)}℃ (${note})`);
}
function useShaker() {
  if (S.inv.salt < 1) return say('소금이 없습니다.');
  const T0 = Sim.airTemp(S), s = Math.min(SHAKE_G, S.inv.salt), t = aimedTarget();
  if (t && t.kind === 'wolf') { Sim.act.saltOnWolf(S, t.ref, s); return; }
  const [o, d] = lookRay(), h = raycast(o, d, REACH);
  if (!h || (h.id !== ICE && h.id !== SNOWTOP)) return say('얼음·눈 칸이나 서리 늑대에게 뿌리세요.');
  const k = islName + ':' + h.x + ',' + h.y + ',' + h.z, had = S.melt[k] || 0, left = ICE_TILE_G - had, melt = C.iceMeltBySalt(T0, s);
  if (melt <= 0) return say('기온이 0 ℃ 이상이라 소금이 필요 없어요.');
  const used = melt >= left ? Math.min(s, C.saltForIce(T0, left)) : s, done = Math.min(melt, left);
  S.inv.salt -= used; S.melt[k] = had + done;
  Sim.logEv(S, '소금 뿌림(얼음 칸)', `기온 ${fmt(T0, 1)}℃ (m_eq=${fmt(-T0 / (2 * C.KF), 2)} mol/kg), 소금 ${fmt(used, 1)} g → 얼음 ${fmt(done, 0)} g 융해 (칸 ${fmt(had + done, 0)}/${ICE_TILE_G} g)`);
  puff(h.x + 0.5, h.y + 1, h.z + 0.5, '#d8f3ff', 8);
  if (had + done >= ICE_TILE_G - 1e-6) { delete S.melt[k]; setVoxel(h.x, h.y, h.z, WATER); say('얼음이 모두 녹아 물이 되었습니다.'); if (islName === 'polar') S.f.polarMelt = true; }
  else say(`얼음 ${fmt(done, 0)} g 융해 (칸 ${fmt(had + done, 0)}/${ICE_TILE_G} g). 소금 ${fmt(used, 1)} g 사용`);
}

// ---------- 건설(뗏목 격자 위의 2×2) ----------
let mode = null, sel = null;   // mode: 'build:<id>' | 'demolish' · sel: 가방에서 고른 블록·도구 아이템
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
function useAction() {   // 우클릭: 건설·철거 모드 > 선택한 블록·도구
  if (UI.isModalOpen()) return;
  if (mode) return placeAtLook();
  if (!sel) return;
  if (BLOCK[sel]) return placeBlock(sel);
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
cv.addEventListener('mousedown', e => { if (!canAct() || !$('modal').hidden) return; if (e.button === 0) dig.on = true; else if (e.button === 2) useAction(); });
addEventListener('mouseup', e => { if (e.button === 0) dig.on = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { const u = usable().map(x => x.k).concat([null]), i = u.indexOf(sel); const n = u[(i + (e.deltaY > 0 ? 1 : -1) + u.length) % u.length]; if (n !== sel) selectItem(n === null ? sel : n); }, { passive: true });   // 휠: 블록·도구 바꾸기

// ---------- HUD(HTML) ----------
const inv3 = $('inv3'), menu3 = $('menu3'), spd = $('spd3');
const usable = () => Object.entries(S.inv).filter(([k, v]) => v >= 1 && (BLOCK[k] || TOOL[k])).map(([k, v]) => ({ k, n: Math.floor(v) }));
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
      const b = document.createElement('button'), usableItem = BLOCK[it.k] || TOOL[it.k]; b.className = 'slot';
      b.title = `${it.name} ${it.n}` + (BLOCK[it.k] ? ' (선택 후 우클릭: 놓기)' : TOOL[it.k] ? ' (선택 후 우클릭: 사용)' : it.k === 'pickaxe' ? ' (돌을 팔 때 자동 사용)' : '');
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
    : t ? `[E] ${t.label}` : (dig.on && dig.need ? `파는 중 ${Math.round(dig.p / dig.need * 100)} %` : 'WASD 이동 · Space 점프 · 마우스 시점 · 좌클릭(꾹) 땅 파기 · 우클릭 놓기/사용 · E 열기');
}
// 시선 아래 칸 표시(파기 대상) + 건설 미리보기
const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01)), new THREE.LineBasicMaterial({ color: 0x000000 })); outline.visible = false; scene.add(outline);
function updateAim() {
  const open = UI.isModalOpen() || !canAct();
  ghost.visible = !!(mode && mode.startsWith('build:')) && !open;
  if (ghost.visible) { const c = ghostCell(), g = ghostCheck(mode.slice(6), c); ghost.material.color.set(g.ok ? 0x66ff88 : 0xff6666); if (c) ghost.position.set(RX0 + c.gx + 1, SEA + 0.9, RZ0 + c.gz + 1); else ghost.visible = false; }
  const [o, d] = lookRay(), h = open || mode ? null : raycast(o, d, REACH);
  outline.visible = !!h; if (h) outline.position.set(h.x + 0.5, h.y + 0.5, h.z + 0.5);
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
  loadIsland(islandName()); if (hitsBody(p.x, p.y, p.z)) { const f = findFree(); if (f) { p.x = f[0]; p.z = f[1]; p.y = SEA + 0.05; } }
  loadPlaza(); joinPresence();
}
function onMoved() {
  const f = $('fade'); f.style.opacity = 1;
  setTimeout(() => { arrive(); setTimeout(() => { f.style.opacity = 0; }, 150); }, TEST ? 50 : 500);
}
function arrive() {
  loadIsland(islandName()); const { cx, cz } = raftDims();
  p.x = RX0 + cx / 2; p.z = RZ0 + cz / 2 + (S.placed.length ? cz / 2 - 0.5 : 0); p.y = SEA + 0.05; p.vx = p.vy = p.vz = 0; yaw = -Math.PI / 2; pitch = 0;
  const free = findFree(); if (free) { p.x = free[0]; p.z = free[1]; }
  loadPlaza(); joinPresence();
}
function findFree() {   // 뗏목 위에서 장치와 겹치지 않는 자리
  const { cx, cz } = raftDims();
  for (let r = 0; r < Math.max(cx, cz); r++) for (let gx = 0; gx < cx; gx++) for (let gz = 0; gz < cz; gz++) { const x = RX0 + gx + 0.5, z = RZ0 + gz + 0.5; if (!hitsBody(x, SEA, z)) return [x, z]; }
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
  stepDig(dt); stepParts(dt); netStep(dt, now);
  for (const k of dirty) { const [cx, cz] = k.split(',').map(Number); buildChunk(cx, cz); } dirty.clear();
  camera.position.set(p.x, p.y + EYE, p.z); camera.rotation.set(pitch, yaw, 0, 'YXZ');
  syncRaft(); updateObjects(); syncDevices(tNow); syncWolves(tNow); sky(); updateAim(); drawHUD(); placeLabels(); syncPlaza(); placePlazaLabels();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

ensureFp(); loadIsland(islandName());
{ const free = hitsBody(p.x, p.y, p.z) ? findFree() : null; if (free) { p.x = free[0]; p.z = free[1]; p.y = SEA + 0.05; } }
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
window.__fp = { targets: collectTargets, scene, camera, S, p, raycast, voxel, aimedTarget, getMode: () => mode, setLook(y, pt) { yaw = y; pitch = pt; }, island: () => isl, islName: () => islName, dig, ghostCell, solid, stepPlayer, setSel(k) { sel = k; } };   // 시험(tools/smokefp.js)용 통로
