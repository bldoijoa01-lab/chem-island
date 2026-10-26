// 1인칭 모형: 외부 모델·이미지 없이 기본 도형(원기둥·구·원뿔·상자) 몇 개를 합친 저폴리 모양. 화학·계산과 무관하다(보이는 모양만).
// 길이 단위는 m, 모든 모형은 바닥 가운데가 (0, 0, 0)이다. 크기·색은 모두 "가정(임의값)"이다.
import * as THREE from 'three';

const matCache = new Map();
const mat = (color, opts = {}) => { const k = color + JSON.stringify(opts); let m = matCache.get(k); if (!m) { m = new THREE.MeshLambertMaterial({ color, ...opts }); matCache.set(k, m); } return m; };
const geoCache = new Map();
const geo = (key, make) => { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; };
const cyl = (rt, rb, h, seg = 8) => geo(`cyl${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const sph = (r, ws = 10, hs = 8) => geo(`sph${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const cone = (r, h, seg = 8) => geo(`cone${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const box = (w, h, d) => geo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const ico = (r, d = 1) => geo(`ico${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
const oct = (r) => geo(`oct${r}`, () => new THREE.OctahedronGeometry(r, 0));
function add(g, geometry, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m; }

const BROWN = 0x7a5232, DARK = 0x3d2a18, GREEN = 0x4f9a3a, DGREEN = 0x2f6b3a, STONE = 0x8a8f99, ICE = 0xa9e1f7, SAND = 0xe0c677, GOLD = 0xd9b43a, WHITE = 0xf2f6fa;

// ---------- 자원·시설 ----------
export function makeObject(type, opts = {}) {
  const g = new THREE.Group();
  switch (type) {
    case 'tree':
      if (opts.pine) {   // 소나무: 원뿔 세 단
        add(g, cyl(0.18, 0.26, 1.2), mat(BROWN), 0, 0.6, 0);
        for (let i = 0; i < 3; i++) add(g, cone(1.25 - i * 0.28, 1.5, 8), mat(DGREEN), 0, 1.5 + i * 0.95, 0);
      } else {           // 활엽수: 줄기 + 둥근 잎 뭉치
        add(g, cyl(0.2, 0.3, 2.2), mat(BROWN), 0, 1.1, 0);
        add(g, ico(1.35, 1), mat(GREEN), 0, 3.1, 0); add(g, ico(0.95, 1), mat(0x5fae45), 0.8, 2.6, 0.3); add(g, ico(0.85, 1), mat(0x468a34), -0.7, 2.7, -0.4);
      }
      break;
    case 'cane':
      for (let i = 0; i < 4; i++) { const a = i * 1.7, c = add(g, cyl(0.06, 0.08, 2.3, 6), mat(0x8cc152), Math.cos(a) * 0.25, 1.15, Math.sin(a) * 0.25); c.rotation.z = Math.cos(a) * 0.12; c.rotation.x = Math.sin(a) * 0.12; add(g, cone(0.12, 0.5, 5), mat(0x6fa83a), Math.cos(a) * 0.3, 2.45, Math.sin(a) * 0.3); }
      break;
    case 'wheat':
      for (let i = 0; i < 7; i++) { const a = i * 0.9, r = 0.1 + (i % 3) * 0.12, x = Math.cos(a) * r, z = Math.sin(a) * r; add(g, cyl(0.025, 0.035, 1.1, 5), mat(0xc9a645), x, 0.55, z); add(g, sph(0.09, 6, 5), mat(GOLD), x, 1.18, z, 1, 2.2, 1); }
      break;
    case 'sandpile': add(g, sph(0.95, 10, 6), mat(SAND), 0, 0, 0, 1.2, 0.55, 1.1); break;
    case 'icecrystal':
      for (const [x, z, h, r] of [[0, 0, 1.6, 0.35], [0.45, 0.15, 1.0, 0.26], [-0.4, -0.2, 0.8, 0.22]]) { const c = add(g, cone(r, h, 5), mat(ICE, { transparent: true, opacity: 0.85 }), x, h / 2, z); c.rotation.z = x * 0.25; }
      break;
    case 'rocksalt':
      add(g, ico(0.6, 0), mat(WHITE), 0, 0.45, 0, 1.1, 0.9, 1); add(g, ico(0.4, 0), mat(0xdbe8f5), 0.55, 0.3, 0.2); add(g, ico(0.3, 0), mat(0xe9f1fa), -0.45, 0.25, -0.3);
      break;
    case 'rock':
      add(g, ico(0.95, 1), mat(0x7f858f), 0, 0.55, 0, 1.2, 0.8, 1); add(g, ico(0.55, 1), mat(0x6c727c), 0.8, 0.3, 0.3); add(g, ico(0.4, 1), mat(0x8e949e), -0.7, 0.25, -0.4);
      break;
    case 'iceblock':
      add(g, ico(0.9, 1), mat(0xcdeefb, { transparent: true, opacity: 0.9 }), 0, 0.6, 0, 1.15, 0.85, 1); add(g, ico(0.5, 1), mat(0xb4e3f6, { transparent: true, opacity: 0.9 }), 0.7, 0.3, 0.3);
      break;
    case 'harbor':   // 항구 표지판: 기둥 + 화살표 판
      add(g, cyl(0.1, 0.12, 2.6), mat(BROWN), 0, 1.3, 0); add(g, box(1.5, 0.5, 0.12), mat(0xa77b4d), 0.35, 2.3, 0); add(g, cone(0.3, 0.45, 3), mat(0xa77b4d), 1.25, 2.3, 0).rotation.z = -Math.PI / 2;
      add(g, box(0.35, 0.35, 0.35), mat(0x3a79c4), -0.15, 1.1, 0.15); break;
    case 'board':    // 유리병 편지 게시판
      add(g, cyl(0.08, 0.1, 2.0), mat(BROWN), -0.7, 1.0, 0); add(g, cyl(0.08, 0.1, 2.0), mat(BROWN), 0.7, 1.0, 0);
      add(g, box(1.8, 1.1, 0.1), mat(0xb98a55), 0, 1.7, 0); for (const [x, y, c] of [[-0.45, 1.8, 0x6fb7a6], [0.1, 1.55, 0xf4f0e5], [0.5, 1.85, 0xc4ece0]]) add(g, box(0.4, 0.4, 0.04), mat(c), x, y, 0.08);
      break;
    case 'box':      // 광장 보급 상자
      add(g, box(1.3, 0.8, 0.9), mat(0x9a6b3c), 0, 0.4, 0); add(g, cyl(0.45, 0.45, 1.3, 10), mat(0xb07b45), 0, 0.85, 0).rotation.z = Math.PI / 2; add(g, box(0.18, 0.3, 0.06), mat(GOLD), 0, 0.7, 0.47);
      break;
    case 'altar':    // 솥 골렘 제단: 돌 받침 + 기둥 + 빛나는 구
      add(g, cyl(1.5, 1.7, 0.7, 10), mat(0x70757f), 0, 0.35, 0); add(g, cyl(0.7, 0.9, 0.9, 8), mat(0x858b96), 0, 1.15, 0);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; add(g, cyl(0.12, 0.16, 1.5), mat(0x606670), Math.cos(a) * 1.3, 1.1, Math.sin(a) * 1.3); }
      g.userData.glow = add(g, sph(0.32, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc878, transparent: true }), 0, 2.0, 0); break;
    case 'fragment': // 뗏목 파편: 널빤지 몇 장
      for (const [x, z, r] of [[0, 0, 0.2], [0.35, 0.2, -0.3], [-0.3, 0.3, 0.7]]) { const p = add(g, box(1.1, 0.12, 0.3), mat(0x8a6038), x, 0.1 + Math.abs(x) * 0.1, z); p.rotation.y = r; p.rotation.z = x * 0.3; }
      add(g, cyl(0.18, 0.18, 1.0, 8), mat(0x6a4a2a), 0.1, 0.22, -0.4).rotation.z = Math.PI / 2; break;
    default: add(g, sph(0.4), mat(0xff00ff), 0, 0.4, 0);
  }
  return g;
}

// ---------- 장치(2 × 2 칸) ----------
export function makeDevice(id) {
  const g = new THREE.Group(), parts = {};
  switch (id) {
    case 'fire': {   // 화덕: 돌 테두리 + 장작 + 불꽃
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; add(g, ico(0.3, 0), mat(i % 2 ? 0x7f858f : 0x6c727c), Math.cos(a) * 0.8, 0.22, Math.sin(a) * 0.8, 1, 0.8, 1); }
      for (let i = 0; i < 3; i++) { const l = add(g, cyl(0.1, 0.1, 1.0, 6), mat(DARK), 0, 0.2, 0); l.rotation.z = Math.PI / 2; l.rotation.y = i * 1.05; }
      parts.flame = add(g, cone(0.42, 1.1, 7), new THREE.MeshBasicMaterial({ color: 0xff9a2e, transparent: true, opacity: 0.9 }), 0, 0.8, 0);
      parts.core = add(g, cone(0.22, 0.7, 6), new THREE.MeshBasicMaterial({ color: 0xffe27a }), 0, 0.65, 0);
      break;
    }
    case 'still': {  // 증류기: 받침 위의 플라스크 + 목 + 응축관 + 받는 병
      add(g, cyl(0.7, 0.8, 0.25, 10), mat(0x7f858f), -0.2, 0.12, 0);
      parts.flask = add(g, sph(0.62, 12, 10), mat(0xbfe7f7, { transparent: true, opacity: 0.75 }), -0.2, 0.95, 0);
      parts.liquid = add(g, sph(0.55, 10, 8), mat(0x3f9be0, { transparent: true, opacity: 0.9 }), -0.2, 0.7, 0, 1, 0.55, 1);
      add(g, cyl(0.16, 0.2, 0.6, 8), mat(0xbfe7f7, { transparent: true, opacity: 0.8 }), -0.2, 1.65, 0);
      const t = add(g, cyl(0.07, 0.07, 1.3, 6), mat(0x9aa4b0), 0.45, 1.75, 0); t.rotation.z = -Math.PI / 2.6;
      add(g, cyl(0.28, 0.28, 0.55, 8), mat(0xbfe7f7, { transparent: true, opacity: 0.8 }), 0.85, 0.3, 0);
      break;
    }
    case 'cooker': { // 압력 밥솥: 원통 + 뚜껑 + 추 + 손잡이
      add(g, cyl(0.85, 0.9, 1.0, 12), mat(0x9aa4b0), 0, 0.5, 0);
      add(g, cyl(0.88, 0.88, 0.12, 12), mat(0x7a8592), 0, 1.06, 0);
      add(g, sph(0.82, 12, 6), mat(0xaab4c0), 0, 1.1, 0, 1, 0.45, 1);
      parts.weight = add(g, cyl(0.1, 0.12, 0.3, 6), mat(0x3a3f47), 0, 1.65, 0);
      for (const s of [-1, 1]) add(g, box(0.5, 0.1, 0.12), mat(0x3a3f47), s * 1.0, 0.8, 0);
      parts.done = add(g, sph(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe066 }), 0, 2.1, 0); parts.done.visible = false;
      break;
    }
    case 'cooler': { // 냉각 상자: 서리 낀 상자
      add(g, box(1.7, 0.95, 1.5), mat(0xdbe9f3), 0, 0.48, 0); add(g, box(1.8, 0.14, 1.6), mat(0xb7d4e6), 0, 1.0, 0);
      for (const x of [-0.5, 0.2]) add(g, ico(0.22, 0), mat(ICE, { transparent: true, opacity: 0.85 }), x, 1.2, 0.1);
      add(g, box(0.3, 0.12, 0.1), mat(0x4a68b4), 0, 0.7, 0.78);
      break;
    }
    case 'collector': { // 기체 포집기: 종 모양 유리 + 탱크 + 주사기 꽂이
      add(g, cyl(0.9, 0.95, 0.2, 12), mat(0x7f858f), 0, 0.1, 0);
      add(g, cyl(0.45, 0.8, 1.2, 12), mat(0xbfe7f7, { transparent: true, opacity: 0.6, side: THREE.DoubleSide }), 0, 0.8, 0);
      add(g, sph(0.46, 10, 6), mat(0xbfe7f7, { transparent: true, opacity: 0.6 }), 0, 1.4, 0, 1, 0.6, 1);
      add(g, cyl(0.06, 0.06, 0.5, 6), mat(0x667587), 0, 1.85, 0);
      add(g, cyl(0.28, 0.28, 0.7, 8), mat(0x3a79c4), 0.85, 0.45, 0.2);
      break;
    }
    default: add(g, box(1.6, 1.4, 1.6), mat(0xaaaaaa), 0, 0.7, 0);
  }
  const bad = new THREE.Group(); const b1 = add(bad, box(0.9, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xff5a4a })); b1.rotation.z = 0.78; const b2 = add(bad, box(0.9, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xff5a4a })); b2.rotation.z = -0.78;
  bad.position.y = 2.4; bad.visible = false; g.add(bad); parts.bad = bad;
  g.userData.parts = parts;
  return g;
}

// ---------- 얼음 생물(서리 늑대의 우주 테마 모양. 질량·소금 규칙은 그대로) ----------
export function makeWolf() {
  const g = new THREE.Group(), body = new THREE.Group(), legs = [];
  const fur = (c, e = 0) => mat(c, { transparent: true, opacity: 1, emissive: e });
  const m1 = fur(0x9fe0f5, 0x0a3a50), m2 = fur(0xd8f6ff, 0x1a5a70), m3 = fur(0x6fc4e6, 0x08304a);
  add(body, ico(0.7, 0), m1, 0, 0.8, 0, 1.35, 0.8, 0.95);                       // 결정 몸통(각진 다면체)
  for (const [x, z, h] of [[-0.3, 0, 0.7], [0.1, 0.25, 0.55], [0.1, -0.25, 0.55], [0.5, 0, 0.45]]) add(body, cone(0.14, h, 4), m2, x, 1.2 + h / 2 - 0.2, z);   // 등의 고드름
  add(body, ico(0.32, 0), m2, 0.95, 0.95, 0);                                    // 머리
  for (const z of [-0.14, 0.14]) add(body, sph(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0xaaf0ff }), 1.18, 1.02, z);   // 빛나는 눈
  add(body, cone(0.2, 0.5, 4), m3, 1.35, 0.9, 0).rotation.z = -Math.PI / 2;      // 주둥이
  add(body, cone(0.14, 0.7, 4), m3, -1.0, 0.9, 0).rotation.z = Math.PI / 2.4;    // 꼬리 결정
  for (const [x, z] of [[0.55, 0.3], [0.55, -0.3], [-0.55, 0.3], [-0.55, -0.3]]) { const l = add(body, cone(0.12, 0.6, 5), m3, x, 0.32, z); l.rotation.x = Math.PI; legs.push(l); }   // 뾰족한 다리
  g.add(body); g.userData = { legs, mats: [m1, m2, m3] };
  g.scale.setScalar(1.3);
  return g;
}

// ---------- 다른 플레이어 ----------
export function makePlayerModel(hue) {
  const g = new THREE.Group(), col = new THREE.Color().setHSL(hue, 0.55, 0.5);
  add(g, cyl(0.28, 0.3, 0.9, 8), mat(col.getHex()), 0, 0.75, 0); add(g, sph(0.24, 8, 6), mat(0xf0c8a0), 0, 1.45, 0); add(g, cyl(0.26, 0.26, 0.1, 8), mat(0x3a3f55), 0, 1.65, 0);
  for (const s of [-1, 1]) add(g, cyl(0.09, 0.09, 0.7, 6), mat(0x3a3f55), s * 0.14, 0.2, 0);
  return g;
}

// ---------- 탐사정(뗏목의 우주 테마 모양): 금속판 갑판 + 테두리 보 + 엔진 ----------
// 갑판 윗면이 SEA(수면과 같은 높이)에 맞는다. 충돌·칸 격자는 그대로이고 모양만 다르다
export function makeRaft(cx, cz, SEA, RX0, RZ0) {
  const g = new THREE.Group(), dm = new THREE.Object3D();
  const plates = new THREE.InstancedMesh(box(0.96, 0.2, 0.96), mat(0xffffff), cx * cz);
  const col = new THREE.Color(); let i = 0;
  for (let z = 0; z < cz; z++) for (let x = 0; x < cx; x++) { dm.position.set(RX0 + x + 0.5, SEA - 0.1, RZ0 + z + 0.5); dm.updateMatrix(); plates.setMatrixAt(i, dm.matrix); plates.setColorAt(i, col.set((x + z) % 2 ? 0x6b7686 : 0x7a8596).offsetHSL(0, 0, ((x * 7 + z * 13) % 5 - 2) * 0.01)); i++; }
  plates.frustumCulled = false; g.add(plates);
  // 선체 아래(물에 잠기는 부분)와 테두리 보
  add(g, box(cx, 0.35, cz), mat(0x3d4654), RX0 + cx / 2, SEA - 0.37, RZ0 + cz / 2);
  const beam = (w, d, x, z) => add(g, box(w, 0.3, d), mat(0x2f3744), x, SEA + 0.04, z);
  beam(cx + 0.3, 0.16, RX0 + cx / 2, RZ0 - 0.08); beam(cx + 0.3, 0.16, RX0 + cx / 2, RZ0 + cz + 0.08);
  beam(0.16, cz, RX0 - 0.08, RZ0 + cz / 2); beam(0.16, cz, RX0 + cx + 0.08, RZ0 + cz / 2);
  // 엔진: 바다 쪽(+x) 끝에 노즐 두 개와 푸른 불빛(보이기만)
  const nz = Math.max(2, Math.floor(cz / 3));
  for (let k = 0; k < nz; k++) {
    const z = RZ0 + cz * (k + 1) / (nz + 1), x = RX0 + cx + 0.55;
    const n = add(g, cyl(0.42, 0.3, 0.9, 10), mat(0x4a5465), x, SEA - 0.05, z); n.rotation.z = Math.PI / 2;
    const f = add(g, cone(0.26, 0.8, 8), new THREE.MeshBasicMaterial({ color: 0x66b8ff, transparent: true, opacity: 0.8 }), x + 0.8, SEA - 0.05, z); f.rotation.z = -Math.PI / 2;
  }
  // 귀퉁이 안테나(알아보기 쉬운 표시)
  add(g, cyl(0.04, 0.05, 1.2, 5), mat(0x9aa4b0), RX0 + 0.25, SEA + 0.6, RZ0 + 0.25); add(g, sph(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff6a5a }), RX0 + 0.25, SEA + 1.25, RZ0 + 0.25);
  return g;
}
