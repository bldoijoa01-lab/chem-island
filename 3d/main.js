// 화학 섬 이야기 — 3D 시험판(디오라마 복셀 뷰). 계산은 sim.js·chem.js를 그대로 쓰고(여기서 식을 만들지 않는다),
// 상태 S를 읽어 그리기만 한다. 땅 규칙·이동은 world.js, 말풍선·모달·패널은 ui.js를 2D와 같이 쓴다.
// 두께(z)는 보이기만 하는 값이다: 충돌·거리·화학에 쓰지 않는다.
import * as THREE from 'three';

const C = Chem, Art = window.Art, S = Store.S;
const { T, WW, WH, PW, PH, ITEM, AIR, GRASS, DIRT, STONE, SAND, SNOWTOP, ICE, WATER, RAFT, GY, OBJS, NODE, tileAt, BLOCK, TOOL, dig } = World;
const { DEV, QUESTS } = Sim;
const { $, fmt, say, flush, advance, refresh, closeModal, interact, openBuild, openCraft, openLog, openHelp, openSave, boot, loadPlaza, api, capText, pAtm, HELP_KEY } = UI;
const save = Store.save;

// ---------- 3D 전용 상수: 모두 "가정(임의값)" (DESIGN.md §4-13) ----------
const DEPTH = 5;          // 가정(임의값) 월드 두께(타일 5칸). 보이기만 한다
const Z_MID = DEPTH / 2;  // 가정(임의값) 장치·자원이 서는 깊이
const Z_SPEED = 3;        // 가정(임의값) 깊이 이동 속도(타일/초)
const CAM_DIST = 13.5, CAM_UP = 3.2, FOV = 45;   // 가정(임의값) 카메라
const nightOf = h => h >= 21 || h < 5 ? 1 : h >= 18 ? (h - 18) / 3 : h < 7 ? (7 - h) / 2 : 0;

// ---------- 장면 ----------
const host = $('gl');
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
const ambient = new THREE.AmbientLight(0xffffff, 0.62), sun = new THREE.DirectionalLight(0xffffff, 0.55);
sun.position.set(-8, 14, 20);
scene.add(ambient, sun);
function fit() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
window.addEventListener('resize', fit); fit();

// 2D에서 그린 캔버스 그림을 그대로 질감으로 쓴다(Art는 sprites.js)
const texCache = new Map();
function tex(canvas) {
  let t = texCache.get(canvas);
  if (!t) { t = new THREE.CanvasTexture(canvas); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; texCache.set(canvas, t); }
  return t;
}
const planeGeo = new THREE.PlaneGeometry(1, 1);
// 캔버스 그림을 (x, y) 픽셀(그림 왼쪽 위, 2D의 blit과 같은 좌표)에 세운 판으로 만든다
function sprite(canvas, z, opts = {}) {
  const m = new THREE.Mesh(planeGeo, new THREE.MeshLambertMaterial({ map: tex(canvas), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, ...opts }));
  m.scale.set(canvas.width / T, canvas.height / T, 1);
  m.userData = { w: canvas.width, h: canvas.height, z, pad: canvas.pad || 0 };
  return m;
}
function putSprite(m, x, y, flip) {   // x, y = 2D에서 blit에 넘기던 값(패딩 보정은 여기서)
  const { w, h, z, pad } = m.userData;
  m.position.set((x - pad + w / 2) / T, -(y - pad + h / 2) / T, z);
  m.scale.x = (flip ? -1 : 1) * w / T;
}

// ---------- 지형: 타일마다 두께 DEPTH의 상자(같은 종류·변형끼리 InstancedMesh 하나) ----------
const boxGeo = new THREE.BoxGeometry(1, 1, DEPTH);
const tileSets = { [GRASS]: Art.tiles.grass, [DIRT]: Art.tiles.dirt, [STONE]: Art.tiles.stone, [SAND]: Art.tiles.sand, [SNOWTOP]: Art.tiles.snowtop, [ICE]: Art.tiles.ice, [RAFT]: Art.tiles.raft };
const WIN = 40, REBUILD = 12;   // 가정(임의값) 플레이어 좌우 40칸만 상자로 만든다(성능). 12칸 벗어나면 다시 만든다
let terrain = new THREE.Group(), mapSig = -1, winCx = -999;
scene.add(terrain);
const dummy = new THREE.Object3D(), tint = new THREE.Color();
function buildTerrain(cx) {
  winCx = cx; const xa = Math.max(0, cx - WIN), xb = Math.min(WW, cx + WIN);
  scene.remove(terrain); terrain.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
  terrain = new THREE.Group();
  const groups = new Map(), walls = [], waters = [];
  for (let ty = 0; ty < WH; ty++) for (let tx = xa; tx < xb; tx++) {
    const id = tileAt(tx, ty), v = (tx * 7 + ty * 13) % 3;
    if (id === AIR) { if (ty > GY[tx]) walls.push([tx, ty]); continue; }   // 파낸 자리·지하 동굴: 뒤쪽 벽
    if (id === WATER) { waters.push([tx, ty]); continue; }
    const k = id * 4 + v;
    if (!groups.has(k)) groups.set(k, { id, v, list: [] });
    groups.get(k).list.push([tx, ty]);
  }
  const place = (mesh, list, dz, depthScale) => {
    list.forEach(([tx, ty], i) => {
      dummy.position.set(tx + 0.5, -(ty + 0.5), dz); dummy.scale.set(1, 1, depthScale); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const dark = ty > 26 ? Math.min(0.6, (ty - 26) * 0.03) : 0;   // 2D와 같은 지하 어둠
      mesh.setColorAt(i, tint.setScalar(1 - dark));
    });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false; terrain.add(mesh);
  };
  for (const g of groups.values()) {
    const set = tileSets[g.id]; if (!set) continue;
    place(new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ map: tex(set[g.v % set.length]) }), g.list.length), g.list, DEPTH / 2, 1);
  }
  if (walls.length) place(new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ map: tex(Art.tiles.wall[0]), color: 0x888888 }), walls.length), walls, 0.1, 0.04);
  if (waters.length) {   // 바닷물: 반투명 파랑, 깊을수록 진하다(2D와 같은 3단계)
    const shallow = waters.filter(([, ty]) => ty - 25 < 2), mid = waters.filter(([, ty]) => ty - 25 >= 2 && ty - 25 < 4), deep = waters.filter(([, ty]) => ty - 25 >= 4);
    for (const [list, col] of [[shallow, 0x3f9be0], [mid, 0x2c7cc0], [deep, 0x1f66a4]]) if (list.length) place(new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.72 }), list.length), list, DEPTH / 2, 1);
  }
  scene.add(terrain);
}
const mapSum = () => { let s = 0; const M = World.MAP; for (let i = 0; i < M.length; i++) s = (s * 31 + M[i]) | 0; return s; };   // 땅·뗏목 칸이 바뀌었는지 확인(21,280칸 합)
function syncTerrain() { const s = mapSum(), cx = Math.floor((S.px + PW / 2) / T); if (s !== mapSig || Math.abs(cx - winCx) > REBUILD) { mapSig = s; buildTerrain(cx); } }

// ---------- 자원·제단 ----------
const objMeshes = [];
const OBJ_ART = { tree: [8, 48], cane: [0, 32], wheat: [0, 20], sandpile: [0, 8], icecrystal: [0, 24], rocksalt: [0, 14], harbor: [0, 32], board: [0, 28], box: [0, 16] };
function buildObjects() {
  for (const m of objMeshes) scene.remove(m); objMeshes.length = 0;
  for (const o of OBJS) {
    let canvas, dx = 0, dy;
    if (o.type === 'tree') { canvas = ((o.x >= 83 && o.x <= 112) || o.x >= 213) ? Art.obj.pine : Art.obj.tree; [dx, dy] = OBJ_ART.tree; }
    else if (o.type === 'altar') { canvas = Art.dev.altar; dy = 32; }
    else if (o.type === 'fragment') { canvas = Art.obj.fragment; dx = 4; dy = 12; }
    else if (OBJ_ART[o.type]) { canvas = Art.obj[o.type]; [dx, dy] = OBJ_ART[o.type]; }
    if (!canvas) continue;
    const m = sprite(canvas, Z_MID); m.userData.o = o; m.userData.dx = dx; m.userData.dy = dy;
    putSprite(m, o.x * T - dx, o.y * T - dy); scene.add(m); objMeshes.push(m);
  }
}
const altarGlow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshBasicMaterial({ color: 0xffc878, transparent: true })); altarGlow.visible = false; scene.add(altarGlow);
function updateObjects() {
  const al = OBJS.find(o => o.type === 'altar');
  if (al) { altarGlow.visible = !S.f.boss; altarGlow.position.set(al.x + 0.75, -(al.y - 1.3), Z_MID + 0.3); altarGlow.material.opacity = 0.45 + 0.35 * Math.sin(tNow * 3); }   // 골렘이 남아 있으면 제단이 깜빡인다(2D와 같음)
  for (const m of objMeshes) {
    const o = m.userData.o, n = NODE[o.type], spent = n && (S.nodes[o.id] || 0) >= n[2];
    m.material.opacity = spent ? 0.4 : 1;
    m.visible = o.type === 'fragment' ? !S.f.raft : true;
  }
}

// ---------- 장치·늑대·플레이어·다른 플레이어 ----------
const devMeshes = new Map(), wolfMeshes = new Map(), flameCv = new Map();
function syncDevices() {
  const live = new Set(S.placed);
  for (const [d, g] of devMeshes) if (!live.has(d)) { scene.remove(g.root); devMeshes.delete(d); flameCv.delete(d); }
  for (const d of S.placed) {
    let g = devMeshes.get(d);
    if (!g) {
      const body = sprite(Art.dev[d.id], Z_MID), x = new THREE.Group(), root = new THREE.Group();
      root.add(body);
      const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 1.4), new THREE.MeshLambertMaterial({ color: 0x6b5a46 }));   // 장치 받침(보이기만)
      base.position.set(0, -1.1, 0); root.add(base);
      const bad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xff5a4a })); bad.position.set(0, 0, 0.2); bad.visible = false;
      const bad2 = bad.clone(); bad2.rotation.z = Math.PI / 2; root.add(bad, bad2);
      g = { root, body, base, bad: [bad, bad2], x };
      scene.add(root); devMeshes.set(d, g);
      if (d.id === 'fire') { const cv = document.createElement('canvas'); cv.width = cv.height = 32; const spr = sprite(cv, Z_MID + 0.02); spr.userData.cv = cv; g.flame = spr; root.add(spr); }
    }
    g.root.position.set(0, 0, 0);
    putSprite(g.body, d.x * T, d.y * T); g.base.position.set(d.x + 1, -(d.y + 2) + 0.1, Z_MID);
    for (const b of g.bad) { b.visible = !!d.s.broken; b.position.set(d.x + 1, -(d.y + 0.5 + 0.35), Z_MID + 0.2); }
    if (g.flame) { const cv = g.flame.userData.cv, c2 = cv.getContext('2d'); c2.clearRect(0, 0, 32, 32); Art.flame(c2, 0, 0, d.s.level, tNow); g.flame.material.map.needsUpdate = true; putSprite(g.flame, d.x * T, d.y * T); }
  }
}
function syncWolves() {
  const live = new Set(S.mobs);
  for (const [m, g] of wolfMeshes) if (!live.has(m)) { scene.remove(g); wolfMeshes.delete(m); }
  for (const m of S.mobs) {
    let g = wolfMeshes.get(m);
    if (!g) { g = sprite(Art.wolf[0], Z_MID + 0.4); g.userData.frames = Art.wolf; scene.add(g); wolfMeshes.set(m, g); }
    const [wx, wy] = World.wolfPos(m), fr = Math.floor(tNow * 3 + m.id) % 2;
    g.material.map = tex(Art.wolf[fr]); g.material.opacity = 0.45 + 0.55 * Math.max(0, m.M / m.M0);
    putSprite(g, Math.round(wx - 11), Math.round(wy - 12), m.id % 2 ? true : false);
  }
}
const player = sprite(Art.playerFrames[0], DEPTH - 1);
scene.add(player);
const pst = { onGround: false, bound: false };
let pz = DEPTH - 1;     // 플레이어 깊이(보이기만): 앞(DEPTH-0.5)~뒤(0.5)
function drawPlayer() {
  const moving = Math.abs(S.vx) > 1, fr = !pst.onGround ? 3 : moving ? 1 + (Math.floor(tNow * 8) % 2) : 0;
  player.material.map = tex(Art.playerFrames[fr]); player.userData.z = pz;
  putSprite(player, S.px - 3, S.py + PH - 22, S.face < 0);
}
const peerMeshes = {};
function syncPeers() {
  if (!(window.Net && Net.user)) return;
  for (const id in Net.peers) {
    const p = Net.peers[id]; let g = peerMeshes[id];
    if (!g) { const label = document.createElement('div'); label.className = 'nick3'; document.body.appendChild(label); g = peerMeshes[id] = { m: sprite(Art.playerFrames[0], Z_MID + 0.8), label, x: p.x, y: p.y }; scene.add(g.m); }
    g.x += (p.x - g.x) * 0.3; g.y += (p.y - g.y) * 0.3;
    const fr = p.air ? 3 : Math.abs(p.vx) > 1 ? 1 + (Math.floor(tNow * 8) % 2) : 0;
    g.m.material.map = tex(Art.playerFrames[fr]); putSprite(g.m, g.x - 3, g.y + PH - 22, p.face < 0);
    g.label.textContent = p.nick || ''; g.p = p;
  }
  for (const id in peerMeshes) if (!Net.peers[id]) { scene.remove(peerMeshes[id].m); peerMeshes[id].label.remove(); delete peerMeshes[id]; }
}
function placeLabels() {
  const v = new THREE.Vector3();
  for (const id in peerMeshes) { const g = peerMeshes[id]; v.set((g.x + PW / 2) / T, -(g.y - 8) / T, Z_MID + 0.8).project(camera); g.label.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; g.label.style.top = ((1 - v.y) / 2 * innerHeight) + 'px'; g.label.style.display = v.z < 1 ? '' : 'none'; }
}
// 광장에 정박한 다른 사람의 뗏목(2D의 drawPlazaRafts와 같은 위치)
let plazaGroup = new THREE.Group(), plazaSig = '';
scene.add(plazaGroup);
function syncPlaza() {
  const rafts = UI.plazaRafts().slice(0, 3), sig = JSON.stringify(rafts.map(r => [r.nick, r.cells, (r.devs || []).length]));
  if (sig === plazaSig) return; plazaSig = sig;
  scene.remove(plazaGroup); plazaGroup = new THREE.Group();
  rafts.forEach((r, i) => {
    const x0 = 153 + i * 13, cells = Math.max(2, Math.min(10, r.cells | 0));
    for (let c = 0; c < cells; c++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, DEPTH), new THREE.MeshLambertMaterial({ map: tex(Art.tiles.raft[c % 3]) })); b.position.set(x0 + c + 0.5, -(Sim.RAFT.ROW + 0.5), DEPTH / 2); plazaGroup.add(b); }
    for (const d of (r.devs || [])) if (d && Art.dev[d.id] && d.u >= 0 && d.u + 2 <= cells) { const s = sprite(Art.dev[d.id], Z_MID); putSprite(s, (x0 + d.u) * T, Sim.RAFT.DEV_Y * T); plazaGroup.add(s); }
  });
  scene.add(plazaGroup);
}

// ---------- 하늘·낮밤·별·해/달 ----------
const stars = (() => {
  const n = 220, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = ((i * 97.31) % 1000) / 1000 * 80 - 40; pos[i * 3 + 1] = ((i * 53.77) % 1000) / 1000 * 30 + 5; pos[i * 3 + 2] = -40; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
  p.frustumCulled = false; scene.add(p); return p;
})();
const sunM = sprite(Art.sun, -30, { fog: false }), moonM = sprite(Art.moon, -30, { fog: false });
sunM.scale.multiplyScalar(2.4); moonM.scale.multiplyScalar(2.4); scene.add(sunM, moonM);
function sky() {
  const hour = S.min / 60, night = nightOf(hour), bands = Art.sky(hour, 18);
  const c = new THREE.Color(bands[6]); scene.background = c; scene.fog = new THREE.Fog(new THREE.Color(bands[12]), 28, 75);
  ambient.intensity = 0.62 - night * 0.3; sun.intensity = 0.55 - night * 0.4;
  stars.material.opacity = night; stars.position.x = camera.position.x; stars.position.y = camera.position.y - 14;
  const sunT = (hour - 6) / 12, moonT = ((hour + 6) % 24) / 12, cx = camera.position.x, cy = camera.position.y;
  sunM.visible = sunT >= 0 && sunT <= 1; moonM.visible = moonT >= 0 && moonT <= 1;
  if (sunM.visible) sunM.position.set(cx + (sunT - 0.5) * 60, cy + Math.sin(sunT * Math.PI) * 18 - 2, -30);
  if (moonM.visible) moonM.position.set(cx + (moonT - 0.5) * 60, cy + Math.sin(moonT * Math.PI) * 18 - 2, -30);
}

// ---------- 파티클(연기·폭발·늑대 효과): sim.js 이벤트를 받아 점으로 그린다 ----------
const PMAX = 240, pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), parts = [];
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3)); pGeo.setDrawRange(0, 0);
const pPts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, transparent: true, fog: false })); pPts.frustumCulled = false; scene.add(pPts);
function puff(x, y, col, n) {
  const c = new THREE.Color(col.startsWith('rgba') ? '#ebf5ff' : col);
  for (let i = 0; i < n; i++) parts.push({ x, y, z: Z_MID + 0.6, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 14, life: 0.6 + Math.random() * 0.5, c });
  if (parts.length > PMAX) parts.splice(0, parts.length - PMAX);
}
function burst(d) { puff(d.x * T + 16, d.y * T + 8, '#ff7a3d', 14); puff(d.x * T + 16, d.y * T + 8, '#4a4f56', 10); }
function stepParts(dt) {
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
  parts.forEach((p, i) => { pPos.set([p.x / T, -p.y / T, p.z], i * 3); pCol.set([p.c.r, p.c.g, p.c.b], i * 3); });
  pGeo.setDrawRange(0, parts.length); pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}

// ---------- 입력 ----------
const keys = { left: false, right: false, jump: false, front: false, back: false };
function clearKeys() { keys.left = keys.right = keys.jump = keys.front = keys.back = false; }
const KEYMAP = { a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', w: 'jump', ' ': 'jump', s: 'front', arrowdown: 'front', arrowup: 'back' };
let mode = null;   // 'build:<id>' | 'demolish' | 'block:<k>' | 'tool:salt|thermo'
const targets = () => World.targets(S);
window.addEventListener('keydown', e => {
  if (!$('modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  if (!$('title').hidden) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startGame(); } return; }
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (KEYMAP[k]) { keys[KEYMAP[k]] = true; e.preventDefault(); }
  else if (k === 'e') interact(targets()[0]);
  else if (k === 'escape' && mode) { mode = null; say('취소'); }
});
window.addEventListener('keyup', e => { const k = KEYMAP[e.key.toLowerCase()]; if (k) keys[k] = false; });
document.querySelectorAll('#pad button').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); if (k === 'e') interact(targets()[0]); else keys[k] = true; };
  const off = e => { e.preventDefault(); if (k !== 'e') keys[k] = false; };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});

// 마우스 → 월드. 칸(땅·블록·건설)은 지형 앞면(z=DEPTH) 평면과의 교점, 대상(장치·자원·늑대)은 화면에 투영한 거리로 고른다
const mouse = { x: 0, y: 0 }, ray = new THREE.Raycaster(), frontPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -DEPTH), hit = new THREE.Vector3();
function mouseWorld() {   // 2D의 (cam.x + mouse.x, cam.y + mouse.y)와 같은 픽셀 좌표
  ray.setFromCamera(new THREE.Vector2(mouse.x / innerWidth * 2 - 1, -(mouse.y / innerHeight) * 2 + 1), camera);
  return ray.ray.intersectPlane(frontPlane, hit) ? [hit.x * T, -hit.y * T] : [0, 0];
}
const mouseTile = () => { const [wx, wy] = mouseWorld(); return [Math.floor(wx / T), Math.floor(wy / T)]; };
const midPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -Z_MID);
function mouseMid() {   // 대상(장치·자원·늑대)이 서 있는 깊이의 평면과의 교점(픽셀 좌표): 2D처럼 월드 거리로 고른다
  ray.setFromCamera(new THREE.Vector2(mouse.x / innerWidth * 2 - 1, -(mouse.y / innerHeight) * 2 + 1), camera);
  return ray.ray.intersectPlane(midPlane, hit) ? [hit.x * T, -hit.y * T] : [0, 0];
}
const PICK = 26;   // 2D와 같은 반지름(월드 px)
const near = (kind) => { const [wx, wy] = mouseMid(); return targets().filter(o => (!kind || o.kind === kind) && Math.hypot(o.x - wx, o.y - wy) < PICK).sort((a, b) => Math.hypot(a.x - wx, a.y - wy) - Math.hypot(b.x - wx, b.y - wy))[0]; };
const pickTarget = () => near(), pickKind = kind => near(kind);

const gl = renderer.domElement;
gl.addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
gl.addEventListener('pointerdown', e => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (e.button > 0 || !$('modal').hidden || mode || pickTarget()) return;
  dig.on = true; dig.p = 0; dig.tx = dig.ty = -1;
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) gl.addEventListener(ev, () => { dig.on = false; dig.p = 0; });
gl.addEventListener('click', e => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (!$('modal').hidden) return;
  if (mode) return placeAtMouse();
  const t = pickTarget(); if (t) interact(t);
});
function placeAtMouse() {
  const [tx, ty] = mouseTile();
  if (mode.startsWith('block:')) { if (World.placeBlock(S, mode.slice(6), tx, ty)) mode = null; flush(); return; }
  if (mode.startsWith('tool:')) {
    if (mode === 'tool:salt') { const w = pickKind('wolf'); World.useShaker(S, w ? { wolf: w.ref } : { tx, ty }); }
    else { const t = pickKind('dev'); World.useThermo(S, t ? { dev: t.ref } : { tx, ty }); }
    flush(); return;
  }
  if (mode.startsWith('build:')) {
    const g = World.ghostCheck(S, mode.slice(6), Math.floor(mouseWorld()[0] / T - 1 + 0.5));
    if (!g.ok) return say(g.msg);
    if (Sim.act.build(S, mode.slice(6), g.u)) mode = null;
    flush(); refresh(); return;
  }
  if (mode === 'demolish') {
    const [wx, wy] = mouseWorld(), d = World.deviceAt(S, wx, wy);
    if (!d) return say('철거할 장치를 클릭하세요.');
    Sim.act.demolish(S, d); flush(); mode = null; refresh();
  }
}

// ---------- HUD(HTML): 가방·시계·속도·메뉴. 2D의 drawHUD와 같은 항목 ----------
const inv3 = $('inv3'), menu3 = $('menu3');
[['hammer', '건설', () => openBuild()], ['gear', '제작', () => openCraft()], ['book', '연구 노트', () => window.Notes && Notes.open(api)], ['scroll', '기록', () => openLog()], ['disk', '저장/계정', () => openSave()]].forEach(([icon, label, fn]) => {
  const b = document.createElement('button'); b.title = label; b.innerHTML = `<i style="background-image:url(${Art.iconURL[icon]})"></i>`; b.onclick = fn; menu3.appendChild(b);
});
const spd = $('spd3');
[10, 3, 1].forEach(sp => { const b = document.createElement('button'); b.textContent = 'x' + sp; b.dataset.sp = sp; b.title = `시간 속도 x${sp}`; b.onclick = () => { S.speed = sp; }; spd.appendChild(b); });
let invSig = '';
function drawHUD() {
  const items = Object.entries(S.inv).filter(([, v]) => v >= 1).map(([k, v]) => ({ k, icon: ITEM[k][0], name: ITEM[k][1], n: Math.floor(v) }));
  if (S.caps.length) items.push({ icon: 'cap', name: '기체 캡슐 (' + capText() + ')', n: S.caps.length });
  if (S.packs.length) items.push({ icon: 'pack', name: '한제 팩', n: S.packs.length });
  const sig = JSON.stringify(items) + mode;
  if (sig !== invSig) {
    invSig = sig; inv3.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button'); b.className = 'slot'; b.title = `${it.name} ${it.n}` + (BLOCK[it.k] ? ' (클릭: 놓기)' : TOOL[it.k] ? ' (클릭: 사용)' : it.k === 'pickaxe' ? ' (돌을 팔 때 자동 사용)' : '');
      b.innerHTML = `<i style="background-image:url(${Art.iconURL[it.icon]})"></i><b>${it.n}</b>`;
      if (BLOCK[it.k]) { b.classList.toggle('on', mode === 'block:' + it.k); b.onclick = () => { mode = mode === 'block:' + it.k ? null : 'block:' + it.k; say(mode ? `${it.name}을(를) 놓을 곳을 클릭하세요. (ESC 취소)` : '취소'); }; }
      if (TOOL[it.k]) { b.classList.toggle('on', mode === 'tool:' + TOOL[it.k]); b.onclick = () => { const m = 'tool:' + TOOL[it.k]; mode = mode === m ? null : m; say(mode ? `${it.name}: 쓸 대상을 클릭하세요. (ESC 취소)` : '취소'); }; }
      inv3.appendChild(b);
    }
    const q = $('quest'); q.style.top = (inv3.offsetHeight + 16) + 'px'; q.style.left = '8px';
  }
  const hh = String(Math.floor(S.min / 60)).padStart(2, '0'), mm = String(Math.floor(S.min % 60)).padStart(2, '0');
  $('clock3').textContent = `D${S.day} ${hh}:${mm}`;
  $('clock3').title = `${S.day}일차 ${hh}:${mm} · ${Sim.ISLANDS[Sim.dockOf(S).island].name} 외기 ${Math.round(Sim.airTemp(S))}℃ · ${fmt(pAtm(), 2)} atm`;
  spd.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.sp === S.speed));
  const tg = targets()[0];
  $('target').textContent = mode && mode.startsWith('block:') ? `${ITEM[mode.slice(6)][1]} 놓기 — 빈 칸을 클릭, ESC 취소`
    : mode && mode.startsWith('tool:') ? `${mode === 'tool:salt' ? '소금 뿌리개' : '온도계'} — 대상을 클릭, ESC 취소`
    : mode ? '건설/철거 모드 — 클릭해서 실행, ESC 취소'
    : tg ? `[E] ${tg.label}` : '이동: A/D · 점프: W/스페이스 · 깊이: ↑/↓ · 상호작용: E 또는 클릭';
}
// 건설 미리보기(유령): 지을 수 있으면 초록, 없으면 빨강
const ghost = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1.4), new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.35 })); ghost.visible = false; scene.add(ghost);
function updateGhost() {
  ghost.visible = !!(mode && mode.startsWith('build:') && $('modal').hidden);
  if (!ghost.visible) return;
  const g = World.ghostCheck(S, mode.slice(6), Math.floor(mouseWorld()[0] / T - 1 + 0.5));
  ghost.material.color.set(g.ok ? 0x66ff88 : 0xff6666);
  ghost.position.set(g.tx + 1, -(g.ty !== undefined ? g.ty : 0) - 1, Z_MID);
}
// 가장 가까운 상호작용 대상 위에 떠 있는 표시
const marker = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0xffd84a })); marker.rotation.x = Math.PI; scene.add(marker);

// ---------- 시간·저장·시작 ----------
let tNow = 0, last = performance.now();
setInterval(() => { if (Store.paused || (window.Raid && Raid.active)) return; advance(S.speed); UI.tick(); refresh(); }, 500);
setInterval(() => save(), 5000);
window.addEventListener('pagehide', () => save(true));
const MAPID = 'main';
let lastPos = '', lastPosAt = 0;
const posPacket = () => ({ x: Math.round(S.px * 10) / 10, y: Math.round(S.py * 10) / 10, vx: Math.round(S.vx), face: S.face < 0 ? -1 : 1, air: !pst.onGround });
function netStep(now) {
  if (!(window.Net && Net.user) || Store.paused) return;
  if (now - lastPosAt >= 100) { const p = posPacket(), k = JSON.stringify(p); if (k !== lastPos || now - lastPosAt > 5000) { lastPos = k; lastPosAt = now; Net.sendPos(p); } }
}
let seaHintAt = 0;
function hintSea() { const n = performance.now(); if (n - seaHintAt > 5000) { seaHintAt = n; say('바다가 거칠어서 헤엄쳐 건널 수 없어요. 뗏목으로 항해하세요 (항구 표지판).'); } }

const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; tNow += dt;
  const modalOpen = !$('modal').hidden;
  const ax = modalOpen ? 0 : (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  World.stepPlayer(S, dt, { ax, jump: !modalOpen && keys.jump }, pst);   // x·y 이동은 2D와 같은 함수
  if (pst.bound) hintSea();
  if (!modalOpen) pz = Math.max(0.5, Math.min(DEPTH - 0.5, pz + ((keys.front ? 1 : 0) - (keys.back ? 1 : 0)) * Z_SPEED * dt));
  { const [tx, ty] = mouseTile(); World.stepDig(S, dt, tx, ty, modalOpen || !!mode); flush(); }
  stepParts(dt); netStep(now);
  syncTerrain(); updateObjects(); syncDevices(); syncWolves(); syncPeers(); syncPlaza(); drawPlayer();
  // 카메라: 플레이어를 따라가며 약간 위에서 내려다본다(경계는 월드 밖이 보이지 않도록 제한)
  const fx = Math.max(10, Math.min(WW - 10, (S.px + PW / 2) / T)), fy = -(S.py + PH / 2) / T;
  camPos.set(fx, fy + CAM_UP, CAM_DIST + Z_MID); camLook.set(fx, fy, Z_MID);
  camera.position.lerp(camPos, 1 - Math.exp(-dt * 8)); camera.lookAt(camLook);
  sky(); updateGhost(); drawHUD(); placeLabels();
  const tg = targets()[0]; marker.visible = !!tg && !modalOpen; if (tg) marker.position.set(tg.x / T, -tg.y / T + 1.4 + Math.sin(tNow * 5) * 0.12, Z_MID);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

UI.init({
  puff, burst, clearKeys, applyWorld: () => World.applyDug(S),
  startBuild(id) { mode = 'build:' + id; $('modal').hidden = true; say(`${DEV[id].name}을(를) 지을 곳을 클릭하세요. (ESC 취소)`); },
  startDemolish() { mode = 'demolish'; $('modal').hidden = true; say('철거할 장치를 클릭하세요. (ESC 취소)'); },
  joinMap() { Net.joinMap(MAPID, posPacket()); },
});
World.applyDug(S);
buildObjects(); syncTerrain();
refresh(); requestAnimationFrame(frame);
Store.paused = true;
$('t-info').textContent = S.day > 1 || S.qDone > 0 ? `저장된 진행: ${S.day}일차 · 목표 ${S.qDone}/${QUESTS.length}` : '새 게임';
function startGame() {
  if ($('title').hidden) return;
  $('title').hidden = true; Store.paused = false; loadPlaza();
  boot().then(() => { let seen = false; try { seen = !!localStorage.getItem(HELP_KEY); } catch { /* 무시 */ } if (!seen && $('auth').hidden) openHelp(); });
}
$('t-start').onclick = startGame;
$('t-help').onclick = () => openHelp();
function tileToScreen(tx, ty) { const v = new THREE.Vector3(tx + 0.5, -(ty + 0.5), DEPTH).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }
window.__chem3d = { scene, camera, renderer, S, getMode: () => mode, tileToScreen, mouseTile };   // 시험(tools/smoke3d.js)용 읽기 통로
