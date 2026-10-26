// 화학 섬 이야기 — 1인칭 3D(fp/, 7단계: 부드러운 지형). 마우스로 둘러보며 걷는다. 블록 채굴은 없고 자원은 노드를 채집한다.
// 화학 계산은 chem.js와 sim.js를 그대로 쓰고(여기서 식을 만들지 않는다), 이 파일은 "어디에 있는가"(위치·충돌·그리기)만 다룬다.
// 상태는 Store.S(= Sim 상태) + S.fp(위치·시점·녹은 얼음 노드). 2D 전용 S.px·S.py는 쓰지 않는다. 저장 키는 chemisle_fp_v2(2D·옛 복셀 버전과 따로).
import * as THREE from 'three';
import { N, SEA, SEABED, RX0, RZ0, PAD, ISLANDS, OFFSET, Island } from '../shared/gen.js';
import { buildIslandGeometry, STEP_NEAR, STEP_FAR } from './terrain.js';
import { makeObject, makeDevice, makeWolf, makePlayerModel, makeRaft } from './models.js';
import { installTheme, themed, GAME_TITLE, PLANET, STORY_HTML } from '../shared/theme.js';
import { Party } from '../shared/party.js';
import { stepBody, HALF, BODY } from '../shared/move.js';
import { makeCtx, PLOT_OFF } from '../shared/ctl.js';
import { makePlay, collectTargets as collectTargetsS, HOLD, REACH, LINK_MAX } from '../shared/play.js';
import { initHud, wrapActions } from '../shared/hud.js';
import { HubUI, tick as hubTick, startWatch, loadPubs, hubShips } from '../shared/hub.js';

const C = Chem, Art = window.Art, S = Store.S;
const { ITEM, NODE, DIG, TOOL, STONE, ICE, ICE_TILE_G, SHAKE_G } = World;
const { DEV, QUESTS, FIRE_T, FIRE_NAME } = Sim;
const { $, fmt, say, flush, advance, refresh, closeModal, interact, openBuild, openCraft, openLog, openHelp, openSave, boot, loadPlaza, api, capText, pAtm, HELP_KEY } = UI;
const save = Store.save;
const TEST = /[?&]test\b/.test(location.search);   // 시험(tools/smokefp.js)에서는 포인터 잠금 없이 조작을 받는다

// ---------- 1인칭 전용 상수: 모두 "가정(임의값)" (DESIGN.md §4-15) ----------
// 이동·충돌 상수(WALK·JUMP·SLOPE_TAN·COLL 등)는 shared/move.js (td/와 공용)
const EYE = 1.6;   // 눈높이 1.6 m
const SENS = 0.0022;            // 마우스 감도(rad/px)
const FOV = 70, VIEW = 220;     // 시야각(°), 안개가 끝나는 거리(m)
const nightOf = h => h >= 21 || h < 5 ? 1 : h >= 18 ? (h - 18) / 3 : h < 7 ? (7 - h) / 2 : 0;

// ---------- 상태 ----------
const ctx = makeCtx(S);
const { ensureFp, nextUid, ensureUids, raftDims, raftCell, groundAt, visible, devWorld, melted, blocked, findFree, islandName, wolfDev, wolfWorld } = ctx;   // 월드 질의는 shared/ctl.js (td/와 공용)
const pl = makePlay(ctx, { aimed: () => aimedTarget(), cell: () => ghostCell(), puff: (x, y, z, c, n) => puff(x, y, z, c, n) });   // 플레이 규칙·조작 상태는 shared/play.js (td/와 공용)
ensureFp();
const p = { x: S.fp.x, y: S.fp.y, z: S.fp.z, vx: 0, vy: 0, vz: 0, onGround: false, inW: false };
let yaw = S.fp.yaw, pitch = S.fp.pitch;

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
function updateObjects(t) {
  for (const [o, g] of objMeshes) {
    const n = NODE[o.type], spent = n && (S.nodes[o.id] || 0) >= n[2];
    g.visible = o.type === 'fragment' ? !S.f.raft : !melted(o);
    g.scale.setScalar(spent ? 0.65 : 1);   // 오늘 다 캔 노드는 작아 보인다
    if (g.userData.glow) { g.userData.glow.visible = !S.f.boss; g.userData.glow.material.opacity = 0.55 + 0.35 * Math.sin(t * 3); }   // 골렘이 남아 있으면 제단이 깜빡인다(2D와 같음)
  }
}
const devBob = (d) => d.plot ? 0 : bobNow;   // 탐사정 위 장치만 출렁인다
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
  islName = name; isl = new Island(name); ctx.name = name; ctx.isl = isl;
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
// 공용 UI의 연기 효과(H.puff)가 쓸 위치: 방금 누른 대상(pl.lastTarget)
const fxPos = () => pl.lastTarget ? [pl.lastTarget.wx, pl.lastTarget.wy, pl.lastTarget.wz] : [p.x, p.y + 1, p.z];

// ---------- 충돌·이동 ----------
let seaHintAt = 0;
// 한 걸음·한 틱은 shared/move.js(td/와 공용). 여기서는 시선 방향(yaw)을 세계 방향으로 바꾸고 월드 질의(groundAt·blocked)를 넘긴다
const moveWorld = { groundAt: (x, z) => groundAt(x, z), blocked, onEdge() { const t = performance.now(); if (t - seaHintAt > 5000) { seaHintAt = t; say('더 멀리 갈 수 없어요. 탐사정으로 궤도 이동하세요 (궤도 이동 단말).'); } } };
function stepPlayer(dt, ax, az, jump) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  stepBody(p, dt, fx * az + rx * ax, fz * az + rz * ax, jump, moveWorld);
}

// ---------- 시선: 지형 가림 + 대상 ----------
const dirV = new THREE.Vector3(), eyeV = new THREE.Vector3();
function lookRay() { camera.getWorldDirection(dirV); eyeV.copy(camera.position); return [eyeV, dirV]; }
// 시선이 지형(뗏목 바닥 포함)에 닿는 거리. 닿지 않으면 null. 지형 자체는 집지 않고, 대상이 가려졌는지만 본다
function terrainHit(o, d, maxD) { for (let t = 0; t <= maxD; t += 0.25) { if (o.y + d.y * t < groundAt(o.x + d.x * t, o.z + d.z * t)) return t; } return null; }

// ---------- 상호작용 대상(공용 ui.js의 interact가 받는 모양 { kind, ref, label }) ----------
const collectTargets = () => collectTargetsS(ctx);   // 대상 목록은 shared/play.js (td/와 공용)
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

// ---------- 건설(뗏목 격자 위의 2×2) ----------
const ghost = new THREE.Mesh(new THREE.BoxGeometry(2, 1.8, 2), new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.4 })); ghost.visible = false; scene.add(ghost);
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
// ---------- 연결선(열선·배관, 10단계) ----------
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
// ---------- 입력 ----------
const keys = { w: false, a: false, s: false, d: false, jump: false };
let locked = false;
const canAct = () => TEST || locked;
const cv = renderer.domElement;
function clearKeys() { keys.w = keys.a = keys.s = keys.d = keys.jump = false; pl.dig.on = false; }
addEventListener('keydown', e => {
  if (!$('modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  if (!$('title').hidden) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startGame(); } return; }
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'w') keys.w = true; else if (k === 'a') keys.a = true; else if (k === 's') keys.s = true; else if (k === 'd') keys.d = true; else if (k === ' ') { keys.jump = true; e.preventDefault(); }
  else if (k === 'e') pl.doInteract();
  else if (k === 'l') pl.cycleLink();
  else if (k === 'q' || k === 'escape') { if (pl.anyMode()) { pl.cancel(); say('취소'); } }
  else if (/^[1-9]$/.test(k)) { const u = pl.usable()[+k - 1]; if (u) pl.selectItem(u.k); }
});
addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (k === 'w') keys.w = false; else if (k === 'a') keys.a = false; else if (k === 's') keys.s = false; else if (k === 'd') keys.d = false; else if (k === ' ') keys.jump = false; });
cv.addEventListener('click', () => { if (!locked && !TEST && $('modal').hidden && $('title').hidden && $('auth').hidden) cv.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === cv; $('lockhint').hidden = locked || TEST || !$('title').hidden; if (!locked) pl.dig.on = false; });
addEventListener('mousemove', e => { if (!locked) return; yaw -= e.movementX * SENS; pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * SENS)); });
cv.addEventListener('mousedown', e => { if (!canAct() || !$('modal').hidden) return; if (e.button === 0) { const t = aimedTarget(); if (t && !HOLD[t.kind] && !pl.mode && !pl.sel) pl.doInteract(); else pl.dig.on = true; } else if (e.button === 2) pl.useAction(); });
addEventListener('mouseup', e => { if (e.button === 0) pl.dig.on = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { const u = pl.usable().map(x => x.k).concat([null]), i = u.indexOf(pl.sel); const n = u[(i + (e.deltaY > 0 ? 1 : -1) + u.length) % u.length]; if (n !== pl.sel) pl.selectItem(n === null ? pl.sel : n); }, { passive: true });   // 휠: 블록·도구 바꾸기

// ---------- HUD(HTML) ----------
const { drawHud } = initHud(pl);   // 가방·메뉴·시계·속도·팀 버튼은 shared/hud.js (td/와 공용)
function drawHUD() {
  drawHud();
  const t = !UI.isModalOpen() && canAct() ? aimedTarget() : null;
  $('target').textContent = pl.hintText(t, 'WASD 이동 · Space 점프 · 마우스 시점 · E 또는 좌클릭 열기·채집(바위·얼음은 꾹) · 우클릭 도구 사용 · L 연결');
}
// 시선 아래 칸 표시(파기 대상) + 건설 미리보기
// 조준 강조: 대상 발밑의 노란 고리 + 대상 위의 이름표(조준하면 이름이 보인다)
const ringGeo = new THREE.RingGeometry(0.86, 1, 32); ringGeo.rotateX(-Math.PI / 2);
const marker = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.85, depthTest: false })); marker.visible = false; marker.renderOrder = 5; scene.add(marker);
const aimLabel = $('aimlabel'), av = new THREE.Vector3();
function updateAim() {
  const open = UI.isModalOpen() || !canAct();
  ghost.visible = !!(pl.mode && pl.mode.startsWith('build:')) && !open;
  if (ghost.visible) { const c = ghostCell(), g = pl.ghostCheck(pl.mode.slice(6), c); ghost.material.color.set(g.ok ? 0x66ff88 : 0xff6666); if (c) ghost.position.set(...cellWorld(c)); else ghost.visible = false; }
  const t = open || pl.mode ? null : aimedTarget();
  marker.visible = !!t && t.kind !== 'water';
  if (t) { const gy = t.gy !== undefined ? t.gy + (t.kind === 'dev' ? bobNow * (t.ref.plot ? 0 : 1) : 0) : t.kind === 'wolf' ? SEA + bobNow : groundAt(t.wx, t.wz); marker.position.set(t.wx, gy + 0.06, t.wz); marker.scale.setScalar((t.r || 1) * (0.95 + 0.05 * Math.sin(tNow * 5))); }
  if (t) { av.set(t.wx, t.wy + (t.r || 1) * 0.9 + 0.5, t.wz).project(camera); aimLabel.style.left = ((av.x + 1) / 2 * innerWidth) + 'px'; aimLabel.style.top = ((1 - av.y) / 2 * innerHeight) + 'px'; aimLabel.textContent = t.label; }
  aimLabel.style.display = t && av.z < 1 ? '' : 'none';
}

// ---------- 시간·저장·시작·항해 ----------
let tNow = 0, last = performance.now();
setInterval(() => { if (Store.paused || (window.Raid && Raid.active)) return; if (Party.canAdvance()) { advance(Party.speed()); pl.pipeStep(); } UI.tick(); refresh(); }, 500);   // 팀이면 시계 담당만 시간을 흘린다
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
const MAPID = 'main';
Party.init({ say, isModalOpen: () => UI.isModalOpen(), onApplied() { ensureUids(); if (islName && islandName() !== islName) onMoved(); else { raftSig = ''; syncRaft(); } refresh(); } });
wrapActions();   // 장치 패널 행동·탐사정 확장은 팀 기록에 남긴다(shared/hud.js)
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
  startBuild: (id) => pl.startBuild(id),
  startDemolish: () => pl.startDemolish(),
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
  pl.stepGather(dt); stepParts(dt); netStep(dt, now);
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
  UI.openModal('불시착', STORY_HTML,
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
window.__fp = { party: Party, targets: collectTargets, scene, camera, S, p, groundAt, terrainHit, aimedTarget, getMode: () => pl.mode, setLook(y, pt) { yaw = y; pitch = pt; }, island: () => isl, islName: () => islName, dig: pl.dig, ghostCell, stepPlayer, setSel(k) { pl.sel = k; } };   // 시험(tools/smokefp.js)용 통로
