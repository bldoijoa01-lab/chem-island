// 탑다운 땅 타일 굽기(13-b): 높이장 height(x, z)를 위에서 본 픽셀 아트 한 장으로 미리 그려 둔다(섬이 바뀔 때만).
// 1 m = 16 px(= sprites.js의 1 타일). 모든 색·기준 높이·음영 세기는 "가정(임의값)"이다(DESIGN.md §4-20).
import { N, SEA, RX0, RZ0, PAD } from '../shared/gen.js';
export const PX = 16;                                  // 1 m = 16 px
export const MAP = { x0: -16, z0: -16, w: N + 48, h: N + 32 };   // 굽는 범위(m): 걷기 한계(BOUNDS) 둘레 바다까지. 밖은 물 색으로 채운다
// 섬마다 땅 성격(가정): 모래 해안 높이, 눈 높이, 바위 기울기. 'metal'은 허브 정거장 바닥
const BIO = {
  start: { shore: 1.0, snow: SEA + 7, rock: 0.58, grass: true },   // 지형은 경사가 0.5 안팎으로 깎여 있어(gen.js MAX_SLOPE) 기울기가 큰 쪽 끝만 바위로 본다
  plaza: { metal: true },
  alpine: { shore: 0.8, snow: SEA + 9, rock: 0.56, tint: 'rgba(122,95,176,.2)' },
  polar: { shore: 1.2, snow: SEA + 0.8, rock: 0.5, ice: true, tint: 'rgba(159,208,232,.12)' },
};
const hash = (x, z) => { let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0); };
const inDock = (x, z) => x >= 47 && x <= RX0 && z >= RZ0 - 1 && z <= RZ0 + 13;   // 부두(뗏목 바닥과 같은 높이로 고정된 곳)

// 위에서 본 풀밭(sprites.js의 grass는 옆모습 블록이라 쓰지 않는다): 두 초록 바탕에 덩어리 점
function grassTiles() {
  const out = [];
  for (let v = 0; v < 3; v++) {
    const c = document.createElement('canvas'); c.width = c.height = PX; const q = c.getContext('2d'); let s = 77 * (v + 1);
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    q.fillStyle = '#5aa03e'; q.fillRect(0, 0, PX, PX);
    for (const [col, n] of [['#4c8c34', 14], ['#6cb24a', 10], ['#3f7a2c', 5]]) { q.fillStyle = col; for (let i = 0; i < n; i++) q.fillRect((r() * 15) | 0, (r() * 15) | 0, 1 + ((r() * 2) | 0), 1 + ((r() * 2) | 0)); }
    if (v === 2) { q.fillStyle = '#e8d54a'; q.fillRect(5, 9, 1, 1); q.fillStyle = '#f4f4f0'; q.fillRect(11, 4, 1, 1); }   // 작은 꽃
    out.push(c);
  }
  return out;
}
export function bakeGround(isl, name, Art) {
  const b = BIO[name] || BIO.start, cv = document.createElement('canvas'); cv.width = MAP.w * PX; cv.height = MAP.h * PX;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const H = (x, z) => isl.height(x, z), tiles = Object.assign({}, Art.tiles, { grass: grassTiles() });
  const pick = (arr, x, z) => arr[hash(x, z) % arr.length];
  for (let mz = 0; mz < MAP.h; mz++) for (let mx = 0; mx < MAP.w; mx++) {
    const x = MAP.x0 + mx, z = MAP.z0 + mz, h = H(x + 0.5, z + 0.5), px = mx * PX, pz = mz * PX;
    const dx = H(x + 1.5, z + 0.5) - H(x - 0.5, z + 0.5), dz = H(x + 0.5, z + 1.5) - H(x + 0.5, z - 0.5), slope = Math.hypot(dx, dz) / 2;
    const depth = SEA - h;
    if (depth > 0.05 && !inDock(x, z)) {   // 물: 투명하게 두고 깊을수록 어두운 막만 얹는다(물 색과 파도는 매 프레임 바탕에서 그린다)
      g.fillStyle = `rgba(4,18,48,${Math.min(0.6, depth * 0.085).toFixed(3)})`; g.fillRect(px, pz, PX, PX);
      if (depth < 0.9) { g.fillStyle = `rgba(255,240,200,${(0.35 - depth * 0.3).toFixed(3)})`; g.fillRect(px, pz, PX, PX); }   // 얕은 물가는 밝게(모래가 비침)
      continue;
    }
    // 땅 종류
    let kind;
    if (inDock(x, z)) kind = 'raft';
    else if (b.metal) kind = 'metal';
    else if (slope > b.rock) kind = 'stone';
    else if (h > b.snow) kind = 'snow';
    else if (b.ice && h < SEA + b.shore + 0.4) kind = 'ice';
    else if (h < SEA + b.shore) kind = 'sand';
    else kind = b.grass ? 'grass' : (name === 'alpine' ? 'stone' : 'snow');
    if (kind === 'metal') {   // 허브 정거장 바닥: 두 회색 격자판
      const a = ((x + z) & 1) === 0; g.fillStyle = a ? '#4a5160' : '#434a58'; g.fillRect(px, pz, PX, PX);
      g.fillStyle = '#2d3340'; g.fillRect(px, pz, PX, 1); g.fillRect(px, pz, 1, PX);
      g.fillStyle = '#5b6474'; g.fillRect(px + 2, pz + 2, 2, 2); g.fillRect(px + PX - 4, pz + PX - 4, 2, 2);
    } else g.drawImage(pick(tiles[kind], x, z), px, pz, PX, PX);
    if (kind === 'grass' || kind === 'sand') {   // 자잘한 점(질감): 같은 칸은 늘 같은 점
      const r = hash(z, x);
      g.fillStyle = kind === 'grass' ? 'rgba(20,60,20,.25)' : 'rgba(255,255,255,.22)';
      for (let i = 0; i < 3; i++) g.fillRect(px + ((r >> (i * 4)) & 15), pz + ((r >> (i * 4 + 12)) & 15), 1, 1);
    }
    if (b.tint && kind !== 'raft') { g.fillStyle = b.tint; g.fillRect(px, pz, PX, PX); }
    // 음영: 북서쪽에서 빛이 온다. 남동쪽으로 내려가는 면이 밝고, 올라가는 면이 어둡다 + 고도에 따라 조금 밝게
    if (kind !== 'metal' && kind !== 'raft') {
      const lit = -(dx + dz) * 0.3 + (h - SEA) * 0.014;
      if (lit > 0) { g.fillStyle = `rgba(255,255,255,${Math.min(0.3, lit).toFixed(3)})`; g.fillRect(px, pz, PX, PX); }
      else if (lit < 0) { g.fillStyle = `rgba(10,5,30,${Math.min(0.42, -lit).toFixed(3)})`; g.fillRect(px, pz, PX, PX); }
    }
    // 절벽 무늬: 가파른 곳에 가로 지층선(경사 한계 0.5 근처는 걸어서 오르기 어렵다)
    if (slope > b.rock + 0.04 && kind !== 'metal' && kind !== 'raft') {
      g.fillStyle = `rgba(20,12,30,${Math.min(0.35, (slope - 0.5) * 1.5).toFixed(3)})`;
      for (let yy = 3; yy < PX; yy += 5) g.fillRect(px, pz + yy, PX, 1);
    }
  }
  // 행성 지표 기지 부지: 회색 판과 1 m 격자선
  const pxx = (PAD.x0 - MAP.x0) * PX, pzz = (PAD.z0 - MAP.z0) * PX;
  g.fillStyle = '#8d949e'; g.fillRect(pxx, pzz, PAD.cx * PX, PAD.cz * PX);
  g.fillStyle = 'rgba(35,42,55,.5)';
  for (let i = 0; i <= PAD.cx; i++) g.fillRect(pxx + i * PX, pzz, 1, PAD.cz * PX + 1);
  for (let i = 0; i <= PAD.cz; i++) g.fillRect(pxx, pzz + i * PX, PAD.cx * PX + 1, 1);
  g.fillStyle = '#c9ced6'; g.fillRect(pxx, pzz, PAD.cx * PX, 2); g.fillRect(pxx, pzz, 2, PAD.cz * PX);
  return cv;
}
