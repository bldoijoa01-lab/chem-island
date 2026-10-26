// 이동·충돌 물리(13-a): fp/(1인칭)와 td/(탑다운)가 같은 함수를 쓴다. 화면(THREE·캔버스)과 무관하다.
// 모든 상수는 "가정(임의값)"이고 값은 fp/main.js에 있던 것을 그대로 옮겼다(DESIGN.md §4-15, §4-14). 바뀐 숫자는 없다.
import { N, SEA } from './gen.js';
export const WALK = 72 / 16, SWIM = 42 / 16, JUMP = 270 / 16, GRAV = 900 / 16, GRAV_W = 300 / 16, FALL_MAX = 400 / 16, FALL_W = 70 / 16;   // 2D의 px/s를 16 px = 1 m로 바꾼 값
export const SURF_JUMP = 16.5;         // 수면에서 뛰어오르는 속도(m/s) → 약 2.4 m: 수면에 떠서 뗏목 바닥(수면과 같은 높이)에 오를 수 있게(2D는 15 m/s)
export const SLOPE_TAN = Math.tan(40 * Math.PI / 180);   // 걸어서 오를 수 있는 기울기 한계 40°(가정). 지형은 26.6° 이하로 만들어 어디든 오르고, 더 가파른 턱은 점프로만 넘는다
export const SNAP_DOWN = 0.5;          // 내리막에서 발이 땅을 따라가는 최대 높이 차(m, 가정). 더 큰 낭떠러지는 떨어진다
export const HALF = 0.3, BODY = 1.8;   // 몸 폭 0.6 m, 키 1.8 m
export const COLL = { tree: 0.45, rock: 0.9, iceblock: 0.8, rocksalt: 0.6, icecrystal: 0.45, box: 0.6, board: 0.5, harbor: 0.4, altar: 1.0 };   // 가정(임의값) 자원·시설 충돌 반지름(m). 높이 COLL_H 넘게 뛰면 위로 지나간다
export const COLL_H = 2.2;
export const BOUNDS = { xlo: -12, xhi: N + 24, zlo: -12, zhi: N + 12 };   // 가정: 섬 둘레 바다에서 더 멀리 못 간다

// 한 걸음: 발 아래 높이가 낮아지면 따라가고(SNAP_DOWN까지), 높아지면 기울기가 SLOPE_TAN 이하일 때만 오른다. 자동 오르기(계단)는 없다
// p = { x, y, z, vx, vy, vz, onGround, inW }, w = { groundAt(x, z), blocked(x, y, z), onEdge() }
export function tryMove(p, nx, nz, w) {
  if (w.blocked(nx, p.y, nz) && !w.blocked(p.x, p.y, p.z)) return false;
  const g = w.groundAt(nx, nz);
  if (g <= p.y + 1e-4) { if (p.onGround && p.y - g <= SNAP_DOWN) p.y = g; p.x = nx; p.z = nz; return true; }
  if (p.onGround) { const d = Math.hypot(nx - p.x, nz - p.z); if (g - p.y <= SLOPE_TAN * d + 1e-4) { p.y = g; p.x = nx; p.z = nz; return true; } }
  return false;
}
// 한 틱: (mx, mz)는 세계 좌표 방향의 입력(길이 1 넘으면 1로 보정), jump는 이번 틱에 점프 입력이 있는가
export function stepBody(p, dt, mx, mz, jump, w) {
  p.inW = p.y + BODY / 2 < SEA - 0.05;
  const sp = p.inW ? SWIM : WALK; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  p.vx = mx * sp; p.vz = mz * sp;
  if (jump) {
    if (p.onGround) { p.vy = JUMP; p.onGround = false; }   // 바닥을 딛고 있으면 물속에서도 뛴다(2D와 같은 규칙)
    else if (p.inW) { const surface = p.y + BODY >= SEA - 0.05; p.vy = surface ? SURF_JUMP : Math.min(p.vy + 700 / 16 * dt, 60 / 16); }
  }
  p.vy = Math.max(p.vy - (p.inW ? GRAV_W : GRAV) * dt, -(p.inW ? FALL_W : FALL_MAX));
  tryMove(p, p.x + p.vx * dt, p.z, w);
  tryMove(p, p.x, p.z + p.vz * dt, w);
  { const b = BOUNDS; if (p.x < b.xlo || p.x > b.xhi || p.z < b.zlo || p.z > b.zhi) { p.x = Math.max(b.xlo, Math.min(b.xhi, p.x)); p.z = Math.max(b.zlo, Math.min(b.zhi, p.z)); if (w.onEdge) w.onEdge(); } }
  const g = w.groundAt(p.x, p.z), ny = p.y + p.vy * dt;
  if (ny <= g && p.vy <= 0) { p.y = g; p.vy = 0; p.onGround = true; }
  else { p.y = Math.max(ny, g); if (ny < g) p.vy = 0; p.onGround = p.y <= g + 1e-4 && p.vy <= 0; }
}
// 몸(반지름 HALF)이 자원·시설에 막히는가(장치는 호출하는 쪽이 따로 본다: 장치 위치는 상태 S에서 온다)
export function blockedByObjs(objs, x, y, z, skip) {
  for (const o of objs) { const r = COLL[o.type]; if (r && o.type !== 'fragment' && !(skip && skip(o)) && Math.hypot(x - o.x, z - o.z) < r + HALF && y < o.y + COLL_H) return true; }
  return false;
}
