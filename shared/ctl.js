// 월드 질의·상태 준비(13-a): fp/와 td/가 같이 쓰는, 화면과 무관한 "어디에 무엇이 있는가". fp/main.js에 있던 것을 그대로 옮겼다(숫자·규칙 변경 없음).
// S = Store.S. 활성 행성(지형)은 ctx.isl, 이름은 ctx.name. 화면 쪽은 ctx.load(name)으로 바꾼다.
import { SEA, RX0, RZ0, PAD, ISLANDS, Island } from './gen.js';
import { blockedByObjs, HALF } from './move.js';

export const PLOT_OFF = (plot) => 100 + ISLANDS.indexOf(plot) * 20;   // 지표 부지 장치(d.plot = 행성 id)는 전역 좌표 x = 100 + 20 × 행성 번호 + 칸으로 저장해 탐사정 장치·다른 행성 장치와 겹치지 않는다(DESIGN §4-18)

export function makeCtx(S) {
  const c = { S, isl: null, name: '' };
  c.islandName = () => Sim.dockOf(S).island;
  c.load = (name) => { c.name = name; c.isl = new Island(name); return c.isl; };
  c.raftDims = () => { const cx = S.raft.cells; return { cx, cz: Math.min(8, 4 + Math.floor((cx - 4) / 2)) }; };   // 가정(임의값) 뗏목 격자 = cells × (4 + (cells−4)/2): 4×4 → 12×8
  c.raftCell = (x, z) => { const { cx, cz } = c.raftDims(); return x >= RX0 && x < RX0 + cx && z >= RZ0 && z < RZ0 + cz; };
  // 발 아래 높이: 지형 높이장(쌍선형)과 뗏목 바닥(칸마다 SEA 높이의 평면) 중 높은 것
  c.groundAt = (x, z) => { const t = c.isl.height(x, z); return c.raftCell(Math.floor(x), Math.floor(z)) ? Math.max(t, SEA) : t; };
  c.visible = (d) => !d.plot || d.plot === c.name;   // 지표 부지 장치는 그 행성에 있을 때만 보이고 조작할 수 있다(시간은 계속 흐른다)
  c.devWorld = (d) => { if (d.plot) return [PAD.x0 + (d.x - PLOT_OFF(d.plot)) + 1, c.isl.padH, PAD.z0 + d.y + 1]; return [RX0 + d.x + 1, SEA, RZ0 + d.y + 1]; };   // 장치(2×2)의 가운데 바닥
  c.melted = (o) => S.fp.melted[o.id] === S.day;   // 소금에 녹은 얼음 노드는 그날 하루 사라진다(다음 날 다시 자란다)
  // 몸(반지름 HALF)이 자원·시설·장치에 막히는가. 자원은 원기둥(COLL), 장치는 2×2 상자. 높이를 넘으면 위로 지나간다
  c.blocked = (x, y, z) => {
    if (blockedByObjs(c.isl.objs, x, y, z, c.melted)) return true;
    for (const d of S.placed) { if (!c.visible(d)) continue; const [wx, wy, wz] = c.devWorld(d); if (Math.abs(x - wx) < 1 + HALF && Math.abs(z - wz) < 1 + HALF && y < wy + 1.8) return true; }
    return false;
  };
  c.findFree = () => {   // 뗏목 위에서 장치와 겹치지 않는 자리
    const { cx, cz } = c.raftDims();
    for (let r = 0; r < Math.max(cx, cz); r++) for (let gx = 0; gx < cx; gx++) for (let gz = 0; gz < cz; gz++) { const x = RX0 + gx + 0.5, z = RZ0 + gz + 0.5; if (!c.blocked(x, SEA, z)) return [x, z]; }
    return null;
  };
  // 장치 uid(연결선이 가리킨다): 건설 때 팀 번호표(S.team.seq)로 부여한다. 예전 세이브의 장치에도 채운다
  c.nextUid = () => { if (!S.team) S.team = {}; S.team.seq = (S.team.seq || 0) + 1; return 'd' + S.team.seq; };
  c.ensureUids = () => { for (const d of S.placed) if (!d.uid) d.uid = c.nextUid(); };
  // 상태 준비 + 교체 고리: 격자 바닥 인접, 지표 부지 장치는 그 행성의 환경, 열선으로 연결된 화덕은 열원(계산식은 그대로, 기본값은 sim.js가 가진 2D 동작)
  c.ensureFp = () => {
    if (!S.fp) S.fp = { x: RX0 - 3.5, y: SEA + 2, z: RZ0 + 2.5, yaw: -Math.PI / 2, pitch: 0, melted: {} };
    if (!S.fp.melted) S.fp.melted = {};
    delete S.fp.mods;   // 예전 복셀 버전의 파낸 칸 기록은 쓰지 않는다
    Sim.geo.adjacent = (a, b) => Math.abs(a.x - b.x) <= 3 && Math.abs(a.y - b.y) <= 3;   // 격자 바닥: 2x2 장치 사이가 한 칸 이내(장치의 x, y = 격자 칸 x, z)
    Sim.geo.island = (S_, d) => d && d.plot ? d.plot : Sim.dockOf(S_).island;
    Sim.geo.heatSources = (S_, d) => {
      const out = S_.placed.filter(f => f !== d && f.id === 'fire' && Sim.geo.adjacent(f, d));
      for (const l of (S_.links || [])) if (l.kind === 'heat' && l.b === d.uid) { const f = S_.placed.find(x => x.uid === l.a); if (f && f.id === 'fire' && !out.includes(f)) out.push(f); }
      return out;
    };
    if (!Array.isArray(S.links)) S.links = [];
    c.ensureUids();
  };
  return c;
}
