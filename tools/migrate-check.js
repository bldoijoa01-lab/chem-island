// 옛 저장 읽기 시험(16~17단계): 옛 저장(ver 2·3·4, 폭 380 한 줄 월드 / 행성별 맵 / 17-a 지표 800×110)이 지하 개편(ver 5, 코어가 원점인 무한 지하 월드)으로 읽히는지 본다.
// 불시착·고원·얼음 위성의 땅 파기·얼음 녹임 키와 코어는 새 지형과 맞지 않아 버리고(허브 키는 유지), 탐사정 위 장치는 재료로 환급하며, 인벤토리·목표·채집 기록은 그대로다.
// 사용: node tools/migrate-check.js   (브라우저 없이)
global.window = global; require('../chem.js'); global.Chem = window.Chem;
const Sim = require('../sim.js'); global.Sim = Sim;
require('../world.js');
const W = global.World;
let fail = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); if (!cond) fail++; };
const base = () => JSON.parse(JSON.stringify(Sim.newState()));
const legacy = (ver, o) => { const j = Object.assign(base(), { ver }, o); if (ver === undefined) delete j.ver; return j; };
const still = { id: 'still', u: 3, x: 110, y: 23, s: { w: 10, ns: 0, outW: 0, outS: 0, run: false, T: 25 } };
const fire = { id: 'fire', u: 0, x: 107, y: 23, s: { level: 2, fuel: 5 } };
// 1. 17-a 저장(ver 4, 지표 800 × 110): 월드·코어·장치를 새 방식으로
{
  const j = legacy(4, { base: { x: 400, y: 60, at: 123, id: 'u1' }, raft: { cells: 6, dock: 'start' }, px: 405 * 16, py: 58 * 16, placed: [fire, still], dug: { 'start:48100': 0, 'plaza:2000': 0, 'alpine:77': 0 }, melt: { 'start:19292': 40 }, inv: Object.assign(base().inv, { stick: 5, sand: 1 }), qDone: 5, nodes: { tr29: 2 } });
  const S = Sim.merge(j), d = Sim.DEV;
  ok('ver 4 → 5, 코어는 원점 (0, 0), 월드 비어 있음', S.ver === 5 && S.base.x === 0 && S.base.y === 0 && Object.keys(S.world).length === 0 && S.ug === true, JSON.stringify([S.ver, S.base]));
  ok('허브 키만 유지(불시착·고원 키와 얼음 녹임 버림)', Object.keys(S.dug).join() === 'plaza:2000' && Object.keys(S.melt).length === 0, JSON.stringify([S.dug, S.melt]));
  ok('탐사정 위 장치는 재료로 환급(화덕 + 증류기)', S.placed.length === 0 && S.inv.stick === 5 + d.fire.cost.stick + d.still.cost.stick && S.inv.sand === 1 + d.fire.cost.sand && S.inv.bottle === d.still.cost.bottle, JSON.stringify(S.inv));
  ok('위치는 코어 안, 목표·채집 기록 보존, 기록에 안내', S.px === 35 && S.py === 30 && S.raft.dock === 'start' && S.qDone === 5 && S.nodes.tr29 === 2 && S.log.some(l => /지하 개편/.test(l.text)), JSON.stringify([S.px, S.py, S.qDone]));
  W.applyDug(S);
  ok('새 월드가 코어를 포함(선체·안쪽·패드)', W.isInfinite() && W.tileAt(0, 0) === W.HULL && W.tileAt(2, 1) === W.AIR && W.targets(S).some(t => t.kind === 'pad'));
  const S2 = Sim.merge(JSON.parse(JSON.stringify(S)));
  ok('새 형식 저장은 다시 이전되지 않음', JSON.stringify(S2.dug) === JSON.stringify(S.dug) && S2.px === S.px && S2.base.x === 0 && S2.ver === 5);
}
// 2. 행성별 맵 저장(ver 3)과 한 줄 380칸 저장(ver 2): 같은 길로, 허브 키는 행성별 형식으로 옮겨진 뒤 유지
{
  const OLD = 380;
  const v3 = Sim.merge(legacy(3, { px: 99 * 16, dug: { 'start:2940': 0, 'plaza:2000': 0, 'alpine:77': 0 }, melt: { 'start:2972': 25 } }));
  ok('ver 3 → 5: 불시착·고원 키 버림, 허브 키 유지', v3.ver === 5 && Object.keys(v3.dug).join() === 'plaza:2000' && v3.base.x === 0);
  const v2 = Sim.merge(legacy(2, { raft: { cells: 6, dock: 'plaza' }, px: 140 * 16 + 8, py: 24 * 16 - 18, dug: { [24 * OLD + 135]: 0, [30 * OLD + 335]: 0 }, melt: { [24 * OLD + 335]: 60 } }));
  ok('ver 2 → 5: 허브(옛 x 135 → 29)만 유지, 얼음 위성 키 버림', v2.ver === 5 && v2.dug['plaza:' + (24 * 112 + 29)] === 0 && Object.keys(v2.dug).length === 1 && Object.keys(v2.melt).length === 0, JSON.stringify(v2.dug));
  const v1 = Sim.merge(legacy(undefined, { px: 50 * 16, dug: { [30 * 120 + 50]: 0 }, melt: {}, qDone: 3 }));
  ok('폭 120 시절(ver 없음): 목표 보정 + 지하 개편', v1.qDone === 4 && v1.f.raft === true && v1.ver === 5 && Object.keys(v1.dug).length === 0, JSON.stringify([v1.qDone, v1.dug]));
}
// 3. 1인칭·탑다운 저장(S.fp)은 이 필드를 쓰지 않으므로 건드리지 않는다
{
  const S = Sim.merge(legacy(3, { fp: { x: 5, y: 12, z: 6, yaw: 0, pitch: 0, melted: {} }, px: 777, melt: { 'iceblock-polar-3': 40 }, placed: [fire] }));
  ok('fp 저장: 위치·얼음 녹임 키·장치 그대로', S.px === 777 && S.melt['iceblock-polar-3'] === 40 && S.placed.length === 1 && S.ver === 5);
}
// 4. 새 게임·유한 맵 생성
{
  const S = Sim.newState();
  ok('새 게임: 코어 (0,0), 월드 {}, 코어 캡슐 안 위치', S.ver === 5 && S.base.x === 0 && JSON.stringify(S.world) === '{}' && S.px === 35 && S.py === 30);
  const g = W.genPlanet('plaza', Sim.ISLANDS.plaza.W, Sim.ISLANDS.plaza.H, Sim.ISLANDS.plaza.off);
  ok('허브(유한 맵) 크기·표지', g.map.length === 112 * 56 && g.gy.length === 112 && g.objs.some(o => o.type === 'fragment') && g.objs.some(o => o.type === 'pad'));
  const a = W.genPlanet('alpine', 102, 56, 201);
  ok('고원 착륙 캡슐 동굴과 패드', a.map.length === 102 * 56 && a.objs.some(o => o.type === 'pad') && a.map[28 * 102 + 14] === W.AIR);
}
if (fail) { console.error('옛 저장 읽기 점검 실패 ' + fail + '건'); process.exit(1); }
console.log('옛 저장 읽기 점검 통과');
