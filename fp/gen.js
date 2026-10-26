// 1인칭 월드의 지형(7단계): 시드 고정 잡음 → 매끈한 높이장 height(x, z). 복셀은 없다.
// 화학과 무관하다(어디에 무엇이 있는가만 정한다). 모든 크기·시드·개수·한계는 "가정(임의값)"이며 DESIGN.md §4-15 표에 있다.
// 지형은 변하지 않는다(파거나 놓지 않는다). 자원은 위치만 정해 두고 채집 상태는 Sim의 S.nodes가 가진다.
export const N = 64;          // 가정(임의값) 섬 한 변(m)
export const SEA = 10;        // 가정(임의값) 바다면 높이(m). 물 윗면은 y = SEA
export const SEABED = 3;      // 가정(임의값) 섬 밖 바다 밑바닥 높이(m)
export const RX0 = 52, RZ0 = 30;   // 가정(임의값) 뗏목 격자의 시작 칸(섬 동쪽 바다). 뗏목은 +x, +z 쪽으로 넓어진다
export const ISLANDS = ['start', 'plaza', 'alpine', 'polar'];
export const OFFSET = { start: [0, 0], plaza: [130, 0], alpine: [260, 0], polar: [390, 0] };   // 가정(임의값) 섬 사이 간격(멀리 보이게)
export const MAX_SLOPE = 0.5;   // 가정(임의값) 지형 기울기 상한 = tan 26.6°. 걷기 한계(tan 40°)보다 낮게 만들어 어디든 걸어서 오르게 한다(대각선 최대 0.71 < 0.84)
const SEED = { start: 11, plaza: 23, alpine: 37, polar: 51 };   // 가정(임의값) 고정 시드 → 같은 지형

function mulberry32(a) { return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function noiseFn(seed) {   // 값 잡음(격자 점마다 난수를 보간)
  const g = (x, z) => { let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const sm = t => t * t * (3 - 2 * t);
  return (x, z) => { const x0 = Math.floor(x), z0 = Math.floor(z), fx = sm(x - x0), fz = sm(z - z0);
    return (g(x0, z0) * (1 - fx) + g(x0 + 1, z0) * fx) * (1 - fz) + (g(x0, z0 + 1) * (1 - fx) + g(x0 + 1, z0 + 1) * fx) * fz; };
}

// lift = 섬 한가운데가 바다면보다 솟는 정도, amp = 울퉁불퉁함, 눈·바위가 덮이는 기준, 자원 개수
const BIOME = {
  start: { lift: 6, amp: 6, snow: SEA + 7, rock: 0.42, objs: { tree: 8, cane: 2, wheat: 3, sandpile: 3, icecrystal: 5, rock: 3 } },
  plaza: { lift: 5, amp: 2, snow: 0, rock: 9, objs: { tree: 2, cane: 1, wheat: 2, rock: 2 } },
  alpine: { lift: 8, amp: 8, snow: 0, rock: 0.3, objs: { tree: 6, rocksalt: 3, rock: 4, iceblock: 3 } },
  polar: { lift: 5, amp: 5, snow: SEA + 1.5, rock: 0.45, objs: { icecrystal: 4, iceblock: 6, rock: 2 } },
};
export const BIOMES = BIOME;

export class Island {
  constructor(name) { this.name = name; this.h = new Float32Array((N + 1) * (N + 1)); this.objs = []; this.gen(); }
  // 발 아래 높이: 정점 높이를 쌍선형으로 보간한다. 섬 밖은 바다 밑바닥
  height(x, z) {
    if (x <= 0 || z <= 0 || x >= N || z >= N) {   // 가장자리에서는 가장자리 값에서 바닥으로 부드럽게 이어진다
      const cx = Math.max(0, Math.min(N, x)), cz = Math.max(0, Math.min(N, z)), e = this.h[Math.round(cz) * (N + 1) + Math.round(cx)];
      const d = Math.hypot(x - cx, z - cz); return Math.max(SEABED, e - d * 0.5);
    }
    const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0, W = N + 1, h = this.h;
    return (h[z0 * W + x0] * (1 - fx) + h[z0 * W + x0 + 1] * fx) * (1 - fz) + (h[(z0 + 1) * W + x0] * (1 - fx) + h[(z0 + 1) * W + x0 + 1] * fx) * fz;
  }
  slope(x, z) { const e = 0.5; return Math.hypot(this.height(x + e, z) - this.height(x - e, z), this.height(x, z + e) - this.height(x, z - e)) / (2 * e); }
  gen() {
    const b = BIOME[this.name], seed = SEED[this.name], nz = noiseFn(seed), rng = mulberry32(seed * 7919), W = N + 1, h = this.h;
    const cx = N * 0.42, cz = N * 0.5, R = N * 0.36;
    for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) {
      const r = Math.hypot((x - cx) / R, (z - cz) / R), mask = Math.pow(Math.max(0, 1 - r * r), 0.7);
      const f = nz(x / 9, z / 9) * 0.6 + nz(x / 4.5, z / 4.5) * 0.3 + nz(x / 2.2, z / 2.2) * 0.1;
      let v = SEA - 3 + mask * (b.lift + f * b.amp);
      if (this.name === 'plaza' && r < 0.78) v = SEA + 1.6;   // 광장섬은 가운데가 평평하다(시설을 놓는 자리)
      h[z * W + x] = Math.max(SEABED + 0.5, v);
    }
    // 부두 쪽 완만한 내리막: x 28 → 46에서 높이를 SEA + 1로 섞는다
    for (let z = 0; z <= N; z++) for (let x = 28; x < 46; x++) {
      const zb = Math.max(0, Math.min(1, Math.min(z - (RZ0 - 8), RZ0 + 14 - z) / 6)), t = (x - 28) / 18, w = t * t * (3 - 2 * t) * zb;
      h[z * W + x] = h[z * W + x] * (1 - w) + (SEA + 1) * w;
    }
    // 부두: x 46 → RX0는 뗏목 바닥과 같은 높이(SEA)로 고정한다. 기울기 상한을 맞출 때 부두 정점은 움직이지 않고 이웃이 맞춘다
    const pin = new Uint8Array(W * W);
    for (let z = RZ0 - 1; z <= RZ0 + 13; z++) for (let x = 47; x <= RX0; x++) { h[z * W + x] = SEA; pin[z * W + x] = 1; }
    // 기울기 상한: 이웃 정점의 높이 차를 MAX_SLOPE(정점 간격 1 m) 이하로 되풀이해서 깎는다(가정: 어디든 걸어서 오를 수 있게)
    for (let it = 0; it < 120; it++) {
      let moved = false;
      for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) {
        for (const [dx, dz] of [[1, 0], [0, 1]]) {
          const x2 = x + dx, z2 = z + dz; if (x2 > N || z2 > N) continue;
          const i1 = z * W + x, i2 = z2 * W + x2, a = h[i1], c = h[i2], d = c - a;
          if (Math.abs(d) <= MAX_SLOPE) continue;
          const ex = (Math.abs(d) - MAX_SLOPE) * Math.sign(d);   // 남는 높이 차
          if (pin[i1] && pin[i2]) continue;
          if (pin[i1]) h[i2] = c - ex; else if (pin[i2]) h[i1] = a + ex; else { h[i1] = a + ex / 2; h[i2] = c - ex / 2; }
          moved = true;
        }
      }
      if (!moved) break;
    }
    // 자원·시설: 땅 위(해안·부두 제외) 완만한 곳, 시드 고정 위치. id는 S.nodes의 키가 된다
    const free = [], used = [];
    for (let z = 4; z < N - 4; z++) for (let x = 4; x < 43; x++) if (this.height(x, z) >= SEA + 1.5 && this.slope(x, z) < 0.4) free.push([x, z]);
    const pick = (minD) => { for (let t = 0; t < 500 && free.length; t++) { const [x, z] = free[Math.floor(rng() * free.length)]; if (used.every(([ux, uz]) => Math.hypot(ux - x, uz - z) >= minD)) { used.push([x, z]); return [x, z]; } } return null; };
    const add = (type, x, z) => { this.objs.push({ id: type + '-' + this.name + '-' + this.objs.length, type, x: x + 0.5, y: this.height(x + 0.5, z + 0.5), z: z + 0.5 }); };
    const fixed = (type, x, z) => { used.push([x, z]); add(type, x, z); };
    // 시설을 먼저 놓아(자리를 확보) 자원이 겹치지 않게 한다
    fixed('harbor', 41, RZ0 + 2);
    if (this.name === 'start') fixed('fragment', 42, RZ0 + 5);
    if (this.name === 'plaza') { fixed('box', 33, 24); fixed('board', 33, 40); fixed('altar', 24, 32); }
    for (const [type, n] of Object.entries(b.objs)) for (let i = 0; i < n; i++) { const p = pick(type === 'tree' ? 4 : 2.5); if (p) add(type, p[0], p[1]); }
  }
}
