// 복셀 → 메시: 보이는 면만 만든다(이웃이 단단하면 면 생략). 질감은 sprites.js의 Art.tiles 캔버스를 한 장의 아틀라스로 묶는다.
// 화학과 무관하다. 모든 크기는 gen.js의 가정값을 따른다.
import { N, HGT, SEA } from './gen.js';
const { AIR, GRASS, DIRT, STONE, SAND, SNOWTOP, ICE, WATER, RAFT } = World;

// 아틀라스 칸 번호: 윗면·옆면에 쓰는 Art.tiles
export const ATLAS = ['grass', 'dirt', 'stone', 'sand', 'snow', 'ice', 'raft'];
export function buildAtlas(THREE) {
  const M = ATLAS.length, c = document.createElement('canvas'); c.width = 16 * M; c.height = 16;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  ATLAS.forEach((k, i) => { const t = Art.tiles[k]; if (t) g.drawImage(t[0], i * 16, 0, 16, 16); });
  const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
// 블록 → [윗면, 옆면] 아틀라스 칸
const FACE = { [GRASS]: [0, 1], [DIRT]: [1, 1], [STONE]: [2, 2], [SAND]: [3, 3], [SNOWTOP]: [4, 1], [ICE]: [5, 5], [RAFT]: [6, 6] };
const M = ATLAS.length, EPS = 0.5 / (16 * M);
// 면: 이웃 방향, 모서리 4개(바깥에서 봤을 때 반시계), 밝기(윗면 1.0, 옆면은 방향마다 조금씩 어둡게)
const FACES = [
  { d: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: 0.82, top: false },
  { d: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: 0.82, top: false },
  { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 0.9, top: false },
  { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 0.9, top: false },
  { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1, top: true },
];
const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
const opaque = id => id !== AIR && id !== WATER;

// 청크 (cx, cz)의 지오메트리 데이터를 만든다. raftCell(x, z) = 뗏목이 덮고 있는 열인지(그 열의 바닥 위 칸은 건너뛰지 않는다)
export function chunkData(isl, cx, cz, CH) {
  const pos = [], uv = [], col = [], idx = [];
  const x0 = cx * CH, z0 = cz * CH;
  for (let y = 0; y < HGT; y++) for (let z = z0; z < z0 + CH; z++) for (let x = x0; x < x0 + CH; x++) {
    const id = isl.get(x, y, z);
    if (!opaque(id)) continue;
    for (const f of FACES) {
      const nid = isl.get(x + f.d[0], y + f.d[1], z + f.d[2]);
      if (opaque(nid)) continue;
      const [tIdx, sIdx] = FACE[id] || [2, 2], tile = f.top ? tIdx : sIdx, u0 = tile / M + EPS, u1 = (tile + 1) / M - EPS;
      const base = pos.length / 3, shade = f.s * (y < SEA - 1 ? 0.75 : 1);   // 물속은 조금 어둡게
      for (let i = 0; i < 4; i++) {
        const c = f.c[i]; pos.push(x + c[0], y + c[1], z + c[2]);
        uv.push(UV[i][0] ? u1 : u0, 1 - (UV[i][1] ? 0.03 : 0.97)); col.push(shade, shade, shade);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return { pos, uv, col, idx };
}
