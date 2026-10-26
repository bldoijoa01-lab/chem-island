// 매끈한 지형 메시: 높이장 height(x, z)를 step 간격 격자로 샘플해 정점 색(높이·경사·섬 종류)과 법선을 준다.
// 활성 섬은 STEP_NEAR, 멀리 보이는 섬은 STEP_FAR(성긴 격자)로 같은 height()를 그린다. 질감 이미지는 쓰지 않는다.
import { N, SEA, BIOMES } from './gen.js';
export const STEP_NEAR = 1;   // 가정(임의값) 활성 섬의 정점 간격(m)
export const STEP_FAR = 4;    // 가정(임의값) 먼 섬의 정점 간격(m)
const SAND = [0.88, 0.78, 0.47], GRASS = [0.36, 0.62, 0.23], ROCK = [0.5, 0.52, 0.56], SNOW = [0.95, 0.97, 0.99], DIRT = [0.45, 0.33, 0.2], WET = [0.55, 0.5, 0.35];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = v => Math.max(0, Math.min(1, v));
function jitter(x, z) { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return (s - Math.floor(s)) - 0.5; }   // 정점마다 조금씩 다른 밝기(결정적)
// 섬 종류·높이·경사로 색을 정한다: 물가는 모래, 위로 풀, 가파르면 바위, 높거나 극지면 눈
export function colorAt(isl, x, z, h, slope) {
  const b = BIOMES[isl.name];
  if (isl.name === 'plaza' && h >= SEA + 0.5) {   // 허브 정거장: 금속 바닥(4 m 판 무늬와 이음선)
    const gx = x / 4, gz = z / 4, edge = Math.min(Math.abs(gx - Math.round(gx)), Math.abs(gz - Math.round(gz))) < 0.07 ? 0.8 : 1, chk = (Math.floor(gx) + Math.floor(gz)) % 2 ? 1 : 0.93, j = jitter(x, z) * 0.05;
    return [clamp01((0.52 + j) * edge * chk), clamp01((0.58 + j) * edge * chk), clamp01((0.67 + j) * edge * chk)];
  }
  let c;
  if (h < SEA - 0.2) c = mix(WET, SAND, clamp01((h - (SEA - 3)) / 3));                // 물속: 어두운 모래(깊을수록 어둡게)
  else if (h < SEA + 1.1) c = SAND;                                                    // 해변
  else if (isl.name === 'polar') c = mix(SNOW, [0.8, 0.9, 0.96], clamp01(slope * 1.5)); // 극지: 눈
  else if (isl.name === 'alpine') c = mix([0.34, 0.27, 0.42], [0.5, 0.42, 0.62], clamp01(0.7 - slope));   // 저기압 고원 행성: 보랏빛 지표(흙 얇고 바위 많다)
  else c = GRASS;
  if (isl.name !== 'polar') {
    if (b.snow && h > b.snow) c = mix(c, SNOW, clamp01((h - b.snow) / 2));
    if (slope > b.rock && h > SEA + 0.5) c = mix(c, ROCK, clamp01((slope - b.rock) / 0.15));
  }
  const j = jitter(x, z) * 0.12, d = h < SEA ? 0.55 + 0.45 * clamp01((h - SEABED_DARK) / (SEA - SEABED_DARK)) : 1;
  return [clamp01((c[0] + j) * d), clamp01((c[1] + j) * d), clamp01((c[2] + j) * d)];
}
const SEABED_DARK = 3;
export function buildIslandGeometry(THREE, isl, step) {
  const n = Math.round(N / step), W = n + 1, pos = new Float32Array(W * W * 3), col = new Float32Array(W * W * 3), idx = [];
  for (let k = 0; k < W * W; k++) {
    const gx = (k % W) * step, gz = Math.floor(k / W) * step, h = isl.height(gx, gz), c = colorAt(isl, gx, gz, h, isl.slope(gx, gz));
    pos[k * 3] = gx; pos[k * 3 + 1] = h; pos[k * 3 + 2] = gz; col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
  }
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) { const a = z * W + x, b = a + 1, c = a + W, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
