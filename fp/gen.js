// 1인칭 월드의 지형: 시드 고정 높이맵 → 복셀. 화학과 무관하다(어디에 무엇이 있는가만 정한다).
// 블록 번호는 world.js(World)의 타일 번호를 그대로 쓴다(AIR 0, GRASS 1, DIRT 2, STONE 3, SAND 4, SNOWTOP 5, ICE 6, WATER 7, RAFT 8).
// 모든 크기·시드·개수는 "가정(임의값)"이며 DESIGN.md §4-15 표에 있다.
const { AIR, GRASS, DIRT, STONE, SAND, SNOWTOP, ICE, WATER } = World;

export const N = 64;          // 가정(임의값) 섬 한 변(칸)
export const HGT = 32;        // 가정(임의값) 높이(칸)
export const SEA = 10;        // 가정(임의값) 바다면 높이: 물 복셀은 y < SEA, 물 윗면은 y = SEA
export const SEABED = 3;      // 가정(임의값) 바다 밑바닥 높이(섬 밖은 y < SEABED가 돌)
export const RX0 = 52, RZ0 = 30;   // 가정(임의값) 뗏목 격자의 시작 칸(섬 동쪽 바다). 뗏목은 +x, +z 쪽으로 넓어진다
export const ISLANDS = ['start', 'plaza', 'alpine', 'polar'];
export const OFFSET = { start: [0, 0], plaza: [130, 0], alpine: [260, 0], polar: [390, 0] };   // 가정(임의값) 섬 사이 간격(멀리 보이게)
const SEED = { start: 11, plaza: 23, alpine: 37, polar: 51 };                                     // 가정(임의값) 고정 시드 → 같은 지형

function mulberry32(a) { return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function noiseFn(seed) {   // 값 잡음(격자 점마다 난수를 보간)
  const g = (x, z) => { let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const sm = t => t * t * (3 - 2 * t);
  return (x, z) => { const x0 = Math.floor(x), z0 = Math.floor(z), fx = sm(x - x0), fz = sm(z - z0);
    return (g(x0, z0) * (1 - fx) + g(x0 + 1, z0) * fx) * (1 - fz) + (g(x0, z0 + 1) * (1 - fx) + g(x0 + 1, z0 + 1) * fx) * fz; };
}

// 섬마다 다른 모양: base = 기본 높이, amp = 울퉁불퉁함, dirt = 흙 두께(고산 섬은 얇고 바위가 많다), snow = 눈이 덮이는 높이(없으면 0)
const BIOME = {
  start: { base: 5, amp: 9, dirt: 3, top: GRASS, snow: SEA + 7, beach: SAND, objs: { tree: 8, cane: 2, wheat: 3, sandpile: 3, icecrystal: 5 } },
  plaza: { base: 4, amp: 2, dirt: 3, top: GRASS, snow: 0, beach: SAND, objs: { tree: 2, cane: 1, wheat: 2 } },
  alpine: { base: 6, amp: 13, dirt: 1, top: GRASS, snow: 0, beach: SAND, objs: { tree: 6, rocksalt: 3 } },
  polar: { base: 4, amp: 6, dirt: 3, top: SNOWTOP, snow: 0, beach: SNOWTOP, objs: { icecrystal: 8 } },
};

export class Island {
  constructor(name) { this.name = name; this.data = new Uint8Array(N * HGT * N); this.top = new Int16Array(N * N); this.objs = []; this.gen(); }
  idx(x, y, z) { return (y * N + z) * N + x; }
  get(x, y, z) {
    if (y < 0) return STONE;
    if (y >= HGT) return AIR;
    if (x < 0 || x >= N || z < 0 || z >= N) return y < SEABED ? STONE : y < SEA ? WATER : AIR;   // 섬 밖은 바다
    return this.data[this.idx(x, y, z)];
  }
  set(x, y, z, id) { if (x >= 0 && x < N && z >= 0 && z < N && y >= 0 && y < HGT) this.data[this.idx(x, y, z)] = id; }
  topY(x, z) { return x < 0 || x >= N || z < 0 || z >= N ? SEABED : this.top[z * N + x]; }   // 가장 높은 단단한 칸 위(= 서 있는 높이)
  gen() {
    const b = BIOME[this.name], seed = SEED[this.name], nz = noiseFn(seed), rng = mulberry32(seed * 7919);
    const H = new Int16Array(N * N), cx = N * 0.42, cz = N * 0.5, R = N * 0.36;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const r = Math.hypot((x - cx) / R, (z - cz) / R), mask = Math.pow(Math.max(0, 1 - r * r), 0.7);
      const f = nz(x / 9, z / 9) * 0.6 + nz(x / 4.5, z / 4.5) * 0.3 + nz(x / 2.2, z / 2.2) * 0.1;
      let h = SEA - 3 + Math.round(mask * (b.base + 6 + f * b.amp));
      if (this.name === 'plaza' && r < 0.78) h = SEA + 2;   // 광장섬은 가운데가 평평하다(시설을 놓는 자리)
      H[z * N + x] = Math.max(SEABED + 1, Math.min(HGT - 6, h));
    }
    // 부두 쪽 완만한 내리막: x 28 → 44에서 높이를 SEA + 2로 섞는다(열마다 높이 차가 1칸 이하가 되도록)
    for (let z = 0; z < N; z++) for (let x = 28; x < 44; x++) {
      const zb = Math.max(0, Math.min(1, Math.min(z - (RZ0 - 8), RZ0 + 14 - z) / 6)), t = (x - 28) / 16, w = t * t * (3 - 2 * t) * zb, k = z * N + x;
      H[k] = Math.max(SEABED + 1, Math.round(H[k] * (1 - w) + (SEA + 2) * w));
    }
    // 뗏목 부두: 해안에서 뗏목 격자까지 한 칸씩 낮아져 뗏목 높이(SEA)와 맞닿는다(한 칸 턱은 점프로 넘는다)
    for (let x = 44; x < RX0; x++) for (let z = RZ0 - 2; z < RZ0 + 12; z++) {
      const k = z * N + x, want = x <= 45 ? Math.min(H[k], SEA + 2) : x <= 47 ? Math.min(H[k], SEA + 1) : SEA;
      H[k] = Math.max(want, SEABED + 1);
    }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const h = H[z * N + x], beach = h <= SEA + 1, pier = x >= 44 && x < RX0 && z >= RZ0 - 2 && z < RZ0 + 12;
      const top = beach || pier ? b.beach : b.snow && h >= b.snow ? SNOWTOP : b.top;
      for (let y = 0; y < h; y++) {
        const d = h - 1 - y;
        this.data[this.idx(x, y, z)] = d === 0 ? top : d <= b.dirt ? (top === SAND ? SAND : DIRT) : STONE;
      }
      for (let y = h; y < SEA; y++) this.data[this.idx(x, y, z)] = WATER;
      this.top[z * N + x] = h;
    }
    // 얼음 연못(극지 섬·시작섬): 위 두 칸을 얼음으로
    const ponds = this.name === 'polar' ? [[20, 18, 4], [30, 40, 5]] : this.name === 'start' ? [[22, 44, 3]] : [];
    for (const [px, pz, pr] of ponds) for (let z = pz - pr; z <= pz + pr; z++) for (let x = px - pr; x <= px + pr; x++) {
      if (Math.hypot(x - px, z - pz) > pr || x < 0 || z < 0 || x >= N || z >= N) continue;
      const h = this.top[z * N + x]; if (h <= SEA + 1) continue;
      this.data[this.idx(x, h - 1, z)] = ICE; this.data[this.idx(x, h - 2, z)] = ICE;
    }
    // 자원·시설: 땅 위(해안·부두·연못 제외) 시드 고정 위치. id는 S.nodes의 키가 된다
    const free = [], used = [];
    for (let z = 4; z < N - 4; z++) for (let x = 4; x < 43; x++) { const h = this.top[z * N + x], id = this.data[this.idx(x, h - 1, z)]; if (h >= SEA + 2 && (id === GRASS || id === SNOWTOP || id === DIRT)) free.push([x, z]); }
    const pick = (minD) => { for (let t = 0; t < 400 && free.length; t++) { const [x, z] = free[Math.floor(rng() * free.length)]; if (used.every(([ux, uz]) => Math.hypot(ux - x, uz - z) >= minD)) { used.push([x, z]); return [x, z]; } } return null; };
    const add = (type, x, z, minD = 0) => { const id = type + '-' + this.name + '-' + this.objs.length; this.objs.push({ id, type, x: x + 0.5, y: this.topY(x, z), z: z + 0.5 }); };
    const fixed = (type, x, z) => { used.push([x, z]); add(type, x, z); };
    for (const [type, n] of Object.entries(b.objs)) for (let i = 0; i < n; i++) { const p = pick(type === 'tree' ? 4 : 2.5); if (p) add(type, p[0], p[1]); }
    // 시설: 항구 표지판(모든 섬), 시작섬의 뗏목 파편, 광장섬의 보급 상자·게시판·제단
    fixed('harbor', 41, RZ0 + 2);
    if (this.name === 'start') fixed('fragment', 42, RZ0 + 5);
    if (this.name === 'plaza') { fixed('box', 33, 24); fixed('board', 33, 40); fixed('altar', 24, 32); }
  }
  // 파낸·놓은 복셀을 다시 입힌다. mods = { 'x,y,z': 블록 번호 }
  applyMods(mods) { for (const k in mods || {}) { const [x, y, z] = k.split(',').map(Number); this.set(x, y, z, mods[k]); } this.refreshTop(); }
  refreshTop() { for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { let y = HGT - 1; while (y > 0 && (this.data[this.idx(x, y, z)] === AIR || this.data[this.idx(x, y, z)] === WATER)) y--; this.top[z * N + x] = y + 1; } }
}
